import { Inject, Injectable, Logger } from "@nestjs/common";
import { InsufficientStockError, type Prisma, type PrismaClient } from "@oca/database";
import { parseCf } from "@oca/shared";
import { PRISMA } from "../../prisma/prisma.module";
import { OrdersService } from "../orders/orders.service";
import { CfReplyService } from "./cf-reply.service";

export interface CfCommentJob {
  sessionId: string;
  commentId: string;
  postId: string;
  authorId: string;
  authorName: string;
  message: string;
}

/** ເກີນ limit ຂອງລະຫັດ: ໂຍນໃນ transaction ເພື່ອ rollback */
class CfLimitReachedError extends Error {
  constructor() {
    super("CF limit reached");
    this.name = "CfLimitReachedError";
  }
}

interface ResolvedLine {
  itemId: string;
  code: string;
  variantId: string;
  quantity: number;
}

type Placed = { duplicate: true } | { duplicate: false; ledgerId: string };

@Injectable()
export class CfProcessorService {
  private readonly logger = new Logger(CfProcessorService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(CfReplyService) private readonly replies: CfReplyService,
  ) {}

  /** ປະມວນຜົນ 1 ຄອມເມັ້ນ. ບໍ່ throw ສຳລັບຄວາມຜິດພາດຂອງທຸລະກິດ (ບັນທຶກເປັນ outcome ໃນ ledger); idempotent ດ້ວຍ externalCommentId */
  async process(job: CfCommentJob): Promise<void> {
    const session = await this.prisma.liveSession.findUnique({ where: { id: job.sessionId }, include: { items: true } });
    // ຈົບ/ຍັງບໍ່ເລີ່ມແລ້ວ: ຂ້າມ (ຄອມເມັ້ນທີ່ເຂົ້າ queue ກ່ອນຈົບ ແຕ່ມາຖືກປະມວນຜົນຫຼັງຈົບ ບໍ່ຈອງ)
    if (!session || session.status !== "LIVE") return;
    if (await this.prisma.cfComment.findUnique({ where: { externalCommentId: job.commentId }, select: { id: true } })) return;

    const parsed = parseCf(job.message, session.items.map((item) => item.code));
    if (!parsed) {
      await this.record(job, { outcome: "NO_MATCH" });
      return;
    }
    const itemByCode = new Map(session.items.map((item) => [item.code, item]));
    const lines: ResolvedLine[] = parsed.flatMap((line) => {
      const item = itemByCode.get(line.code);
      return item ? [{ itemId: item.id, code: item.code, variantId: item.variantId, quantity: line.quantity }] : [];
    });
    if (lines.length !== parsed.length) {
      await this.record(job, { outcome: "ERROR" });
      return;
    }

    let placed: Placed;
    try {
      placed = await this.prisma.$transaction((tx) => this.place(tx, job, session, lines), { timeout: 20_000, maxWait: 15_000 });
    } catch (error) {
      placed = await this.recordFailure(job, lines, error);
    }
    if (!placed.duplicate) await this.replies.deliver(placed.ledgerId);
  }

  private async place(
    tx: Prisma.TransactionClient,
    job: CfCommentJob,
    session: { id: string; title: string; kind: "LIVE" | "POST" },
    lines: ResolvedLine[],
  ): Promise<Placed> {
    // ຄອມເມັ້ນຂອງ session ດຽວກັນເຂົ້າທີລະອັນ: limit ຕໍ່ລະຫັດ ແລະ merge ບິນຕ້ອງ atomic
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cf:${session.id}`}))`;
    if (await tx.cfComment.findUnique({ where: { externalCommentId: job.commentId }, select: { id: true } })) {
      return { duplicate: true };
    }

    const fresh = await tx.liveSessionItem.findMany({ where: { id: { in: lines.map((line) => line.itemId) } } });
    const freshById = new Map(fresh.map((item) => [item.id, item]));
    for (const line of lines) {
      const item = freshById.get(line.itemId);
      if (!item) throw new Error("CF item disappeared");
      if (item.limit !== null && item.claimed + line.quantity > item.limit) throw new CfLimitReachedError();
    }

    await tx.customer.createMany({ data: [{ name: job.authorName, facebookUserId: job.authorId }], skipDuplicates: true });
    const customer = await tx.customer.findUniqueOrThrow({ where: { facebookUserId: job.authorId } });

    // ສອງລະຫັດຊີ້ variant ດຽວກັນ → ລວມຈຳນວນ (ບິນບໍ່ມີແຖວ variant ຊ້ຳ)
    const byVariant = new Map<string, number>();
    for (const line of lines) byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity);
    const additions = [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity }));

    const open = await tx.order.findFirst({
      where: { liveSessionId: session.id, customerId: customer.id, status: "PENDING_PAYMENT", reservedUntil: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    let orderId: string;
    if (open) {
      await this.orders.appendItemsInTx(tx, open.id, additions, null);
      orderId = open.id;
    } else {
      orderId = await this.orders.createCfOrderInTx(
        tx,
        {
          customerId: customer.id,
          items: additions.map((addition) => ({ ...addition, discount: "0" })),
          shippingFee: "0",
          note: `CF ${session.title}`.slice(0, 500),
        },
        { channel: "FACEBOOK", source: session.kind === "LIVE" ? "LIVE_CF" : "POST_CF", liveSessionId: session.id },
      );
    }

    for (const line of lines) {
      await tx.liveSessionItem.update({ where: { id: line.itemId }, data: { claimed: { increment: line.quantity } } });
    }
    const ledger = await tx.cfComment.create({
      data: {
        externalCommentId: job.commentId,
        sessionId: session.id,
        authorExternalId: job.authorId,
        authorName: job.authorName,
        message: job.message,
        outcome: "ORDERED",
        lines: lines.map(({ itemId, code, quantity }) => ({ itemId, code, quantity })),
        orderId,
      },
      select: { id: true },
    });
    return { duplicate: false, ledgerId: ledger.id };
  }

  private async recordFailure(job: CfCommentJob, lines: ResolvedLine[], error: unknown): Promise<Placed> {
    const detail = lines.map(({ itemId, code, quantity }) => ({ itemId, code, quantity }));
    if (error instanceof InsufficientStockError) return this.record(job, { outcome: "OUT_OF_STOCK", lines: detail });
    if (error instanceof CfLimitReachedError) return this.record(job, { outcome: "LIMIT_REACHED", lines: detail });
    // ບັນທຶກສະເພາະຊື່ error (ບໍ່ເອົາ payload/ຄວາມລັບລົງ log); ບໍ່ retry ເພື່ອບໍ່ຈອງຊ້ຳ
    this.logger.error(`CF comment ${job.commentId} failed (${error instanceof Error ? error.name : "UnknownError"})`);
    return this.record(job, { outcome: "ERROR", lines: detail });
  }

  /** ບັນທຶກ ledger ທີ່ບໍ່ມີບິນ. ON CONFLICT DO NOTHING ເພື່ອກັນ job ຊ້ຳ; ຄືນ duplicate ຖ້າມີແລ້ວ */
  private async record(
    job: CfCommentJob,
    data: { outcome: "NO_MATCH" | "OUT_OF_STOCK" | "LIMIT_REACHED" | "ERROR"; lines?: Prisma.InputJsonValue },
  ): Promise<Placed> {
    const sessionId = job.sessionId;
    const { count } = await this.prisma.cfComment.createMany({
      data: [
        {
          externalCommentId: job.commentId,
          sessionId,
          authorExternalId: job.authorId,
          authorName: job.authorName,
          message: job.message,
          outcome: data.outcome,
          lines: data.lines,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { duplicate: true };
    const row = await this.prisma.cfComment.findUniqueOrThrow({ where: { externalCommentId: job.commentId }, select: { id: true } });
    // NO_MATCH/ERROR ບໍ່ສົ່ງຂໍ້ຄວາມ (deliver ຂ້າມເອງ) ແຕ່ຄືນ id ເພື່ອໃຫ້ flow ດຽວກັນ
    return { duplicate: false, ledgerId: row.id };
  }
}

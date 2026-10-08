import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "../inbox/channel-registry";
import { ledgerLines } from "./live-cf.mapper";
import {
  PUBLIC_REPLY_ORDERED,
  PUBLIC_REPLY_REJECTED,
  buildOrderedText,
  buildRejectedText,
} from "./cf-summary";

export const SENDING_STALE_MS = 2 * 60 * 1000;

/** ສົ່ງສະຫຼຸບຫາຜູ້ຄອມເມັ້ນ (Private Reply) ຫຼັງ ledger ຖືກບັນທຶກ. ບໍ່ throw: ລົ້ມ = replyStatus FAILED ໃຫ້ແອດມິນສົ່ງໃໝ່ */
@Injectable()
export class CfReplyService {
  private readonly logger = new Logger(CfReplyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  async deliver(ledgerId: string): Promise<void> {
    try {
      await this.deliverOnce(ledgerId);
    } catch (error) {
      this.logger.error(`deliver failed for ${ledgerId} (${error instanceof Error ? error.name : "UnknownError"})`);
      await this.prisma.cfComment
        .updateMany({ where: { id: ledgerId, replyStatus: { in: ["NONE", "SENDING", "FAILED"] } }, data: { replyStatus: "FAILED", replyErrorCode: "CHANNEL_UNAVAILABLE" } })
        .catch(() => undefined);
    }
  }

  private async deliverOnce(ledgerId: string): Promise<void> {
    const row = await this.prisma.cfComment.findUnique({
      where: { id: ledgerId },
      include: { session: { select: { publicReplyEnabled: true } }, order: { include: { items: { orderBy: { id: "asc" } } } } },
    });
    if (!row || row.replyStatus === "SENT") return;
    if (row.outcome !== "ORDERED" && row.outcome !== "OUT_OF_STOCK" && row.outcome !== "LIMIT_REACHED") return;
    if (row.outcome === "ORDERED" && !row.order) {
      this.logger.warn(`ledger ${ledgerId} is ORDERED but has no order`);
      return;
    }

    let text: string;
    if (row.outcome === "ORDERED") {
      if (!row.order) return;
      const settings = await this.prisma.storeSetting.findUnique({ where: { id: 1 }, select: { paymentInstructions: true } });
      text = buildOrderedText({
        orderNumber: row.order.orderNumber,
        lines: row.order.items.map((item) => ({
          name: [item.productName, item.variantName].filter(Boolean).join(" "),
          quantity: item.quantity,
          lineTotal: item.lineTotal.toFixed(2),
        })),
        total: row.order.total.toFixed(2),
        currency: row.order.currency,
        reservedUntil: row.order.reservedUntil,
        paymentInstructions: settings?.paymentInstructions ?? null,
      });
    } else {
      text = buildRejectedText(row.outcome, ledgerLines(row.lines).map((line) => line.code));
    }

    // claim ແບບ atomic: ມີຜູ້ສົ່ງພ້ອມກັນຄົນດຽວເທົ່ານັ້ນ. SENDING ຄ້າງເກີນ 2 ນາທີ = ຜູ້ສົ່ງກ່ອນລົ້ມກາງທາງ ຍຶດຄືນໄດ້
    const now = new Date();
    const claim = await this.prisma.cfComment.updateMany({
      where: {
        id: ledgerId,
        OR: [
          { replyStatus: { in: ["NONE", "FAILED"] } },
          { replyStatus: "SENDING", replyAttemptedAt: { lt: new Date(now.getTime() - SENDING_STALE_MS) } },
        ],
      },
      data: { replyStatus: "SENDING", replyAttemptedAt: now },
    });
    if (claim.count === 0) return;

    const adapter = this.channels.facebook;
    const firstAttempt = row.replyStatus === "NONE";
    const result = await adapter.sendPrivateReply(row.externalCommentId, text);
    await this.prisma.cfComment.updateMany({
      where: { id: ledgerId, replyStatus: "SENDING" },
      data: result.ok ? { replyStatus: "SENT", replyErrorCode: null } : { replyStatus: "FAILED", replyErrorCode: result.code },
    });

    // ຕອບຄອມເມັ້ນສາທາລະນະ: ສະເພາະຄັ້ງທຳອິດ (ກັນຊ້ຳເມື່ອ resend) ແລະ ບໍ່ບອກໃຫ້ກວດແຊັດຖ້າຂໍ້ຄວາມສ່ວນຕົວສົ່ງບໍ່ຜ່ານ
    if (firstAttempt && row.session.publicReplyEnabled && (result.ok || row.outcome !== "ORDERED")) {
      const publicText = row.outcome === "ORDERED" ? PUBLIC_REPLY_ORDERED : PUBLIC_REPLY_REJECTED;
      const publicResult = await adapter.replyToComment(row.externalCommentId, publicText);
      if (!publicResult.ok) this.logger.warn(`public reply failed for ${ledgerId}: ${publicResult.code}`);
    }
  }
}

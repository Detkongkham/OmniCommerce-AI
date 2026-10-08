import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Prisma, type PrismaClient, evaluateSlip } from "@oca/database";
import type { PatchSlipInput, RejectSlipInput } from "@oca/shared";
import { OrdersService } from "../orders/orders.service";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { apiError } from "../../common/api-error";
import { PRISMA } from "../../prisma/prisma.module";
import { SLIP_QUEUE, type SlipQueue } from "./slip.providers";
import { requireOrder, requireRow } from "./slip-queries";
import { type SlipDto, toSlipDto } from "./slips.mapper";

/** ສະຖານະທີ່ຍັງແກ້/retry/ປະຕິເສດໄດ້ (CONFIRMED/REJECTED ຖືວ່າປິດແລ້ວ) */
const OPEN_STATUSES = ["PENDING_READ", "READ", "READ_FAILED"] as const;

/** ການກວດຂອງແອດມິນ (payments:write): ແກ້ຄ່າ / retry / ປະຕິເສດ / ຢືນຢັນ */
@Injectable()
export class SlipReviewService {
  private readonly logger = new Logger(SlipReviewService.name);

  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SLIP_QUEUE) private readonly queue: SlipQueue,
  ) {}

  /**
   * ແກ້ຄ່າທີ່ແອດມິນຢືນຢັນ ແລະ/ຫຼື ຜູກ/ຍ້າຍບິນ; ຄິດ flag ໃໝ່ສະເໝີ.
   * ຍ້າຍໄປບິນຂອງເຄສອື່ນໄດ້ (ແອດມິນຕັດສິນ) ຂໍພຽງບິນມີຢູ່ຈິງ.
   */
  async patch(id: string, input: PatchSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await requireRow(this.prisma, id);
    if (input.orderId) await requireOrder(this.prisma, input.orderId);
    await this.updateOpen(id, {
      orderId: input.orderId,
      confirmedAmount: input.confirmedAmount,
      confirmedCurrency: input.confirmedCurrency,
      confirmedPaidAt: input.confirmedPaidAt,
      confirmedRefNo: input.confirmedRefNo,
      confirmedDestAccount: input.confirmedDestAccount,
    });
    await evaluateSlip(this.prisma, id);
    await this.audit.record({
      userId: actor.id,
      action: "slip.update",
      entity: "PaymentSlip",
      entityId: id,
      // round-trip ເພື່ອໃຫ້ Date ກາຍເປັນ string ແລະ JSON-safe
      after: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      ip,
    });
    return toSlipDto(await requireRow(this.prisma, id));
  }

  /** ອ່ານໃໝ່: ຕັ້ງ PENDING_READ ແລ້ວ enqueue. ຖ້າ enqueue ລົ້ມ ສະຖານະ PENDING_READ ຍັງຄົງ ແລະ ຕອບ 500 (ກົດໃໝ່ໄດ້) */
  async retry(id: string, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.updateOpen(id, { status: "PENDING_READ" });
    // ບໍ່ກືນ error ຄືຕອນສ້າງ: retry ມີໄວ້ເພື່ອ enqueue ຈຶ່ງຕ້ອງໃຫ້ແອດມິນເຫັນເມື່ອລົ້ມ
    await this.queue.enqueueRead(id);
    await this.audit.record({ userId: actor.id, action: "slip.retry", entity: "PaymentSlip", entityId: id, ip });
    return toSlipDto(await requireRow(this.prisma, id));
  }

  /** ປະຕິເສດສະລິບ: ບໍ່ແຕະບິນ */
  async reject(id: string, input: RejectSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.updateOpen(id, {
      status: "REJECTED",
      rejectReason: input.reason,
      reviewedByUserId: actor.id,
      reviewedAt: new Date(),
    });
    await this.audit.record({
      userId: actor.id,
      action: "slip.reject",
      entity: "PaymentSlip",
      entityId: id,
      after: { reason: input.reason },
      ip,
    });
    return toSlipDto(await requireRow(this.prisma, id));
  }

  /**
   * ຢືນຢັນ: claim ສະລິບ (conditional UPDATE ກັນແຂ່ງ) + OrdersService.payWithin ໃນ transaction ດຽວ.
   * payWithin ລົ້ມ (ບິນບໍ່ຢູ່ PENDING_PAYMENT / ໝົດເວລາຈອງ) → throw → rollback ທັງ claim ສະລິບ ແລະ ບິນ.
   */
  async confirm(id: string, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const slip = await requireRow(this.prisma, id);
    if (slip.status === "CONFIRMED" || slip.status === "REJECTED") {
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    if (slip.status === "PENDING_READ") throw apiError("CONFLICT", "The slip is still being read");
    if (!slip.orderId) throw apiError("SLIP_NOT_LINKED", "Link the slip to an order before confirming");
    const orderId = slip.orderId;

    // ກວດເບື້ອງຕົ້ນເພື່ອໄດ້ code ທີ່ຊັດ; ການກວດຍອດທີ່ຕັດສິນແທ້ຢູ່ໃນ transaction ດ້ວຍແຖວສົດ
    if ((slip.confirmedAmount ?? slip.readAmount) === null) {
      throw apiError("SLIP_AMOUNT_REQUIRED", "Enter the slip amount before confirming");
    }

    const amount = await this.prisma.$transaction(async (tx) => {
      // (a) claim ກ່ອນ: ຕັ້ງສະເພາະສະຖານະ+ຜູ້ກວດ (ໄດ້ lock ແຖວ ຈຶ່ງ PATCH ຂອງຄົນອື່ນຕ້ອງລໍຈົນ commit ແລ້ວຈະຖືກ 409).
      // orderId ຢູ່ໃນ where: ຖ້າຍ້າຍບິນລະຫວ່າງອ່ານ ຈະບໍ່ຢືນຢັນຜິດບິນ; status ກັນ confirm/reject ພ້ອມກັນ
      const { count } = await tx.paymentSlip.updateMany({
        where: { id, orderId, status: { in: ["READ", "READ_FAILED"] } },
        data: { status: "CONFIRMED", reviewedByUserId: actor.id, reviewedAt: new Date() },
      });
      if (count === 0) {
        const current = await tx.paymentSlip.findUnique({ where: { id }, select: { status: true } });
        if (!current) throw apiError("SLIP_NOT_FOUND", "Slip not found");
        if (current.status === "CONFIRMED" || current.status === "REJECTED") {
          throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
        }
        throw apiError("CONFLICT", "The slip was changed concurrently; reload and retry");
      }
      // (b) ອ່ານແຖວສົດຫຼັງ lock: ຄ່ານິ່ງແລ້ວ ບໍ່ໃຊ້ snapshot ເກົ່າທີ່ອາດຖືກແກ້ໄປ
      const fresh = await tx.paymentSlip.findUniqueOrThrow({ where: { id } });
      const finalAmount = fresh.confirmedAmount ?? fresh.readAmount;
      // (c) ບໍ່ມີຍອດ → throw ເພື່ອ rollback claim
      if (finalAmount === null) throw apiError("SLIP_AMOUNT_REQUIRED", "Enter the slip amount before confirming");
      // (d) ຄ່າສຸດທ້າຍ = ທີ່ແອດມິນແກ້ ກ່ອນ ບໍ່ດັ່ງນັ້ນທີ່ເຄື່ອງອ່ານ; ເກັບໃສ່ confirmed* ໃຫ້ຄົບ
      await tx.paymentSlip.update({
        where: { id },
        data: {
          confirmedAmount: finalAmount,
          confirmedCurrency: fresh.confirmedCurrency ?? fresh.readCurrency,
          confirmedPaidAt: fresh.confirmedPaidAt ?? fresh.readPaidAt,
          confirmedRefNo: fresh.confirmedRefNo ?? fresh.readRefNo,
          confirmedDestAccount: fresh.confirmedDestAccount ?? fresh.readDestAccount,
        },
      });
      // (e) pay ໃນ transaction ດຽວກັນ: ລົ້ມ → rollback ທັງ claim
      await this.orders.payWithin(tx, orderId, actor);
      return finalAmount;
    });

    // ຫຼັງ commit ເງິນ/ບິນປ່ຽນແລ້ວ: audit ລົ້ມຕ້ອງບໍ່ເຮັດໃຫ້ endpoint ຕອບ 500 (best-effort, ບັນທຶກ log)
    await this.auditBestEffort({
      userId: actor.id,
      action: "slip.confirm",
      entity: "PaymentSlip",
      entityId: id,
      after: { orderId, amount: amount.toFixed(2) },
      ip,
    });
    await this.auditBestEffort({
      userId: actor.id,
      action: "order.pay",
      entity: "Order",
      entityId: orderId,
      after: { status: "PAID", slipId: id },
      ip,
    });
    return toSlipDto(await requireRow(this.prisma, id));
  }

  private async auditBestEffort(entry: Parameters<AuditService["record"]>[0]): Promise<void> {
    try {
      await this.audit.record(entry);
    } catch (error) {
      // ບໍ່ log message ດິບ (Prisma ອາດຝັງ payload): ສະເພາະຊື່/code ຂອງ error
      const code = (error as { code?: unknown } | null)?.code;
      const name = error instanceof Error ? error.name : "UnknownError";
      this.logger.error(`Failed to record audit ${entry.action} ${entry.entityId ?? ""} (${name}${typeof code === "string" ? ` ${code}` : ""})`);
    }
  }

  /**
   * conditional update ສະເພາະສະຖານະເປີດ: ກັນແຂ່ງກັບ confirm/reject.
   * count = 0 → ບໍ່ມີແຖວ (404) ຫຼື ຖືກ review ແລ້ວ (409 SLIP_ALREADY_REVIEWED)
   */
  private async updateOpen(id: string, data: Prisma.PaymentSlipUncheckedUpdateManyInput): Promise<void> {
    const { count } = await this.prisma.paymentSlip.updateMany({ where: { id, status: { in: [...OPEN_STATUSES] } }, data });
    if (count === 0) {
      await requireRow(this.prisma, id);
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { type Prisma, type PrismaClient, evaluateSlip } from "@oca/database";
import type { PatchSlipInput, RejectSlipInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { apiError } from "../../common/api-error";
import { PRISMA } from "../../prisma/prisma.module";
import { SLIP_QUEUE, type SlipQueue } from "./slip.providers";
import { requireOrder, requireRow } from "./slip-queries";
import { type SlipDto, toSlipDto } from "./slips.mapper";

/** ສະຖານະທີ່ຍັງແກ້/retry/ປະຕິເສດໄດ້ (CONFIRMED/REJECTED ຖືວ່າປິດແລ້ວ) */
const OPEN_STATUSES = ["PENDING_READ", "READ", "READ_FAILED"] as const;

/** ການກວດຂອງແອດມິນ (payments:write): ແກ້ຄ່າ / retry / ປະຕິເສດ */
@Injectable()
export class SlipReviewService {
  constructor(
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

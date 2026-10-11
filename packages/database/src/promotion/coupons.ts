import { type CouponRejectReason, computeCouponDiscount } from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import type { Tx } from "../inventory/stock-engine";

/** ໂຄດໃຊ້ບໍ່ໄດ້ (ຜູ້ເອີ້ນແປເປັນ 409 COUPON_INVALID ແລະ ປ່ອຍໃຫ້ transaction rollback) */
export class CouponRejectedError extends Error {
  constructor(
    readonly reason: CouponRejectReason,
    /** ຂໍ້ມູນປະກອບ ເຊັ່ນ { minSubtotal } */
    readonly detail: Record<string, string> = {},
  ) {
    super(`Coupon rejected: ${reason}`);
    this.name = "CouponRejectedError";
  }
}

/** ບິນທີ່ບໍ່ນັບເປັນການໃຊ້ໂຄດ (ສິດຄືນເອງເມື່ອບິນຖືກຍົກເລີກ/ໝົດອາຍຸ) */
export const COUPON_RELEASED_STATUSES = ["CANCELLED", "EXPIRED"] as const;

export interface CouponEvaluation {
  couponId: string;
  code: string;
  /** ສ່ວນຫຼຸດ "12500.00" */
  discount: string;
}

export interface EvaluateCouponInput {
  /** ລະຫັດທີ່ normalize ແລ້ວ (trim + ຕົວພິມໃຫຍ່) */
  code: string;
  /** ຜົນລວມລາຍການຫຼັງສ່ວນຫຼຸດລາຍການ */
  merchandiseSubtotal: string;
  /** ເບີຂອງລູກຄ້າໃນບິນ; `undefined` = ຍັງບໍ່ຮູ້ (preview) ຈຶ່ງຂ້າມການກວດຕໍ່ເບີ; `null` = ບິນບໍ່ມີເບີ */
  phone?: string | null;
  now?: Date;
}

/**
 * ກວດໂຄດ ແລະ ຄິດສ່ວນຫຼຸດ. ບໍ່ຂຽນຫຍັງ: ການ "ໃຊ້" ໂຄດ = ຜູ້ເອີ້ນບັນທຶກ Order.couponId ໃນ transaction ດຽວກັນ.
 * ຕອນສ້າງບິນ ຕ້ອງເອີ້ນ `lockCoupon` ກ່ອນ ເພື່ອໃຫ້ການນັບ ແລະ ການບັນທຶກເປັນ atomic ຕໍ່ໂຄດ.
 */
export async function evaluateCoupon(db: Tx | PrismaClient, input: EvaluateCouponInput): Promise<CouponEvaluation> {
  const now = input.now ?? new Date();
  const coupon = await db.coupon.findUnique({ where: { code: input.code } });
  if (!coupon) throw new CouponRejectedError("NOT_FOUND");
  if (!coupon.isActive) throw new CouponRejectedError("INACTIVE");
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) throw new CouponRejectedError("NOT_STARTED");
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) throw new CouponRejectedError("EXPIRED");
  if (coupon.minSubtotal.greaterThan(input.merchandiseSubtotal)) {
    throw new CouponRejectedError("MIN_SUBTOTAL", { minSubtotal: coupon.minSubtotal.toFixed(2) });
  }

  const used = { couponId: coupon.id, status: { notIn: [...COUPON_RELEASED_STATUSES] } };
  if (coupon.usageLimit !== null && (await db.order.count({ where: used })) >= coupon.usageLimit) {
    throw new CouponRejectedError("USAGE_LIMIT");
  }
  if (coupon.perPhoneLimit !== null && input.phone !== undefined) {
    if (input.phone === null) throw new CouponRejectedError("PHONE_REQUIRED");
    const byPhone = await db.order.count({ where: { ...used, customer: { phone: input.phone } } });
    if (byPhone >= coupon.perPhoneLimit) throw new CouponRejectedError("PHONE_LIMIT");
  }

  return {
    couponId: coupon.id,
    code: coupon.code,
    discount: computeCouponDiscount(
      { type: coupon.type, value: coupon.value.toFixed(2), maxDiscount: coupon.maxDiscount?.toFixed(2) ?? null },
      input.merchandiseSubtotal,
    ),
  };
}

/** advisory lock ຕໍ່ໂຄດ ຈົນຈົບ transaction: ຄຳຂໍທີ່ໃຊ້ໂຄດດຽວກັນເຂົ້າທີລະອັນ (ກັນໃຊ້ເກີນ limit) */
export async function lockCoupon(tx: Tx, code: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${code}`}))`;
}

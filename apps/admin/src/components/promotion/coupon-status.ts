import type { StatusTone } from "@oca/ui";
import type { CouponDto } from "@/lib/types";

export type CouponStatus = "active" | "inactive" | "scheduled" | "expired" | "usedUp";

/** ສະຖານະທີ່ສະແດງໃນຕາຕະລາງ: ປິດ > ໝົດອາຍຸ > ຍັງບໍ່ເລີ່ມ > ໃຊ້ຄົບ > ໃຊ້ໄດ້ */
export function couponStatus(coupon: CouponDto, now: Date = new Date()): CouponStatus {
  if (!coupon.isActive) return "inactive";
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now.getTime()) return "expired";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) return "scheduled";
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return "usedUp";
  return "active";
}

export const COUPON_STATUS_TONE: Record<CouponStatus, StatusTone> = {
  active: "success",
  inactive: "neutral",
  scheduled: "info",
  expired: "neutral",
  usedUp: "warning",
};

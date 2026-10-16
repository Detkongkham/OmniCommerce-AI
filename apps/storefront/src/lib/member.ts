import { MEMBER_PIN_PATTERN, type MemberTier, type PointEntryType, pointsDiscount } from "@oca/shared";
import type { StoreMember } from "./types";

const TIER_LABELS: Record<MemberTier, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export function tierLabel(tier: MemberTier): string {
  return TIER_LABELS[tier] ?? tier;
}

const POINT_TYPE_LABELS: Record<PointEntryType, string> = {
  EARN: "ໄດ້ຈາກບິນ",
  EARN_REVERSAL: "ດຶງຄືນ (ບິນຖືກຍົກເລີກ)",
  REDEEM: "ໃຊ້ໃນບິນ",
  REDEEM_REFUND: "ຄືນແຕ້ມ",
  ADJUST: "ປັບໂດຍຮ້ານ",
};

export function pointTypeLabel(type: PointEntryType): string {
  return POINT_TYPE_LABELS[type] ?? type;
}

/** ມູນຄ່າເງິນຂອງແຕ້ມ "2500.00" */
export function pointsValue(points: number, pointValue: string): string {
  return pointsDiscount(points, pointValue);
}

/** ຄວາມຄືບໜ້າສູ່ລະດັບຖັດໄປ 0–100 (ຍອດ 12 ເດືອນ / ເກນຂອງລະດັບຖັດໄປ); null = ລະດັບສູງສຸດແລ້ວ */
export function tierProgress(member: Pick<StoreMember, "spend12m" | "nextTier">): number | null {
  if (!member.nextTier) return null;
  const target = Number(member.nextTier.minSpend);
  if (!(target > 0) || Number(member.nextTier.remaining) <= 0) return 100;
  const spend = Number(member.spend12m);
  return Math.max(0, Math.min(100, Math.floor((spend / target) * 100)));
}

/** PIN = ຕົວເລກ 6 ຕົວ (ກົດດຽວກັບ API) */
export function isValidPin(pin: string): boolean {
  return MEMBER_PIN_PATTERN.test(pin);
}

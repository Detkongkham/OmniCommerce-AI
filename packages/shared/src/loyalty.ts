import { Decimal } from "decimal.js";
import { z } from "zod";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
export const MEMBER_TIERS = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
export type MemberTier = (typeof MEMBER_TIERS)[number];

export const POINT_ENTRY_TYPES = ["EARN", "EARN_REVERSAL", "REDEEM", "REDEEM_REFUND", "ADJUST"] as const;
export type PointEntryType = (typeof POINT_ENTRY_TYPES)[number];

/** ເຫດຜົນທີ່ໃຊ້/ປັບແຕ້ມບໍ່ໄດ້ (ຢູ່ໃນ body ຂອງ 409 POINTS_INVALID) */
export const POINTS_REJECT_REASONS = ["DISABLED", "NO_CUSTOMER", "INSUFFICIENT", "OVER_CAP", "PHONE_MISMATCH"] as const;
export type PointsRejectReason = (typeof POINTS_REJECT_REASONS)[number];

export interface TierRule {
  tier: MemberTier;
  /** ຍອດຊື້ 12 ເດືອນຂັ້ນຕ່ຳ (baseCurrency) */
  minSpend: string;
  /** ຕົວຄູນແຕ້ມ 1–10 */
  multiplier: string;
}

export const DEFAULT_TIER_RULES: readonly TierRule[] = [
  { tier: "BRONZE", minSpend: "0", multiplier: "1" },
  { tier: "SILVER", minSpend: "2000000", multiplier: "1.25" },
  { tier: "GOLD", minSpend: "5000000", multiplier: "1.5" },
  { tier: "PLATINUM", minSpend: "10000000", multiplier: "2" },
];

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const MULTIPLIER = /^\d{1,2}(\.\d{1,2})?$/;

/** ຈຳນວນເງິນ > 0 ຂອງການຕັ້ງຄ່າແຕ້ມ (ກີບຕໍ່ແຕ້ມ, ມູນຄ່າແຕ້ມ) */
export const loyaltyAmountSchema = z
  .string()
  .trim()
  .regex(AMOUNT, "ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ")
  .refine((value) => new D(value).greaterThan(0), "ຕ້ອງຫຼາຍກວ່າ 0");

export const tierRulesSchema = z
  .array(
    z.strictObject({
      tier: z.enum(MEMBER_TIERS),
      minSpend: z.string().trim().regex(AMOUNT, "ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ"),
      multiplier: z
        .string()
        .trim()
        .regex(MULTIPLIER, "ຕົວຄູນບໍ່ຖືກຕ້ອງ")
        .refine((value) => new D(value).greaterThanOrEqualTo(1) && new D(value).lessThanOrEqualTo(10), "ຕົວຄູນຕ້ອງຢູ່ລະຫວ່າງ 1–10"),
    }),
  )
  .length(MEMBER_TIERS.length)
  .superRefine((rules, ctx) => {
    // ກົດຂ້າມແຖວ ກວດສະເພາະເມື່ອທຸກ minSpend ເປັນຕົວເລກແລ້ວ
    if (!rules.every((rule) => AMOUNT.test(rule.minSpend))) return;
    rules.forEach((rule, index) => {
      if (rule.tier !== MEMBER_TIERS[index]) {
        ctx.addIssue({ code: "custom", path: [index, "tier"], message: "ລະດັບຕ້ອງລຽງ BRONZE → PLATINUM" });
      }
      const previous = rules[index - 1];
      const min = new D(rule.minSpend);
      if (previous === undefined ? !min.isZero() : !min.greaterThan(previous.minSpend)) {
        ctx.addIssue({ code: "custom", path: [index, "minSpend"], message: index === 0 ? "ລະດັບທຳອິດຕ້ອງເລີ່ມທີ່ 0" : "ເກນຕ້ອງສູງກວ່າລະດັບກ່ອນໜ້າ" });
      }
    });
  });

/** ອ່ານ Json ຂອງ DB: ຮູບແບບຜິດ ຫຼື [] (ຄ່າເລີ່ມຂອງຖັນ) = ຄ່າເລີ່ມຕົ້ນ */
export function parseTierRules(value: unknown): TierRule[] {
  const parsed = tierRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TIER_RULES.map((rule) => ({ ...rule }));
}

/** ລະດັບ = ຂັ້ນສູງສຸດທີ່ເກນ <= ຍອດຊື້ */
export function tierForSpend(rules: readonly TierRule[], spend: string): MemberTier {
  let tier: MemberTier = "BRONZE";
  for (const rule of rules) if (new D(rule.minSpend).lessThanOrEqualTo(spend)) tier = rule.tier;
  return tier;
}

export function tierMultiplier(rules: readonly TierRule[], tier: MemberTier): string {
  return rules.find((rule) => rule.tier === tier)?.multiplier ?? "1";
}

/** ລະດັບຖັດໄປ ແລະ ຍອດທີ່ຕ້ອງຊື້ຕື່ມ; null = ຢູ່ລະດັບສູງສຸດແລ້ວ */
export function nextTier(rules: readonly TierRule[], spend: string): { tier: MemberTier; remaining: string } | null {
  const next = rules.find((rule) => new D(rule.minSpend).greaterThan(spend));
  return next ? { tier: next.tier, remaining: new D(next.minSpend).minus(spend).toFixed(2) } : null;
}

/** ແຕ້ມທີ່ໄດ້ = floor(ຍອດ / ກີບຕໍ່ແຕ້ມ x ຕົວຄູນ) */
export function pointsForAmount(amount: string, earnPer: string, multiplier: string): number {
  const per = new D(earnPer);
  const value = new D(amount);
  if (!per.greaterThan(0) || !value.greaterThan(0)) return 0;
  return value.mul(multiplier).div(per).floor().toNumber();
}

/** ແຕ້ມສູງສຸດທີ່ໃຊ້ໄດ້ໃນບິນ: ສ່ວນຫຼຸດບໍ່ເກີນ floor(ຍອດ x % / 100) ແລະ ບໍ່ເກີນຍອດແຕ້ມ */
export function maxRedeemablePoints(input: { merchandise: string; balance: number; pointValue: string; maxPercent: number }): number {
  const value = new D(input.pointValue);
  if (!value.greaterThan(0)) return 0;
  const capMoney = new D(input.merchandise).mul(input.maxPercent).div(100).floor();
  const byCap = capMoney.div(value).floor().toNumber();
  return Math.max(0, Math.min(input.balance, byCap));
}

/** ສ່ວນຫຼຸດຈາກແຕ້ມ "2500.00" */
export function pointsDiscount(points: number, pointValue: string): string {
  return new D(pointValue).mul(points).toFixed(2);
}

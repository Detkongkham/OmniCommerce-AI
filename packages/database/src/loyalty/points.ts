import {
  DEFAULT_TIER_RULES,
  type MemberTier,
  type PointEntryType,
  type PointsRejectReason,
  type TierRule,
  maxRedeemablePoints,
  parseTierRules,
  pointsDiscount,
  pointsForAmount,
  tierForSpend,
  tierMultiplier,
} from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import type { Tx } from "../inventory/stock-engine";

/** ບິນທີ່ນັບເປັນການຊື້ (ສະຖິຕິລູກຄ້າ, ຍອດຊື້ 12 ເດືອນ) */
export const COUNTED_ORDER_STATUSES = ["PAID", "PACKING", "SHIPPED", "COMPLETED"] as const;
const TIER_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/** ໃຊ້/ປັບແຕ້ມບໍ່ໄດ້ (ຜູ້ເອີ້ນແປເປັນ 409 POINTS_INVALID ແລະ ປ່ອຍໃຫ້ transaction rollback) */
export class PointsRejectedError extends Error {
  constructor(
    readonly reason: PointsRejectReason,
    /** ຂໍ້ມູນປະກອບ ເຊັ່ນ { balance } ຫຼື { maxPoints } */
    readonly detail: Record<string, number> = {},
  ) {
    super(`Points rejected: ${reason}`);
    this.name = "PointsRejectedError";
  }
}

export interface LoyaltyConfig {
  enabled: boolean;
  /** ກີບຕໍ່ 1 ແຕ້ມ */
  earnPer: string;
  /** ກີບຕໍ່ 1 ແຕ້ມຕອນແລກ */
  pointValue: string;
  maxRedeemPercent: number;
  tierRules: TierRule[];
}

interface DecimalLike {
  toFixed(decimalPlaces: number): string;
}

export function loyaltyConfigOf(row: {
  loyaltyEnabled: boolean;
  pointsEarnPer: DecimalLike;
  pointValue: DecimalLike;
  pointsMaxRedeemPercent: number;
  tierRules: unknown;
}): LoyaltyConfig {
  return {
    enabled: row.loyaltyEnabled,
    earnPer: row.pointsEarnPer.toFixed(2),
    pointValue: row.pointValue.toFixed(2),
    maxRedeemPercent: row.pointsMaxRedeemPercent,
    tierRules: parseTierRules(row.tierRules),
  };
}

/** ການຕັ້ງຄ່າແຕ້ມຂອງຮ້ານ; ຍັງບໍ່ມີແຖວ StoreSetting = ປິດ */
export async function loadLoyaltyConfig(db: Tx | PrismaClient): Promise<LoyaltyConfig> {
  const row = await db.storeSetting.findUnique({ where: { id: 1 } });
  if (row) return loyaltyConfigOf(row);
  return { enabled: false, earnPer: "10000.00", pointValue: "100.00", maxRedeemPercent: 50, tierRules: DEFAULT_TIER_RULES.map((rule) => ({ ...rule })) };
}

interface LockedCustomer {
  pointsBalance: number;
  tier: MemberTier;
}

/** ລັອກແຖວລູກຄ້າຈົນຈົບ transaction: ທຸກການປ່ຽນຍອດແຕ້ມຂອງລູກຄ້າຄົນດຽວເຂົ້າທີລະອັນ */
async function lockCustomer(tx: Tx, customerId: string): Promise<LockedCustomer | null> {
  const rows = await tx.$queryRaw<LockedCustomer[]>`
    SELECT "pointsBalance", "tier"::text AS "tier" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** ຂຽນ 1 ແຖວຂອງສະໝຸດ + ອັບເດດຍອດ. ຜູ້ເອີ້ນຕ້ອງຖື lock ຂອງລູກຄ້າ ແລະ ສົ່ງຍອດປັດຈຸບັນ. ຄືນຍອດໃໝ່ */
async function writeEntry(
  tx: Tx,
  balance: number,
  entry: { customerId: string; orderId?: string | null; type: PointEntryType; points: number; note?: string | null; actorId?: string | null },
): Promise<number> {
  const balanceAfter = balance + entry.points;
  await tx.pointEntry.create({
    data: {
      customerId: entry.customerId,
      orderId: entry.orderId ?? null,
      type: entry.type,
      points: entry.points,
      balanceAfter,
      note: entry.note ?? null,
      actorId: entry.actorId ?? null,
    },
  });
  await tx.customer.update({ where: { id: entry.customerId }, data: { pointsBalance: balanceAfter } });
  return balanceAfter;
}

export interface Redemption {
  points: number;
  /** ສ່ວນຫຼຸດ "2500.00" */
  discount: string;
}

/**
 * ກວດວ່າລູກຄ້າໃຊ້ແຕ້ມຈຳນວນນີ້ໃນບິນໄດ້ ແລະ ຄິດສ່ວນຫຼຸດ. ລັອກລູກຄ້າ ແຕ່ຍັງບໍ່ຫັກ:
 * ຜູ້ເອີ້ນສ້າງບິນແລ້ວເອີ້ນ `recordRedemption` ໃນ transaction ດຽວກັນ (lock ຍັງຖືຢູ່).
 */
export async function evaluateRedemption(
  tx: Tx,
  config: LoyaltyConfig,
  input: { customerId: string | null; points: number; /** ຄ່າສິນຄ້າຫຼັງສ່ວນຫຼຸດລາຍການ ແລະ ໂຄດ */ merchandise: string },
): Promise<Redemption> {
  if (!config.enabled) throw new PointsRejectedError("DISABLED");
  if (!input.customerId) throw new PointsRejectedError("NO_CUSTOMER");
  const customer = await lockCustomer(tx, input.customerId);
  if (!customer) throw new PointsRejectedError("NO_CUSTOMER");
  if (input.points > customer.pointsBalance) throw new PointsRejectedError("INSUFFICIENT", { balance: customer.pointsBalance });
  const maxPoints = maxRedeemablePoints({
    merchandise: input.merchandise,
    balance: customer.pointsBalance,
    pointValue: config.pointValue,
    maxPercent: config.maxRedeemPercent,
  });
  if (input.points > maxPoints) throw new PointsRejectedError("OVER_CAP", { maxPoints });
  return { points: input.points, discount: pointsDiscount(input.points, config.pointValue) };
}

/** ຫັກແຕ້ມທີ່ `evaluateRedemption` ອະນຸມັດ ໃຫ້ບິນທີ່ຫາກໍ່ສ້າງ */
export async function recordRedemption(tx: Tx, input: { customerId: string; orderId: string; points: number }): Promise<void> {
  const customer = await lockCustomer(tx, input.customerId);
  if (!customer || customer.pointsBalance < input.points) throw new PointsRejectedError("INSUFFICIENT", { balance: customer?.pointsBalance ?? 0 });
  await writeEntry(tx, customer.pointsBalance, { customerId: input.customerId, orderId: input.orderId, type: "REDEEM", points: -input.points });
}

async function spendInWindow(tx: Tx, customerId: string, now: Date): Promise<string> {
  const result = await tx.order.aggregate({
    where: { customerId, status: { in: [...COUNTED_ORDER_STATUSES] }, paidAt: { gte: new Date(now.getTime() - TIER_WINDOW_MS) } },
    _sum: { subtotal: true },
  });
  return (result._sum.subtotal ?? 0).toFixed(2);
}

/** ຍອດຊື້ 12 ເດືອນຫຼ້າສຸດຂອງລູກຄ້າ (ບິນທີ່ນັບ) */
export function customerSpend12m(db: Tx | PrismaClient, customerId: string, now: Date = new Date()): Promise<string> {
  return spendInWindow(db as Tx, customerId, now);
}

/** ຄິດລະດັບໃໝ່ຈາກຍອດຊື້ 12 ເດືອນ ແລະ ບັນທຶກຖ້າປ່ຽນ. ຄືນລະດັບປັດຈຸບັນ */
export async function recomputeTier(tx: Tx, customerId: string, config: LoyaltyConfig, now: Date = new Date()): Promise<MemberTier> {
  const tier = tierForSpend(config.tierRules, await spendInWindow(tx, customerId, now));
  await tx.customer.updateMany({ where: { id: customerId, tier: { not: tier } }, data: { tier } });
  return tier;
}

/**
 * ໃຫ້ແຕ້ມຂອງບິນທີ່ຫາກໍ່ເປັນ PAID (ເອີ້ນໃນ transaction ດຽວກັບການປ່ຽນສະຖານະ; ການປ່ຽນເປັນ PAID ເກີດຄັ້ງດຽວ).
 * ຕົວຄູນ = ລະດັບກ່ອນບິນນີ້; ຈາກນັ້ນຄິດລະດັບໃໝ່. ຄືນແຕ້ມທີ່ໃຫ້.
 */
export async function awardPointsForOrder(tx: Tx, orderId: string, config: LoyaltyConfig): Promise<number> {
  if (!config.enabled) return 0;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true, subtotal: true } });
  if (!order?.customerId) return 0;
  const customer = await lockCustomer(tx, order.customerId);
  if (!customer) return 0;
  const points = pointsForAmount(order.subtotal.toFixed(2), config.earnPer, tierMultiplier(config.tierRules, customer.tier));
  if (points > 0) {
    await writeEntry(tx, customer.pointsBalance, { customerId: order.customerId, orderId, type: "EARN", points });
    await tx.order.update({ where: { id: orderId }, data: { pointsEarned: points } });
  }
  await recomputeTier(tx, order.customerId, config);
  return points;
}

/**
 * ບິນຖືກຍົກເລີກ/ໝົດອາຍຸ: ຄືນແຕ້ມທີ່ໃຊ້ ແລະ ດຶງແຕ້ມທີ່ໃຫ້ຄືນ (ບໍ່ເກີນຍອດຄົງເຫຼືອ) ຢ່າງລະຄັ້ງດຽວ.
 * ເຮັດສະເໝີ ເຖິງລະບົບແຕ້ມຖືກປິດພາຍຫຼັງ (ແຕ້ມທີ່ຫັກໄປແລ້ວຕ້ອງຄືນ).
 */
export async function releaseOrderPoints(tx: Tx, orderId: string, config: LoyaltyConfig): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true, pointsRedeemed: true, pointsEarned: true } });
  if (!order?.customerId || (order.pointsRedeemed === 0 && order.pointsEarned === 0)) return;
  const customer = await lockCustomer(tx, order.customerId);
  if (!customer) return;
  const done = new Set((await tx.pointEntry.findMany({ where: { orderId }, select: { type: true } })).map((entry) => entry.type));
  let balance = customer.pointsBalance;
  if (order.pointsRedeemed > 0 && !done.has("REDEEM_REFUND")) {
    balance = await writeEntry(tx, balance, { customerId: order.customerId, orderId, type: "REDEEM_REFUND", points: order.pointsRedeemed });
  }
  if (order.pointsEarned > 0 && !done.has("EARN_REVERSAL")) {
    await writeEntry(tx, balance, { customerId: order.customerId, orderId, type: "EARN_REVERSAL", points: -Math.min(order.pointsEarned, balance) });
    await recomputeTier(tx, order.customerId, config);
  }
}

/** ປັບແຕ້ມດ້ວຍມື. ຄືນຍອດໃໝ່; null = ບໍ່ພົບລູກຄ້າ. ຍອດຈະຕິດລົບ → PointsRejectedError(INSUFFICIENT) */
export async function adjustPoints(
  tx: Tx,
  input: { customerId: string; points: number; note: string; actorId: string | null },
): Promise<number | null> {
  const customer = await lockCustomer(tx, input.customerId);
  if (!customer) return null;
  if (customer.pointsBalance + input.points < 0) throw new PointsRejectedError("INSUFFICIENT", { balance: customer.pointsBalance });
  return writeEntry(tx, customer.pointsBalance, { customerId: input.customerId, type: "ADJUST", points: input.points, note: input.note, actorId: input.actorId });
}

export interface RecomputeTiersResult {
  checked: number;
  changed: number;
  /** ລະບົບແຕ້ມປິດ: ບໍ່ແຕະລະດັບ */
  skipped: boolean;
}

/** ງານປະຈຳຄືນ: ຄິດລະດັບໃໝ່ຂອງລູກຄ້າທີ່ມີລະດັບ ຫຼື ມີບິນໃນ 12 ເດືອນ (ຫຼຸດລະດັບຄົນທີ່ຍອດຕົກອອກຈາກຊ່ວງ) */
export async function runRecomputeMemberTiers(db: PrismaClient, options: { now?: Date } = {}): Promise<RecomputeTiersResult> {
  const now = options.now ?? new Date();
  const config = await loadLoyaltyConfig(db);
  if (!config.enabled) return { checked: 0, changed: 0, skipped: true };
  const customers = await db.customer.findMany({
    where: {
      OR: [
        { tier: { not: "BRONZE" } },
        { orders: { some: { status: { in: [...COUNTED_ORDER_STATUSES] }, paidAt: { gte: new Date(now.getTime() - TIER_WINDOW_MS) } } } },
      ],
    },
    select: { id: true, tier: true },
  });
  let changed = 0;
  for (const customer of customers) {
    const tier = await db.$transaction(async (tx) => {
      if (!(await lockCustomer(tx, customer.id))) return customer.tier;
      return recomputeTier(tx, customer.id, config, now);
    });
    if (tier !== customer.tier) changed += 1;
  }
  return { checked: customers.length, changed, skipped: false };
}

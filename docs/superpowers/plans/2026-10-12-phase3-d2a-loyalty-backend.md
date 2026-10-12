# Phase 3 D2a: Points & Tiers Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Customers earn points when an order is paid, can spend them as a money discount on an order, and move between four tiers by 12-month spend; admins can adjust points and configure the rules.

**Architecture:** All point mutations live in `packages/database/src/loyalty` (the worker expires orders too) and always run inside the caller's transaction under a row lock on the customer: lock → write `PointEntry` → update `Customer.pointsBalance`. Pure formulas and schemas live in `@oca/shared`. `OrdersService` calls the engine at exactly three points: order creation (redeem), transition to `PAID` (earn), transition to `CANCELLED` (release); `expireOrder` calls release.

**Tech Stack:** Prisma 7 + Postgres row locks, NestJS 11, Zod 4, decimal.js, BullMQ (nightly tier job), Vitest + supertest.

Spec: `docs/superpowers/specs/2026-10-12-phase3-d-crm-loyalty-design.md` §3. Admin UI is plan D2b. Web redemption (`PHONE_MISMATCH`, member session) is D3.

API tests: `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api exec vitest run <file>`.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/loyalty.ts` + test (create) | tiers, reject reasons, `tierRulesSchema`, formulas |
| `packages/shared/src/schemas/inventory.ts` (modify) | settings fields, `pointsToRedeem` on create order |
| `packages/shared/src/schemas/crm.ts` (modify) | `tier` filter, `points` sort, `adjustPointsSchema` |
| `packages/shared/src/error-codes.ts`, `apps/api/src/common/api-error.ts` (modify) | `POINTS_INVALID` (409) |
| `schema.prisma`, migration `20261012010000_loyalty` | enums, `PointEntry`, new columns |
| `packages/database/src/loyalty/points.ts`, `index.ts` (create) | the engine |
| `packages/database/src/inventory/expire-reservations.ts` (modify) | refund points on expiry |
| `apps/api/src/common/points-error.ts` (create) | `PointsRejectedError` → 409 |
| `apps/api/src/modules/orders/orders.service.ts`, `orders.mapper.ts` (modify) | redeem / earn / release hooks, DTO fields |
| `apps/api/src/modules/inventory/store-settings.service.ts` (modify) | loyalty settings |
| `apps/api/src/modules/crm/*` (modify) | tier + points in list/detail/segments, ledger, adjust, merge moves points |
| `apps/worker/src/processors/recompute-member-tiers.processor.ts` + test, `maintenance.worker.ts`, `queues/names.ts` | nightly job |
| `apps/api/test/loyalty.e2e.test.ts`, `crm-loyalty.e2e.test.ts` (create), `helpers.ts`, `store-settings.e2e.test.ts` (modify) | tests |

---

### Task 1: Shared formulas and schemas

- [ ] **Step 1: failing test** `packages/shared/src/loyalty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_RULES,
  type TierRule,
  maxRedeemablePoints,
  nextTier,
  parseTierRules,
  pointsDiscount,
  pointsForAmount,
  tierForSpend,
  tierMultiplier,
  tierRulesSchema,
} from "./loyalty";
import { adjustPointsSchema, crmCustomerListQuerySchema } from "./schemas/crm";
import { createOrderSchema, updateStoreSettingsSchema } from "./schemas/inventory";

const rules = [...DEFAULT_TIER_RULES];

describe("pointsForAmount", () => {
  it("floor(ຍອດ / ກີບຕໍ່ແຕ້ມ x ຕົວຄູນ)", () => {
    expect(pointsForAmount("255000.00", "10000", "1")).toBe(25);
    expect(pointsForAmount("255000.00", "10000", "1.5")).toBe(38);
    expect(pointsForAmount("9999.99", "10000", "2")).toBe(1);
    expect(pointsForAmount("9999.99", "10000", "1")).toBe(0);
  });
  it("ຍອດ 0 / ອັດຕາ 0 ຫຼື ຕິດລົບ = 0 ແຕ້ມ", () => {
    expect(pointsForAmount("0", "10000", "1")).toBe(0);
    expect(pointsForAmount("5000", "0", "1")).toBe(0);
    expect(pointsForAmount("-5", "10", "1")).toBe(0);
  });
});

describe("maxRedeemablePoints / pointsDiscount", () => {
  it("ຈຳກັດດ້ວຍເພດານ % ຂອງຍອດ ແລະ ຍອດແຕ້ມ", () => {
    expect(maxRedeemablePoints({ merchandise: "100000.00", balance: 9999, pointValue: "100", maxPercent: 50 })).toBe(500);
    expect(maxRedeemablePoints({ merchandise: "100000.00", balance: 120, pointValue: "100", maxPercent: 50 })).toBe(120);
    // ເພດານ 33% ຂອງ 1000 = 330 → 3 ແຕ້ມ (ປັດລົງ)
    expect(maxRedeemablePoints({ merchandise: "1000.00", balance: 50, pointValue: "100", maxPercent: 33 })).toBe(3);
    expect(maxRedeemablePoints({ merchandise: "0.00", balance: 50, pointValue: "100", maxPercent: 50 })).toBe(0);
    expect(maxRedeemablePoints({ merchandise: "1000.00", balance: 50, pointValue: "0", maxPercent: 50 })).toBe(0);
  });
  it("ສ່ວນຫຼຸດ = ແຕ້ມ x ມູນຄ່າ", () => {
    expect(pointsDiscount(25, "100")).toBe("2500.00");
    expect(pointsDiscount(3, "0.5")).toBe("1.50");
  });
});

describe("ລະດັບ", () => {
  it("tierForSpend: ຂັ້ນສູງສຸດທີ່ເກນ <= ຍອດ (ຂອບລວມ)", () => {
    expect(tierForSpend(rules, "0")).toBe("BRONZE");
    expect(tierForSpend(rules, "1999999.99")).toBe("BRONZE");
    expect(tierForSpend(rules, "2000000.00")).toBe("SILVER");
    expect(tierForSpend(rules, "7000000")).toBe("GOLD");
    expect(tierForSpend(rules, "99000000")).toBe("PLATINUM");
  });
  it("tierMultiplier ແລະ nextTier", () => {
    expect(tierMultiplier(rules, "GOLD")).toBe("1.5");
    expect(nextTier(rules, "1500000.00")).toEqual({ tier: "SILVER", remaining: "500000.00" });
    expect(nextTier(rules, "10000000")).toBeNull();
  });
  it("tierRulesSchema: ຄົບ 4 ລະດັບຕາມລຳດັບ, BRONZE = 0, ເກນເພີ່ມຂຶ້ນ, ຕົວຄູນ 1–10", () => {
    expect(tierRulesSchema.safeParse(rules).success).toBe(true);
    const patch = (index: number, change: Partial<TierRule>) => rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule));
    expect(tierRulesSchema.safeParse(rules.slice(0, 3)).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(0, { minSpend: "1" })).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(2, { minSpend: "2000000" })).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(1, { multiplier: "0.5" })).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(1, { multiplier: "11" })).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(1, { minSpend: "abc" })).success).toBe(false);
    expect(tierRulesSchema.safeParse([rules[1], rules[0], rules[2], rules[3]]).success).toBe(false);
  });
  it("parseTierRules: ຄ່າທີ່ຜິດ/ຫວ່າງ (ຄ່າເລີ່ມຂອງ DB ຄື []) = ຄ່າເລີ່ມຕົ້ນ", () => {
    expect(parseTierRules([])).toEqual(rules);
    expect(parseTierRules(null)).toEqual(rules);
    const custom = rules.map((rule) => ({ ...rule, multiplier: "3" }));
    expect(parseTierRules(custom)).toEqual(custom);
  });
});

describe("schema ທີ່ກ່ຽວກັບແຕ້ມ", () => {
  it("createOrderSchema: pointsToRedeem ເປັນຈຳນວນເຕັມ > 0", () => {
    const base = { items: [{ variantId: "v1", quantity: 1 }] };
    expect(createOrderSchema.parse({ ...base, pointsToRedeem: 10 }).pointsToRedeem).toBe(10);
    for (const value of [0, -1, 1.5, "10"]) expect(createOrderSchema.safeParse({ ...base, pointsToRedeem: value }).success).toBe(false);
  });
  it("updateStoreSettingsSchema: ຄ່າແຕ້ມ", () => {
    expect(updateStoreSettingsSchema.parse({ loyaltyEnabled: true, pointsEarnPer: "5000", pointValue: "50", pointsMaxRedeemPercent: 30, tierRules: rules })).toMatchObject({
      loyaltyEnabled: true,
      pointsMaxRedeemPercent: 30,
    });
    for (const body of [{ pointsEarnPer: "0" }, { pointValue: "-1" }, { pointsMaxRedeemPercent: 0 }, { pointsMaxRedeemPercent: 101 }, { tierRules: [] }]) {
      expect(updateStoreSettingsSchema.safeParse(body).success).toBe(false);
    }
  });
  it("adjustPointsSchema: ບໍ່ແມ່ນ 0, ຕ້ອງມີເຫດຜົນ", () => {
    expect(adjustPointsSchema.parse({ points: -20, note: " ຄືນເງິນ " })).toEqual({ points: -20, note: "ຄືນເງິນ" });
    for (const body of [{ points: 0, note: "x" }, { points: 1.5, note: "x" }, { points: 5 }, { points: 5, note: " " }]) {
      expect(adjustPointsSchema.safeParse(body).success).toBe(false);
    }
  });
  it("crmCustomerListQuerySchema: tier ແລະ sort=points", () => {
    expect(crmCustomerListQuerySchema.parse({ tier: "GOLD", sort: "points" })).toMatchObject({ tier: "GOLD", sort: "points" });
    expect(crmCustomerListQuerySchema.safeParse({ tier: "DIAMOND" }).success).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/shared exec vitest run src/loyalty.test.ts` → FAIL.

- [ ] **Step 3: implement** `packages/shared/src/loyalty.ts`:

```ts
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
```

Then:

- `packages/shared/src/index.ts`: add `export * from "./loyalty";` **before** `export * from "./schemas/inventory";`.
- `schemas/inventory.ts`: `import { loyaltyAmountSchema, tierRulesSchema } from "../loyalty";`; in `createOrderSchema` after `couponCode`: `/** ແຕ້ມທີ່ລູກຄ້າໃຊ້ຫັກໃນບິນນີ້; server ກວດຍອດແຕ້ມ ແລະ ເພດານເອງ */ pointsToRedeem: z.number().int().min(1).max(100_000_000).optional(),`; in `updateStoreSettingsSchema` after `paymentReminderMinutes`: `loyaltyEnabled: z.boolean().optional(), pointsEarnPer: loyaltyAmountSchema.optional(), pointValue: loyaltyAmountSchema.optional(), pointsMaxRedeemPercent: z.number().int().min(1).max(100).optional(), tierRules: tierRulesSchema.optional(),`.
- `schemas/crm.ts`: `import { MEMBER_TIERS } from "../loyalty";`; sorts become `["lastOrder", "spent", "points", "created"]`; list query gets `tier: z.enum(MEMBER_TIERS).optional(),`; append

```ts
export const adjustPointsSchema = z.strictObject({
  /** ບວກ = ເພີ່ມ, ລົບ = ຫັກ */
  points: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0, "ຕ້ອງບໍ່ແມ່ນ 0"),
  note: z.string().trim().min(1).max(200),
});
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;
```

- `error-codes.ts`: add `"POINTS_INVALID",` after `"CUSTOMER_PHONE_TAKEN",`. `api-error.ts`: `POINTS_INVALID: HttpStatus.CONFLICT,`.
- admin strings so the admin build stays green: `crm-dictionary.ts` add `"customers.sort.points"` (lo "ແຕ້ມຫຼາຍສຸດ", en "Most points"); `dictionary.ts` add `error.POINTS_INVALID` (lo "ໃຊ້ແຕ້ມບໍ່ໄດ້", en "Points cannot be used").

- [ ] **Step 4:** `pnpm --filter @oca/shared test && pnpm --filter @oca/shared build` → PASS. `pnpm --filter @oca/admin typecheck` → clean. Commit `feat(shared): loyalty formulas, tier rules and points schemas`.

---

### Task 2: Schema, migration, engine

- [ ] **Step 1: schema.** Add enums after `enum CouponType`:

```prisma
enum MemberTier {
  BRONZE
  SILVER
  GOLD
  PLATINUM
}

enum PointEntryType {
  EARN // ບິນຈ່າຍແລ້ວ
  EARN_REVERSAL // ບິນທີ່ຈ່າຍແລ້ວຖືກຍົກເລີກ
  REDEEM // ໃຊ້ແຕ້ມຫັກໃນບິນ
  REDEEM_REFUND // ບິນທີ່ໃຊ້ແຕ້ມ ຖືກຍົກເລີກ/ໝົດອາຍຸ
  ADJUST // ແອດມິນປັບດ້ວຍມື
}

// ສະໝຸດແຕ້ມ (ເພີ່ມຢ່າງດຽວ). Customer.pointsBalance = ຜົນລວມ points ຂອງລູກຄ້າ, ອັບເດດໃນ transaction ດຽວກັນ
model PointEntry {
  id           String         @id @default(cuid())
  customerId   String
  customer     Customer       @relation(fields: [customerId], references: [id], onDelete: Cascade)
  orderId      String?
  order        Order?         @relation(fields: [orderId], references: [id], onDelete: SetNull)
  type         PointEntryType
  points       Int // ມີເຄື່ອງໝາຍ: ບວກ = ໄດ້, ລົບ = ໃຊ້
  balanceAfter Int
  note         String?
  actorId      String? // ພະນັກງານ (ADJUST); null = ລະບົບ
  createdAt    DateTime       @default(now())

  // ບິນໜຶ່ງມີແຖວແຕ່ລະຊະນິດໄດ້ຄັ້ງດຽວ (ກັນໄດ້/ຄືນຊ້ຳ); orderId null (ADJUST) ບໍ່ຕິດ
  @@unique([orderId, type])
  @@index([customerId, createdAt])
}
```

`Customer`: `pointsBalance  Int            @default(0)`, `tier           MemberTier     @default(BRONZE)`, `pointEntries   PointEntry[]`. `Order` (after `couponDiscount`): `pointsRedeemed Int     @default(0)`, `pointsDiscount Decimal @default(0) @db.Decimal(18, 2) // ລວມຢູ່ໃນ discountTotal ແລ້ວ`, `pointsEarned   Int     @default(0)`, and `pointEntries   PointEntry[]` with the other relations. `StoreSetting` (after `paymentReminderMinutes`): `loyaltyEnabled Boolean @default(false)`, `pointsEarnPer Decimal @default(10000) @db.Decimal(18, 2) // ກີບຕໍ່ 1 ແຕ້ມ`, `pointValue Decimal @default(100) @db.Decimal(18, 2) // ກີບຕໍ່ 1 ແຕ້ມຕອນແລກ`, `pointsMaxRedeemPercent Int @default(50)`, `tierRules Json @default("[]") // [] = DEFAULT_TIER_RULES ຂອງ @oca/shared`.

- [ ] **Step 2: migration** `packages/database/prisma/migrations/20261012010000_loyalty/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "MemberTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PointEntryType" AS ENUM ('EARN', 'EARN_REVERSAL', 'REDEEM', 'REDEEM_REFUND', 'ADJUST');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "pointsBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tier" "MemberTier" NOT NULL DEFAULT 'BRONZE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pointsDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pointValue" DECIMAL(18,2) NOT NULL DEFAULT 100,
ADD COLUMN     "pointsEarnPer" DECIMAL(18,2) NOT NULL DEFAULT 10000,
ADD COLUMN     "pointsMaxRedeemPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "tierRules" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "PointEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointEntry_customerId_createdAt_idx" ON "PointEntry"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointEntry_orderId_type_key" ON "PointEntry"("orderId", "type");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ຍອດແຕ້ມຕິດລົບບໍ່ໄດ້ (ຂຽນດ້ວຍມື: Prisma ບໍ່ຮອງຮັບ CHECK)
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pointsBalance_check" CHECK ("pointsBalance" >= 0);
```

Run `pnpm --filter @oca/database db:validate && pnpm --filter @oca/database build`. Add `"PointEntry", ` to the `TRUNCATE` list in `apps/api/test/helpers.ts` (before `"OrderItem"`).

- [ ] **Step 3: engine** `packages/database/src/loyalty/points.ts`:

```ts
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
```

`packages/database/src/loyalty/index.ts`: `export * from "./points";`. `packages/database/src/index.ts`: add `export * from "./loyalty";`.

In `expire-reservations.ts` `expireOrder`, after `await releaseCfClaims(tx, orderId);`: `await releaseOrderPoints(tx, orderId, await loadLoyaltyConfig(tx));` (import both from `../loyalty`; update the doc comment: "ຄືນສະຕ໋ອກ ແລະ ແຕ້ມທີ່ໃຊ້").

- [ ] **Step 4:** `pnpm --filter @oca/database build` → clean. Commit `feat(db): loyalty schema and points engine`.

---

### Task 3: Orders integration

- [ ] **Step 1: failing tests** `apps/api/test/loyalty.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, expireOrder, receive, runRecomputeMemberTiers } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../src/common/auth-types";
import { OrdersService } from "../src/modules/orders/orders.service";
import { seedCustomerOrder } from "./crm-fixtures";
import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedRoleUsers } from "./helpers";

const PHONE = "02055555555";
const TIERS = [
  { tier: "BRONZE", minSpend: "0", multiplier: "1" },
  { tier: "SILVER", minSpend: "400", multiplier: "2" },
  { tier: "GOLD", minSpend: "5000", multiplier: "3" },
  { tier: "PLATINUM", minSpend: "10000", multiplier: "4" },
];

describe("loyalty points (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 100 }));
    // 10 ກີບ = 1 ແຕ້ມ, 1 ແຕ້ມ = 1 ກີບ, ໃຊ້ໄດ້ບໍ່ເກີນ 50% ຂອງຍອດ; VAT 0 ເພື່ອໃຫ້ total = subtotal
    await db.storeSetting.create({
      data: { id: 1, name: "T", vatRate: "0", loyaltyEnabled: true, pointsEarnPer: "10", pointValue: "1", pointsMaxRedeemPercent: 50, tierRules: TIERS },
    });
  });

  /** ບິນ 5 x 100 = 500 ຂອງລູກຄ້າ PHONE */
  const order = (body: object = {}) =>
    request(server())
      .post("/orders")
      .set(chat)
      .send({ items: [{ variantId: f.v1.id, quantity: 5 }], customer: { name: "ກ", phone: PHONE }, ...body });
  const pay = (id: string) => request(server()).post(`/orders/${id}/pay`).set(manager);
  const cancel = (id: string) => request(server()).post(`/orders/${id}/cancel`).set(manager).send({});
  const customer = () => db.customer.findUniqueOrThrow({ where: { phone: PHONE } });
  const entries = async () =>
    (await db.pointEntry.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((entry) => `${entry.type}:${entry.points}:${entry.balanceAfter}`);
  const givePoints = async (points: number) => {
    const row = await db.customer.upsert({ where: { phone: PHONE }, create: { name: "ກ", phone: PHONE }, update: {} });
    await db.customer.update({ where: { id: row.id }, data: { pointsBalance: points } });
    return row.id;
  };

  describe("ໄດ້ແຕ້ມ", () => {
    it("ບິນຈ່າຍແລ້ວ: floor(subtotal / 10) ແຕ້ມ, ບັນທຶກໃນບິນ ແລະ ສະໝຸດ", async () => {
      const created = await order().expect(201);
      expect(created.body).toMatchObject({ pointsEarned: 0, pointsRedeemed: 0, pointsDiscount: "0.00" });
      expect((await customer()).pointsBalance).toBe(0);
      const paid = await pay(created.body.id).expect(201);
      expect(paid.body).toMatchObject({ status: "PAID", pointsEarned: 50 });
      expect(await customer()).toMatchObject({ pointsBalance: 50, tier: "SILVER" });
      expect(await entries()).toEqual(["EARN:50:50"]);
    });

    it("ຕົວຄູນ = ລະດັບກ່ອນບິນ: ບິນທຳອິດ x1 (ແລ້ວຂຶ້ນ SILVER), ບິນທີສອງ x2", async () => {
      await pay((await order().expect(201)).body.id).expect(201);
      const second = await pay((await order().expect(201)).body.id).expect(201);
      expect(second.body.pointsEarned).toBe(100);
      expect(await customer()).toMatchObject({ pointsBalance: 150, tier: "SILVER" });
    });

    it("ຢືນຢັນຜ່ານ payWithin (ເສັ້ນທາງສະລິບ) ກໍໄດ້ແຕ້ມຄືກັນ", async () => {
      const created = await order().expect(201);
      const owner = await db.user.findFirstOrThrow({ where: { email: "owner@role.test" } });
      await db.$transaction((tx) => app.get(OrdersService).payWithin(tx, created.body.id, { id: owner.id } as AuthUser));
      expect((await customer()).pointsBalance).toBe(50);
    });

    it("ລະບົບປິດ ຫຼື ບິນບໍ່ມີລູກຄ້າ: ບໍ່ໄດ້ແຕ້ມ", async () => {
      const walkIn = await request(server()).post("/orders").set(chat).send({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      await pay(walkIn.body.id).expect(201);
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      const created = await order().expect(201);
      const paid = await pay(created.body.id).expect(201);
      expect(paid.body.pointsEarned).toBe(0);
      expect(await db.pointEntry.count()).toBe(0);
      expect(await customer()).toMatchObject({ pointsBalance: 0, tier: "BRONZE" });
    });

    it("ຍົກເລີກບິນທີ່ຈ່າຍແລ້ວ: ດຶງແຕ້ມຄືນ (ບໍ່ເກີນຍອດຄົງເຫຼືອ) ແລະ ລະດັບກັບຄືນ", async () => {
      const first = await pay((await order().expect(201)).body.id).expect(201); // +50
      // ໃຊ້ 30 ແຕ້ມໃນບິນທີສອງ → ຍອດ 20
      await order({ pointsToRedeem: 30 }).expect(201);
      await cancel(first.body.id).expect(201);
      expect(await entries()).toEqual(["EARN:50:50", "REDEEM:-30:20", "EARN_REVERSAL:-20:0"]);
      expect(await customer()).toMatchObject({ pointsBalance: 0, tier: "BRONZE" });
    });
  });

  describe("ແລກແຕ້ມ", () => {
    it("ຫັກເປັນເງິນໃນບິນ: subtotal/total ຫຼຸດ, discountTotal ລວມ, ແຕ້ມຖືກຫັກທັນທີ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 120 }).expect(201);
      expect(res.body).toMatchObject({ pointsRedeemed: 120, pointsDiscount: "120.00", subtotal: "380.00", discountTotal: "120.00", total: "380.00" });
      expect((await customer()).pointsBalance).toBe(80);
      expect(await entries()).toEqual(["REDEEM:-120:80"]);
      // ແຕ້ມທີ່ໄດ້ ຄິດຈາກຍອດຫຼັງຫັກແຕ້ມ
      const paid = await pay(res.body.id).expect(201);
      expect(paid.body.pointsEarned).toBe(38);
    });

    it("ໃຊ້ຮ່ວມກັບໂຄດ: ເພດານຄິດຈາກຍອດຫຼັງໂຄດ", async () => {
      await givePoints(1000);
      await request(server()).post("/coupons").set(manager).send({ code: "OFF100", type: "FIXED", value: "100" }).expect(201);
      const over = await order({ couponCode: "OFF100", pointsToRedeem: 201 }).expect(409);
      expect(over.body).toMatchObject({ code: "POINTS_INVALID", reason: "OVER_CAP", maxPoints: 200 });
      const ok = await order({ couponCode: "OFF100", pointsToRedeem: 200 }).expect(201);
      expect(ok.body).toMatchObject({ couponDiscount: "100.00", pointsDiscount: "200.00", subtotal: "200.00", discountTotal: "300.00", total: "200.00" });
    });

    it("ປະຕິເສດ: DISABLED, NO_CUSTOMER, INSUFFICIENT, OVER_CAP; ບໍ່ສ້າງບິນ ແລະ ບໍ່ຈອງສະຕ໋ອກ", async () => {
      await givePoints(40);
      const insufficient = await order({ pointsToRedeem: 41 }).expect(409);
      expect(insufficient.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT", balance: 40 });
      await db.customer.update({ where: { phone: PHONE }, data: { pointsBalance: 900 } });
      const cap = await order({ pointsToRedeem: 251 }).expect(409);
      expect(cap.body).toMatchObject({ reason: "OVER_CAP", maxPoints: 250 });
      const walkIn = await request(server()).post("/orders").set(chat).send({ items: [{ variantId: f.v1.id, quantity: 1 }], pointsToRedeem: 1 }).expect(409);
      expect(walkIn.body.reason).toBe("NO_CUSTOMER");
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      const disabled = await order({ pointsToRedeem: 1 }).expect(409);
      expect(disabled.body.reason).toBe("DISABLED");
      expect(await db.order.count()).toBe(0);
      expect(await db.pointEntry.count()).toBe(0);
      await expectLedgerMatches(db);
    });

    it("ສອງບິນແຂ່ງກັນໃຊ້ແຕ້ມເກີນຍອດ: ສຳເລັດດຽວ", async () => {
      await givePoints(200);
      const results = await Promise.all([order({ pointsToRedeem: 150 }), order({ pointsToRedeem: 150 })]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)?.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT" });
      expect((await customer()).pointsBalance).toBe(50);
      expect(await db.order.count()).toBe(1);
      await expectLedgerMatches(db);
    });

    it("ຍົກເລີກບິນຄ້າງຈ່າຍ: ຄືນແຕ້ມຄັ້ງດຽວ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 100 }).expect(201);
      await cancel(res.body.id).expect(201);
      expect(await entries()).toEqual(["REDEEM:-100:100", "REDEEM_REFUND:100:200"]);
      await cancel(res.body.id).expect(409);
      expect((await customer()).pointsBalance).toBe(200);
    });

    it("ບິນໝົດອາຍຸ: ຄືນແຕ້ມ ເຖິງລະບົບແຕ້ມຖືກປິດແລ້ວ; expire ຊ້ຳບໍ່ຄືນຊ້ຳ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 100 }).expect(201);
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      await db.order.update({ where: { id: res.body.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      expect(await expireOrder(db, res.body.id)).toBe(true);
      expect(await expireOrder(db, res.body.id)).toBe(false);
      expect((await customer()).pointsBalance).toBe(200);
      expect(await db.pointEntry.count({ where: { type: "REDEEM_REFUND" } })).toBe(1);
      await expectLedgerMatches(db);
    });
  });

  describe("ງານຄິດລະດັບປະຈຳຄືນ", () => {
    it("ຫຼຸດລະດັບຄົນທີ່ຍອດຕົກອອກຈາກ 12 ເດືອນ, ຂຶ້ນລະດັບຄົນທີ່ຍອດເຖິງ; ລະບົບປິດ = ຂ້າມ", async () => {
      const lapsed = await db.customer.create({ data: { name: "Lapsed", tier: "GOLD" } });
      await seedCustomerOrder(db, lapsed.id, { subtotal: "6000.00", paidDaysAgo: 400 });
      const rising = await db.customer.create({ data: { name: "Rising" } });
      await seedCustomerOrder(db, rising.id, { subtotal: "600.00", paidDaysAgo: 10 });
      const idle = await db.customer.create({ data: { name: "Idle" } });

      expect(await runRecomputeMemberTiers(db)).toEqual({ checked: 2, changed: 2, skipped: false });
      const tierOf = async (id: string) => (await db.customer.findUniqueOrThrow({ where: { id } })).tier;
      expect(await tierOf(lapsed.id)).toBe("BRONZE");
      expect(await tierOf(rising.id)).toBe("SILVER");
      expect(await tierOf(idle.id)).toBe("BRONZE");

      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      await db.customer.update({ where: { id: idle.id }, data: { tier: "PLATINUM" } });
      expect(await runRecomputeMemberTiers(db)).toEqual({ checked: 0, changed: 0, skipped: true });
      expect(await tierOf(idle.id)).toBe("PLATINUM");
    });
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: implement.**

`apps/api/src/common/points-error.ts`:

```ts
import type { HttpException } from "@nestjs/common";
import { PointsRejectedError } from "@oca/database";
import { apiError } from "./api-error";

/** PointsRejectedError → 409 POINTS_INVALID { reason, ...detail }; error ອື່ນຄືນຕາມເດີມ */
export function pointsRejection(error: unknown): unknown {
  if (!(error instanceof PointsRejectedError)) return error;
  return apiError("POINTS_INVALID", `Points cannot be used: ${error.reason}`, { reason: error.reason, ...error.detail }) satisfies HttpException;
}
```

`orders.service.ts`:

1. Imports from `@oca/database`: `type Redemption, awardPointsForOrder, evaluateRedemption, loadLoyaltyConfig, loyaltyConfigOf, recordRedemption, releaseOrderPoints`; `import { pointsRejection } from "../../common/points-error";`.
2. In `createInTransaction`, declare `let redemption: Redemption | null = null;` next to `coupon`, and inside the `try`, after the coupon block:

```ts
        if (input.pointsToRedeem !== undefined) {
          // ລັອກລູກຄ້າຈົນ commit: ກວດຍອດແຕ້ມ ແລະ ຫັກ (ຫຼັງສ້າງບິນ) ເປັນ atomic ຕໍ່ລູກຄ້າ
          redemption = await evaluateRedemption(tx, loyaltyConfigOf(settings), {
            customerId,
            points: input.pointsToRedeem,
            merchandise: totals.subtotal,
          });
          const orderDiscount = new Prisma.Decimal(coupon?.discount ?? 0).plus(redemption.discount).toFixed(2);
          totals = calculateOrderTotals({ ...totalsInput, orderDiscount });
        }
```

   and change the catch's last line to `throw pointsRejection(couponRejection(error));`.
3. In `tx.order.create` data after `couponDiscount`: `pointsRedeemed: redemption?.points ?? 0, pointsDiscount: redemption?.discount ?? 0,`.
4. After `reserveMany(...)` in the same function: `if (redemption && customerId) await recordRedemption(tx, { customerId, orderId: order.id, points: redemption.points });`.
5. In `appendItemsInTx`: `orderDiscount: order.couponDiscount.plus(order.pointsDiscount).toFixed(2),`.
6. In `applyTransition`, right after `if (count === 0) return false;`:

```ts
    // ແຕ້ມ: ໄດ້ເມື່ອຈ່າຍ, ຄືນ/ດຶງຄືນເມື່ອຍົກເລີກ (transaction ດຽວກັບການປ່ຽນສະຖານະ)
    if (options.to === "PAID") await awardPointsForOrder(tx, id, await loadLoyaltyConfig(tx));
    else if (options.to === "CANCELLED") await releaseOrderPoints(tx, id, await loadLoyaltyConfig(tx));
```

`orders.mapper.ts`: in `OrderDetailDto` after `couponDiscount`: `/** ແຕ້ມທີ່ລູກຄ້າໃຊ້ຫັກໃນບິນ ແລະ ຍອດທີ່ຫັກ; pointsEarned = ແຕ້ມທີ່ໄດ້ເມື່ອຈ່າຍ */ pointsRedeemed: number; pointsDiscount: string; pointsEarned: number;` and in `toOrderDetail`: `pointsRedeemed: row.pointsRedeemed, pointsDiscount: money(row.pointsDiscount), pointsEarned: row.pointsEarned,` (use the file's existing money formatter).

- [ ] **Step 4:** run the file → PASS; run `test/orders.e2e.test.ts test/coupons.e2e.test.ts test/expire-reservations.test.ts test/cf-engine.e2e.test.ts test/orders-append.e2e.test.ts` → PASS (fix only assertions that compare a whole order DTO with `toEqual` by adding the three fields). Commit `feat(api): earn, redeem and release loyalty points on orders`.

---

### Task 4: Settings and CRM API

- [ ] **Step 1: failing tests** `apps/api/test/crm-loyalty.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCustomerOrder } from "./crm-fixtures";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("crm loyalty (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
  });
  const adjust = (id: string, body: object, auth = manager) => request(server()).post(`/crm/customers/${id}/points/adjust`).set(auth).send(body);

  describe("ການຕັ້ງຄ່າຮ້ານ", () => {
    it("ຄ່າເລີ່ມຕົ້ນ: ປິດ, 10000 ກີບ/ແຕ້ມ, 100 ກີບ/ແຕ້ມ, 50%, 4 ລະດັບ", async () => {
      const res = await request(server()).get("/settings/store").set(manager).expect(200);
      expect(res.body).toMatchObject({ loyaltyEnabled: false, pointsEarnPer: "10000.00", pointValue: "100.00", pointsMaxRedeemPercent: 50 });
      expect(res.body.tierRules.map((rule: { tier: string }) => rule.tier)).toEqual(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
      expect(res.body.tierRules[1]).toEqual({ tier: "SILVER", minSpend: "2000000", multiplier: "1.25" });
    });

    it("PATCH ບັນທຶກ ແລະ ກວດ tierRules", async () => {
      const tierRules = [
        { tier: "BRONZE", minSpend: "0", multiplier: "1" },
        { tier: "SILVER", minSpend: "1000000", multiplier: "1.5" },
        { tier: "GOLD", minSpend: "3000000", multiplier: "2" },
        { tier: "PLATINUM", minSpend: "6000000", multiplier: "3" },
      ];
      const res = await request(server())
        .patch("/settings/store")
        .set(manager)
        .send({ loyaltyEnabled: true, pointsEarnPer: "5000", pointValue: "50", pointsMaxRedeemPercent: 30, tierRules })
        .expect(200);
      expect(res.body).toMatchObject({ loyaltyEnabled: true, pointsEarnPer: "5000.00", pointValue: "50.00", pointsMaxRedeemPercent: 30, tierRules });
      await request(server()).patch("/settings/store").set(manager).send({ tierRules: tierRules.slice(0, 3) }).expect(400);
      await request(server()).patch("/settings/store").set(manager).send({ pointsEarnPer: "0" }).expect(400);
    });
  });

  describe("POST /crm/customers/:id/points/adjust", () => {
    it("ບວກ/ລົບ ພ້ອມເຫດຜົນ, ຍອດບໍ່ຕິດລົບ, audit, ສະໝຸດໃໝ່ສຸດກ່ອນ", async () => {
      const row = await db.customer.create({ data: { name: "ມະລິ", phone: "02055550001" } });
      const plus = await adjust(row.id, { points: 120, note: "ຊົດເຊີຍສິນຄ້າຊ້າ" }).expect(200);
      expect(plus.body).toMatchObject({ id: row.id, pointsBalance: 120 });
      const minus = await adjust(row.id, { points: -20, note: "ແກ້ໄຂ" }).expect(200);
      expect(minus.body.pointsBalance).toBe(100);
      const over = await adjust(row.id, { points: -500, note: "ຜິດ" }).expect(409);
      expect(over.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT", balance: 100 });

      const ledger = await request(server()).get(`/crm/customers/${row.id}/points`).set(chat).expect(200);
      expect(ledger.body).toMatchObject({ total: 2, page: 1 });
      expect(ledger.body.items[0]).toEqual({
        id: expect.any(String),
        type: "ADJUST",
        points: -20,
        balanceAfter: 100,
        note: "ແກ້ໄຂ",
        orderId: null,
        orderNumber: null,
        createdAt: expect.any(String),
      });
      expect(ledger.body.items[1]).toMatchObject({ points: 120, balanceAfter: 120 });
      const audit = await db.auditLog.findMany({ where: { action: "customer.points.adjust", entityId: row.id } });
      expect(audit).toHaveLength(2);
      expect(audit[0]?.after).toMatchObject({ points: expect.any(Number), balance: expect.any(Number), note: expect.any(String) });
    });

    it("body ຜິດ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403", async () => {
      const row = await db.customer.create({ data: { name: "X" } });
      await adjust(row.id, { points: 0, note: "x" }).expect(400);
      await adjust(row.id, { points: 5 }).expect(400);
      await adjust("nope", { points: 5, note: "x" }).expect(404);
      await adjust(row.id, { points: 5, note: "x" }, chat).expect(403);
      await request(server()).get("/crm/customers/nope/points").set(manager).expect(404);
    });

    it("ສະໝຸດສະແດງເລກບິນຂອງແຖວທີ່ມາຈາກບິນ", async () => {
      const row = await db.customer.create({ data: { name: "X", pointsBalance: 50 } });
      const order = await seedCustomerOrder(db, row.id, { subtotal: "500.00" });
      await db.pointEntry.create({ data: { customerId: row.id, orderId: order.id, type: "EARN", points: 50, balanceAfter: 50 } });
      const ledger = await request(server()).get(`/crm/customers/${row.id}/points`).set(manager).expect(200);
      expect(ledger.body.items[0]).toMatchObject({ type: "EARN", orderId: order.id, orderNumber: order.orderNumber });
    });
  });

  describe("ລະດັບ ແລະ ແຕ້ມ ໃນລາຍຊື່/ລາຍລະອຽດ", () => {
    it("list: tier + pointsBalance, ກັ່ນຕອງ tier, ລຽງ points; segments ນັບຕໍ່ລະດັບ", async () => {
      await db.customer.create({ data: { name: "Gold", tier: "GOLD", pointsBalance: 300 } });
      await db.customer.create({ data: { name: "Silver", tier: "SILVER", pointsBalance: 900 } });
      await db.customer.create({ data: { name: "Plain" } });
      const all = await request(server()).get("/crm/customers?sort=points").set(manager).expect(200);
      expect(all.body.items.map((item: { name: string }) => item.name)).toEqual(["Silver", "Gold", "Plain"]);
      expect(all.body.items[0]).toMatchObject({ tier: "SILVER", pointsBalance: 900 });
      const gold = await request(server()).get("/crm/customers?tier=GOLD").set(manager).expect(200);
      expect(gold.body.items.map((item: { name: string }) => item.name)).toEqual(["Gold"]);
      expect(gold.body.total).toBe(1);
      const summary = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(summary.body.tiers).toEqual({ BRONZE: 1, SILVER: 1, GOLD: 1, PLATINUM: 0 });
    });

    it("detail: ຍອດຊື້ 12 ເດືອນ ແລະ ລະດັບຖັດໄປ (ຕາມ tierRules ຂອງຮ້ານ)", async () => {
      const row = await db.customer.create({ data: { name: "ມະລິ", tier: "SILVER", pointsBalance: 42 } });
      await seedCustomerOrder(db, row.id, { subtotal: "2500000.00", paidDaysAgo: 30 });
      await seedCustomerOrder(db, row.id, { subtotal: "9000000.00", paidDaysAgo: 400 });
      const res = await request(server()).get(`/crm/customers/${row.id}`).set(manager).expect(200);
      expect(res.body).toMatchObject({
        tier: "SILVER",
        pointsBalance: 42,
        spend12m: "2500000.00",
        nextTier: { tier: "GOLD", remaining: "2500000.00" },
        totalSpent: "11500000.00",
      });
    });

    it("merge: ຍ້າຍແຕ້ມ + ສະໝຸດ ແລະ ຄິດລະດັບໃໝ່", async () => {
      await db.storeSetting.create({ data: { id: 1, name: "T", loyaltyEnabled: true } });
      const target = await db.customer.create({ data: { name: "T", phone: "02011111111", pointsBalance: 10 } });
      const source = await db.customer.create({ data: { name: "S", facebookUserId: "FB_S", pointsBalance: 40 } });
      await db.pointEntry.create({ data: { customerId: source.id, type: "ADJUST", points: 40, balanceAfter: 40, note: "seed" } });
      await seedCustomerOrder(db, source.id, { subtotal: "2500000.00", paidDaysAgo: 5 });
      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({ pointsBalance: 50, tier: "SILVER", orderCount: 1 });
      expect(await db.pointEntry.count({ where: { customerId: target.id } })).toBe(1);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.merge" } });
      expect(audit.after).toMatchObject({ movedPoints: 40 });
    });
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: implement.**

`store-settings.service.ts`: DTO gains `loyaltyEnabled: boolean; pointsEarnPer: string; pointValue: string; pointsMaxRedeemPercent: number; tierRules: TierRule[];`; `toStoreSettingsDto` maps them (`row.pointsEarnPer.toFixed(2)`, `parseTierRules(row.tierRules)`); `update` passes `loyaltyEnabled`, `pointsEarnPer`, `pointValue`, `pointsMaxRedeemPercent`, and `tierRules: input.tierRules as Prisma.InputJsonValue | undefined`. Update the exact-equality expectation in `store-settings.e2e.test.ts` (and any admin fixture typed as `StoreSettingsDto`) with the five defaults.

`crm-customers.service.ts`:

- `CrmCustomerListItemDto` gains `tier: MemberTier; pointsBalance: number;` (`ListRow` too; SELECT adds `c."tier"::text AS "tier", c."pointsBalance"`).
- list: `if (query.tier) conditions.push(Prisma.sql\`c."tier" = ${query.tier}::"MemberTier"\`);`; `ORDER_BY.points = Prisma.sql\`c."pointsBalance" DESC, c."createdAt" DESC, c.id\``.
- `CrmSegmentSummaryDto` gains `tiers: Record<MemberTier, number>` from `this.prisma.customer.groupBy({ by: ["tier"], _count: { _all: true } })`, zero-filled over `MEMBER_TIERS`.
- `CrmCustomerDetailDto` gains `spend12m: string; nextTier: { tier: MemberTier; remaining: string } | null;`; `get()` loads `loadLoyaltyConfig(this.prisma)` and `customerSpend12m(this.prisma, id)` and returns `tier: customer.tier, pointsBalance: customer.pointsBalance, spend12m, nextTier: nextTier(config.tierRules, spend12m)`.
- new methods:

```ts
  async points(id: string, query: CrmPageQuery): Promise<Page<CrmPointEntryDto>> {
    await this.requireCustomer(id);
    const where = { customerId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pointEntry.findMany({
        where,
        include: { order: { select: { orderNumber: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.pointEntry.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        points: row.points,
        balanceAfter: row.balanceAfter,
        note: row.note,
        orderId: row.orderId,
        orderNumber: row.order?.orderNumber ?? null,
        createdAt: row.createdAt,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async adjustPoints(id: string, input: AdjustPointsInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    let balance: number | null;
    try {
      balance = await this.prisma.$transaction((tx) => adjustPoints(tx, { customerId: id, points: input.points, note: input.note, actorId: actor.id }));
    } catch (error) {
      throw pointsRejection(error);
    }
    if (balance === null) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    await this.audit.record({
      userId: actor.id,
      action: "customer.points.adjust",
      entity: "Customer",
      entityId: id,
      after: { points: input.points, balance, note: input.note },
      ip,
    });
    return this.get(id);
  }
```

  with `export interface CrmPointEntryDto { id: string; type: string; points: number; balanceAfter: number; note: string | null; orderId: string | null; orderNumber: string | null; createdAt: Date; }`.
- merge, inside the transaction after moving conversations: `await tx.pointEntry.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });`; the target update adds `pointsBalance: target.pointsBalance + source.pointsBalance`; after it `await recomputeTier(tx, target.id, await loadLoyaltyConfig(tx));`; return and audit `movedPoints: source.pointsBalance`.

Controller: `GET :id/points` (`crm:read`, `crmPageQuerySchema`) and `POST :id/points/adjust` (`@HttpCode(200)`, `crm:write`, `adjustPointsSchema`).

- [ ] **Step 4:** run both CRM test files and `store-settings.e2e.test.ts` → PASS. Commit `feat(api): loyalty settings, points ledger, manual adjust and tier data in CRM`.

---

### Task 5: Nightly tier job

- [ ] **Step 1: failing test** `apps/worker/src/processors/recompute-member-tiers.processor.test.ts`:

```ts
import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { recomputeMemberTiersJob } from "./recompute-member-tiers.processor";

describe("recomputeMemberTiersJob", () => {
  it("ສົ່ງຕໍ່ໃຫ້ engine ແລະ ຄືນຜົນ", async () => {
    const db = {} as PrismaClient;
    const run = vi.fn().mockResolvedValue({ checked: 3, changed: 1, skipped: false });
    expect(await recomputeMemberTiersJob(db, run)).toEqual({ checked: 3, changed: 1, skipped: false });
    expect(run).toHaveBeenCalledWith(db);
  });
});
```

- [ ] **Step 2: implement** `recompute-member-tiers.processor.ts`:

```ts
import { type PrismaClient, type RecomputeTiersResult, runRecomputeMemberTiers } from "@oca/database";

/**
 * ຄິດລະດັບສະມາຊິກໃໝ່ປະຈຳຄືນ (ຫຼຸດລະດັບຄົນທີ່ຍອດຊື້ຕົກອອກຈາກ 12 ເດືອນ). Logic ຢູ່ໃນ @oca/database
 * (ທົດສອບກັບ Postgres ຈິງໃນ apps/api/test/loyalty.e2e.test.ts); `run` ປ່ຽນໄດ້ສຳລັບ test.
 */
export function recomputeMemberTiersJob(
  db: PrismaClient,
  run: (db: PrismaClient) => Promise<RecomputeTiersResult> = runRecomputeMemberTiers,
): Promise<RecomputeTiersResult> {
  return run(db);
}
```

`queues/names.ts`: `export const JOB_RECOMPUTE_MEMBER_TIERS = "recompute-member-tiers";`. `maintenance.worker.ts`: after the existing `upsertJobScheduler` add

```ts
    // Daily at 03:30: re-rank member tiers on rolling 12-month spend.
    await this.queue.upsertJobScheduler(
      JOB_RECOMPUTE_MEMBER_TIERS,
      { pattern: "30 3 * * *" },
      { name: JOB_RECOMPUTE_MEMBER_TIERS },
    );
```

and in `process`:

```ts
      case JOB_RECOMPUTE_MEMBER_TIERS: {
        const result = await recomputeMemberTiersJob(this.prisma);
        this.logger.log(result.skipped ? "Member tiers skipped: loyalty is off" : `Member tiers: checked ${result.checked}, changed ${result.changed}`);
        return result;
      }
```

- [ ] **Step 3:** `pnpm --filter @oca/worker test && pnpm --filter @oca/worker build` → PASS. Commit `feat(worker): nightly member tier recompute`.

---

### Task 6: Full verification

- [ ] `pnpm --filter @oca/shared test`, `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api test`, `pnpm --filter @oca/worker test`, `pnpm --filter @oca/admin test`, `pnpm --filter @oca/storefront test`; `tsc`/`eslint` for api, worker, admin, storefront → all clean.
- [ ] Check the migration matches the schema: after the API tests have deployed it to `oca_test_crm`, run from `packages/database` `DATABASE_URL=<test db url> pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (or the equivalent flags this Prisma version documents) → "No difference detected" apart from the hand-written CHECK constraint.

## Self-review

- Spec §3 coverage: data (T2); single engine with customer row lock (T2); earn on PAID via both pay paths, tier-before-order multiplier, reversal clamped at balance (T3); redeem with cap after coupon, money invariants, rejects, race, refund on cancel/expire regardless of `loyaltyEnabled`, `appendItemsInTx` (T3); tiers on pay/cancel/merge + nightly job skipping when disabled (T2, T4, T5); settings, adjust with audit, order DTO fields (T3, T4). `PHONE_MISMATCH` is declared here but only raised in D3. Admin UI is D2b.
- Names: `evaluateRedemption` / `recordRedemption` / `awardPointsForOrder` / `releaseOrderPoints` / `adjustPoints` / `recomputeTier` / `customerSpend12m` / `runRecomputeMemberTiers` / `loadLoyaltyConfig` / `loyaltyConfigOf` are used with the same signatures in every task.

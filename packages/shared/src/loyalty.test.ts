import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_RULES,
  type TierRule,
  maxRedeemablePoints,
  nextTierAfter,
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
  it("tierMultiplier", () => {
    expect(tierMultiplier(rules, "GOLD")).toBe("1.5");
  });
  it("nextTierAfter: ລະດັບຖັດຈາກລະດັບທີ່ບັນທຶກ (ບໍ່ແມ່ນຈາກຍອດ), ຍອດທີ່ເຫຼືອບໍ່ຕິດລົບ", () => {
    expect(nextTierAfter(rules, "BRONZE", "1500000.00")).toEqual({ tier: "SILVER", minSpend: "2000000.00", remaining: "500000.00" });
    // ລະດັບທີ່ບັນທຶກຍັງບໍ່ຖືກຄິດໃໝ່: ຍອດເກີນເກນແລ້ວ ແຕ່ຍັງຊີ້ໄປລະດັບຖັດຈາກ BRONZE ດ້ວຍ remaining 0
    expect(nextTierAfter(rules, "BRONZE", "7000000")).toEqual({ tier: "SILVER", minSpend: "2000000.00", remaining: "0.00" });
    // ລະດັບສູງກວ່າຍອດ (ເຊັ່ນ ບິນຖືກຄືນ): ບໍ່ຊີ້ກັບລົງ
    expect(nextTierAfter(rules, "GOLD", "100")).toEqual({ tier: "PLATINUM", minSpend: "10000000.00", remaining: "9999900.00" });
    expect(nextTierAfter(rules, "PLATINUM", "0")).toBeNull();
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
    expect(tierRulesSchema.safeParse(patch(1, { multiplier: "" })).success).toBe(false);
    expect(tierRulesSchema.safeParse(patch(1, { multiplier: "x2" })).success).toBe(false);
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
    for (const body of [{ pointsEarnPer: "0" }, { pointsEarnPer: "" }, { pointsEarnPer: "abc" }, { pointValue: "-1" }, { pointsMaxRedeemPercent: 0 }, { pointsMaxRedeemPercent: 101 }, { tierRules: [] }]) {
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

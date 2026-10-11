import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "../order-totals";
import { computeCouponDiscount, couponCodeSchema, couponPreviewSchema, createCouponSchema, updateCouponSchema } from "./promotion";

describe("couponCodeSchema", () => {
  it("trim + ຕົວພິມໃຫຍ່; A-Z 0-9 _ - ຍາວ 3..30", () => {
    expect(couponCodeSchema.parse("  new10 ")).toBe("NEW10");
    expect(couponCodeSchema.safeParse("ab").success).toBe(false);
    expect(couponCodeSchema.safeParse("ມີ ຍະຫວ່າງ").success).toBe(false);
    expect(couponCodeSchema.safeParse("A".repeat(31)).success).toBe(false);
  });
});

describe("createCouponSchema", () => {
  const base = { code: "NEW10", type: "PERCENT", value: "10" };

  it("ຄ່າເລີ່ມຕົ້ນ: minSubtotal 0, isActive true", () => {
    expect(createCouponSchema.parse(base)).toMatchObject({ code: "NEW10", minSubtotal: "0", isActive: true });
  });

  it("PERCENT ຕ້ອງຢູ່ 1..100 ແລະ ເປັນຈຳນວນເຕັມ; FIXED ຕ້ອງ > 0", () => {
    expect(createCouponSchema.safeParse({ ...base, value: "0" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, value: "101" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, value: "12.5" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, type: "FIXED", value: "0" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, type: "FIXED", value: "20000" }).success).toBe(true);
  });

  it("maxDiscount ໃຊ້ໄດ້ສະເພາະ PERCENT", () => {
    expect(createCouponSchema.safeParse({ ...base, maxDiscount: "50000" }).success).toBe(true);
    expect(createCouponSchema.safeParse({ ...base, type: "FIXED", value: "100", maxDiscount: "50" }).success).toBe(false);
  });

  it("endsAt ຕ້ອງຫຼັງ startsAt; limit ຕ້ອງ >= 1", () => {
    expect(createCouponSchema.safeParse({ ...base, startsAt: "2026-10-02T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-02T00:00:00Z" }).success).toBe(true);
    expect(createCouponSchema.safeParse({ ...base, usageLimit: 0 }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, perPhoneLimit: 1, usageLimit: 100 }).success).toBe(true);
  });
});

describe("updateCouponSchema", () => {
  it("ຕ້ອງມີຢ່າງໜ້ອຍ 1 field; null ລ້າງຄ່າທີ່ເປັນທາງເລືອກ", () => {
    expect(updateCouponSchema.safeParse({}).success).toBe(false);
    expect(updateCouponSchema.parse({ endsAt: null, usageLimit: null, maxDiscount: null })).toEqual({ endsAt: null, usageLimit: null, maxDiscount: null });
    expect(updateCouponSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe("couponPreviewSchema", () => {
  it("code ຖືກ normalize; phone ເປັນທາງເລືອກ", () => {
    expect(couponPreviewSchema.parse({ code: "new10", subtotal: "100000" })).toEqual({ code: "NEW10", subtotal: "100000" });
    expect(couponPreviewSchema.safeParse({ code: "new10", subtotal: "x" }).success).toBe(false);
  });
});

describe("computeCouponDiscount", () => {
  it("PERCENT: ປັດລົງເປັນໜ່ວຍເຕັມ ແລະ ບີບດ້ວຍ maxDiscount", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: "10", maxDiscount: null }, "85000.00")).toBe("8500.00");
    expect(computeCouponDiscount({ type: "PERCENT", value: "15", maxDiscount: null }, "9999.00")).toBe("1499.00");
    expect(computeCouponDiscount({ type: "PERCENT", value: "50", maxDiscount: "20000" }, "100000")).toBe("20000.00");
    expect(computeCouponDiscount({ type: "PERCENT", value: "100", maxDiscount: null }, "5000")).toBe("5000.00");
  });

  it("FIXED: ບໍ່ເກີນຍອດຄ່າສິນຄ້າ", () => {
    expect(computeCouponDiscount({ type: "FIXED", value: "20000", maxDiscount: null }, "85000")).toBe("20000.00");
    expect(computeCouponDiscount({ type: "FIXED", value: "20000", maxDiscount: null }, "15000")).toBe("15000.00");
  });
});

describe("calculateOrderTotals + orderDiscount", () => {
  const input = (orderDiscount?: string, pricesIncludeVat = true) => ({
    lines: [
      { unitPrice: "50000", quantity: 2, discount: "5000" },
      { unitPrice: "10000", quantity: 1, discount: "0" },
    ],
    shippingFee: "0",
    vatRate: "10",
    pricesIncludeVat,
    ...(orderDiscount === undefined ? {} : { orderDiscount }),
  });

  it("ບໍ່ສົ່ງ orderDiscount = ຜົນຄືເກົ່າ", () => {
    expect(calculateOrderTotals(input())).toMatchObject({ subtotal: "105000.00", discountTotal: "5000.00", total: "105000.00" });
  });

  it("orderDiscount ຫັກຈາກ subtotal ແລະ ລວມເຂົ້າ discountTotal; lineTotal ບໍ່ປ່ຽນ; gross = subtotal + discountTotal ຄົງທີ່", () => {
    const totals = calculateOrderTotals(input("10500"));
    expect(totals).toMatchObject({ subtotal: "94500.00", discountTotal: "15500.00", total: "94500.00", vatAmount: "8590.91" });
    expect(totals.lines).toEqual([{ lineTotal: "95000.00" }, { lineTotal: "10000.00" }]);
    expect(Number(totals.subtotal) + Number(totals.discountTotal)).toBe(110000);
  });

  it("ລາຄາບໍ່ລວມ VAT: VAT ຄິດຈາກຍອດຫຼັງສ່ວນຫຼຸດ", () => {
    expect(calculateOrderTotals(input("5000", false))).toMatchObject({ subtotal: "100000.00", vatAmount: "10000.00", total: "110000.00" });
  });

  it("orderDiscount ເກີນຍອດຄ່າສິນຄ້າ → RangeError", () => {
    expect(() => calculateOrderTotals(input("105000.01"))).toThrow(RangeError);
  });
});

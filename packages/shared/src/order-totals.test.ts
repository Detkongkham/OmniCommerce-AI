import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "./order-totals";

describe("calculateOrderTotals", () => {
  it("ລາຄາລວມ VAT (ຕົວຢ່າງໃນ spec §7.2)", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "12500.00", quantity: 2, discount: "500.00" }],
      shippingFee: "15000.00",
      vatRate: "10",
      pricesIncludeVat: true,
    });
    expect(result).toEqual({
      lines: [{ lineTotal: "24500.00" }],
      subtotal: "24500.00",
      discountTotal: "500.00",
      vatAmount: "3590.91",
      total: "39500.00",
    });
  });

  it("ລາຄາບໍ່ລວມ VAT: ບວກ VAT ເຂົ້າ total", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "100.00", quantity: 3, discount: "0" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: false,
    });
    expect(result.subtotal).toBe("300.00");
    expect(result.vatAmount).toBe("30.00");
    expect(result.total).toBe("330.00");
  });

  it("ປັດເສດແບບ half-up ທີ່ 2 ຫຼັກ", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "0.05", quantity: 1, discount: "0" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: false,
    });
    expect(result.vatAmount).toBe("0.01"); // 0.005 -> 0.01
    expect(result.total).toBe("0.06");
  });

  it("ຫຼາຍລາຍການ: ລວມ subtotal ແລະ discountTotal", () => {
    const result = calculateOrderTotals({
      lines: [
        { unitPrice: "10.00", quantity: 2, discount: "1.00" },
        { unitPrice: "5.50", quantity: 1, discount: "0" },
      ],
      shippingFee: "2.00",
      vatRate: "0",
      pricesIncludeVat: true,
    });
    expect(result.lines).toEqual([{ lineTotal: "19.00" }, { lineTotal: "5.50" }]);
    expect(result.subtotal).toBe("24.50");
    expect(result.discountTotal).toBe("1.00");
    expect(result.vatAmount).toBe("0.00");
    expect(result.total).toBe("26.50");
  });

  it("ສ່ວນຫຼຸດ = ລາຄາເຕັມ ໄດ້ lineTotal 0", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "100.00", quantity: 1, discount: "100.00" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: true,
    });
    expect(result.lines[0]?.lineTotal).toBe("0.00");
    expect(result.total).toBe("0.00");
  });

  it("ສ່ວນຫຼຸດເກີນລາຄາ throw RangeError", () => {
    expect(() =>
      calculateOrderTotals({
        lines: [{ unitPrice: "100.00", quantity: 1, discount: "100.01" }],
        shippingFee: "0",
        vatRate: "10",
        pricesIncludeVat: true,
      }),
    ).toThrow(RangeError);
  });
});

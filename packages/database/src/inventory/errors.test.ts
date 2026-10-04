import { describe, expect, it } from "vitest";
import { InsufficientStockError, isStockCheckViolation } from "./errors";

describe("InsufficientStockError", () => {
  it("ເກັບລາຍການທີ່ບໍ່ພໍ ແລະ ເປັນ Error", () => {
    const shortages = [{ variantId: "v1", warehouseId: "w1", requested: 5, available: 2 }];
    const error = new InsufficientStockError(shortages);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InsufficientStockError");
    expect(error.shortages).toEqual(shortages);
    expect(error.message).toContain("1");
  });
});

describe("isStockCheckViolation", () => {
  it("ຈັບຈາກ message", () => {
    expect(isStockCheckViolation(new Error('violates check constraint "StockLevel_stock_check"'))).toBe(true);
  });
  it("ຈັບຈາກ meta (driver adapter)", () => {
    const error = Object.assign(new Error("Raw query failed"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { constraint: "StockLevel_stock_check" } } },
    });
    expect(isStockCheckViolation(error)).toBe(true);
  });
  it("error ອື່ນ ແລະ ຄ່າທີ່ບໍ່ແມ່ນ object ຄືນ false", () => {
    expect(isStockCheckViolation(new Error("connection reset"))).toBe(false);
    expect(isStockCheckViolation(null)).toBe(false);
    expect(isStockCheckViolation("StockLevel_stock_check")).toBe(false);
  });
  it("meta ທີ່ stringify ບໍ່ໄດ້ (BigInt) ບໍ່ throw", () => {
    const error = Object.assign(new Error("x"), { meta: { n: 1n } });
    expect(isStockCheckViolation(error)).toBe(false);
  });
});

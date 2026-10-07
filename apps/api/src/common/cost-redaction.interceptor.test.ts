import { describe, expect, it } from "vitest";
import { stripCostFields } from "./cost-redaction.interceptor";

describe("stripCostFields", () => {
  it("ລຶບ costPrice/unitCost ທຸກລະດັບ (object ແລະ array) ແລະ ຮັກສາ Date + null", () => {
    const at = new Date();
    const result = stripCostFields({
      id: "p",
      createdAt: at,
      note: null,
      variants: [{ sku: "A", price: "1.00", costPrice: "0.50", stock: [{ onHand: 1 }] }],
      items: [{ unitPrice: "2.00", unitCost: "1.00" }],
    });
    expect(result).toEqual({
      id: "p",
      createdAt: at,
      note: null,
      variants: [{ sku: "A", price: "1.00", stock: [{ onHand: 1 }] }],
      items: [{ unitPrice: "2.00" }],
    });
  });

  it("ຄ່າທີ່ບໍ່ແມ່ນ object ຜ່ານໄປຕາມເດີມ", () => {
    expect(stripCostFields(undefined)).toBeUndefined();
    expect(stripCostFields("x")).toBe("x");
    expect(stripCostFields([1, 2])).toEqual([1, 2]);
  });
});

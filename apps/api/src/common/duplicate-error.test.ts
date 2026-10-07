import { describe, expect, it } from "vitest";
import { duplicateError, fieldNameFromConstraint } from "./duplicate-error";

describe("fieldNameFromConstraint", () => {
  it("maps known and generic constraint names", () => {
    expect(fieldNameFromConstraint("ProductVariant_sku_key")).toBe("sku");
    expect(fieldNameFromConstraint("Warehouse_code_key")).toBe("code");
    expect(fieldNameFromConstraint("Thing_someCol_key")).toBe("someCol");
    expect(fieldNameFromConstraint("weird")).toBe("weird");
    expect(fieldNameFromConstraint("sku")).toBe("sku");
  });
});

describe("duplicateError", () => {
  it("names the field and ignores non-unique errors", () => {
    const error = duplicateError({ code: "P2002", meta: { target: ["ProductVariant_barcode_key"] } });
    expect(error?.getStatus()).toBe(409);
    expect(error?.message).toContain("barcode");
    expect(error?.message).not.toContain("_key");
    expect(duplicateError(new Error("x"))).toBeUndefined();
  });
});

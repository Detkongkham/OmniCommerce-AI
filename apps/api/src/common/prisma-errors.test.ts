import { describe, expect, it } from "vitest";
import { isUniqueViolation, prismaErrorCode, uniqueViolationFields } from "./prisma-errors";

describe("prisma-errors", () => {
  it("prismaErrorCode / isUniqueViolation", () => {
    expect(prismaErrorCode({ code: "P2002" })).toBe("P2002");
    expect(prismaErrorCode(null)).toBeUndefined();
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2003" })).toBe(false);
  });
  it("uniqueViolationFields ອ່ານ meta.target", () => {
    expect(uniqueViolationFields({ code: "P2002", meta: { target: ["sku"] } })).toEqual(["sku"]);
    expect(uniqueViolationFields({ code: "P2003" })).toBeUndefined();
  });
});

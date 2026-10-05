import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode } from "./error-codes";

describe("ERROR_CODES", () => {
  it("ບໍ່ຊ້ຳ ແລະ ເປັນ UPPER_SNAKE_CASE", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });
  it("isErrorCode", () => {
    expect(isErrorCode("INSUFFICIENT_STOCK")).toBe(true);
    expect(isErrorCode("nope")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});

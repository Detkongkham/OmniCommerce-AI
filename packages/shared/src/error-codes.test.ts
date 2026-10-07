import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode } from "./error-codes";

describe("ERROR_CODES", () => {
  it("ບໍ່ຊ້ຳ ແລະ ເປັນ UPPER_SNAKE_CASE", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });
  it("ມີ code ຂອງ inbox", () => {
    for (const code of ["CONVERSATION_NOT_FOUND", "USER_NOT_FOUND", "CHANNEL_NOT_CONFIGURED"]) {
      expect(isErrorCode(code), code).toBe(true);
    }
  });
  it("ມີ code ຂອງ slip", () => {
    for (const code of [
      "SLIP_NOT_FOUND",
      "SLIP_ALREADY_REVIEWED",
      "SLIP_NOT_LINKED",
      "SLIP_FILE_INVALID",
      "SLIP_AMOUNT_REQUIRED",
    ]) {
      expect(isErrorCode(code), code).toBe(true);
    }
  });
  it("isErrorCode", () => {
    expect(isErrorCode("INSUFFICIENT_STOCK")).toBe(true);
    expect(isErrorCode("nope")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});

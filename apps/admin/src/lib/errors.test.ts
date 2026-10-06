import { ERROR_CODES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { ActionBusyError, errorMessage, extractShortages, shortageLines } from "./errors";
import { type TranslationKey, dictionaries, translate } from "./i18n/dictionary";

const t = (key: TranslationKey, params?: Record<string, string | number>) => translate("en", key, params);

describe("errorMessage", () => {
  it("ActionBusyError ແປເປັນຂໍ້ຄວາມ 'ກຳລັງດຳເນີນການອື່ນຢູ່'", () => {
    expect(errorMessage(new ActionBusyError(), t)).toBe(t("common.busy"));
  });

  it("ແປຈາກ code ທີ່ຮູ້ຈັກ (ບໍ່ສົນ message ພາສາອັງກິດຂອງ API)", () => {
    const error = new ApiError(409, "Warehouse is inactive", [], "WAREHOUSE_INACTIVE");
    expect(errorMessage(error, t)).toBe(t("error.WAREHOUSE_INACTIVE"));
    expect(errorMessage(error, t)).not.toBe("Warehouse is inactive");
  });

  it("CONFLICT/BAD_REQUEST ໃຊ້ message ຂອງ API ຖ້າມີ ເພື່ອບໍ່ເສຍລາຍລະອຽດ", () => {
    expect(errorMessage(new ApiError(409, "Cannot remove the last active OWNER", [], "CONFLICT"), t)).toBe(
      "Cannot remove the last active OWNER",
    );
    expect(errorMessage(new ApiError(400, "name must not be empty", [], "BAD_REQUEST"), t)).toBe("name must not be empty");
  });

  it("FORBIDDEN / NOT_FOUND / UNAUTHORIZED / INTERNAL_ERROR ໃຊ້ຂໍ້ຄວາມແປສະເໝີ ບໍ່ຮົ່ວ message ອັງກິດ", () => {
    expect(errorMessage(new ApiError(403, "Setting costPrice requires costs:write", [], "FORBIDDEN"), t)).toBe(t("error.FORBIDDEN"));
    expect(errorMessage(new ApiError(404, "Product xyz not found", [], "NOT_FOUND"), t)).toBe(t("error.NOT_FOUND"));
    expect(errorMessage(new ApiError(401, "Invalid credentials", [], "UNAUTHORIZED"), t)).toBe(t("error.UNAUTHORIZED"));
    expect(errorMessage(new ApiError(500, "Internal server error", [], "INTERNAL_ERROR"), t)).toBe(t("error.INTERNAL_ERROR"));
  });

  it("status >= 500 ໃຊ້ຂໍ້ຄວາມແປສະເໝີ (ແມ່ນແຕ່ code ທີ່ບໍ່ຮູ້ຈັກ ຫຼື ບໍ່ມີ code)", () => {
    expect(errorMessage(new ApiError(500, "boom", [], undefined, { message: "boom" }), t)).toBe(t("common.error.generic"));
    expect(errorMessage(new ApiError(502, "x", [], "SOME_FUTURE_CODE"), t)).toBe(t("common.error.generic"));
    expect(errorMessage(new ApiError(409, "Boom", [], "INTERNAL_ERROR"), t)).toBe(t("error.INTERNAL_ERROR"));
  });

  it("response ທີ່ບໍ່ແມ່ນ JSON (gateway): ບໍ່ສະແດງ statusText", () => {
    expect(errorMessage(new ApiError(502, "Bad Gateway"), t)).toBe(t("common.error.generic"));
    expect(errorMessage(new ApiError(400, "Bad Request"), t)).toBe(t("common.error.generic"));
  });

  it("code ທີ່ບໍ່ຮູ້ຈັກ ແຕ່ມີ message (status < 500) ໃຊ້ message", () => {
    expect(errorMessage(new ApiError(400, "Something odd", [], "SOME_FUTURE_CODE", { message: "Something odd" }), t)).toBe("Something odd");
  });

  it("CONFLICT ແຕ່ message ຫວ່າງ ໃຊ້ຂໍ້ຄວາມແປ", () => {
    expect(errorMessage(new ApiError(409, "", [], "CONFLICT"), t)).toBe(t("error.CONFLICT"));
  });

  it("ບໍ່ມີ code ແຕ່ເປັນ JSON message (4xx): ໃຊ້ message; ບໍ່ແມ່ນ ApiError: ຂໍ້ຄວາມກາງ", () => {
    expect(errorMessage(new ApiError(400, "boom", [], undefined, { message: "boom" }), t)).toBe("boom");
    expect(errorMessage(new Error("x"), t)).toBe(t("common.error.generic"));
    expect(errorMessage(undefined, t)).toBe(t("common.error.generic"));
  });

  it("ທຸກ ERROR_CODES ມີຂໍ້ຄວາມໃນທັງ lo ແລະ en", () => {
    for (const code of ERROR_CODES) {
      const key = `error.${code}` as TranslationKey;
      expect(dictionaries.lo[key], `lo ${key}`).toBeTruthy();
      expect(dictionaries.en[key], `en ${key}`).toBeTruthy();
    }
  });
});

describe("shortages", () => {
  const shortage = { variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 5, available: 2 };

  it("extractShortages ອ່ານ body.shortages ຂອງ INSUFFICIENT_STOCK; ຢ່າງອື່ນຄືນ []", () => {
    const error = new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: [shortage] });
    expect(extractShortages(error)).toEqual([shortage]);
    expect(extractShortages(new ApiError(409, "x", [], "CONFLICT"))).toEqual([]);
    expect(extractShortages(new Error("x"))).toEqual([]);
    expect(extractShortages(new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: "bad" }))).toEqual([]);
  });

  it("shortageLines ແປເປັນຂໍ້ຄວາມ (ໃຊ້ variantId ຖ້າ sku ເປັນ null)", () => {
    const error = new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
      shortages: [shortage, { ...shortage, sku: null, variantId: "v9" }],
    });
    expect(shortageLines(error, t)).toEqual([
      "TEE-R: needs 5 but only 2 available",
      "v9: needs 5 but only 2 available",
    ]);
  });
});

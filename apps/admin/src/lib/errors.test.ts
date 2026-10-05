import { ERROR_CODES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage } from "./errors";
import { type TranslationKey, dictionaries, translate } from "./i18n/dictionary";

const t = (key: TranslationKey, params?: Record<string, string | number>) => translate("en", key, params);

describe("errorMessage", () => {
  it("ແປຈາກ code ທີ່ຮູ້ຈັກ (ບໍ່ສົນ message ພາສາອັງກິດຂອງ API)", () => {
    const error = new ApiError(409, "Warehouse is inactive", [], "WAREHOUSE_INACTIVE");
    expect(errorMessage(error, t)).toBe(t("error.WAREHOUSE_INACTIVE"));
    expect(errorMessage(error, t)).not.toBe("Warehouse is inactive");
  });

  it("code ທົ່ວໄປ (CONFLICT/BAD_REQUEST/NOT_FOUND) ໃຊ້ message ຂອງ API ຖ້າມີ ເພື່ອບໍ່ເສຍລາຍລະອຽດ", () => {
    expect(errorMessage(new ApiError(409, "Cannot remove the last active OWNER", [], "CONFLICT"), t)).toBe(
      "Cannot remove the last active OWNER",
    );
  });

  it("ບໍ່ມີ code: ໃຊ້ message; ບໍ່ແມ່ນ ApiError: ຂໍ້ຄວາມກາງ", () => {
    expect(errorMessage(new ApiError(500, "boom"), t)).toBe("boom");
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

import { type ErrorCode, isErrorCode } from "@oca/shared";
import type { Translate, TranslationKey } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";

/** code ທົ່ວໄປທີ່ message ຂອງ API ໃຫ້ລາຍລະອຽດຫຼາຍກວ່າຂໍ້ຄວາມແປ ຈຶ່ງໃຊ້ message ກ່ອນ */
const GENERIC_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

/**
 * ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້ (spec §6.2): ແປຈາກ `code` ຄົງທີ່; code ທົ່ວໄປໃຊ້ message ຂອງ API;
 * ບໍ່ມີ code ໃຊ້ message; ບໍ່ມີຫຍັງ → ຂໍ້ຄວາມກາງ.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    if (isErrorCode(error.code) && !(GENERIC_CODES.has(error.code) && error.message)) {
      return t(`error.${error.code}` as TranslationKey);
    }
    if (error.message) return error.message;
  }
  return t("common.error.generic");
}

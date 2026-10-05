import { type ErrorCode, isErrorCode } from "@oca/shared";
import type { Translate, TranslationKey } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";
import type { Shortage } from "./types";

/** code ທົ່ວໄປທີ່ message ຂອງ API ໃຫ້ລາຍລະອຽດຫຼາຍກວ່າຂໍ້ຄວາມແປ ຈຶ່ງໃຊ້ message ກ່ອນ */
const GENERIC_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

/** ຖືກໂຍນເມື່ອມີ action ອື່ນກຳລັງສົ່ງຢູ່ ແລະ ບໍ່ໄດ້ສົ່ງຫຍັງ (ຕ່າງຈາກສຳເລັດ) */
export class ActionBusyError extends Error {
  constructor() {
    super("action in progress");
    this.name = "ActionBusyError";
  }
}

/**
 * ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້ (spec §6.2): ແປຈາກ `code` ຄົງທີ່; code ທົ່ວໄປໃຊ້ message ຂອງ API;
 * ບໍ່ມີ code ໃຊ້ message; ບໍ່ມີຫຍັງ → ຂໍ້ຄວາມກາງ.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ActionBusyError) return t("common.busy");
  if (error instanceof ApiError) {
    if (isErrorCode(error.code) && !(GENERIC_CODES.has(error.code) && error.message)) {
      return t(`error.${error.code}` as TranslationKey);
    }
    if (error.message) return error.message;
  }
  return t("common.error.generic");
}

/** ລາຍການທີ່ສະຕ໋ອກບໍ່ພໍ ຈາກ body ຂອງ 409 INSUFFICIENT_STOCK; ຢ່າງອື່ນ = [] */
export function extractShortages(error: unknown): Shortage[] {
  if (!(error instanceof ApiError) || error.code !== "INSUFFICIENT_STOCK") return [];
  const shortages = error.body?.shortages;
  return Array.isArray(shortages) ? (shortages as Shortage[]) : [];
}

export function shortageLines(error: unknown, t: Translate): string[] {
  return extractShortages(error).map((shortage) =>
    t("stock.shortage", {
      sku: shortage.sku ?? shortage.variantId,
      requested: shortage.requested,
      available: shortage.available,
    }),
  );
}

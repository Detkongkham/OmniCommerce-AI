import { type ErrorCode, isErrorCode } from "@oca/shared";
import type { Translate, TranslationKey } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";
import type { Shortage } from "./types";

/** code ທີ່ message ຂອງ API ເປັນຂໍ້ຄວາມໃຫ້ຜູ້ໃຊ້ (ເຊັ່ນ "Cannot remove the last active OWNER") ຈຶ່ງໃຊ້ message ກ່ອນ */
const MESSAGE_FIRST_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["BAD_REQUEST", "CONFLICT"]);

/** ຖືກໂຍນເມື່ອມີ action ອື່ນກຳລັງສົ່ງຢູ່ ແລະ ບໍ່ໄດ້ສົ່ງຫຍັງ (ຕ່າງຈາກສຳເລັດ) */
export class ActionBusyError extends Error {
  constructor() {
    super("action in progress");
    this.name = "ActionBusyError";
  }
}

/**
 * ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້ (spec §6.2): ແປຈາກ `code` ຄົງທີ່; ມີແຕ່ CONFLICT/BAD_REQUEST ທີ່ໃຊ້ message ຂອງ API;
 * status >= 500 ແລະ response ທີ່ບໍ່ແມ່ນ JSON (gateway, ມີແຕ່ statusText) ໃຊ້ຂໍ້ຄວາມແປສະເໝີ ບໍ່ຮົ່ວອັງກິດ.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ActionBusyError) return t("common.busy");
  if (error instanceof ApiError) {
    const known = isErrorCode(error.code);
    if (error.status >= 500) return known ? t(`error.${error.code as ErrorCode}` as TranslationKey) : t("common.error.generic");
    if (known) {
      const code = error.code as ErrorCode;
      return MESSAGE_FIRST_CODES.has(code) && error.message ? error.message : t(`error.${code}` as TranslationKey);
    }
    // code ບໍ່ຮູ້ຈັກ/ບໍ່ມີ: ໃຊ້ message ສະເພາະເມື່ອມາຈາກ JSON body (body ບໍ່ມີ = statusText ຂອງ gateway)
    if (error.message && error.body !== undefined) return error.message;
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

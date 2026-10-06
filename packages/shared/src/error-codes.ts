/**
 * ລະຫັດ error ທີ່ຄົງທີ່ ໃນ body ຂອງ API ({ statusCode, code, message }).
 * UI ໃຊ້ `code` ແປເປັນພາສາ (i18n); `message` ເປັນພາສາອັງກິດສຳລັບ log/debug ເທົ່ານັ້ນ.
 * ຫ້າມປ່ຽນຊື່ລະຫັດທີ່ປ່ອຍແລ້ວ (ເພີ່ມໃໝ່ໄດ້).
 */
export const ERROR_CODES = [
  // ທົ່ວໄປ (ຕາມ HTTP status ເມື່ອບໍ່ມີລະຫັດສະເພາະ)
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_ATTEMPTS",
  "INTERNAL_ERROR",
  // ບໍ່ພົບ resource ທີ່ອ້າງອີງ (ທັງ path ແລະ body → 404)
  "PRODUCT_NOT_FOUND",
  "VARIANT_NOT_FOUND",
  "CATEGORY_NOT_FOUND",
  "WAREHOUSE_NOT_FOUND",
  "STOCK_LEVEL_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "CUSTOMER_NOT_FOUND",
  "ROLE_NOT_FOUND",
  // ຊ້ຳ / ຖືກອ້າງອີງ
  "DUPLICATE_VALUE",
  "CATEGORY_IN_USE",
  "PRODUCT_HAS_STOCK_HISTORY",
  "WAREHOUSE_NOT_EMPTY",
  "WAREHOUSE_IS_DEFAULT",
  "WAREHOUSE_INACTIVE",
  "NO_DEFAULT_WAREHOUSE",
  // ສະຕ໋ອກ
  "INSUFFICIENT_STOCK",
  // ບິນ
  "VARIANT_NOT_AVAILABLE",
  "ORDER_INVALID_STATE",
  "RESERVATION_EXPIRED",
  // inbox
  "CONVERSATION_NOT_FOUND",
  "USER_NOT_FOUND",
  "CHANNEL_NOT_CONFIGURED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

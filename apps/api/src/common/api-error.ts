import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import type { ErrorCode } from "@oca/shared";

/** HTTP status ຂອງແຕ່ລະ `code` ສະເພາະ. ເປັນແຫຼ່ງດຽວ: ບໍ່ໃຫ້ code ແລະ status ຂັດກັນ. */
const STATUS_BY_CODE: Record<ErrorCode, HttpStatus> = {
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  VARIANT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  WAREHOUSE_NOT_FOUND: HttpStatus.NOT_FOUND,
  STOCK_LEVEL_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CUSTOMER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_VALUE: HttpStatus.CONFLICT,
  CATEGORY_IN_USE: HttpStatus.CONFLICT,
  PRODUCT_HAS_STOCK_HISTORY: HttpStatus.CONFLICT,
  WAREHOUSE_NOT_EMPTY: HttpStatus.CONFLICT,
  WAREHOUSE_IS_DEFAULT: HttpStatus.CONFLICT,
  WAREHOUSE_INACTIVE: HttpStatus.CONFLICT,
  NO_DEFAULT_WAREHOUSE: HttpStatus.CONFLICT,
  INSUFFICIENT_STOCK: HttpStatus.CONFLICT,
  VARIANT_NOT_AVAILABLE: HttpStatus.CONFLICT,
  ORDER_INVALID_STATE: HttpStatus.CONFLICT,
  RESERVATION_EXPIRED: HttpStatus.CONFLICT,
  CONVERSATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHANNEL_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  LIVE_SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  LIVE_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  CF_COMMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  LIVE_SESSION_INVALID_STATE: HttpStatus.CONFLICT,
  LIVE_ITEM_IN_USE: HttpStatus.CONFLICT,
};

export function statusOfCode(code: ErrorCode): HttpStatus {
  return STATUS_BY_CODE[code];
}

/** code ເລີ່ມຕົ້ນຕາມ status ເມື່ອ exception ບໍ່ໄດ້ລະບຸເອງ */
export function defaultCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "TOO_MANY_ATTEMPTS";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}

const ERROR_CLASSES = new Map<HttpStatus, new (body: Record<string, unknown>) => HttpException>([
  [HttpStatus.BAD_REQUEST, BadRequestException],
  [HttpStatus.FORBIDDEN, ForbiddenException],
  [HttpStatus.NOT_FOUND, NotFoundException],
  [HttpStatus.CONFLICT, ConflictException],
]);

/**
 * Exception ທີ່ມີ `code` ຄົງທີ່ ແລະ status ຕາມຕາຕະລາງ (ເປັນ subclass ຂອງ Nest ເດີມ ເຊັ່ນ NotFoundException).
 * `message` ເປັນພາສາອັງກິດ (ສຳລັບ log/debug); UI ແປຈາກ `code`.
 */
export function apiError(code: ErrorCode, message: string, extra: Record<string, unknown> = {}): HttpException {
  const statusCode = statusOfCode(code);
  const body = { statusCode, error: statusReason(statusCode), code, message, ...extra };
  const ErrorClass = ERROR_CLASSES.get(statusCode);
  return ErrorClass ? new ErrorClass(body) : new HttpException(body, statusCode);
}

function statusReason(status: HttpStatus): string {
  const name = HttpStatus[status] ?? "Error";
  return name
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

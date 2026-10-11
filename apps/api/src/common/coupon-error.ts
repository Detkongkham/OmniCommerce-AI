import type { HttpException } from "@nestjs/common";
import { CouponRejectedError } from "@oca/database";
import { apiError } from "./api-error";

/** CouponRejectedError → 409 COUPON_INVALID { reason, ...detail }; error ອື່ນຄືນຕາມເດີມ */
export function couponRejection(error: unknown): unknown {
  if (!(error instanceof CouponRejectedError)) return error;
  return apiError("COUPON_INVALID", `Coupon cannot be used: ${error.reason}`, { reason: error.reason, ...error.detail }) satisfies HttpException;
}

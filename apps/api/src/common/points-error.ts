import type { HttpException } from "@nestjs/common";
import { PointsRejectedError } from "@oca/database";
import { apiError } from "./api-error";

/** PointsRejectedError → 409 POINTS_INVALID { reason, ...detail }; error ອື່ນຄືນຕາມເດີມ */
export function pointsRejection(error: unknown): unknown {
  if (!(error instanceof PointsRejectedError)) return error;
  return apiError("POINTS_INVALID", `Points cannot be used: ${error.reason}`, { reason: error.reason, ...error.detail }) satisfies HttpException;
}

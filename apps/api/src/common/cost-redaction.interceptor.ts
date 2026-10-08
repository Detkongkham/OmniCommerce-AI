import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import { hasPermission } from "@oca/shared";
import { type Observable, map } from "rxjs";
import type { AuthenticatedRequest } from "./auth-types";

/**
 * ຊື່ field ຕົ້ນທຶນໃນ DTO ທັງໝົດ (Variant.costPrice, OrderItem.unitCost, ລາຍງານ: cogs/grossProfit/grossMargin/stockValue).
 * ເພີ່ມຢູ່ບ່ອນດຽວເມື່ອມີ field ໃໝ່.
 */
export const COST_FIELDS: ReadonlySet<string> = new Set([
  "costPrice",
  "unitCost",
  "cogs",
  "grossProfit",
  "grossMargin",
  "stockValue",
]);

export function stripCostFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCostFields);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!COST_FIELDS.has(key)) out[key] = stripCostFields(inner);
  }
  return out;
}

/**
 * ຜູ້ໃຊ້ທີ່ບໍ່ມີ `costs:read` ຈະບໍ່ເຫັນຕົ້ນທຶນ. ເຮັດທີ່ຊັ້ນ response ທົ່ວທັງແອັບ (ແທນທີ່ຈະຢູ່ໃນ mapper ຕໍ່ໂຕ)
 * ເພື່ອໃຫ້ endpoint ໃໝ່ (Inbox/CF) ທີ່ຄືນບິນ ຫຼື variant ປອດໄພໂດຍບໍ່ຕ້ອງຈື່.
 */
@Injectable()
export class CostRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user as
      | AuthenticatedRequest["user"]
      | undefined;
    if (!user || hasPermission(user.permissions, "costs:read")) return next.handle();
    return next.handle().pipe(map(stripCostFields));
  }
}

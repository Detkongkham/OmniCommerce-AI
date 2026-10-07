import type { HttpException } from "@nestjs/common";
import { apiError } from "./api-error";
import { uniqueViolationFields } from "./prisma-errors";

const KNOWN_CONSTRAINTS: Record<string, string> = {
  ProductVariant_sku_key: "sku",
  ProductVariant_barcode_key: "barcode",
  Product_slug_key: "slug",
  Warehouse_code_key: "code",
  Category_slug_key: "slug",
};

/** Index/constraint name -> column name (e.g. `ProductVariant_sku_key` -> `sku`); unknown text is kept as is. */
export function fieldNameFromConstraint(name: string): string {
  const known = KNOWN_CONSTRAINTS[name];
  if (known) return known;
  const match = /^[A-Za-z0-9]+_(.+)_key$/.exec(name);
  return match?.[1] ?? name;
}

/** 409 naming the duplicated field(s) for a P2002 error; undefined for any other error. */
export function duplicateError(error: unknown): HttpException | undefined {
  const fields = uniqueViolationFields(error);
  if (!fields) return undefined;
  const names = fields.map(fieldNameFromConstraint);
  return apiError("DUPLICATE_VALUE", `Duplicate value: ${names.join(", ") || "unique field"}`, { fields: names });
}

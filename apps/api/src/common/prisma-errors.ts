export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

/** ລະເມີດ CHECK constraint (Postgres 23514); Prisma ອາດໃຫ້ເປັນ P2004 ຫຼື ຂໍ້ຄວາມ driver adapter */
export function isCheckViolation(error: unknown): boolean {
  if (prismaErrorCode(error) === "P2004") return true;
  const text = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? "")}` : "";
  return /23514|check constraint|_check/i.test(text);
}

interface UniqueMeta {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown } } };
}

/**
 * Fields/constraint named by a P2002 error: `meta.target`, or (driver adapters) the constraint
 * in `meta.driverAdapterError.cause.constraint`. [] when unknown; undefined when not a P2002.
 */
export function uniqueViolationFields(error: unknown): string[] | undefined {
  if (!isUniqueViolation(error)) return undefined;
  const meta = (error as { meta?: UniqueMeta }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  if (typeof constraint?.index === "string") return [constraint.index];
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  return [];
}

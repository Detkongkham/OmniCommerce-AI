import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** ຕາມ DESIGN.md §16.2: comma ຂັ້ນພັນ, ທົດສະນິຍົມສະເພາະເມື່ອມີ, ຄ່າຫວ່າງເປັນ fallback. */
export function formatNumber(
  value: number | string | null | undefined,
  options: { maxDecimals?: number; fallback?: string } = {},
): string {
  const { maxDecimals = 2, fallback = "—" } = options;
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** dd/MM/yyyy ຕາມເຂດເວລາລາວສະເໝີ (DESIGN.md §16.2). */
export function formatDate(value: string | Date | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Vientiane" });
}

import type { StockMovementType } from "@oca/shared";
import { formatNumber } from "@oca/ui";

/** ເງິນຈາກ API ເປັນ string ("12500.00"): ສະແດງ comma ຂັ້ນພັນ + 2 ທົດສະນິຍົມສະເໝີ (DESIGN.md §16.2). */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ຈຳນວນເຕັມ (ສະຕ໋ອກ) ມີ comma ຂັ້ນພັນ */
export function formatQuantity(value: number | null | undefined): string {
  return formatNumber(value, { maxDecimals: 0 });
}

/** dd/MM/yyyy HH:mm ເຂດເວລາລາວ ສະເໝີ */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleString("en-GB", {
      timeZone: "Asia/Vientiane",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    .replace(/,\s*/, " ");
}

const MINUS = "−";

/** ຈຳນວນຂອງ movement ພ້ອມເຄື່ອງໝາຍຕາມຜົນຕໍ່ `onHand`; RESERVE/RELEASE (ກະທົບ reserved) ເປັນຈຳນວນລ້ວນ */
export function formatMovementQuantity(type: StockMovementType, quantity: number): string {
  const abs = formatQuantity(Math.abs(quantity));
  if (type === "RECEIVE" || type === "RETURN" || type === "TRANSFER_IN") return `+${abs}`;
  if (type === "SHIP" || type === "TRANSFER_OUT") return `${MINUS}${abs}`;
  if (type === "ADJUST") return quantity < 0 ? `${MINUS}${abs}` : `+${abs}`;
  return abs;
}

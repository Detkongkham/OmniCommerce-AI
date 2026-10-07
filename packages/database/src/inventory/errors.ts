export interface StockShortage {
  variantId: string;
  warehouseId: string;
  requested: number;
  available: number;
}

/** ສະຕ໋ອກບໍ່ພໍ. ຜູ້ເອີ້ນຕ້ອງປ່ອຍໃຫ້ transaction rollback. */
export class InsufficientStockError extends Error {
  readonly shortages: StockShortage[];

  constructor(shortages: StockShortage[]) {
    super(`Insufficient stock for ${shortages.length} item(s)`);
    this.name = "InsufficientStockError";
    this.shortages = shortages;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** CHECK 0 <= reserved <= onHand ຖືກຕີ (ດ່ານສຸດທ້າຍ ຖ້າເງື່ອນໄຂ UPDATE ຖືກຂ້າມ). */
export function isStockCheckViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { message, meta } = error as { message?: unknown; meta?: unknown };
  return `${typeof message === "string" ? message : ""} ${safeJson(meta)}`.includes("StockLevel_stock_check");
}

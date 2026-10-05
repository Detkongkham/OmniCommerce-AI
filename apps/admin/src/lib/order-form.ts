import { type OrderTotals, calculateOrderTotals, moneySchema, vatRateSchema } from "@oca/shared";
import type { CustomerDto, Shortage, VariantSearchItemDto } from "./types";

export interface OrderLineDraft {
  variant: VariantSearchItemDto;
  /** "" = default warehouse (warehouseId is not sent) */
  warehouseId: string;
  quantity: string;
  discount: string;
}

export type CustomerMode = "none" | "existing" | "new";

export interface OrderFormState {
  lines: OrderLineDraft[];
  customerMode: CustomerMode;
  customer: CustomerDto | null;
  newCustomer: { name: string; phone: string; email: string };
  shippingFee: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  note: string;
  reservationMinutes: string;
}

export function emptyOrderForm(): OrderFormState {
  return {
    lines: [],
    customerMode: "none",
    customer: null,
    newCustomer: { name: "", phone: "", email: "" },
    shippingFee: "",
    shippingName: "",
    shippingPhone: "",
    shippingAddress: "",
    note: "",
    reservationMinutes: "",
  };
}

const MAX_QUANTITY = 1_000_000;

/** Whole number typed as plain digits only ("1e3", "1.5", "-1", "0x10" are not integers here); null otherwise. */
function parseDigits(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

/** Sellable stock of a line: the chosen warehouse or the default one; no stock row = 0 (never negative). */
export function lineAvailable(line: OrderLineDraft, defaultWarehouseId: string | null): number {
  const warehouseId = line.warehouseId || defaultWarehouseId;
  if (!warehouseId) return 0;
  const available = line.variant.stock.find((level) => level.warehouseId === warehouseId)?.available ?? 0;
  return Math.max(0, available);
}

/**
 * Client-side totals (an estimate): the same formula as the API via `calculateOrderTotals`, on decimal strings.
 * Incomplete or invalid input (blank/zero/non-integer quantity, malformed or negative money, discount above the
 * line total, bad VAT rate, empty cart) -> null instead of throwing while the user types.
 */
export function computeTotals(
  state: OrderFormState,
  settings: { vatRate: string; pricesIncludeVat: boolean },
): OrderTotals | null {
  if (state.lines.length === 0) return null;
  const shippingFee = state.shippingFee.trim() || "0";
  if (!moneySchema.safeParse(shippingFee).success || !vatRateSchema.safeParse(settings.vatRate).success) return null;
  try {
    const lines = state.lines.map((line) => {
      const quantity = parseDigits(line.quantity);
      const discount = line.discount.trim() || "0";
      if (quantity === null || quantity < 1 || quantity > MAX_QUANTITY) throw new RangeError("quantity");
      if (!moneySchema.safeParse(discount).success || !moneySchema.safeParse(line.variant.price).success) {
        throw new RangeError("money");
      }
      return { unitPrice: line.variant.price, quantity, discount };
    });
    return calculateOrderTotals({
      lines,
      shippingFee,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
    });
  } catch {
    return null;
  }
}

/** state -> body of POST /orders (not validated here; pass it on to `createOrderSchema.safeParse`). */
export function toCreateOrderInput(state: OrderFormState): unknown {
  const customer =
    state.customerMode === "existing" && state.customer
      ? { customerId: state.customer.id }
      : state.customerMode === "new"
        ? {
            customer: {
              name: state.newCustomer.name.trim(),
              phone: state.newCustomer.phone.trim(),
              ...(state.newCustomer.email.trim() ? { email: state.newCustomer.email.trim() } : {}),
            },
          }
        : {};
  const minutes = state.reservationMinutes.trim();
  return {
    ...customer,
    items: state.lines.map((line) => ({
      variantId: line.variant.id,
      ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
      // 0 for blank/invalid so the schema rejects it (never NaN or an exponent form)
      quantity: parseDigits(line.quantity) ?? 0,
      discount: line.discount.trim() || "0",
    })),
    ...(state.shippingFee.trim() ? { shippingFee: state.shippingFee.trim() } : {}),
    ...(state.shippingName.trim() ? { shippingName: state.shippingName.trim() } : {}),
    ...(state.shippingPhone.trim() ? { shippingPhone: state.shippingPhone.trim() } : {}),
    ...(state.shippingAddress.trim() ? { shippingAddress: state.shippingAddress.trim() } : {}),
    ...(state.note.trim() ? { note: state.note.trim() } : {}),
    // 0 for invalid so the schema rejects it
    ...(minutes ? { reservationMinutes: parseDigits(minutes) ?? 0 } : {}),
  };
}

/** `variantId|warehouseId` -> shortage, to mark rows whose stock was short when the API answered 409. */
export function shortageKeys(shortages: readonly Shortage[]): Map<string, Shortage> {
  return new Map(shortages.map((shortage) => [`${shortage.variantId}|${shortage.warehouseId}`, shortage]));
}

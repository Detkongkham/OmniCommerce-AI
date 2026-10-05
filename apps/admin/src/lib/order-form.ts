import { type OrderTotals, calculateOrderTotals, moneySchema, vatRateSchema } from "@oca/shared";
import type { CustomerDto, Shortage, VariantSearchItemDto } from "./types";

export interface OrderLineDraft {
  variant: VariantSearchItemDto;
  /** "" = ສາງຫຼັກ (ບໍ່ສົ່ງ warehouseId) */
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

// ຊ້ຳກັບ `quantitySchema` (1..1_000_000) ຂອງ @oca/shared ທີ່ບໍ່ export ຄ່າຄົງທີ່; ແກ້ຄູ່ກັນ
const MAX_QUANTITY = 1_000_000;
// ຖັນເງິນຂອງ DB ເປັນ Decimal(18,2) → ສູງສຸດ 16 ຫຼັກກ່ອນຈຸດ
const MAX_INTEGER_DIGITS = 16;
const fitsColumn = (value: string): boolean => (value.split(".")[0] ?? "").length <= MAX_INTEGER_DIGITS;

/** ຈຳນວນເຕັມທີ່ພິມເປັນຕົວເລກລ້ວນເທົ່ານັ້ນ ("1e3", "1.5", "-1", "0x10" ບໍ່ນັບ); ຢ່າງອື່ນ null */
function parseDigits(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

/** ສະຕ໋ອກຂາຍໄດ້ຂອງແຖວ: ສາງທີ່ເລືອກ ຫຼື ສາງຫຼັກ; ບໍ່ມີແຖວສະຕ໋ອກ = 0 (ບໍ່ຕິດລົບ) */
export function lineAvailable(line: OrderLineDraft, defaultWarehouseId: string | null): number {
  const warehouseId = line.warehouseId || defaultWarehouseId;
  if (!warehouseId) return 0;
  const available = line.variant.stock.find((level) => level.warehouseId === warehouseId)?.available ?? 0;
  return Math.max(0, available);
}

/**
 * ສະຫຼຸບເງິນຝັ່ງ client (ຄາດຄະເນ): ສູດດຽວກັບ API ຜ່ານ `calculateOrderTotals` ດ້ວຍ decimal string.
 * ຂໍ້ມູນຍັງບໍ່ຄົບ/ຜິດ (ຈຳນວນເປົ່າ/ສູນ/ບໍ່ເຕັມ, ເງິນຜິດຮູບແບບ ຫຼື ຕິດລົບ, ສ່ວນຫຼຸດເກີນຍອດແຖວ, VAT ຜິດ, ກະຕ່າເປົ່າ, ຍອດເກີນ 16 ຫຼັກ)
 * → null ແທນທີ່ຈະ throw ຂະນະພິມ.
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
    const totals = calculateOrderTotals({
      lines,
      shippingFee,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
    });
    // ຍອດທີ່ DB ເກັບບໍ່ໄດ້ (ເກີນ 16 ຫຼັກ) ຖືວ່າບໍ່ຖືກຕ້ອງ ແທນທີ່ຈະສະແດງຕົວເລກທີ່ API ຈະປະຕິເສດ
    return fitsColumn(totals.subtotal) && fitsColumn(totals.total) ? totals : null;
  } catch {
    return null;
  }
}

/** state → body ຂອງ POST /orders (ຍັງບໍ່ validate; ສົ່ງຕໍ່ໃຫ້ `createOrderSchema.safeParse`) */
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
      // ເປົ່າ/ຜິດ → 0 ເພື່ອໃຫ້ schema ປະຕິເສດ (ບໍ່ເປັນ NaN ຫຼື ຮູບ exponent)
      quantity: parseDigits(line.quantity) ?? 0,
      discount: line.discount.trim() || "0",
    })),
    ...(state.shippingFee.trim() ? { shippingFee: state.shippingFee.trim() } : {}),
    ...(state.shippingName.trim() ? { shippingName: state.shippingName.trim() } : {}),
    ...(state.shippingPhone.trim() ? { shippingPhone: state.shippingPhone.trim() } : {}),
    ...(state.shippingAddress.trim() ? { shippingAddress: state.shippingAddress.trim() } : {}),
    ...(state.note.trim() ? { note: state.note.trim() } : {}),
    // ຜິດ → 0 ເພື່ອໃຫ້ schema ປະຕິເສດ
    ...(minutes ? { reservationMinutes: parseDigits(minutes) ?? 0 } : {}),
  };
}

/** `variantId|warehouseId` → shortage ເພື່ອໝາຍແຖວທີ່ສະຕ໋ອກບໍ່ພໍຫຼັງ API ຕອບ 409 */
export function shortageKeys(shortages: readonly Shortage[]): Map<string, Shortage> {
  return new Map(shortages.map((shortage) => [`${shortage.variantId}|${shortage.warehouseId}`, shortage]));
}

/**
 * Idempotency-Key ຂອງ POST /orders (ASCII ພິມໄດ້ 1-128). `crypto.randomUUID` ມີສະເພາະ secure context
 * (https/localhost) ຈຶ່ງມີທາງສຳຮອງຜ່ານ `getRandomValues` ສຳລັບ admin ທີ່ເປີດຜ່ານ http ໃນ LAN.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

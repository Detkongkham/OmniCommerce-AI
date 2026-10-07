import {
  type CreateOrderInput,
  type OrderTotals,
  calculateOrderTotals,
  createOrderSchema,
  moneySchema,
  vatRateSchema,
} from "@oca/shared";
import type { Translate } from "./i18n/dictionary";
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

/** ຟອມຂອງບິນທີ່ເປີດຈາກແຊັດ: ມີລູກຄ້າທີ່ລິ້ງກັບເຄສ = prefill (ເລືອກແລ້ວ + ຊື່/ໂທຈັດສົ່ງ); ບໍ່ມີ = ຟອມເປົ່າ */
export function orderFormForConversation(customer: { id: string; name: string; phone: string | null } | null): OrderFormState {
  const base = emptyOrderForm();
  if (!customer) return base;
  return {
    ...base,
    customerMode: "existing",
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: null },
    shippingName: customer.name,
    shippingPhone: customer.phone ?? "",
  };
}

// ຊ້ຳກັບ `quantitySchema` (1..1_000_000) ຂອງ @oca/shared ທີ່ບໍ່ export ຄ່າຄົງທີ່; ແກ້ຄູ່ກັນ
const MAX_QUANTITY = 1_000_000;
// ຖັນເງິນຂອງ DB ເປັນ Decimal(18,2) → ສູງສຸດ 16 ຫຼັກກ່ອນຈຸດ
const MAX_INTEGER_DIGITS = 16;
const fitsColumn = (value: string): boolean => (value.split(".")[0] ?? "").length <= MAX_INTEGER_DIGITS;

/** ຈຳນວນເຕັມທີ່ພິມເປັນຕົວເລກລ້ວນເທົ່ານັ້ນ ("1e3", "1.5", "-1", "0x10" ບໍ່ນັບ); ຢ່າງອື່ນ null */
export function lineQuantity(value: string): number | null {
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
      const quantity = lineQuantity(line.quantity);
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
      quantity: lineQuantity(line.quantity) ?? 0,
      discount: line.discount.trim() || "0",
    })),
    ...(state.shippingFee.trim() ? { shippingFee: state.shippingFee.trim() } : {}),
    ...(state.shippingName.trim() ? { shippingName: state.shippingName.trim() } : {}),
    ...(state.shippingPhone.trim() ? { shippingPhone: state.shippingPhone.trim() } : {}),
    ...(state.shippingAddress.trim() ? { shippingAddress: state.shippingAddress.trim() } : {}),
    ...(state.note.trim() ? { note: state.note.trim() } : {}),
    // ຜິດ → 0 ເພື່ອໃຫ້ schema ປະຕິເສດ
    ...(minutes ? { reservationMinutes: lineQuantity(minutes) ?? 0 } : {}),
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

/** ຊ່ອງທີ່ຜິດ: ຕໍ່ແຖວ `qty:<variantId>`/`discount:<variantId>`/`warehouse:<variantId>`; ອື່ນໆ items, customer, newName, newPhone, newEmail, fee, reservation, form */
export interface FormIssues {
  messages: string[];
  fields: string[];
}

export interface OrderValidationContext {
  /** ໂຫຼດສາງແລ້ວ ແຕ່ບໍ່ມີສາງຫຼັກທີ່ເປີດ */
  noDefaultWarehouse: boolean;
  /** undefined = ຍັງໂຫຼດຕັ້ງຄ່າຮ້ານບໍ່ແລ້ວ (ຂ້າມການກວດຍອດເງິນ; API ກວດເອງ) */
  settings: { vatRate: string; pricesIncludeVat: boolean } | undefined;
}

export type OrderValidation = { ok: true; data: CreateOrderInput } | { ok: false; issues: FormIssues };

/** ກວດຟອມ ແລ້ວແປເປັນຂໍ້ຄວາມຂອງລະບົບເອງ (ບໍ່ສະແດງ path/ຂໍ້ຄວາມດິບຈາກ zod ຫຼື API); ຜ່ານ → payload ທີ່ parse ແລ້ວ */
export function validateOrderForm(state: OrderFormState, ctx: OrderValidationContext, t: Translate): OrderValidation {
  const found = new Map<string, string>(); // ຂໍ້ຄວາມ → ຊ່ອງ (ຂໍ້ຄວາມຊ້ຳບໍ່ຊ້ອນ)
  const flagged = new Set<string>();
  const mark = (field: string, text: string) => {
    flagged.add(field);
    if (!found.has(text)) found.set(text, field);
  };
  const invalidText = (label: string) => t("orders.err.invalid", { field: label });

  if (state.customerMode === "existing" && !state.customer) mark("customer", t("orders.err.customer"));

  const parsed = createOrderSchema.safeParse(toCreateOrderInput(state));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [head, index, leaf] = issue.path;
      if (head === "items" && typeof index === "number") {
        const line = state.lines[index];
        const id = line?.variant.id ?? "";
        const sku = line?.variant.sku ?? "";
        if (leaf === "quantity") mark(`qty:${id}`, t("orders.err.quantity", { sku }));
        else if (leaf === "discount") mark(`discount:${id}`, t("orders.err.discount", { sku }));
        else mark(`warehouse:${id}`, invalidText(`${t("orders.items.warehouse")} ${sku}`.trim()));
      } else if (head === "items") mark("items", t("orders.err.items"));
      else if (head === "shippingFee") mark("fee", invalidText(t("orders.shipping.fee")));
      else if (head === "reservationMinutes") mark("reservation", invalidText(t("orders.reservation")));
      else if (head === "customerId") mark("customer", t("orders.err.customer"));
      else if (head === "customer") {
        if (index === "name") mark("newName", invalidText(t("orders.customer.name")));
        else if (index === "phone") mark("newPhone", invalidText(t("orders.customer.phone")));
        else if (index === "email") mark("newEmail", invalidText(t("orders.customer.email")));
        else mark("newName", invalidText(t("orders.section.customer")));
      } else mark("form", t("common.error.generic"));
    }
  }

  const { settings } = ctx;
  const vatOk = settings !== undefined && vatRateSchema.safeParse(settings.vatRate).success;
  if (settings && !vatOk) mark("form", t("orders.err.vat"));
  for (const line of state.lines) {
    const id = line.variant.id;
    const sku = line.variant.sku;
    if (!line.warehouseId && ctx.noDefaultWarehouse) mark(`warehouse:${id}`, t("orders.err.warehouse", { sku }));
    // schema ຈັບສ່ວນຫຼຸດເກີນຍອດແຖວບໍ່ໄດ້: ໃຊ້ສູດດຽວກັບສະຫຼຸບເງິນ (decimal string) ກັບແຖວນີ້ແຖວດຽວ.
    // null ມີຫຼາຍສາເຫດ: ແຍກ "ເພາະສ່ວນຫຼຸດ" (ຄິດໄດ້ຖ້າສ່ວນຫຼຸດ 0) ອອກຈາກ "ຍອດໃຫຍ່ເກີນ"
    if (settings && vatOk && !flagged.has(`qty:${id}`) && !flagged.has(`discount:${id}`)) {
      const single = { ...state, lines: [line], shippingFee: "" };
      if (computeTotals(single, settings) === null) {
        const withoutDiscount = computeTotals({ ...single, lines: [{ ...line, discount: "" }] }, settings);
        if (withoutDiscount === null) mark("form", t("orders.err.totals"));
        else mark(`discount:${id}`, t("orders.err.discount", { sku }));
      }
    }
  }
  // ຄ່າສົ່ງ + ແຖວລວມກັນເກີນຄວາມຈຸຂອງຖັນເງິນ
  if (settings && vatOk && found.size === 0 && computeTotals(state, settings) === null) mark("form", t("orders.err.totals"));

  if (found.size > 0) return { ok: false, issues: { messages: [...found.keys()], fields: [...found.values()] } };
  if (!parsed.success) return { ok: false, issues: { messages: [], fields: [] } };
  return { ok: true, data: parsed.data };
}

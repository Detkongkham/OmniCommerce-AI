import { createOrderSchema } from "@oca/shared";
import { describe, expect, it } from "vitest";
import {
  type OrderFormState,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  shortageKeys,
  toCreateOrderInput,
} from "./order-form";
import type { VariantSearchItemDto } from "./types";

const variant = (patch: Partial<VariantSearchItemDto> = {}): VariantSearchItemDto => ({
  id: "v1",
  sku: "TEE-R",
  barcode: null,
  name: "Red",
  productId: "p1",
  productName: "Tee",
  productStatus: "ACTIVE",
  imageUrl: null,
  price: "100.00",
  isActive: true,
  availableTotal: 8,
  stock: [
    { warehouseId: "w1", onHand: 10, reserved: 2, available: 8 },
    { warehouseId: "w2", onHand: 1, reserved: 0, available: 1 },
  ],
  ...patch,
});
const settings = { vatRate: "10.00", pricesIncludeVat: true };
const lineOf = (patch: Partial<OrderFormState["lines"][number]> = {}) => ({
  variant: variant(),
  warehouseId: "",
  quantity: "1",
  discount: "",
  ...patch,
});

const form = (patch: Partial<OrderFormState> = {}): OrderFormState => ({
  ...emptyOrderForm(),
  lines: [{ variant: variant(), warehouseId: "", quantity: "2", discount: "10" }],
  ...patch,
});

describe("computeTotals", () => {
  it("uses the API formula (VAT included): subtotal 190, shipping 5 -> total 195, VAT 17.73", () => {
    const totals = computeTotals(form({ shippingFee: "5" }), settings);
    expect(totals).toMatchObject({ subtotal: "190.00", discountTotal: "10.00", vatAmount: "17.73", total: "195.00" });
  });

  it("VAT excluded: VAT is added on top", () => {
    const totals = computeTotals(form({ shippingFee: "0" }), { vatRate: "10", pricesIncludeVat: false });
    expect(totals).toMatchObject({ subtotal: "190.00", vatAmount: "19.00", total: "209.00" });
  });

  it("accepts vatRate '7.00' and 0 rate", () => {
    expect(computeTotals(form(), { vatRate: "7.00", pricesIncludeVat: false })).toMatchObject({
      vatAmount: "13.30",
      total: "203.30",
    });
    expect(computeTotals(form(), { vatRate: "0.00", pricesIncludeVat: true })).toMatchObject({
      vatAmount: "0.00",
      total: "190.00",
    });
  });

  it("blank discount and shipping default to 0; discount equal to the line total is allowed", () => {
    expect(computeTotals(form({ lines: [lineOf({ quantity: "2" })] }), settings)).toMatchObject({
      subtotal: "200.00",
      total: "200.00",
    });
    expect(computeTotals(form({ lines: [lineOf({ discount: "100" })] }), settings)).toMatchObject({
      subtotal: "0.00",
      total: "0.00",
    });
  });

  it("returns per-line totals", () => {
    const totals = computeTotals(form({ lines: [lineOf({ quantity: "3", discount: "50" }), lineOf({ quantity: "1" })] }), settings);
    expect(totals?.lines).toEqual([{ lineTotal: "250.00" }, { lineTotal: "100.00" }]);
  });

  it("incomplete or invalid input returns null instead of throwing", () => {
    expect(computeTotals(form({ lines: [lineOf({ quantity: "" })] }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [lineOf({ discount: "999" })] }), settings)).toBeNull();
    expect(computeTotals(form({ shippingFee: "abc" }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [] }), settings)).toBeNull();
    expect(computeTotals(form(), { vatRate: "", pricesIncludeVat: true })).toBeNull();
    expect(computeTotals(form(), { vatRate: "abc", pricesIncludeVat: true })).toBeNull();
  });

  it("rejects zero, negative, fractional and exponent quantities", () => {
    for (const quantity of ["0", "-1", "1.5", "1e3", "0x10", " ", "abc", "1000001"]) {
      expect(computeTotals(form({ lines: [lineOf({ quantity })] }), settings)).toBeNull();
    }
  });

  it("rejects negative or malformed discount and shipping (would otherwise inflate the total)", () => {
    for (const discount of ["-5", "1.234", "1e2", "5."]) {
      expect(computeTotals(form({ lines: [lineOf({ discount })] }), settings)).toBeNull();
    }
    for (const shippingFee of ["-5", "1.234", "1e2"]) {
      expect(computeTotals(form({ shippingFee }), settings)).toBeNull();
    }
  });

  it("handles huge values exactly with decimal strings (no float error)", () => {
    const big = variant({ price: "9999999999999999.99" });
    const totals = computeTotals(form({ lines: [lineOf({ variant: big, quantity: "3" })] }), {
      vatRate: "0",
      pricesIncludeVat: true,
    });
    expect(totals?.subtotal).toBe("29999999999999999.97");
    expect(computeTotals(form({ lines: [lineOf({ variant: variant({ price: "0.10" }), quantity: "3" })] }), settings)?.subtotal).toBe("0.30");
  });

  it("returns null when the variant price is not a valid decimal", () => {
    expect(computeTotals(form({ lines: [lineOf({ variant: variant({ price: "" }) })] }), settings)).toBeNull();
  });
});

describe("lineAvailable", () => {
  it("uses the chosen warehouse; none -> default; missing stock row = 0", () => {
    const line = { variant: variant(), warehouseId: "", quantity: "1", discount: "" };
    expect(lineAvailable(line, "w1")).toBe(8);
    expect(lineAvailable({ ...line, warehouseId: "w2" }, "w1")).toBe(1);
    expect(lineAvailable({ ...line, warehouseId: "w9" }, "w1")).toBe(0);
    expect(lineAvailable(line, null)).toBe(0);
    expect(lineAvailable({ ...line, variant: variant({ stock: [] }) }, "w1")).toBe(0);
  });

  it("never returns a negative number", () => {
    const negative = variant({ stock: [{ warehouseId: "w1", onHand: 1, reserved: 3, available: -2 }] });
    expect(lineAvailable(lineOf({ variant: negative }), "w1")).toBe(0);
  });
});

describe("toCreateOrderInput", () => {
  it("walk-in customer: skips empty fields and omits warehouseId for the default warehouse", () => {
    const input = toCreateOrderInput(form());
    expect(input).toEqual({ items: [{ variantId: "v1", quantity: 2, discount: "10" }] });
    expect(createOrderSchema.safeParse(input).success).toBe(true);
  });

  it("existing customer -> customerId; new customer -> customer; chosen warehouse and shipping fields", () => {
    const existing = toCreateOrderInput(
      form({
        customerMode: "existing",
        customer: { id: "c1", name: "A", phone: "020", email: null },
        shippingFee: "5",
        shippingName: "Recipient",
        shippingPhone: "020555",
        shippingAddress: "Vientiane",
        note: "gift",
        reservationMinutes: "45",
        lines: [{ variant: variant(), warehouseId: "w2", quantity: "1", discount: "" }],
      }),
    );
    expect(existing).toEqual({
      customerId: "c1",
      items: [{ variantId: "v1", warehouseId: "w2", quantity: 1, discount: "0" }],
      shippingFee: "5",
      shippingName: "Recipient",
      shippingPhone: "020555",
      shippingAddress: "Vientiane",
      note: "gift",
      reservationMinutes: 45,
    });
    expect(createOrderSchema.safeParse(existing).success).toBe(true);

    const created = toCreateOrderInput(
      form({ customerMode: "new", newCustomer: { name: "New", phone: "02055551111", email: "n@x.com" } }),
    );
    expect(created).toMatchObject({ customer: { name: "New", phone: "02055551111", email: "n@x.com" } });
    expect(created).not.toHaveProperty("customerId");
    expect(createOrderSchema.safeParse(created).success).toBe(true);
  });

  it("existing mode without a chosen customer sends no customer; new customer without email omits it", () => {
    const none = toCreateOrderInput(form({ customerMode: "existing", customer: null }));
    expect(none).not.toHaveProperty("customerId");
    expect(none).not.toHaveProperty("customer");
    const created = toCreateOrderInput(
      form({ customerMode: "new", newCustomer: { name: " New ", phone: " 020555 ", email: " " } }),
    );
    expect(created).toMatchObject({ customer: { name: "New", phone: "020555" } });
    expect((created as { customer: object }).customer).not.toHaveProperty("email");
  });

  it("switching mode away ignores stale customer data", () => {
    const input = toCreateOrderInput(
      form({ customerMode: "none", customer: { id: "c1", name: "A", phone: "1", email: null }, newCustomer: { name: "x", phone: "1", email: "" } }),
    );
    expect(input).not.toHaveProperty("customerId");
    expect(input).not.toHaveProperty("customer");
  });

  it("empty or invalid quantity -> 0 (schema rejects); never NaN/exponent/float quirks", () => {
    for (const quantity of ["", "abc", "1e3", "1.5", "-2", "0"]) {
      const input = toCreateOrderInput(form({ lines: [lineOf({ quantity })] }));
      expect(createOrderSchema.safeParse(input).success).toBe(false);
    }
  });

  it("empty cart is rejected by the schema", () => {
    expect(createOrderSchema.safeParse(toCreateOrderInput(form({ lines: [] }))).success).toBe(false);
  });

  it("invalid reservation minutes are rejected by the schema", () => {
    for (const reservationMinutes of ["0", "abc", "1.5", "99999"]) {
      expect(createOrderSchema.safeParse(toCreateOrderInput(form({ reservationMinutes }))).success).toBe(false);
    }
  });
});

describe("shortageKeys", () => {
  it("maps API shortages to `variantId|warehouseId` keys to mark rows", () => {
    const keys = shortageKeys([{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 2 }]);
    expect(keys.get("v1|w1")).toMatchObject({ requested: 9, available: 2 });
    expect(shortageKeys([]).size).toBe(0);
  });
});

import { createOrderSchema } from "@oca/shared";
import { describe, expect, it, vi } from "vitest";
import {
  type OrderFormState,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  lineQuantity,
  newIdempotencyKey,
  orderFormForConversation,
  shortageKeys,
  toCreateOrderInput,
  validateOrderForm,
} from "./order-form";
import { translate } from "./i18n/dictionary";
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
  it("ໃຊ້ສູດດຽວກັບ API (ລວມ VAT): subtotal 190, ຄ່າສົ່ງ 5 → total 195, VAT 17.73", () => {
    const totals = computeTotals(form({ shippingFee: "5" }), settings);
    expect(totals).toMatchObject({ subtotal: "190.00", discountTotal: "10.00", vatAmount: "17.73", total: "195.00" });
  });

  it("ບໍ່ລວມ VAT: ບວກ VAT ເພີ່ມ", () => {
    const totals = computeTotals(form({ shippingFee: "0" }), { vatRate: "10", pricesIncludeVat: false });
    expect(totals).toMatchObject({ subtotal: "190.00", vatAmount: "19.00", total: "209.00" });
  });

  it("ຮັບ vatRate '7.00' ແລະ ອັດຕາ 0", () => {
    expect(computeTotals(form(), { vatRate: "7.00", pricesIncludeVat: false })).toMatchObject({
      vatAmount: "13.30",
      total: "203.30",
    });
    expect(computeTotals(form(), { vatRate: "0.00", pricesIncludeVat: true })).toMatchObject({
      vatAmount: "0.00",
      total: "190.00",
    });
  });

  it("ສ່ວນຫຼຸດ/ຄ່າສົ່ງເປົ່າ = 0; ສ່ວນຫຼຸດເທົ່າຍອດແຖວອະນຸຍາດ", () => {
    expect(computeTotals(form({ lines: [lineOf({ quantity: "2" })] }), settings)).toMatchObject({
      subtotal: "200.00",
      total: "200.00",
    });
    expect(computeTotals(form({ lines: [lineOf({ discount: "100" })] }), settings)).toMatchObject({
      subtotal: "0.00",
      total: "0.00",
    });
  });

  it("ຄືນຍອດຕໍ່ແຖວ", () => {
    const totals = computeTotals(form({ lines: [lineOf({ quantity: "3", discount: "50" }), lineOf({ quantity: "1" })] }), settings);
    expect(totals?.lines).toEqual([{ lineTotal: "250.00" }, { lineTotal: "100.00" }]);
  });

  it("ຂໍ້ມູນຍັງບໍ່ຄົບ/ຜິດ (ຈຳນວນເປົ່າ, ສ່ວນຫຼຸດເກີນ, ເງິນບໍ່ແມ່ນຕົວເລກ) → null ແທນ throw", () => {
    expect(computeTotals(form({ lines: [lineOf({ quantity: "" })] }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [lineOf({ discount: "999" })] }), settings)).toBeNull();
    expect(computeTotals(form({ shippingFee: "abc" }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [] }), settings)).toBeNull();
    expect(computeTotals(form(), { vatRate: "", pricesIncludeVat: true })).toBeNull();
    expect(computeTotals(form(), { vatRate: "abc", pricesIncludeVat: true })).toBeNull();
  });

  it("ປະຕິເສດຈຳນວນສູນ, ລົບ, ທົດສະນິຍົມ ແລະ exponent", () => {
    for (const quantity of ["0", "-1", "1.5", "1e3", "0x10", " ", "abc", "1000001"]) {
      expect(computeTotals(form({ lines: [lineOf({ quantity })] }), settings)).toBeNull();
    }
  });

  it("ປະຕິເສດສ່ວນຫຼຸດ/ຄ່າສົ່ງທີ່ລົບ ຫຼື ຜິດຮູບແບບ (ບໍ່ດັ່ງນັ້ນຍອດຈະບວມ)", () => {
    for (const discount of ["-5", "1.234", "1e2", "5."]) {
      expect(computeTotals(form({ lines: [lineOf({ discount })] }), settings)).toBeNull();
    }
    for (const shippingFee of ["-5", "1.234", "1e2"]) {
      expect(computeTotals(form({ shippingFee }), settings)).toBeNull();
    }
  });

  it("ຄ່າໃຫຍ່ທີ່ເກັບໄດ້ (≤ 16 ຫຼັກ) ຖືກຕ້ອງແນ່ນອນດ້ວຍ decimal string (ບໍ່ມີ float error)", () => {
    const big = variant({ price: "3333333333333333.33" });
    const totals = computeTotals(form({ lines: [lineOf({ variant: big, quantity: "3", discount: "" })] }), {
      vatRate: "0",
      pricesIncludeVat: true,
    });
    expect(totals?.subtotal).toBe("9999999999999999.99");
    expect(computeTotals(form({ lines: [lineOf({ variant: variant({ price: "0.10" }), quantity: "3", discount: "" })] }), settings)?.subtotal).toBe("0.30");
  });

  it("subtotal ຫຼື total ເກີນ 16 ຫຼັກ (ເກີນ Decimal(18,2) ຂອງ DB) → null", () => {
    const big = variant({ price: "9999999999999999.99" });
    const noVat = { vatRate: "0", pricesIncludeVat: true };
    expect(computeTotals(form({ lines: [lineOf({ variant: big, quantity: "3", discount: "" })] }), noVat)).toBeNull();
    // subtotal ພໍດີ 16 ຫຼັກ ແຕ່ຄ່າສົ່ງ ແລະ VAT ເຮັດໃຫ້ total ເກີນ
    expect(computeTotals(form({ lines: [lineOf({ variant: big, discount: "" })], shippingFee: "1" }), noVat)).toBeNull();
    expect(
      computeTotals(form({ lines: [lineOf({ variant: variant({ price: "9999999999999999.00" }), discount: "" })] }), {
        vatRate: "10",
        pricesIncludeVat: false,
      }),
    ).toBeNull();
  });

  it("ລາຄາ variant ບໍ່ເປັນ decimal ທີ່ຖືກ → null", () => {
    expect(computeTotals(form({ lines: [lineOf({ variant: variant({ price: "" }) })] }), settings)).toBeNull();
  });
});

describe("lineAvailable", () => {
  it("ໃຊ້ສາງທີ່ເລືອກ; ບໍ່ເລືອກ → ສາງຫຼັກ; ບໍ່ມີແຖວສະຕ໋ອກ = 0", () => {
    const line = { variant: variant(), warehouseId: "", quantity: "1", discount: "" };
    expect(lineAvailable(line, "w1")).toBe(8);
    expect(lineAvailable({ ...line, warehouseId: "w2" }, "w1")).toBe(1);
    expect(lineAvailable({ ...line, warehouseId: "w9" }, "w1")).toBe(0);
    expect(lineAvailable(line, null)).toBe(0);
    expect(lineAvailable({ ...line, variant: variant({ stock: [] }) }, "w1")).toBe(0);
  });

  it("ບໍ່ຄືນຄ່າລົບ", () => {
    const negative = variant({ stock: [{ warehouseId: "w1", onHand: 1, reserved: 3, available: -2 }] });
    expect(lineAvailable(lineOf({ variant: negative }), "w1")).toBe(0);
  });
});

describe("toCreateOrderInput", () => {
  it("ລູກຄ້າໜ້າຮ້ານ: ຂ້າມ field ເປົ່າ ແລະ ບໍ່ສົ່ງ warehouseId ເມື່ອໃຊ້ສາງຫຼັກ", () => {
    const input = toCreateOrderInput(form());
    expect(input).toEqual({ items: [{ variantId: "v1", quantity: 2, discount: "10" }] });
    expect(createOrderSchema.safeParse(input).success).toBe(true);
  });

  it("ລູກຄ້າທີ່ມີ → customerId; ລູກຄ້າໃໝ່ → customer; ສາງທີ່ເລືອກ ແລະ field ຈັດສົ່ງ", () => {
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

  it("ໂໝດລູກຄ້າທີ່ມີແຕ່ຍັງບໍ່ເລືອກ → ບໍ່ສົ່ງລູກຄ້າ; ລູກຄ້າໃໝ່ບໍ່ມີອີເມວ → ຂ້າມ email", () => {
    const none = toCreateOrderInput(form({ customerMode: "existing", customer: null }));
    expect(none).not.toHaveProperty("customerId");
    expect(none).not.toHaveProperty("customer");
    const created = toCreateOrderInput(
      form({ customerMode: "new", newCustomer: { name: " New ", phone: " 020555 ", email: " " } }),
    );
    expect(created).toMatchObject({ customer: { name: "New", phone: "020555" } });
    expect((created as { customer: object }).customer).not.toHaveProperty("email");
  });

  it("ປ່ຽນໂໝດອອກ → ບໍ່ສົນຂໍ້ມູນລູກຄ້າທີ່ຄ້າງ", () => {
    const input = toCreateOrderInput(
      form({ customerMode: "none", customer: { id: "c1", name: "A", phone: "1", email: null }, newCustomer: { name: "x", phone: "1", email: "" } }),
    );
    expect(input).not.toHaveProperty("customerId");
    expect(input).not.toHaveProperty("customer");
  });

  it("ຈຳນວນເປົ່າ/ຜິດ → 0 (schema ປະຕິເສດ); ບໍ່ເປັນ NaN/exponent/float", () => {
    for (const quantity of ["", "abc", "1e3", "1.5", "-2", "0"]) {
      const input = toCreateOrderInput(form({ lines: [lineOf({ quantity })] }));
      expect(createOrderSchema.safeParse(input).success).toBe(false);
    }
  });

  it("ກະຕ່າເປົ່າ → schema ປະຕິເສດ", () => {
    expect(createOrderSchema.safeParse(toCreateOrderInput(form({ lines: [] }))).success).toBe(false);
  });

  it("ນາທີຈອງທີ່ຜິດ → schema ປະຕິເສດ", () => {
    for (const reservationMinutes of ["0", "abc", "1.5", "99999"]) {
      expect(createOrderSchema.safeParse(toCreateOrderInput(form({ reservationMinutes }))).success).toBe(false);
    }
  });
});

describe("shortageKeys", () => {
  it("ແມັບ shortage ຂອງ API ເປັນ key `variantId|warehouseId` ເພື່ອໝາຍແຖວ", () => {
    const keys = shortageKeys([{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 2 }]);
    expect(keys.get("v1|w1")).toMatchObject({ requested: 9, available: 2 });
    expect(shortageKeys([]).size).toBe(0);
  });
});

describe("newIdempotencyKey", () => {
  it("ຮູບແບບທີ່ API ຍອມຮັບ (ASCII ພິມໄດ້ 1-128, ບໍ່ມີຍະຫວ່າງ) ແລະ ບໍ່ຊ້ຳກັນ", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[\x21-\x7e]{1,128}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });

  it("ຕອນບໍ່ມີ crypto.randomUUID (http ທີ່ບໍ່ປອດໄພ) ຍັງໄດ້ key ທີ່ຖືກຮູບແບບ", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(171) });
    try {
      expect(newIdempotencyKey()).toMatch(/^[\x21-\x7e]{1,128}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("lineQuantity", () => {
  it("ຮັບສະເພາະຕົວເລກລ້ວນ 1-9 ຫຼັກ; ຢ່າງອື່ນ null", () => {
    expect(lineQuantity(" 12 ")).toBe(12);
    for (const bad of ["", "1e3", "1.5", "-1", "0x10", "1234567890", "abc"]) expect(lineQuantity(bad)).toBeNull();
  });
});

describe("validateOrderForm", () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate("en", key, params);
  const ctx = { noDefaultWarehouse: false, settings };
  const run = (state: OrderFormState, over: Partial<typeof ctx> = {}) => validateOrderForm(state, { ...ctx, ...over }, t);
  const failed = (state: OrderFormState, over: Partial<typeof ctx> = {}) => {
    const result = run(state, over);
    if (result.ok) throw new Error("expected failure");
    return result.issues;
  };

  it("ຖືກຕ້ອງ: ຄືນ payload ທີ່ parse ແລ້ວ", () => {
    const result = run(form());
    expect(result).toMatchObject({ ok: true, data: { items: [{ variantId: "v1", quantity: 2, discount: "10" }] } });
  });

  it("ກະຕ່າເປົ່າ: ຂໍ້ຄວາມແປແລ້ວ ບໍ່ແມ່ນ path ຂອງ zod", () => {
    const issues = failed(form({ lines: [] }));
    expect(issues.messages).toEqual(["Add at least one item"]);
    expect(issues.fields).toEqual(["items"]);
  });

  it("ຈຳນວນ/ເງິນ/ເວລາຈອງຜິດ: ຂໍ້ຄວາມແປ + ລະຫັດຊ່ອງ", () => {
    const issues = failed(
      form({ lines: [lineOf({ quantity: "", discount: "abc" })], shippingFee: "-1", reservationMinutes: "1e3" }),
    );
    expect(issues.messages).toEqual(
      expect.arrayContaining([
        "TEE-R: quantity must be a whole number of 1 or more",
        "TEE-R: discount is invalid or larger than the line amount",
        "Shipping fee is not valid",
        "Reservation time (minutes) is not valid",
      ]),
    );
    expect(issues.fields).toEqual(expect.arrayContaining(["qty:v1", "discount:v1", "fee", "reservation"]));
    expect(issues.messages.join(" ")).not.toMatch(/items\.|shippingFee|Invalid|Too small/);
  });

  it("ເລືອກ 'ລູກຄ້າທີ່ມີ' ແຕ່ບໍ່ເລືອກ; ລູກຄ້າໃໝ່ເບີຜິດ", () => {
    expect(failed(form({ customerMode: "existing" })).fields).toEqual(["customer"]);
    const issues = failed(form({ customerMode: "new", newCustomer: { name: "Mali", phone: "abc", email: "" } }));
    expect(issues.fields).toEqual(["newPhone"]);
  });

  it("ບໍ່ມີສາງຫຼັກ: ແຖວທີ່ຍັງເປັນ 'ສາງຫຼັກ' ຜິດ; ເລືອກສາງແລ້ວຜ່ານ", () => {
    expect(failed(form(), { noDefaultWarehouse: true }).fields).toEqual(["warehouse:v1"]);
    expect(run(form({ lines: [lineOf({ warehouseId: "w2" })] }), { noDefaultWarehouse: true }).ok).toBe(true);
  });

  it("ສ່ວນຫຼຸດເກີນຍອດແຖວ: ຂໍ້ຄວາມສ່ວນຫຼຸດ", () => {
    const issues = failed(form({ lines: [lineOf({ quantity: "1", discount: "500" })] }));
    expect(issues.messages).toEqual(["TEE-R: discount is invalid or larger than the line amount"]);
    expect(issues.fields).toEqual(["discount:v1"]);
  });

  it("VAT ຂອງຮ້ານຜິດຮູບແບບ: ຂໍ້ຄວາມ VAT (ບໍ່ໂທດສ່ວນຫຼຸດ)", () => {
    const issues = failed(form(), { settings: { vatRate: "abc", pricesIncludeVat: true } });
    expect(issues.messages).toEqual(["The store VAT setting is not valid. Please fix it in store settings"]);
    expect(issues.messages.join(" ")).not.toMatch(/discount/);
  });

  it("ຍອດເກີນ 16 ຫຼັກ: ຂໍ້ຄວາມຍອດໃຫຍ່ເກີນ (ບໍ່ໂທດສ່ວນຫຼຸດ)", () => {
    const issues = failed(form({ lines: [lineOf({ variant: variant({ price: "9999999999999999.00" }), quantity: "10", discount: "" })] }));
    expect(issues.messages).toEqual(["The order amount is too large to calculate"]);
    expect(issues.messages.join(" ")).not.toMatch(/discount/);
  });
});

describe("orderFormForConversation", () => {
  it("ເຄສບໍ່ມີລູກຄ້າ = ຟອມເປົ່າ (ຜູ້ໃຊ້ເລືອກ/ສ້າງເອງ)", () => {
    expect(orderFormForConversation(null)).toEqual(emptyOrderForm());
  });

  it("ເຄສມີລູກຄ້າ: ເລືອກລູກຄ້າທີ່ມີແລ້ວ + ເຕີມຊື່/ໂທຈັດສົ່ງ", () => {
    const form = orderFormForConversation({ id: "cu1", name: "Dala", phone: "020111111" });
    expect(form.customerMode).toBe("existing");
    expect(form.customer).toEqual({ id: "cu1", name: "Dala", phone: "020111111", email: null });
    expect(form.shippingName).toBe("Dala");
    expect(form.shippingPhone).toBe("020111111");
    expect(form.lines).toEqual([]);
  });

  it("ລູກຄ້າບໍ່ມີເບີ: ໂທຈັດສົ່ງວ່າງ", () => {
    expect(orderFormForConversation({ id: "cu2", name: "Noi", phone: null }).shippingPhone).toBe("");
  });
});

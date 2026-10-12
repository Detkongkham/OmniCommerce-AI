import { describe, expect, it } from "vitest";
import {
  MEMBER_PIN_PATTERN,
  STORE_MAX_LINES,
  STORE_MAX_QUANTITY,
  STORE_TOKEN_PATTERN,
  storeCartCheckSchema,
  storeCreateOrderSchema,
  storeMemberLoginSchema,
  storeMemberPageQuerySchema,
  storeProductListQuerySchema,
  storeSetPinSchema,
  storeStock,
} from "./storefront";

const item = (n = 1) => ({ variantId: `v${n}`, quantity: 1 });
const order = (patch: object = {}) => ({
  items: [item()],
  name: "ນາງ ກ",
  phone: "02055555555",
  address: "ບ້ານ ກ, ວຽງຈັນ",
  courierId: "c1",
  branch: "ສາຂາ ໂພນທັນ",
  expectedTotal: "100.00",
  ...patch,
});

describe("storeCartCheckSchema", () => {
  it("ຮັບ 1..20 ລາຍການ, ຈຳນວນ 1..20", () => {
    const max = Array.from({ length: STORE_MAX_LINES }, (_, index) => ({ variantId: `v${index}`, quantity: STORE_MAX_QUANTITY }));
    expect(storeCartCheckSchema.safeParse({ items: max }).success).toBe(true);
    expect(storeCartCheckSchema.safeParse({ items: [] }).success).toBe(false);
    expect(storeCartCheckSchema.safeParse({ items: [...max, item(99)] }).success).toBe(false);
    expect(storeCartCheckSchema.safeParse({ items: [{ variantId: "v1", quantity: STORE_MAX_QUANTITY + 1 }] }).success).toBe(false);
    expect(storeCartCheckSchema.safeParse({ items: [{ variantId: "v1", quantity: 0 }] }).success).toBe(false);
    expect(storeCartCheckSchema.safeParse({ items: [{ variantId: "v1", quantity: 1.5 }] }).success).toBe(false);
  });

  it("variant ຊ້ຳ ຜິດ; field ແປກ ຜິດ", () => {
    expect(storeCartCheckSchema.safeParse({ items: [item(), item()] }).success).toBe(false);
    expect(storeCartCheckSchema.safeParse({ items: [{ ...item(), warehouseId: "w" }] }).success).toBe(false);
  });
});

describe("storeCreateOrderSchema", () => {
  it("ຮັບ body ທີ່ຄົບ ແລະ trim ຂໍ້ຄວາມ", () => {
    const parsed = storeCreateOrderSchema.parse(order({ name: "  ນາງ ກ  ", note: "  " }));
    expect(parsed.name).toBe("ນາງ ກ");
    expect(parsed.note).toBe("");
  });

  it("phone ຕ້ອງເປັນຕົວເລກ 6-15 ຫຼັກ (ມີ + ໜ້າໄດ້)", () => {
    expect(storeCreateOrderSchema.safeParse(order({ phone: "+85620555555" })).success).toBe(true);
    expect(storeCreateOrderSchema.safeParse(order({ phone: "020 555" })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ phone: "12ab" })).success).toBe(false);
  });

  it("ຊື່/ທີ່ຢູ່/ສາຂາ ຫວ່າງ ຫຼື ຍາວເກີນ ຜິດ", () => {
    expect(storeCreateOrderSchema.safeParse(order({ name: " " })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ address: "x".repeat(301) })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ branch: "" })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ note: "x".repeat(501) })).success).toBe(false);
  });

  it("expectedTotal ຕ້ອງເປັນ money; ບໍ່ຮັບ field ລາຄາ/ສ່ວນຫຼຸດຈາກ client", () => {
    expect(storeCreateOrderSchema.safeParse(order({ expectedTotal: "-1" })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ expectedTotal: 100 })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ shippingFee: "0" })).success).toBe(false);
    expect(storeCreateOrderSchema.safeParse(order({ items: [{ ...item(), discount: "5" }] })).success).toBe(false);
  });
});

describe("storeProductListQuerySchema", () => {
  it("page: coerce ຈາກ string, default 1, ຕ້ອງ >= 1", () => {
    expect(storeProductListQuerySchema.parse({}).page).toBe(1);
    expect(storeProductListQuerySchema.parse({ page: "3" }).page).toBe(3);
    expect(storeProductListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("category ຕ້ອງເປັນ slug; q ຖືກ trim", () => {
    expect(storeProductListQuerySchema.parse({ category: "t-shirts", q: " ເສື້ອ " })).toMatchObject({ category: "t-shirts", q: "ເສື້ອ" });
    expect(storeProductListQuerySchema.safeParse({ category: "Bad Slug" }).success).toBe(false);
  });
});

describe("storeStock", () => {
  it("<= 0 = OUT; 1..5 = LOW ພ້ອມຈຳນວນ; ຫຼາຍກວ່ານັ້ນ = IN_STOCK ບໍ່ບອກຈຳນວນ", () => {
    expect(storeStock(0)).toEqual({ status: "OUT", remaining: null });
    expect(storeStock(-2)).toEqual({ status: "OUT", remaining: null });
    expect(storeStock(1)).toEqual({ status: "LOW", remaining: 1 });
    expect(storeStock(5)).toEqual({ status: "LOW", remaining: 5 });
    expect(storeStock(6)).toEqual({ status: "IN_STOCK", remaining: null });
  });
});

describe("STORE_TOKEN_PATTERN", () => {
  it("ກົງກັບ base64url ຂອງ 32 byte ເທົ່ານັ້ນ", () => {
    expect(STORE_TOKEN_PATTERN.test("A".repeat(43))).toBe(true);
    expect(STORE_TOKEN_PATTERN.test("A".repeat(42))).toBe(false);
    expect(STORE_TOKEN_PATTERN.test(`${"A".repeat(42)}/`)).toBe(false);
  });
});

describe("ສະມາຊິກເທິງເວັບ", () => {
  it("PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວພໍດີ", () => {
    expect(storeSetPinSchema.parse({ pin: "012345" })).toEqual({ pin: "012345" });
    for (const pin of ["12345", "1234567", "12345a", "", " 123456", 123456]) expect(storeSetPinSchema.safeParse({ pin }).success).toBe(false);
    expect(MEMBER_PIN_PATTERN.test("000000")).toBe(true);
  });
  it("ເຂົ້າລະບົບຕ້ອງມີເບີ + PIN; field ແປກຖືກປະຕິເສດ", () => {
    expect(storeMemberLoginSchema.parse({ phone: "02055550001", pin: "123456" })).toEqual({ phone: "02055550001", pin: "123456" });
    expect(storeMemberLoginSchema.safeParse({ phone: "abc", pin: "123456" }).success).toBe(false);
    expect(storeMemberLoginSchema.safeParse({ phone: "02055550001" }).success).toBe(false);
    expect(storeMemberLoginSchema.safeParse({ phone: "02055550001", pin: "123456", remember: true }).success).toBe(false);
  });
  it("pointsToRedeem ໃນກວດກະຕ່າ ແລະ ສັ່ງຊື້: ຈຳນວນເຕັມ > 0", () => {
    const items = [{ variantId: "v1", quantity: 1 }];
    expect(storeCartCheckSchema.parse({ items, pointsToRedeem: 25 }).pointsToRedeem).toBe(25);
    for (const value of [0, -1, 2.5, "5"]) expect(storeCartCheckSchema.safeParse({ items, pointsToRedeem: value }).success).toBe(false);
    expect(storeMemberPageQuerySchema.parse({})).toEqual({ page: 1 });
    expect(storeMemberPageQuerySchema.parse({ page: "3" })).toEqual({ page: 3 });
  });
});

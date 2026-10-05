import { describe, expect, it } from "vitest";
import {
  adjustStockSchema,
  createCategorySchema,
  createOrderSchema,
  createProductSchema,
  createWarehouseSchema,
  deltaSchema,
  moneySchema,
  customerListQuerySchema,
  orderListQuerySchema,
  stockMovementQuerySchema,
  variantSearchQuerySchema,
  productListQuerySchema,
  quantitySchema,
  stockListQuerySchema,
  transferStockSchema,
  updateProductSchema,
  updateStoreSettingsSchema,
  updateVariantSchema,
  variantInputSchema,
  variantName,
} from "./inventory";

const simpleProduct = {
  name: "ແກ້ວນ້ຳ",
  variants: [{ sku: "CUP-1", price: "25000" }],
};

const shirt = {
  name: "ເສື້ອຍືດ",
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    { sku: "TS-BK-M", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
    { sku: "TS-BK-L", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
  ],
};

describe("moneySchema", () => {
  it.each(["0", "12500", "12500.5", "12500.50"])("ຮັບ %s", (value) => {
    expect(moneySchema.safeParse(value).success).toBe(true);
  });
  it.each(["-1", "1.234", "abc", "", "1e3", "12500.", ".5"])("ປະຕິເສດ %s", (value) => {
    expect(moneySchema.safeParse(value).success).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("ສິນຄ້າບໍ່ມີ option ມີ 1 variant: ໃສ່ຄ່າເລີ່ມຕົ້ນ", () => {
    const parsed = createProductSchema.parse(simpleProduct);
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.options).toEqual([]);
    expect(parsed.images).toEqual([]);
    expect(parsed.variants[0]).toMatchObject({ costPrice: "0", isActive: true, optionValues: {} });
  });

  it("ສິນຄ້າບໍ່ມີ option ແຕ່ມີ 2 variants ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...simpleProduct,
      variants: [
        { sku: "A", price: "1" },
        { sku: "B", price: "1" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("ສິນຄ້າທີ່ມີ options ຖືກຕ້ອງ", () => {
    expect(createProductSchema.safeParse(shirt).success).toBe(true);
  });

  it("variant ລະບຸ option ບໍ່ຄົບ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [{ sku: "X", price: "1", optionValues: { ສີ: "ດຳ" } }],
    });
    expect(result.success).toBe(false);
  });

  it("ຄ່າ option ທີ່ບໍ່ຢູ່ໃນລາຍການ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [{ sku: "X", price: "1", optionValues: { ສີ: "ແດງ", ໄຊສ໌: "M" } }],
    });
    expect(result.success).toBe(false);
  });

  it("ຊຸດຄ່າ option ຊ້ຳ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [
        { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
        { sku: "B", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("SKU ຫຼື barcode ຊ້ຳໃນ request ຜິດ", () => {
    expect(
      createProductSchema.safeParse({
        ...shirt,
        variants: [
          { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
          { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...shirt,
        variants: [
          { sku: "A", barcode: "885", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
          { sku: "B", barcode: "885", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
        ],
      }).success,
    ).toBe(false);
  });

  it("option ເກີນ 3 ຫຼື ຊື່ option ຊ້ຳ ຜິດ", () => {
    const four = ["a", "b", "c", "d"].map((name) => ({ name, values: ["1"] }));
    expect(createProductSchema.safeParse({ ...shirt, options: four }).success).toBe(false);
    const dup = [
      { name: "ສີ", values: ["ດຳ"] },
      { name: "ສີ", values: ["ຂາວ"] },
    ];
    expect(createProductSchema.safeParse({ ...shirt, options: dup }).success).toBe(false);
  });

  it("compareAtPrice ຕ້ອງ >= price", () => {
    const bad = { ...simpleProduct, variants: [{ sku: "A", price: "100", compareAtPrice: "99.99" }] };
    expect(createProductSchema.safeParse(bad).success).toBe(false);
    const ok = { ...simpleProduct, variants: [{ sku: "A", price: "100", compareAtPrice: "100" }] };
    expect(createProductSchema.safeParse(ok).success).toBe(true);
  });

  it("SKU ຮັບສະເພາະ A-Z a-z 0-9 . _ -", () => {
    const bad = { ...simpleProduct, variants: [{ sku: "has space", price: "1" }] };
    expect(createProductSchema.safeParse(bad).success).toBe(false);
  });

  it("ຮູບ: URL ຕ້ອງ http/https ແລະ variantSku ຕ້ອງມີຢູ່", () => {
    const base = { ...simpleProduct };
    expect(
      createProductSchema.safeParse({ ...base, images: [{ url: "https://cdn.test/a.jpg" }] }).success,
    ).toBe(true);
    expect(createProductSchema.safeParse({ ...base, images: [{ url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        images: [{ url: "https://cdn.test/a.jpg", variantSku: "NOPE" }],
      }).success,
    ).toBe(false);
  });

  it("ປະຕິເສດ field ແປກ (strict)", () => {
    expect(createProductSchema.safeParse({ ...simpleProduct, hacked: true }).success).toBe(false);
  });
});

describe("variantName", () => {
  it("ຕໍ່ຄ່າຕາມລຳດັບ option ດ້ວຍ ' / '", () => {
    expect(variantName(["ສີ", "ໄຊສ໌"], { ໄຊສ໌: "M", ສີ: "ດຳ" })).toBe("ດຳ / M");
  });
  it("ບໍ່ມີ option ໄດ້ null", () => {
    expect(variantName([], {})).toBeNull();
  });
});

describe("updateProductSchema / category / warehouse", () => {
  it("update ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });
  it("category slug ຕ້ອງຖືກຮູບແບບ", () => {
    expect(createCategorySchema.safeParse({ name: "A", slug: "Bad Slug" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "A", slug: "good-slug" }).success).toBe(true);
  });
  it("warehouse code ຕ້ອງເປັນຕົວໃຫຍ່", () => {
    expect(createWarehouseSchema.safeParse({ code: "main", name: "x" }).success).toBe(false);
    const ok = createWarehouseSchema.parse({ code: "MAIN", name: "x" });
    expect(ok.isActive).toBe(true);
  });
});

describe("stock operation schemas", () => {
  it("adjust: delta ≠ 0 ແລະ ຕ້ອງມີ note", () => {
    const base = { variantId: "v", warehouseId: "w", delta: -2, note: "ນັບສະຕ໋ອກ" };
    expect(adjustStockSchema.safeParse(base).success).toBe(true);
    expect(adjustStockSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...base, delta: 1.5 }).success).toBe(false);
  });
  it("transfer: ສາງຕົ້ນທາງ ≠ ປາຍທາງ", () => {
    const base = { variantId: "v", fromWarehouseId: "a", toWarehouseId: "b", quantity: 1 };
    expect(transferStockSchema.safeParse(base).success).toBe(true);
    expect(transferStockSchema.safeParse({ ...base, toWarehouseId: "a" }).success).toBe(false);
  });
});

describe("createOrderSchema", () => {
  const item = { variantId: "v1", quantity: 2 };
  it("ຄ່າເລີ່ມຕົ້ນ: discount 0, shippingFee 0", () => {
    const parsed = createOrderSchema.parse({ items: [item] });
    expect(parsed.items[0]?.discount).toBe("0");
    expect(parsed.shippingFee).toBe("0");
  });
  it("items ຫວ່າງ ຜິດ", () => {
    expect(createOrderSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("customerId ແລະ customer ໃຊ້ພ້ອມກັນບໍ່ໄດ້", () => {
    const result = createOrderSchema.safeParse({
      items: [item],
      customerId: "c1",
      customer: { name: "A", phone: "020555555" },
    });
    expect(result.success).toBe(false);
  });
  it("phone ຕ້ອງເປັນຕົວເລກ 6-15 ຫຼັກ (ມີ + ໜ້າໄດ້)", () => {
    const make = (phone: string) => ({ items: [item], customer: { name: "A", phone } });
    expect(createOrderSchema.safeParse(make("+85620555555")).success).toBe(true);
    expect(createOrderSchema.safeParse(make("12ab")).success).toBe(false);
  });
  it("(variantId, warehouseId) ຊ້ຳ ຜິດ", () => {
    expect(createOrderSchema.safeParse({ items: [item, item] }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [item, { ...item, warehouseId: "w2" }] }).success,
    ).toBe(true);
  });
  it("reservationMinutes ຢູ່ໃນ 1..10080", () => {
    expect(createOrderSchema.safeParse({ items: [item], reservationMinutes: 0 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: [item], reservationMinutes: 45 }).success).toBe(true);
  });
});

describe("query schemas", () => {
  it("ໃສ່ຄ່າເລີ່ມຕົ້ນ page=1 pageSize=20 ແລະ coerce ຈາກ string", () => {
    expect(productListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(productListQuerySchema.parse({ page: "3", pageSize: "50" })).toMatchObject({ page: 3, pageSize: 50 });
  });
  it("pageSize ເກີນ 100 ຜິດ", () => {
    expect(productListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
  it("order list: status ຕ້ອງເປັນ enum, from/to ເປັນ Date", () => {
    expect(orderListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    const parsed = orderListQuerySchema.parse({ status: "PAID", from: "2026-10-01" });
    expect(parsed.from).toBeInstanceOf(Date);
  });
});

describe("date range ຂອງ filter (ເວລາຮ້ານ UTC+7)", () => {
  it("from date-only = ຕົ້ນມື້ເວລາລາວ", () => {
    expect(orderListQuerySchema.parse({ from: "2026-10-05" }).from?.toISOString()).toBe("2026-10-04T17:00:00.000Z");
  });
  it("to date-only = ຕົ້ນມື້ຖັດໄປ (exclusive) ເພື່ອໃຫ້ມື້ສຸດທ້າຍຮວມຢູ່ນຳ", () => {
    expect(orderListQuerySchema.parse({ to: "2026-10-05" }).to?.toISOString()).toBe("2026-10-05T17:00:00.000Z");
    expect(orderListQuerySchema.parse({ to: "2026-12-31" }).to?.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
  it("ມີເວລາມາດ້ວຍ ໃຊ້ຕາມທີ່ສົ່ງ", () => {
    expect(orderListQuerySchema.parse({ to: "2026-10-05T12:00:00Z" }).to?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });
  it.each(["2026-02-30", "2026-13-01", "nope", "2026-10-05T25:00:00Z"])("%s ຜິດ", (value) => {
    expect(orderListQuerySchema.safeParse({ from: value }).success).toBe(false);
    expect(stockMovementQuerySchema.safeParse({ to: value }).success).toBe(false);
  });
  it("ບໍ່ໃສ່ = undefined", () => {
    const parsed = stockMovementQuerySchema.parse({});
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });
});

describe("variantSearchQuerySchema / customerListQuerySchema", () => {
  it("includeInactive ເປັນ true/false string", () => {
    expect(variantSearchQuerySchema.parse({ includeInactive: "true" }).includeInactive).toBe(true);
    expect(variantSearchQuerySchema.safeParse({ includeInactive: "yes" }).success).toBe(false);
  });
  it("pagination ເລີ່ມຕົ້ນ", () => {
    expect(customerListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });
});

describe("updateStoreSettingsSchema", () => {
  it("vatRate 0-100, reservationMinutes 1-10080, ບໍ່ມີ baseCurrency", () => {
    expect(updateStoreSettingsSchema.safeParse({ vatRate: "10" }).success).toBe(true);
    expect(updateStoreSettingsSchema.safeParse({ vatRate: "101" }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({ vatRate: 10 }).success).toBe(false); // ຕ້ອງເປັນ string
    expect(updateStoreSettingsSchema.safeParse({ reservationMinutes: 0 }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({ baseCurrency: "USD" }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({}).success).toBe(false);
  });
  it.each(["0", "7", "10", "12.5", "0.01", "0.3", "33.33", "99.99", "100", "100.00"])("vatRate %s ຖືກຕ້ອງ (≤2 ທົດສະນິຍົມ)", (vatRate) => {
    expect(updateStoreSettingsSchema.safeParse({ vatRate }).success).toBe(true);
  });
  it.each(["0.015", "1.005", "5.555", "100.01", "-1", "abc", ""])("vatRate %s ຜິດ", (vatRate) => {
    expect(updateStoreSettingsSchema.safeParse({ vatRate }).success).toBe(false);
  });
});

describe("hardening: invalid money must not throw", () => {
  const cases = [
    { price: "abc", compareAtPrice: "5" },
    { price: "5", compareAtPrice: "abc" },
    { price: "abc", compareAtPrice: "abc" },
  ];
  it.each(cases)("variantInputSchema %o", (prices) => {
    const result = variantInputSchema.safeParse({ sku: "A", ...prices });
    expect(result.success).toBe(false);
  });
  it.each(cases)("createProductSchema %o", (prices) => {
    const result = createProductSchema.safeParse({ name: "x", variants: [{ sku: "A", ...prices }] });
    expect(result.success).toBe(false);
  });
  it("compareAtPrice: null ຮັບໄດ້", () => {
    expect(variantInputSchema.safeParse({ sku: "A", price: "1", compareAtPrice: null }).success).toBe(true);
  });
});

describe("image URL", () => {
  const parse = (url: string) =>
    createProductSchema.safeParse({ ...simpleProduct, images: [{ url }] }).success;
  it.each(["https://cdn.test/a.jpg", "http://localhost:3000/x.png?v=1#a", "HTTPS://CDN.TEST/A.JPG"])(
    "ຮັບ %s",
    (url) => expect(parse(url)).toBe(true),
  );
  it.each([
    "ftp://x.com/a.jpg",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "//x.com/a.jpg",
    "https://cdn.test/a b.jpg",
    "https://cdn.test/a\u0000.jpg",
    "https://cdn.test/a\u0007.jpg",
    "https://cdn.test/a\u200b.jpg",
    "https://cdn.test/a\u2028.jpg",
    "https://cdn.test/a\ufeff.jpg",
    "https://",
    "https://@",
    "https://:80",
    "https://?x",
    "https://#x",
    "https:///x",
  ])("ປະຕິເສດ %j", (url) => expect(parse(url)).toBe(false));
});

describe("boundaries", () => {
  it("quantity", () => {
    expect(quantitySchema.safeParse(1_000_000).success).toBe(true);
    expect(quantitySchema.safeParse(1_000_001).success).toBe(false);
  });
  it("delta", () => {
    expect(deltaSchema.safeParse(-1_000_000).success).toBe(true);
    expect(deltaSchema.safeParse(1_000_000).success).toBe(true);
    expect(deltaSchema.safeParse(1_000_001).success).toBe(false);
  });
  it("page / pageSize ຕ່ຳສຸດ", () => {
    expect(productListQuerySchema.safeParse({ pageSize: "0" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
  it("lowStock coerce", () => {
    expect(stockListQuerySchema.parse({ lowStock: "true" }).lowStock).toBe(true);
    expect(stockListQuerySchema.safeParse({ lowStock: "maybe" }).success).toBe(false);
  });
  it("option ທີ່ values ຫວ່າງ ຜິດ", () => {
    expect(
      createProductSchema.safeParse({ ...shirt, options: [{ name: "ສີ", values: [] }] }).success,
    ).toBe(false);
  });
  it("updateVariantSchema", () => {
    expect(updateVariantSchema.safeParse({}).success).toBe(false);
    expect(updateVariantSchema.safeParse({ price: "1" }).success).toBe(true);
  });
});

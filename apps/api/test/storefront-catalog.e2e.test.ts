import { receive } from "@oca/database";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_KEYS, keysOf, setupStoreTest } from "./storefront-fixtures";

describe("storefront catalog (e2e)", () => {
  const { server, db, state } = setupStoreTest();

  const expectNoForbiddenKeys = (body: unknown) => {
    const keys = keysOf(body);
    for (const key of FORBIDDEN_KEYS) expect(keys.has(key), key).toBe(false);
  };

  describe("GET /store/config", () => {
    it("ບໍ່ຕ້ອງ token: ຊື່ຮ້ານ, ບັນຊີຮັບເງິນ, ເວລາຈອງ ແລະ courier ທີ່ເປີດໃຊ້ເທົ່ານັ້ນ", async () => {
      await db().storeSetting.create({
        data: {
          id: 1,
          name: "ຮ້ານ ກ",
          paymentInstructions: "ໂອນແລ້ວສົ່ງສະລິບ",
          receivingAccounts: [{ bank: "BCEL", accountNo: "0101234567", accountName: "ຮ້ານ ກ" }],
        },
      });
      await db().courier.create({ data: { code: "OFF", name: "Closed", isActive: false } });
      const res = await request(server()).get("/store/config").expect(200);
      expect(res.body).toEqual({
        name: "ຮ້ານ ກ",
        currency: "LAK",
        reservationMinutes: 30,
        paymentInstructions: "ໂອນແລ້ວສົ່ງສະລິບ",
        receivingAccounts: [{ bank: "BCEL", accountNo: "0101234567", accountName: "ຮ້ານ ກ" }],
        couriers: [{ id: state.courier.id, name: "Anousith" }],
      });
    });

    it("ຍັງບໍ່ມີ StoreSetting → ສ້າງຄ່າເລີ່ມຕົ້ນ ແລະ ຕອບໄດ້", async () => {
      const res = await request(server()).get("/store/config").expect(200);
      expect(res.body.receivingAccounts).toEqual([]);
      expect(res.body.paymentInstructions).toBeNull();
    });
  });

  describe("GET /store/products", () => {
    it("ສະເພາະສິນຄ້າ ACTIVE ທີ່ມີ variant ເປີດຂາຍ; ຊ່ວງລາຄາ, ຮູບທຳອິດ ແລະ ສະຖານະສະຕ໋ອກລວມ", async () => {
      const { f } = state;
      await db().productVariant.update({ where: { id: f.v2.id }, data: { price: "150.00", compareAtPrice: "200.00" } });
      await db().productVariant.update({ where: { id: f.v1.id }, data: { compareAtPrice: "120.00" } });
      await db().productImage.createMany({
        data: [
          { productId: f.product.id, url: "/media/files/b.png", position: 1 },
          { productId: f.product.id, url: "/media/files/a.png", position: 0 },
        ],
      });
      await db().product.create({ data: { name: "Draft", slug: "draft", status: "DRAFT", variants: { create: { sku: "D-1", price: "1" } } } });
      await db().product.create({ data: { name: "Archived", slug: "archived", status: "ARCHIVED", variants: { create: { sku: "A-1", price: "1" } } } });
      await db().product.create({ data: { name: "No variants", slug: "no-variants", status: "ACTIVE" } });
      await db().product.create({
        data: { name: "All inactive", slug: "all-inactive", status: "ACTIVE", variants: { create: { sku: "I-1", price: "1", isActive: false } } },
      });

      const res = await request(server()).get("/store/products").expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 24 });
      expect(res.body.items).toEqual([
        {
          slug: "product",
          name: "Product",
          imageUrl: "/media/files/a.png",
          priceMin: "100.00",
          priceMax: "150.00",
          compareAtPrice: "120.00",
          stock: "IN_STOCK",
        },
      ]);
      expectNoForbiddenKeys(res.body);
    });

    it("ສະຖານະສະຕ໋ອກ: ນັບສະເພາະສາງ default ແລະ ຫັກສ່ວນທີ່ຈອງ; variant ປິດຂາຍບໍ່ນັບ", async () => {
      const { f } = state;
      const stockOf = async () => (await request(server()).get("/store/products").expect(200)).body.items[0].stock;
      expect(await stockOf()).toBe("IN_STOCK");

      await db().stockLevel.updateMany({ where: { variantId: f.v1.id, warehouseId: f.whA.id }, data: { reserved: 6 } });
      expect(await stockOf()).toBe("LOW");

      await db().stockLevel.updateMany({ where: { variantId: f.v1.id, warehouseId: f.whA.id }, data: { reserved: 10 } });
      expect(await stockOf()).toBe("OUT");

      // ສະຕ໋ອກໃນສາງ B (ບໍ່ແມ່ນ default) ບໍ່ຖືກນັບ
      await db().$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 50 }));
      expect(await stockOf()).toBe("OUT");

      // variant ປິດຂາຍ ເຖິງມີສະຕ໋ອກກໍບໍ່ນັບ
      await db().$transaction((tx) => receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 50 }));
      await db().productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
      expect(await stockOf()).toBe("OUT");
    });

    it("ບໍ່ມີສາງ default → ທຸກສິນຄ້າເປັນ OUT", async () => {
      await db().warehouse.updateMany({ data: { isDefault: false } });
      const res = await request(server()).get("/store/products").expect(200);
      expect(res.body.items[0].stock).toBe("OUT");
    });

    it("ກັ່ນຕອງດ້ວຍ category (slug) ແລະ q (ຊື່, ບໍ່ສົນຕົວພິມ)", async () => {
      const shirts = await db().category.create({ data: { name: "ເສື້ອ", slug: "shirts" } });
      await db().product.create({
        data: { name: "Blue Shirt", slug: "blue-shirt", status: "ACTIVE", categoryId: shirts.id, variants: { create: { sku: "BS-1", price: "50" } } },
      });
      const byCategory = await request(server()).get("/store/products?category=shirts").expect(200);
      expect(byCategory.body.items.map((item: { slug: string }) => item.slug)).toEqual(["blue-shirt"]);
      const byName = await request(server()).get("/store/products?q=blue").expect(200);
      expect(byName.body.items.map((item: { slug: string }) => item.slug)).toEqual(["blue-shirt"]);
      const none = await request(server()).get("/store/products?category=unknown").expect(200);
      expect(none.body.items).toEqual([]);
      await request(server()).get("/store/products?category=Bad%20Slug").expect(400);
    });

    it("ແບ່ງໜ້າ 24 ລາຍການ, ໃໝ່ສຸດກ່ອນ", async () => {
      for (let index = 0; index < 25; index += 1) {
        await db().product.create({
          data: {
            name: `P${index}`,
            slug: `p-${index}`,
            status: "ACTIVE",
            createdAt: new Date(Date.UTC(2030, 0, 1, 0, index)),
            variants: { create: { sku: `P-${index}`, price: "10" } },
          },
        });
      }
      const first = await request(server()).get("/store/products").expect(200);
      expect(first.body.total).toBe(26);
      expect(first.body.items).toHaveLength(24);
      expect(first.body.items[0].slug).toBe("p-24");
      const second = await request(server()).get("/store/products?page=2").expect(200);
      expect(second.body.items).toHaveLength(2);
      await request(server()).get("/store/products?page=0").expect(400);
    });
  });

  describe("GET /store/products/:slug", () => {
    it("ລາຍລະອຽດ: options, variant ທີ່ເປີດຂາຍພ້ອມ optionValues ແລະ ສະຖານະສະຕ໋ອກ, ຮູບ, ໝວດໝູ່", async () => {
      const category = await db().category.create({ data: { name: "ເສື້ອ", slug: "shirts" } });
      const product = await db().product.create({
        data: {
          name: "ເສື້ອຍືດ",
          slug: "tee",
          description: "ຜ້າຝ້າຍ",
          status: "ACTIVE",
          categoryId: category.id,
          options: { create: { name: "ສີ", values: { create: [{ value: "ດຳ", position: 0 }, { value: "ຂາວ", position: 1 }] } } },
        },
        include: { options: { include: { values: true } } },
      });
      const values = product.options[0]?.values ?? [];
      const black = values.find((value) => value.value === "ດຳ");
      const white = values.find((value) => value.value === "ຂາວ");
      const vBlack = await db().productVariant.create({
        data: { productId: product.id, sku: "TEE-B", name: "ດຳ", price: "80.00", costPrice: "30.00", optionValues: { connect: { id: black?.id } } },
      });
      await db().productVariant.create({
        data: { productId: product.id, sku: "TEE-W", name: "ຂາວ", price: "80.00", isActive: false, optionValues: { connect: { id: white?.id } } },
      });
      await db().$transaction((tx) => receive(tx, { variantId: vBlack.id, warehouseId: state.f.whA.id, quantity: 3 }));
      await db().productImage.create({ data: { productId: product.id, variantId: vBlack.id, url: "/media/files/tee.png", alt: "ເສື້ອ" } });

      const res = await request(server()).get("/store/products/tee").expect(200);
      expect(res.body).toEqual({
        slug: "tee",
        name: "ເສື້ອຍືດ",
        description: "ຜ້າຝ້າຍ",
        category: { name: "ເສື້ອ", slug: "shirts" },
        options: [{ name: "ສີ", values: ["ດຳ", "ຂາວ"] }],
        variants: [
          {
            id: vBlack.id,
            name: "ດຳ",
            price: "80.00",
            compareAtPrice: null,
            optionValues: { ສີ: "ດຳ" },
            stock: { status: "LOW", remaining: 3 },
          },
        ],
        images: [{ url: "/media/files/tee.png", alt: "ເສື້ອ", variantId: vBlack.id }],
      });
      expectNoForbiddenKeys(res.body);
    });

    it("ສິນຄ້າ DRAFT, ບໍ່ມີ variant ເປີດຂາຍ ຫຼື ບໍ່ມີ → 404 PRODUCT_NOT_FOUND", async () => {
      await db().product.create({ data: { name: "Draft", slug: "draft", status: "DRAFT", variants: { create: { sku: "D-1", price: "1" } } } });
      await db().product.create({
        data: { name: "Inactive", slug: "inactive", status: "ACTIVE", variants: { create: { sku: "I-1", price: "1", isActive: false } } },
      });
      for (const slug of ["draft", "inactive", "nope"]) {
        const res = await request(server()).get(`/store/products/${slug}`).expect(404);
        expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
      }
    });
  });

  describe("GET /store/categories", () => {
    it("ສະເພາະໝວດໝູ່ທີ່ມີສິນຄ້າຂາຍໄດ້; parentSlug ຊີ້ສະເພາະ parent ທີ່ຢູ່ໃນລາຍການ", async () => {
      const parent = await db().category.create({ data: { name: "ເຄື່ອງນຸ່ງ", slug: "clothing", position: 0 } });
      const child = await db().category.create({ data: { name: "ເສື້ອ", slug: "shirts", parentId: parent.id, position: 1 } });
      await db().category.create({ data: { name: "ຫວ່າງ", slug: "empty" } });
      const draftOnly = await db().category.create({ data: { name: "ຮ່າງ", slug: "draft-only" } });
      await db().product.update({ where: { id: state.f.product.id }, data: { categoryId: child.id } });
      await db().product.create({
        data: { name: "Draft", slug: "draft", status: "DRAFT", categoryId: draftOnly.id, variants: { create: { sku: "D-1", price: "1" } } },
      });

      const res = await request(server()).get("/store/categories").expect(200);
      expect(res.body).toEqual([{ name: "ເສື້ອ", slug: "shirts", parentSlug: null }]);

      await db().product.create({
        data: { name: "Hat", slug: "hat", status: "ACTIVE", categoryId: parent.id, variants: { create: { sku: "H-1", price: "1" } } },
      });
      const both = await request(server()).get("/store/categories").expect(200);
      expect(both.body).toEqual([
        { name: "ເຄື່ອງນຸ່ງ", slug: "clothing", parentSlug: null },
        { name: "ເສື້ອ", slug: "shirts", parentSlug: "clothing" },
      ]);
    });
  });

  describe("POST /store/cart/check", () => {
    const check = (items: { variantId: string; quantity: number }[]) => request(server()).post("/store/cart/check").send({ items });

    it("ຄືນລາຄາ/ຊື່/ສະຕ໋ອກປັດຈຸບັນ ແລະ ຍອດລວມທີ່ຄິດຝັ່ງ server", async () => {
      const { f } = state;
      await db().productImage.create({ data: { productId: f.product.id, url: "/media/files/a.png" } });
      const res = await check([{ variantId: f.v1.id, quantity: 3 }]).expect(200);
      expect(res.body).toEqual({
        items: [
          {
            variantId: f.v1.id,
            quantity: 3,
            unavailable: false,
            productName: "Product",
            productSlug: "product",
            variantName: null,
            imageUrl: "/media/files/a.png",
            unitPrice: "100.00",
            lineTotal: "300.00",
            stock: { status: "IN_STOCK", remaining: null },
            insufficient: false,
          },
        ],
        subtotal: "300.00",
        vatAmount: "27.27",
        total: "300.00",
        orderable: true,
      });
      expectNoForbiddenKeys(res.body);
    });

    it("ສະຕ໋ອກບໍ່ພໍ → insufficient; ສິນຄ້າປິດຂາຍ/ບໍ່ມີ → unavailable; ທັງສອງເຮັດໃຫ້ orderable = false ແລະ ບໍ່ຖືກຄິດໃນຍອດ", async () => {
      const { f } = state;
      const short = await check([{ variantId: f.v1.id, quantity: 11 }]).expect(200);
      expect(short.body.items[0]).toMatchObject({ insufficient: true, unavailable: false });
      expect(short.body.orderable).toBe(false);

      await db().productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
      const mixed = await check([
        { variantId: f.v1.id, quantity: 1 },
        { variantId: f.v2.id, quantity: 1 },
        { variantId: "missing", quantity: 1 },
      ]).expect(200);
      expect(mixed.body.items[1]).toEqual({ variantId: f.v2.id, quantity: 1, unavailable: true });
      expect(mixed.body.items[2]).toEqual({ variantId: "missing", quantity: 1, unavailable: true });
      expect(mixed.body.total).toBe("100.00");
      expect(mixed.body.orderable).toBe(false);
    });

    it("body ຜິດ → 400 (ຫວ່າງ, ຈຳນວນເກີນ 20, variant ຊ້ຳ)", async () => {
      const { f } = state;
      await check([]).expect(400);
      await check([{ variantId: f.v1.id, quantity: 21 }]).expect(400);
      await check([
        { variantId: f.v1.id, quantity: 1 },
        { variantId: f.v1.id, quantity: 1 },
      ]).expect(400);
    });
  });
});

describe("storefront cart check rate limit (e2e)", () => {
  const { server, state } = setupStoreTest({ STORE_CHECK_RATE_LIMIT: "2" });

  it("ເກີນ limit ຕໍ່ IP → 429 TOO_MANY_ATTEMPTS", async () => {
    const check = () => request(server()).post("/store/cart/check").send({ items: [{ variantId: state.f.v1.id, quantity: 1 }] });
    await check().expect(200);
    await check().expect(200);
    const res = await check().expect(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

const cup = { name: "ແກ້ວນ້ຳ", variants: [{ sku: "CUP-1", price: "25000", costPrice: "10000.5" }] };

const shirt = {
  name: "Black Shirt",
  status: "ACTIVE",
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    { sku: "TS-BK-M", barcode: "885001", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
    { sku: "TS-BK-L", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
    { sku: "TS-WH-M", price: "110000", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "M" } },
  ],
  images: [
    { url: "https://cdn.test/shirt-1.jpg", alt: "front" },
    { url: "https://cdn.test/shirt-bk.jpg", variantSku: "TS-BK-M" },
  ],
};

describe("products (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const create = (body: object) => request(server()).post("/products").set(writer).send(body);

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  describe("ສ້າງ ແລະ ອ່ານ", () => {
    it("ສິນຄ້າບໍ່ມີ option: DRAFT, 1 variant, ເງິນເປັນ string 2 ທົດສະນິຍົມ, slug fallback, audit", async () => {
      const res = await create(cup).expect(201);
      expect(res.body).toMatchObject({
        name: "ແກ້ວນ້ຳ",
        slug: "product",
        status: "DRAFT",
        categoryId: null,
        options: [],
      });
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.variants[0]).toMatchObject({
        sku: "CUP-1",
        name: null,
        price: "25000.00",
        costPrice: "10000.50",
        compareAtPrice: null,
        isActive: true,
        optionValues: {},
        stock: [],
      });
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "product.create" } });
      expect(audit.entityId).toBe(res.body.id);
    });

    it("ສິນຄ້າທີ່ມີ options: ຊື່ variant 'ດຳ / M', ຮູບຜູກກັບ variant ຕາມ SKU, position ຕາມລຳດັບ", async () => {
      const res = await create(shirt).expect(201);
      expect(res.body.slug).toBe("black-shirt");
      expect(res.body.options.map((o: { name: string }) => o.name)).toEqual(["ສີ", "ໄຊສ໌"]);
      const names = res.body.variants.map((v: { name: string }) => v.name).sort();
      expect(names).toEqual(["ດຳ / L", "ດຳ / M", "ຂາວ / M"].sort());
      const black = res.body.variants.find((v: { sku: string }) => v.sku === "TS-BK-M");
      expect(black.optionValues).toEqual({ ສີ: "ດຳ", ໄຊສ໌: "M" });
      expect(res.body.images.map((i: { position: number }) => i.position)).toEqual([0, 1]);
      expect(res.body.images[1].variantId).toBe(black.id);
      expect(res.body.images[0].variantId).toBeNull();
    });

    it("GET /products/:id ຄືນຂໍ້ມູນເຕັມພ້ອມ stock ຕໍ່ສາງ; ບໍ່ມີ id → 404", async () => {
      const created = await create(cup).expect(201);
      const variantId = created.body.variants[0].id;
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockLevel.create({ data: { variantId, warehouseId: wh.id, onHand: 10, reserved: 3 } });

      const res = await request(server()).get(`/products/${created.body.id}`).set(reader).expect(200);
      expect(res.body.variants[0].stock).toEqual([{ warehouseId: wh.id, onHand: 10, reserved: 3, available: 7 }]);
      await request(server()).get("/products/nope").set(reader).expect(404);
    });

    it("SKU ຊ້ຳກັບສິນຄ້າອື່ນ → 409 ແລະ ບໍ່ມີສິນຄ້າຄ້າງ (rollback)", async () => {
      await create(cup).expect(201);
      await create({ name: "Other", variants: [{ sku: "CUP-1", price: "1" }] }).expect(409);
      expect(await db.product.count()).toBe(1);
    });

    it("category ທີ່ບໍ່ມີ → 400; body ຜິດ → 400 ພ້ອມ issues", async () => {
      await create({ ...cup, categoryId: "missing" }).expect(400);
      const res = await create({ name: "x", variants: [] }).expect(400);
      expect(res.body.issues.length).toBeGreaterThan(0);
    });

    it("ສິດ: ບໍ່ login 401, read-only ສ້າງບໍ່ໄດ້ 403, ບໍ່ມີ inventory:read ອ່ານບໍ່ໄດ້ 403", async () => {
      await request(server()).get("/products").expect(401);
      await request(server()).post("/products").set(reader).send(cup).expect(403);
      const noInv = await bearerFor(app, "noinv@test.local");
      await request(server()).get("/products").set(noInv).expect(403);
    });
  });

  describe("ລາຍການ", () => {
    beforeEach(async () => {
      const category = await db.category.create({ data: { name: "Tops", slug: "tops" } });
      await create({ ...shirt, categoryId: category.id }).expect(201);
      await create({ ...cup, status: "ARCHIVED" }).expect(201);
    });

    it("pagination + ສະຫຼຸບ: variantCount, ຊ່ວງລາຄາ, ຮູບທຳອິດ, ສະຕ໋ອກຂາຍໄດ້ລວມ", async () => {
      const shirtRow = await db.productVariant.findUniqueOrThrow({ where: { sku: "TS-BK-M" } });
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockLevel.create({ data: { variantId: shirtRow.id, warehouseId: wh.id, onHand: 10, reserved: 4 } });

      const res = await request(server()).get("/products?status=ACTIVE").set(reader).expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(res.body.items[0]).toMatchObject({
        name: "Black Shirt",
        status: "ACTIVE",
        category: { name: "Tops" },
        imageUrl: "https://cdn.test/shirt-1.jpg",
        variantCount: 3,
        priceMin: "100000.00",
        priceMax: "110000.00",
        availableTotal: 6,
      });
    });

    it("ຄົ້ນຫາ q ດ້ວຍຊື່ / SKU / barcode (ບໍ່ສົນຕົວພິມ)", async () => {
      const search = async (q: string) =>
        (await request(server()).get("/products").query({ q }).set(reader).expect(200)).body.items.map(
          (p: { name: string }) => p.name,
        );
      expect(await search("black")).toEqual(["Black Shirt"]);
      expect(await search("ts-wh")).toEqual(["Black Shirt"]);
      expect(await search("885001")).toEqual(["Black Shirt"]);
      expect(await search("ແກ້ວ")).toEqual(["ແກ້ວນ້ຳ"]);
      expect(await search("nomatch")).toEqual([]);
    });

    it("filter ຕາມ categoryId ແລະ pageSize", async () => {
      const category = await db.category.findUniqueOrThrow({ where: { slug: "tops" } });
      const byCategory = await request(server()).get("/products").query({ categoryId: category.id }).set(reader).expect(200);
      expect(byCategory.body.total).toBe(1);
      const paged = await request(server()).get("/products?pageSize=1&page=2").set(reader).expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.total).toBe(2);
      await request(server()).get("/products?pageSize=101").set(reader).expect(400);
    });
  });
});

import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers, seedLiveSession } from "./helpers";

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
      const dup = await create({ name: "Other", variants: [{ sku: "CUP-1", price: "1" }] }).expect(409);
      expect(dup.body.message).toContain("sku");
      expect(dup.body.message).not.toContain("_key");
      expect(await db.product.count()).toBe(1);
    });

    it("barcode / slug ຊ້ຳ → 409 ແລະ message ບອກຊື່ field (ບໍ່ມີ _key)", async () => {
      await create({ name: "A", slug: "a-slug", variants: [{ sku: "A-1", barcode: "BC-1", price: "1" }] }).expect(201);
      const barcode = await create({ name: "B", variants: [{ sku: "B-1", barcode: "BC-1", price: "1" }] }).expect(409);
      expect(barcode.body.message).toContain("barcode");
      expect(barcode.body.message).not.toContain("_key");
      const slug = await create({ name: "C", slug: "a-slug", variants: [{ sku: "C-1", price: "1" }] }).expect(409);
      expect(slug.body.message).toContain("slug");
      expect(slug.body.message).not.toContain("_key");
    });

    it("optionValues ຮຽງ key ຕາມລຳດັບ option", async () => {
      const res = await create(shirt).expect(201);
      for (const variant of res.body.variants) {
        expect(Object.keys(variant.optionValues)).toEqual(["ສີ", "ໄຊສ໌"]);
      }
    });

    it("category ທີ່ບໍ່ມີ → 404; body ຜິດ → 400 ພ້ອມ issues", async () => {
      const missing = await create({ ...cup, categoryId: "missing" }).expect(404);
      expect(missing.body.code).toBe("CATEGORY_NOT_FOUND");
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

  describe("ແກ້ໄຂສິນຄ້າ", () => {
    it("PATCH ແກ້ຊື່/ສະຖານະ/ໝວດ/ລຶບ description (null); slug ຊ້ຳ 409; ໝວດບໍ່ມີ 404; body ວ່າງ 400; ບໍ່ມີ id 404", async () => {
      const a = await create(cup).expect(201);
      const b = await create({ ...cup, name: "B", slug: "b-slug", variants: [{ sku: "B-1", price: "1" }] }).expect(201);
      const category = await db.category.create({ data: { name: "C", slug: "c" } });
      const patch = (id: string, body: object) => request(server()).patch(`/products/${id}`).set(writer).send(body);

      const res = await patch(a.body.id, { name: "ໃໝ່", status: "ACTIVE", categoryId: category.id, description: null }).expect(200);
      expect(res.body).toMatchObject({ name: "ໃໝ່", status: "ACTIVE", categoryId: category.id, description: null });
      await patch(a.body.id, { slug: "b-slug" }).expect(409);
      await patch(a.body.id, { categoryId: "missing" }).expect(404);
      await patch(a.body.id, {}).expect(400);
      await patch("nope", { name: "x" }).expect(404);
      expect(await db.auditLog.count({ where: { action: "product.update", entityId: a.body.id } })).toBe(1);
      expect(b.body.slug).toBe("b-slug");
    });
  });

  describe("ລຶບ / archive", () => {
    it("ບໍ່ເຄີຍຖືກຂາຍ ແລະ ບໍ່ມີ movement → ລຶບແທ້ 204 (variant/ຮູບຖືກລຶບຕາມ)", async () => {
      const p = await create(shirt).expect(201);
      await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(204);
      expect(await db.product.count()).toBe(0);
      expect(await db.productVariant.count()).toBe(0);
      expect(await db.auditLog.count({ where: { action: "product.delete" } })).toBe(1);
    });

    it("ເຄີຍຖືກຂາຍ → ARCHIVED ແທນການລຶບ (200 { archived: true })", async () => {
      const p = await create(cup).expect(201);
      const variantId = p.body.variants[0].id;
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      const order = await db.order.create({
        data: {
          orderNumber: "SO-X1",
          channel: "OFFLINE",
          source: "MANUAL",
          currency: "LAK",
          subtotal: "1",
          vatRate: "10",
          vatAmount: "0",
          total: "1",
          items: {
            create: [
              { variantId, warehouseId: wh.id, productName: "x", sku: "CUP-1", unitPrice: "1", unitCost: "0", quantity: 1, lineTotal: "1" },
            ],
          },
        },
      });
      expect(order.id).toBeTruthy();

      const res = await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(200);
      expect(res.body).toEqual({ archived: true });
      expect((await db.product.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe("ARCHIVED");
      expect(await db.auditLog.count({ where: { action: "product.archive" } })).toBe(1);
    });

    it("ມີ StockMovement ແຕ່ບໍ່ເຄີຍຖືກຂາຍ → 409 (ໃຫ້ archive ດ້ວຍ PATCH status)", async () => {
      const p = await create(cup).expect(201);
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockMovement.create({
        data: { variantId: p.body.variants[0].id, warehouseId: wh.id, type: "RECEIVE", quantity: 1 },
      });
      await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(409);
    });

    it("ຖືກໃຊ້ໃນ Live/ໂພສ CF ຢູ່ (ບໍ່ເຄີຍຂາຍ) → 409 PRODUCT_IN_LIVE_SESSION ແລະ ສິນຄ້າຍັງຢູ່", async () => {
      const p = await create(cup).expect(201);
      await seedLiveSession(db, { items: [{ code: "A1", variantId: p.body.variants[0].id }] });
      const res = await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(409);
      expect(res.body.code).toBe("PRODUCT_IN_LIVE_SESSION");
      expect(await db.product.count()).toBe(1);
    });
  });

  describe("variants", () => {
    it("POST /products/:id/variants ເພີ່ມ variant ໃໝ່ຂອງສິນຄ້າທີ່ມີ options", async () => {
      const p = await create(shirt).expect(201);
      const res = await request(server())
        .post(`/products/${p.body.id}/variants`)
        .set(writer)
        .send({ sku: "TS-WH-L", price: "110000", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } })
        .expect(201);
      expect(res.body).toMatchObject({ sku: "TS-WH-L", name: "ຂາວ / L", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } });
      expect((await request(server()).get(`/products/${p.body.id}`).set(reader)).body.variants).toHaveLength(4);
    });

    it("ເພີ່ມ variant ຜິດ: ຊຸດຄ່າຊ້ຳ / ຄ່າບໍ່ຢູ່ໃນ option / ບໍ່ຄົບ → 409/400; SKU ຊ້ຳ → 409", async () => {
      const p = await create(shirt).expect(201);
      const post = (body: object) => request(server()).post(`/products/${p.body.id}/variants`).set(writer).send(body);
      await post({ sku: "N1", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } }).expect(409);
      await post({ sku: "N2", price: "1", optionValues: { ສີ: "ແດງ", ໄຊສ໌: "M" } }).expect(400);
      await post({ sku: "N3", price: "1", optionValues: { ສີ: "ຂາວ" } }).expect(400);
      await post({ sku: "TS-BK-M", price: "1", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } }).expect(409);
    });

    it("ເພີ່ມ variant ຊຸດຄ່າດຽວກັນພ້ອມກັນ → ສຳເລັດ 1 ແລະ 409 1", async () => {
      for (let round = 0; round < 4; round++) {
        const p = await create({ ...shirt, name: `Race ${round}`, variants: [{ sku: `R${round}-A`, price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } }], images: [] }).expect(201);
        const post = (sku: string) =>
          request(server()).post(`/products/${p.body.id}/variants`).set(writer).send({ sku, price: "1", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } });
        const [r1, r2] = await Promise.all([post(`R${round}-X`), post(`R${round}-Y`)]);
        expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      }
    });

    it("ສິນຄ້າບໍ່ມີ option ເພີ່ມ variant ທີສອງບໍ່ໄດ້ → 409; ບໍ່ມີສິນຄ້າ → 404", async () => {
      const p = await create(cup).expect(201);
      await request(server()).post(`/products/${p.body.id}/variants`).set(writer).send({ sku: "CUP-2", price: "1" }).expect(409);
      await request(server()).post("/products/nope/variants").set(writer).send({ sku: "Z", price: "1" }).expect(404);
    });

    it("PATCH /variants/:id ແກ້ລາຄາ/ຕົ້ນທຶນ/active; compareAt < price → 400; SKU ຊ້ຳ → 409; ບໍ່ມີ → 404", async () => {
      const p = await create(shirt).expect(201);
      const [first, second] = p.body.variants as { id: string; sku: string }[];
      const patch = (id: string, body: object) => request(server()).patch(`/variants/${id}`).set(writer).send(body);

      const res = await patch(first!.id, { price: "120000", costPrice: "70000", isActive: false, compareAtPrice: "150000" }).expect(200);
      expect(res.body).toMatchObject({ price: "120000.00", costPrice: "70000.00", isActive: false, compareAtPrice: "150000.00" });
      await patch(first!.id, { compareAtPrice: "100" }).expect(400);
      await patch(first!.id, { price: "200000" }).expect(400); // compareAt 150000 ຕ້ອງ >= price ໃໝ່
      await patch(second!.id, { sku: first!.sku }).expect(409);
      await patch("nope", { price: "1" }).expect(404);
      expect(await db.auditLog.count({ where: { action: "variant.update" } })).toBe(1);
    });
  });

  describe("ຮູບ", () => {
    it("PUT /products/:id/images ແທນທັງລາຍການ ແລະ ຈັດ position; variant ຕ້ອງເປັນຂອງສິນຄ້ານີ້", async () => {
      const p = await create(shirt).expect(201);
      const other = await create({ ...cup, name: "Other", variants: [{ sku: "O-1", price: "1" }] }).expect(201);
      const variantId = p.body.variants[0].id;

      const res = await request(server())
        .put(`/products/${p.body.id}/images`)
        .set(writer)
        .send({ images: [{ url: "https://cdn.test/b.jpg" }, { url: "https://cdn.test/a.jpg", variantId }] })
        .expect(200);
      expect(res.body.images.map((i: { url: string }) => i.url)).toEqual(["https://cdn.test/b.jpg", "https://cdn.test/a.jpg"]);
      expect(res.body.images[1].variantId).toBe(variantId);

      await request(server())
        .put(`/products/${p.body.id}/images`)
        .set(writer)
        .send({ images: [{ url: "https://cdn.test/c.jpg", variantId: other.body.variants[0].id }] })
        .expect(400);
      expect(await db.productImage.count({ where: { productId: p.body.id } })).toBe(2); // pre-check ຄືນ 400 ກ່ອນແຕະຮູບ: ຍັງເປັນຊຸດເກົ່າ

      const cleared = await request(server()).put(`/products/${p.body.id}/images`).set(writer).send({ images: [] }).expect(200);
      expect(cleared.body.images).toEqual([]);
      await request(server()).put(`/products/${p.body.id}/images`).set(writer).send({ images: [{ url: "ftp://x" }] }).expect(400);
    });
  });
});

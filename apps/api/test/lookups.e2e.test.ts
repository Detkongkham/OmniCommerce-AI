import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("lookups: variant search, customers, date filters (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  let none: { Authorization: string };
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    f = await seedCatalog(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
    none = await bearerFor(app, "noinv@test.local");
  });

  describe("GET /variants", () => {
    it("ຄ່າເລີ່ມຕົ້ນ: ສະເພາະ variant ACTIVE ຂອງສິນຄ້າ ACTIVE; ຍັງບໍ່ມີ StockLevel ກໍຢູ່ (stock = [])", async () => {
      // seedCatalog ສ້າງສິນຄ້າເປັນ ACTIVE ແລ້ວ; ບໍ່ມີ StockLevel
      const res = await request(server()).get("/variants").set(reader).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toEqual({
        id: f.v1.id,
        sku: "SKU-1",
        barcode: null,
        name: null,
        productId: f.product.id,
        productName: "Product",
        productStatus: "ACTIVE",
        imageUrl: null,
        price: "100.00",
        costPrice: "60.00",
        isActive: true,
        availableTotal: 0,
        stock: [],
      });
    });

    it("ມີສະຕ໋ອກຕໍ່ສາງ + availableTotal = onHand - reserved ລວມ; q ຄົ້ນ sku / ຊື່ສິນຄ້າ / ຊື່ variant / barcode", async () => {
      await db.$transaction(async (tx) => {
        await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
        await receive(tx, { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 3 });
      });
      await db.stockLevel.update({
        where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
        data: { reserved: 2 },
      });
      await db.productVariant.update({ where: { id: f.v2.id }, data: { barcode: "885000111", name: "ສີແດງ" } });

      const all = await request(server()).get("/variants?q=sku-1").set(reader).expect(200);
      expect(all.body.items.map((v: { sku: string }) => v.sku)).toEqual(["SKU-1"]);
      expect(all.body.items[0].availableTotal).toBe(6);
      expect(all.body.items[0].stock).toEqual(
        expect.arrayContaining([
          { warehouseId: f.whA.id, onHand: 5, reserved: 2, available: 3 },
          { warehouseId: f.whB.id, onHand: 3, reserved: 0, available: 3 },
        ]),
      );
      for (const q of ["885000", "ແດງ", "PRODUCT"]) {
        const res = await request(server()).get(`/variants?q=${encodeURIComponent(q)}`).set(reader).expect(200);
        expect(res.body.total, q).toBeGreaterThan(0);
      }
      expect((await request(server()).get("/variants?q=nothing-here").set(reader).expect(200)).body.total).toBe(0);
    });

    it("ຊ່ອນ variant ປິດ / ສິນຄ້າ DRAFT / ARCHIVED ເວັ້ນແຕ່ includeInactive=true", async () => {
      await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
      expect((await request(server()).get("/variants").set(reader).expect(200)).body.total).toBe(1);
      expect((await request(server()).get("/variants?includeInactive=true").set(reader).expect(200)).body.total).toBe(2);

      await db.product.update({ where: { id: f.product.id }, data: { status: "DRAFT" } });
      expect((await request(server()).get("/variants").set(reader).expect(200)).body.total).toBe(0);
      const draft = await request(server()).get("/variants?includeInactive=true").set(reader).expect(200);
      expect(draft.body.total).toBe(2);
      expect(draft.body.items[0].productStatus).toBe("DRAFT");
    });

    it("pagination + ຮຽງຕາມ SKU; ພາຣາມິເຕີຜິດ → 400; ບໍ່ມີສິດ → 403/401", async () => {
      const page2 = await request(server()).get("/variants?pageSize=1&page=2").set(writer).expect(200);
      expect(page2.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(page2.body.items[0].sku).toBe("SKU-2");
      await request(server()).get("/variants?includeInactive=maybe").set(reader).expect(400);
      await request(server()).get("/variants?pageSize=101").set(reader).expect(400);
      await request(server()).get("/variants").set(none).expect(403);
      await request(server()).get("/variants").expect(401);
    });

    it("variant ທີ່ບໍ່ເຄີຍມີ StockLevel ຮັບເຂົ້າສະຕ໋ອກຄັ້ງທຳອິດໄດ້ (flow ຂອງ UI)", async () => {
      await db.product.update({ where: { id: f.product.id }, data: { status: "DRAFT" } });
      const found = await request(server()).get("/variants?includeInactive=true&q=SKU-2").set(writer).expect(200);
      expect(found.body.items[0].stock).toEqual([]);
      await request(server())
        .post("/stock/receive")
        .set(writer)
        .send({ variantId: found.body.items[0].id, warehouseId: f.whA.id, quantity: 4 })
        .expect(201);
      const after = await request(server()).get("/variants?includeInactive=true&q=SKU-2").set(writer).expect(200);
      expect(after.body.items[0].availableTotal).toBe(4);
    });
  });

  describe("GET /customers", () => {
    beforeEach(async () => {
      await db.customer.createMany({
        data: [
          { name: "ນາງ ມາລີ", phone: "02055550001", email: "mali@example.com" },
          { name: "ທ້າວ ສົມຊາຍ", phone: "02055550002", email: null },
          { name: "Anna", phone: null, email: "anna@example.com" },
        ],
      });
    });

    it("ຮຽງຕາມຊື່; q ຄົ້ນຊື່ / ໂທ / email (ບໍ່ສົນຕົວພິມ); pagination", async () => {
      const all = await request(server()).get("/customers").set(reader).expect(200);
      expect(all.body.total).toBe(3);
      expect(all.body.items[0]).toEqual({ id: expect.any(String), name: "Anna", phone: null, email: "anna@example.com" });
      const names = async (q: string) =>
        (await request(server()).get(`/customers?q=${encodeURIComponent(q)}`).set(reader).expect(200)).body.items.map(
          (c: { name: string }) => c.name,
        );
      expect(await names("ມາລີ")).toEqual(["ນາງ ມາລີ"]);
      expect(await names("0205555000")).toHaveLength(2);
      expect(await names("ANNA@EXAMPLE")).toEqual(["Anna"]);
      expect(await names("zzz")).toEqual([]);
      const paged = await request(server()).get("/customers?pageSize=2&page=2").set(reader).expect(200);
      expect(paged.body.items).toHaveLength(1);
    });

    it("ຕ້ອງມີ orders:read", async () => {
      await request(server()).get("/customers").expect(401);
      await request(server()).get("/customers").set(none).expect(403);
    });
  });

  describe("filter ວັນທີ (ເວລາຮ້ານ UTC+7)", () => {
    // 2026-10-05 ເວລາລາວ = [2026-10-04T17:00Z, 2026-10-05T17:00Z)
    const at = (iso: string) => new Date(iso);
    async function orderAt(createdAt: Date, n: number) {
      return db.order.create({
        data: {
          orderNumber: `SO-9${n}`,
          channel: "OFFLINE",
          source: "MANUAL",
          currency: "LAK",
          exchangeRate: 1,
          createdAt,
          subtotal: "0",
          discountTotal: "0",
          shippingFee: "0",
          vatRate: "0",
          vatAmount: "0",
          total: "0",
        },
      });
    }
    const numbers = async (qs: string) =>
      (await request(server()).get(`/orders${qs}`).set(reader).expect(200)).body.items
        .map((o: { orderNumber: string }) => o.orderNumber)
        .sort();

    it("to=ວັນທີລ້ວນ ຮວມມື້ສຸດທ້າຍທັງມື້ (ຮອດ 23:59 ເວລາລາວ) ແລະ ບໍ່ຮວມມື້ຖັດໄປ", async () => {
      await orderAt(at("2026-10-04T16:59:59Z"), 1); // 4 ຕຸລາ 23:59:59 ລາວ
      await orderAt(at("2026-10-04T17:00:00Z"), 2); // 5 ຕຸລາ 00:00 ລາວ
      await orderAt(at("2026-10-05T16:59:59Z"), 3); // 5 ຕຸລາ 23:59:59 ລາວ
      await orderAt(at("2026-10-05T17:00:00Z"), 4); // 6 ຕຸລາ 00:00 ລາວ

      expect(await numbers("?from=2026-10-05&to=2026-10-05")).toEqual(["SO-92", "SO-93"]);
      expect(await numbers("?to=2026-10-05")).toEqual(["SO-91", "SO-92", "SO-93"]);
      expect(await numbers("?from=2026-10-05")).toEqual(["SO-92", "SO-93", "SO-94"]);
      expect(await numbers("?from=2026-10-04&to=2026-10-06")).toEqual(["SO-91", "SO-92", "SO-93", "SO-94"]);
    });

    it("ສົ່ງເວລາເຕັມມາ ໃຊ້ຕາມນັ້ນ (to ເປັນ exclusive); ວັນທີທີ່ບໍ່ມີຢູ່ຈິງ → 400", async () => {
      await orderAt(at("2026-10-05T10:00:00Z"), 5);
      expect(await numbers("?to=2026-10-05T10:00:00Z")).toEqual([]);
      expect(await numbers("?to=2026-10-05T10:00:01Z")).toEqual(["SO-95"]);
      const bad = await request(server()).get("/orders?to=2026-02-30").set(reader).expect(400);
      expect(bad.body.code).toBe("VALIDATION_FAILED");
    });

    it("movements ໃຊ້ກົດດຽວກັນ", async () => {
      await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }));
      await db.stockMovement.updateMany({ data: { createdAt: at("2026-10-05T16:30:00Z") } }); // 5 ຕຸລາ 23:30 ລາວ
      const inclusive = await request(server()).get("/stock/movements?to=2026-10-05").set(reader).expect(200);
      expect(inclusive.body.total).toBe(1);
      const next = await request(server()).get("/stock/movements?from=2026-10-06").set(reader).expect(200);
      expect(next.body.total).toBe(0);
    });
  });

  describe("vatRate ເປັນ string ທຸກບ່ອນ", () => {
    it("settings ຄືນ \"7.00\" ແລະ ຮັບ string; ບິນໃໝ່ໃຊ້ອັດຕານັ້ນ", async () => {
      const set = await request(server()).patch("/settings/store").set(writer).send({ vatRate: "7" }).expect(200);
      expect(set.body.vatRate).toBe("7.00");
      expect(typeof (await request(server()).get("/settings/store").set(reader)).body.vatRate).toBe("string");
      await request(server()).patch("/settings/store").set(writer).send({ vatRate: 7 }).expect(400);
      await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 3 }));
      const order = await request(server())
        .post("/orders")
        .set(writer)
        .send({ items: [{ variantId: f.v1.id, quantity: 1 }] })
        .expect(201);
      expect(order.body.vatRate).toBe("7.00");
    });
  });
});

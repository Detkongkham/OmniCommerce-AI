import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("orders (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let users: Awaited<ReturnType<typeof seedInventoryUsers>>;
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const server = () => app.getHttpServer();
  const createOrder = (body: object, headers = writer) => request(server()).post("/orders").set(headers).send(body);
  const act = (id: string, action: string, body: object = {}) =>
    request(server()).post(`/orders/${id}/${action}`).set(writer).send(body);

  async function level(variantId = f.v1.id, warehouseId = f.whA.id) {
    const row = await db.stockLevel.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } });
    return { onHand: row.onHand, reserved: row.reserved };
  }

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    users = await seedInventoryUsers(db);
    f = await seedCatalog(db);
    await db.product.update({ where: { id: f.product.id }, data: { status: "ACTIVE" } });
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 10 });
    });
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  describe("ສ້າງບິນ", () => {
    it("ຄຳນວນເງິນ, snapshot, ຈອງສະຕ໋ອກສາງ default, ເລກບິນ, reservedUntil ຕາມ setting, movement + audit", async () => {
      const before = Date.now();
      const res = await createOrder({
        items: [{ variantId: f.v1.id, quantity: 2, discount: "10.00" }],
        shippingFee: "5.00",
        customer: { name: "ນາງ ກ", phone: "02055551111" },
        shippingAddress: "Vientiane",
      }).expect(201);

      expect(res.body).toMatchObject({
        orderNumber: "SO-000001",
        status: "PENDING_PAYMENT",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "190.00",
        discountTotal: "10.00",
        shippingFee: "5.00",
        vatRate: "10.00",
        vatAmount: "17.73",
        total: "195.00",
        shippingAddress: "Vientiane",
        customer: { name: "ນາງ ກ", phone: "02055551111" },
      });
      expect(res.body.items).toEqual([
        expect.objectContaining({
          variantId: f.v1.id,
          warehouseId: f.whA.id,
          productName: "Product",
          sku: "SKU-1",
          unitPrice: "100.00",
          unitCost: "60.00",
          quantity: 2,
          discount: "10.00",
          lineTotal: "190.00",
        }),
      ]);

      const reservedUntil = new Date(res.body.reservedUntil).getTime();
      expect(reservedUntil).toBeGreaterThanOrEqual(before + 30 * 60_000 - 5_000);
      expect(reservedUntil).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 5_000);

      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
      const movement = await db.stockMovement.findFirstOrThrow({ where: { type: "RESERVE" } });
      expect(movement).toMatchObject({ orderId: res.body.id, quantity: 2, actorId: users.writer.id });
      expect(await db.auditLog.count({ where: { action: "order.create", entityId: res.body.id } })).toBe(1);

      const second = await createOrder({ items: [{ variantId: f.v2.id, quantity: 1 }] }).expect(201);
      expect(second.body.orderNumber).toBe("SO-000002");
    });

    it("reservationMinutes ຂອງບິນ override setting; ແກ້ setting ແລ້ວມີຜົນກັບບິນຕໍ່ໄປ", async () => {
      const custom = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }], reservationMinutes: 45 }).expect(201);
      expect(new Date(custom.body.reservedUntil).getTime()).toBeGreaterThan(Date.now() + 44 * 60_000);

      await db.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, name: "S", reservationMinutes: 5 }, update: { reservationMinutes: 5 } });
      const fromSetting = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      expect(new Date(fromSetting.body.reservedUntil).getTime()).toBeLessThan(Date.now() + 6 * 60_000);
    });

    it("ລະບຸ warehouseId ເອງໄດ້ (ຈອງຈາກສາງ B)", async () => {
      await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 4 }));
      const res = await createOrder({ items: [{ variantId: f.v1.id, warehouseId: f.whB.id, quantity: 3 }] }).expect(201);
      expect(res.body.items[0].warehouseId).toBe(f.whB.id);
      expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 4, reserved: 3 });
      expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 10, reserved: 0 });
    });

    it("ສະຕ໋ອກບໍ່ພໍ → 409 ພ້ອມ shortages (ທຸກລາຍການ) ແລະ ບໍ່ມີ Order/ສະຕ໋ອກຄ້າງ", async () => {
      const res = await createOrder({
        items: [
          { variantId: f.v1.id, quantity: 2 },
          { variantId: f.v2.id, quantity: 11 },
        ],
      }).expect(409);
      expect(res.body.shortages).toEqual([
        { variantId: f.v2.id, warehouseId: f.whA.id, sku: "SKU-2", requested: 11, available: 10 },
      ]);
      expect(await db.order.count()).toBe(0);
      expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(0);
      expect(await level(f.v1.id)).toEqual({ onHand: 10, reserved: 0 });
    });

    it("variant ບໍ່ active / ສິນຄ້າບໍ່ ACTIVE → 409; variant ບໍ່ມີ → 404", async () => {
      await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
      await createOrder({ items: [{ variantId: f.v2.id, quantity: 1 }] }).expect(409);
      await createOrder({ items: [{ variantId: "nope", quantity: 1 }] }).expect(404);
      await db.product.update({ where: { id: f.product.id }, data: { status: "DRAFT" } });
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(409);
      expect(await db.order.count()).toBe(0);
    });

    it("ບໍ່ມີສາງ default → 409; ສາງທີ່ລະບຸບໍ່ມີ → 400; ສາງປິດ → 409", async () => {
      await db.warehouse.update({ where: { id: f.whB.id }, data: { isActive: false } });
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 }] }).expect(409);
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: "nope", quantity: 1 }] }).expect(400);
      await db.warehouse.update({ where: { id: f.whA.id }, data: { isDefault: false } });
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(409);
    });

    it("ລູກຄ້າ: upsert ຕາມ phone (ບໍ່ຂຽນທັບຊື່), customerId ທີ່ບໍ່ມີ → 400", async () => {
      const item = { variantId: f.v1.id, quantity: 1 };
      const a = await createOrder({ items: [item], customer: { name: "ຊື່ເດີມ", phone: "020999" + "111" } }).expect(201);
      const b = await createOrder({ items: [item], customer: { name: "ຊື່ໃໝ່", phone: "020999111" } }).expect(201);
      expect(b.body.customer.id).toBe(a.body.customer.id);
      expect(b.body.customer.name).toBe("ຊື່ເດີມ");
      expect(await db.customer.count()).toBe(1);

      const withId = await createOrder({ items: [item], customerId: a.body.customer.id }).expect(201);
      expect(withId.body.customer.id).toBe(a.body.customer.id);
      await createOrder({ items: [item], customerId: "nope" }).expect(400);
    });

    it("ສ່ວນຫຼຸດເກີນລາຄາ → 400; body ຜິດ (items ຫວ່າງ, ລາຍການຊ້ຳ) → 400", async () => {
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1, discount: "100.01" }] }).expect(400);
      await createOrder({ items: [] }).expect(400);
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v1.id, quantity: 1 }] }).expect(400);
      // ລາຍການຊ້ຳທີ່ເກີດຫຼັງ resolve ສາງ default (ໜຶ່ງໃສ່ whA ຊັດເຈນ, ອີກອັນໃຊ້ default = whA)
      await createOrder({
        items: [
          { variantId: f.v1.id, quantity: 1 },
          { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 },
        ],
      }).expect(400);
    });

    it("ສິດ: ບໍ່ login 401, read-only 403", async () => {
      await request(server()).post("/orders").send({}).expect(401);
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }, reader).expect(403);
    });

    it("ສ້າງພ້ອມກັນ 10 ບິນໃສ່ສະຕ໋ອກ 3 ຊິ້ນ → ສຳເລັດ 3, ທີ່ເຫຼືອ 409, reserved = 3, ເລກບິນບໍ່ຊ້ຳ", async () => {
      await db.stockLevel.update({
        where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
        data: { onHand: 3 },
      });
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] })),
      );
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
      expect(await level()).toEqual({ onHand: 3, reserved: 3 });
      const numbers = (await db.order.findMany({ select: { orderNumber: true } })).map((o) => o.orderNumber);
      expect(new Set(numbers).size).toBe(3);
    });
  });

  describe("ອ່ານ ແລະ ລາຍການ", () => {
    it("GET /orders/:id: ມີ movements ແລະ secondsUntilExpiry; ບໍ່ມີ id → 404", async () => {
      const created = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      const res = await request(server()).get(`/orders/${created.body.id}`).set(reader).expect(200);
      expect(res.body.movements).toEqual([
        expect.objectContaining({ type: "RESERVE", quantity: 1, warehouseCode: "A" }),
      ]);
      expect(res.body.secondsUntilExpiry).toBeGreaterThan(29 * 60);
      expect(res.body.secondsUntilExpiry).toBeLessThanOrEqual(30 * 60);
      await request(server()).get("/orders/nope").set(reader).expect(404);
    });

    // TODO(Task 3): ເອົາ .skip ອອກເມື່ອມີ route cancel
    it.skip("GET /orders: filter status / q (ເລກບິນ, ຊື່, ໂທ) / pagination", async () => {
      const item = { variantId: f.v1.id, quantity: 1 };
      const a = await createOrder({ items: [item], customer: { name: "Somchai", phone: "020111222" } }).expect(201);
      await createOrder({ items: [item] }).expect(201);
      await act(a.body.id, "cancel").expect(200);

      const get = async (qs: string) => (await request(server()).get(`/orders${qs}`).set(reader).expect(200)).body;
      expect((await get("")).total).toBe(2);
      expect((await get("?status=CANCELLED")).items.map((o: { id: string }) => o.id)).toEqual([a.body.id]);
      expect((await get("?q=so-000002")).total).toBe(1);
      expect((await get("?q=somch")).total).toBe(1);
      expect((await get("?q=020111")).total).toBe(1);
      const paged = await get("?pageSize=1&page=2");
      expect(paged.items).toHaveLength(1);
      expect(paged.items[0]).toMatchObject({ itemCount: 1, total: "100.00" });
      await request(server()).get("/orders?status=NOPE").set(reader).expect(400);
    });
  });
});

import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, expireOrder, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

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

    it("ບໍ່ມີສາງ default → 409; ສາງທີ່ລະບຸບໍ່ມີ → 404; ສາງປິດ → 409", async () => {
      await db.warehouse.update({ where: { id: f.whB.id }, data: { isActive: false } });
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 }] }).expect(409);
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: "nope", quantity: 1 }] }).expect(404);
      await db.warehouse.update({ where: { id: f.whA.id }, data: { isDefault: false } });
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(409);
    });

    it("ລູກຄ້າ: upsert ຕາມ phone (ບໍ່ຂຽນທັບຊື່), customerId ທີ່ບໍ່ມີ → 404", async () => {
      const item = { variantId: f.v1.id, quantity: 1 };
      const a = await createOrder({ items: [item], customer: { name: "ຊື່ເດີມ", phone: "020999" + "111" } }).expect(201);
      const b = await createOrder({ items: [item], customer: { name: "ຊື່ໃໝ່", phone: "020999111" } }).expect(201);
      expect(b.body.customer.id).toBe(a.body.customer.id);
      expect(b.body.customer.name).toBe("ຊື່ເດີມ");
      expect(await db.customer.count()).toBe(1);

      const withId = await createOrder({ items: [item], customerId: a.body.customer.id }).expect(201);
      expect(withId.body.customer.id).toBe(a.body.customer.id);
      const noCustomer = await createOrder({ items: [item], customerId: "nope" }).expect(404);
      expect(noCustomer.body.code).toBe("CUSTOMER_NOT_FOUND");
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
        expect.objectContaining({ type: "RESERVE", quantity: 1, warehouseCode: "A", variantId: f.v1.id, sku: "SKU-1" }),
      ]);
      expect(res.body.secondsUntilExpiry).toBeGreaterThan(29 * 60);
      expect(res.body.secondsUntilExpiry).toBeLessThanOrEqual(30 * 60);
      await request(server()).get("/orders/nope").set(reader).expect(404);

      // ບິນຫຼາຍລາຍການ: movement ແຕ່ລະອັນບອກ variant/sku ຂອງລາຍການຕົນ
      const multi = await createOrder({
        items: [
          { variantId: f.v1.id, quantity: 1 },
          { variantId: f.v2.id, quantity: 2 },
        ],
      }).expect(201);
      const detail = await request(server()).get(`/orders/${multi.body.id}`).set(reader).expect(200);
      expect(detail.body.movements).toHaveLength(2);
      expect(detail.body.movements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "RESERVE", quantity: 1, variantId: f.v1.id, sku: "SKU-1" }),
          expect.objectContaining({ type: "RESERVE", quantity: 2, variantId: f.v2.id, sku: "SKU-2" }),
        ]),
      );
    });

    it("GET /orders: filter status / q (ເລກບິນ, ຊື່, ໂທ) / pagination", async () => {
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

  describe("ວົງຈອນບິນ", () => {
    const newOrder = async (quantity = 2) =>
      (await createOrder({ items: [{ variantId: f.v1.id, quantity }] }).expect(201)).body as { id: string };
    const statusOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;

    it("pay → pack → ship → complete: ສະຖານະ, timestamp, ສະຕ໋ອກ (ship ຕັດ onHand ແລະ reserved)", async () => {
      const { id } = await newOrder(2);

      const paid = await act(id, "pay").expect(200);
      expect(paid.body.status).toBe("PAID");
      expect(paid.body.paidAt).not.toBeNull();
      expect(paid.body.secondsUntilExpiry).toBeNull();
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });

      expect((await act(id, "pack").expect(200)).body.status).toBe("PACKING");
      const shipped = await act(id, "ship").expect(200);
      expect(shipped.body.status).toBe("SHIPPED");
      expect(shipped.body.shippedAt).not.toBeNull();
      expect(await level()).toEqual({ onHand: 8, reserved: 0 });

      const done = await act(id, "complete").expect(200);
      expect(done.body.status).toBe("COMPLETED");
      expect(done.body.completedAt).not.toBeNull();

      const types = (await db.stockMovement.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
      expect(types).toEqual(["RESERVE", "SHIP"]);
      for (const action of ["pay", "pack", "ship", "complete"]) {
        expect(await db.auditLog.count({ where: { action: `order.${action}`, entityId: id } })).toBe(1);
      }
      await expectLedgerMatches(db);
    });

    it("ຂ້າມຂັ້ນ/ຍ້ອນຫຼັງ → 409 ແລະ ບໍ່ປ່ຽນຫຍັງ; ບໍ່ມີບິນ → 404", async () => {
      const { id } = await newOrder();
      await act(id, "pack").expect(409);
      await act(id, "ship").expect(409);
      await act(id, "complete").expect(409);
      expect(await statusOf(id)).toBe("PENDING_PAYMENT");

      await act(id, "pay").expect(200);
      await act(id, "pay").expect(409);
      await act("nope", "pay").expect(404);
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
    });

    it("pay ຫຼັງ reservedUntil → 409 (ໝົດເວລາແລ້ວ) ແລະ ຍັງ PENDING_PAYMENT", async () => {
      const { id } = await newOrder();
      await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      const res = await act(id, "pay").expect(409);
      expect(res.body.message).toMatch(/expired/i);
      expect(await statusOf(id)).toBe("PENDING_PAYMENT");
    });

    it("reservedUntil = null ບໍ່ເຮັດໃຫ້ບິນຈ່າຍບໍ່ໄດ້", async () => {
      const { id } = await newOrder();
      await db.order.update({ where: { id }, data: { reservedUntil: null } });
      const res = await act(id, "pay").expect(200);
      expect(res.body.status).toBe("PAID");
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
    });

    it("cancel ຈາກ PENDING_PAYMENT / PAID / PACKING ຄືນສະຕ໋ອກທີ່ຈອງ ແລະ ເກັບເຫດຜົນໃນ note", async () => {
      const a = await newOrder(1);
      const b = await newOrder(2);
      const c = await newOrder(3);
      await act(b.id, "pay").expect(200);
      await act(c.id, "pay").expect(200);
      await act(c.id, "pack").expect(200);
      expect(await level()).toEqual({ onHand: 10, reserved: 6 });

      const res = await act(a.id, "cancel", { reason: "ລູກຄ້າຍົກເລີກ" }).expect(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(res.body.cancelledAt).not.toBeNull();
      expect(res.body.note).toContain("ລູກຄ້າຍົກເລີກ");
      await act(b.id, "cancel").expect(200);
      await act(c.id, "cancel").expect(200);

      expect(await level()).toEqual({ onHand: 10, reserved: 0 });
      expect(await db.stockMovement.count({ where: { type: "RELEASE" } })).toBe(3);
      expect(await db.auditLog.count({ where: { action: "order.cancel" } })).toBe(3);
      await expectLedgerMatches(db);
    });

    it("cancel ຊ້ຳ, ຫຼັງ SHIPPED, COMPLETED, ຫຼື EXPIRED → 409 ແລະ ບໍ່ຄືນສະຕ໋ອກຊ້ຳ", async () => {
      const { id } = await newOrder(2);
      await act(id, "cancel").expect(200);
      await act(id, "cancel").expect(409);
      expect(await level()).toEqual({ onHand: 10, reserved: 0 });

      const shipped = await newOrder(1);
      await act(shipped.id, "pay").expect(200);
      await act(shipped.id, "pack").expect(200);
      await act(shipped.id, "ship").expect(200);
      await act(shipped.id, "cancel").expect(409);
      await act(shipped.id, "complete").expect(200);
      await act(shipped.id, "cancel").expect(409);

      const expired = await newOrder(1);
      await db.order.update({ where: { id: expired.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      expect(await expireOrder(db, expired.id)).toBe(true);
      await act(expired.id, "cancel").expect(409);
      expect(await level()).toEqual({ onHand: 9, reserved: 0 });
      await expectLedgerMatches(db);
    });

    it("cancel ແຂ່ງກັບ expire ພ້ອມກັນ (30 ຮອບ): ຜູ້ຊະນະຄົນດຽວ, ຄືນສະຕ໋ອກຄັ້ງດຽວ, reserved ບໍ່ຕິດລົບ", async () => {
      for (let i = 0; i < 30; i += 1) {
        const { id } = await newOrder(1);
        await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() - 1000) } });

        // ໜ່ວງ expire 0-4ms (cancel ຜ່ານ HTTP ຊ້າກວ່າ) ເພື່ອໃຫ້ທັງສອງຝ່າຍໄດ້ຊະນະບາງຮອບ; assertion ບໍ່ຂຶ້ນກັບຜູ້ຊະນະ
        const expireLater = async () => {
          await new Promise((resolve) => setTimeout(resolve, i % 5));
          return expireOrder(db, id);
        };
        const [cancelRes, expired] = await Promise.all([act(id, "cancel"), expireLater()]);

        const finalStatus = await statusOf(id);
        expect(["CANCELLED", "EXPIRED"]).toContain(finalStatus);
        expect(cancelRes.status === 200 ? 1 : 0).toBe(finalStatus === "CANCELLED" ? 1 : 0);
        expect(expired).toBe(finalStatus === "EXPIRED");
        expect(await db.stockMovement.count({ where: { orderId: id, type: "RELEASE" } })).toBe(1);
        expect(await level()).toEqual({ onHand: 10, reserved: 0 });
      }
      await expectLedgerMatches(db);
    });

    it("pay ແຂ່ງກັບ expire (30 ຮອບ): ຖ້າ pay ຊະນະ ສະຕ໋ອກຍັງຈອງ; ຖ້າ expire ຊະນະ ສະຕ໋ອກຄືນ", async () => {
      for (let i = 0; i < 30; i += 1) {
        const { id } = await newOrder(1);
        // ໃຫ້ guard ຂອງທັງສອງຝ່າຍຜ່ານແນ່ນອນເມື່ອແລ່ນດ່ຽວ: pay (ໂມງຈິງ) ເຫັນ reservedUntil > now,
        // expire ໄດ້ `now` ທີ່ເລີຍ reservedUntil ແລ້ວ (ຄື worker ທີ່ໂມງເດີນໄປແລ້ວ). ຜູ້ຕັດສິນຈຶ່ງເປັນ row lock ເທົ່ານັ້ນ
        // (ບໍ່ມີກໍລະນີ "ບໍ່ມີໃຜຊະນະ" ຈາກເວລາ ms ທີ່ຄາດເດົາບໍ່ໄດ້). ໜ່ວງ expire 0-4ms ເພື່ອໃຫ້ທັງສອງຝ່າຍໄດ້ຊະນະບາງຮອບ.
        const reservedUntil = new Date(Date.now() + 60_000);
        await db.order.update({ where: { id }, data: { reservedUntil } });
        const expireLater = async () => {
          await new Promise((resolve) => setTimeout(resolve, i % 5));
          return expireOrder(db, id, new Date(reservedUntil.getTime() + 1));
        };

        const [payRes, expired] = await Promise.all([act(id, "pay"), expireLater()]);

        const finalStatus = await statusOf(id);
        expect(["PAID", "EXPIRED"]).toContain(finalStatus);
        expect(payRes.status).toBe(finalStatus === "PAID" ? 200 : 409);
        expect(expired).toBe(finalStatus === "EXPIRED");
        expect(await level()).toEqual({ onHand: 10, reserved: finalStatus === "PAID" ? 1 : 0 });
        expect(await db.stockMovement.count({ where: { orderId: id, type: "RELEASE" } })).toBe(
          finalStatus === "EXPIRED" ? 1 : 0,
        );
        // ລ້າງສຳລັບຮອບຕໍ່ໄປຜ່ານ API (ຄືນສະຕ໋ອກດ້ວຍເຄື່ອງຈັກ ບໍ່ຂຽນ reserved ກົງ) ເພື່ອໃຫ້ ledger ຖືກຕ້ອງຂ້າມຮອບ
        if (finalStatus === "PAID") await act(id, "cancel").expect(200);
        expect(await level()).toEqual({ onHand: 10, reserved: 0 });
      }
      await expectLedgerMatches(db);
    });

    it("ສິດ: read-only ປ່ຽນສະຖານະບໍ່ໄດ້ 403", async () => {
      const { id } = await newOrder();
      for (const action of ["pay", "pack", "ship", "complete", "cancel"]) {
        await request(server()).post(`/orders/${id}/${action}`).set(reader).send({}).expect(403);
      }
    });
  });

  describe("Idempotency-Key", () => {
    const body = () => ({ items: [{ variantId: f.v1.id, quantity: 2 }] });
    const withKey = (key: string, payload: object = body()) =>
      request(server()).post("/orders").set(writer).set("Idempotency-Key", key).send(payload);

    it("key ຊ້ຳ + payload ຄືເກົ່າ = ຄືນບິນເດີມ, ບໍ່ຈອງສະຕ໋ອກ/ບໍ່ສ້າງບິນ/ບໍ່ audit ຊ້ຳ", async () => {
      const first = await withKey("key-1").expect(201);
      const second = await withKey("key-1").expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.orderNumber).toBe(first.body.orderNumber);
      expect(await db.order.count()).toBe(1);
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
      expect(await db.auditLog.count({ where: { action: "order.create" } })).toBe(1);
      await expectLedgerMatches(db);
    });

    it("key ຊ້ຳ ແຕ່ payload ຕ່າງ = 409 ແລະ ບໍ່ສ້າງບິນໃໝ່", async () => {
      await withKey("key-2").expect(201);
      const res = await withKey("key-2", { items: [{ variantId: f.v1.id, quantity: 3 }] }).expect(409);
      expect(res.body.code).toBe("CONFLICT");
      expect(await db.order.count()).toBe(1);
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
    });

    it("ພ້ອມກັນດ້ວຍ key ດຽວ: ໄດ້ບິນດຽວ ແລະ ຈອງສະຕ໋ອກຄັ້ງດຽວ", async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => withKey("key-race")));
      for (const res of results) expect(res.status).toBe(201);
      expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
      expect(await db.order.count()).toBe(1);
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
      await expectLedgerMatches(db);
    });

    it("key ຕ່າງກັນ = ບິນແຍກກັນ; ບໍ່ສົ່ງ key = ສ້າງທຸກຄັ້ງຄືເກົ່າ", async () => {
      const a = await withKey("key-a").expect(201);
      const b = await withKey("key-b").expect(201);
      const c = await createOrder(body()).expect(201);
      const d = await createOrder(body()).expect(201);
      expect(new Set([a.body.id, b.body.id, c.body.id, d.body.id]).size).toBe(4);
    });

    it("ຄຳຕອບສະຕ໋ອກບໍ່ພໍບໍ່ຖືກຈື່: ຫຼັງເຕີມສະຕ໋ອກ ໃຊ້ key ເດີມລອງໃໝ່ໄດ້", async () => {
      const big = { items: [{ variantId: f.v1.id, quantity: 15 }] };
      await withKey("key-retry", big).expect(409);
      expect(await db.order.count()).toBe(0);

      await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 }));
      const retried = await withKey("key-retry", big).expect(201);
      expect(retried.body.status).toBe("PENDING_PAYMENT");
      expect(await level()).toEqual({ onHand: 20, reserved: 15 });
    });

    it("key ຮູບແບບຜິດ = 400", async () => {
      await withKey("has space").expect(400);
      await withKey("x".repeat(129)).expect(400);
    });
  });
});

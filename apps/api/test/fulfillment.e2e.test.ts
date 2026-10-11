import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../src/common/auth-types";
import { OrdersService } from "../src/modules/orders/orders.service";
import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedRoleUsers } from "./helpers";

describe("fulfillment (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let owner: { Authorization: string };
  let wh: { Authorization: string };
  let courierId: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    f = await seedCatalog(db);
    await db.productVariant.update({ where: { id: f.v1.id }, data: { barcode: "8850001" } });
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 10 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whB.id, quantity: 10 });
    });
    owner = await bearerFor(app, "owner@role.test");
    wh = await bearerFor(app, "warehouse@role.test");
    courierId = (await db.courier.create({ data: { code: "AN", name: "Anousith", trackingUrlTemplate: "https://an.la/t/{tracking}" } })).id;
  });

  /** ບິນ v1 x2 + v2 x1 ທີ່ຈ່າຍແລ້ວ */
  async function paidOrder(overrides: object = {}) {
    const created = await request(server())
      .post("/orders")
      .set(owner)
      .send({
        customer: { name: "Noy", phone: "02055551234" },
        items: [
          { variantId: f.v1.id, quantity: 2 },
          { variantId: f.v2.id, quantity: 1 },
        ],
        shippingName: "Noy",
        shippingPhone: "020 5555 1234",
        shippingAddress: "Vientiane",
        ...overrides,
      })
      .expect(201);
    await request(server()).post(`/orders/${created.body.id}/pay`).set(owner).expect(200);
    return created.body as { id: string; orderNumber: string };
  }
  const start = (id: string) => request(server()).post(`/fulfillment/${id}/start`).set(wh);
  const verify = (id: string, scans: object[]) => request(server()).post(`/fulfillment/${id}/verify`).set(wh).send({ scans });
  const ship = (id: string, body: object = { courierId, trackingNumber: "AN123" }) => request(server()).post(`/fulfillment/${id}/ship`).set(wh).send(body);
  const FULL_SCANS = [
    { code: "8850001", quantity: 1 },
    { code: "sku-1", quantity: 1 },
    { code: "SKU-2", quantity: 1 },
  ];

  describe("queue", () => {
    it("ສະເພາະ PAID/PACKING ລຽງ paidAt ເກົ່າ→ໃໝ່; ກອງສະຖານະ/ສາງ; ຄົ້ນເລກບິນ/ຊື່/ເບີ", async () => {
      const first = await paidOrder();
      const second = await paidOrder({ customer: { name: "Kham", phone: "02077770000" }, shippingName: "Kham", shippingPhone: "02077770000", items: [{ variantId: f.v2.id, quantity: 1, warehouseId: f.whB.id }] });
      await request(server()).post("/orders").set(owner).send({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201); // ຍັງບໍ່ຈ່າຍ
      await start(second.id).expect(200);

      const all = await request(server()).get("/fulfillment").set(wh).expect(200);
      expect(all.body.items.map((row: { id: string }) => row.id)).toEqual([first.id, second.id]);
      expect(all.body.items[0]).toMatchObject({ orderNumber: first.orderNumber, status: "PAID", itemCount: 3, hasShippingInfo: true, verified: false, customer: { name: "Noy" } });

      const packing = await request(server()).get("/fulfillment?status=PACKING").set(wh).expect(200);
      expect(packing.body.items.map((row: { id: string }) => row.id)).toEqual([second.id]);
      const inB = await request(server()).get(`/fulfillment?warehouseId=${f.whB.id}`).set(wh).expect(200);
      expect(inB.body.items.map((row: { id: string }) => row.id)).toEqual([second.id]);
      for (const q of [first.orderNumber, "noy", "5555"]) {
        const found = await request(server()).get(`/fulfillment?q=${encodeURIComponent(q)}`).set(wh).expect(200);
        expect(found.body.items.map((row: { id: string }) => row.id)).toEqual([first.id]);
      }
    });
  });

  describe("detail / start / verify / override / shipping", () => {
    it("detail: ລາຍການ + sku/barcode/ສາງ, ຜູ້ຮັບ, ຊື່ຮ້ານ; shipment = null ກ່ອນເລີ່ມ; ບໍ່ພົບ → 404", async () => {
      const order = await paidOrder();
      const res = await request(server()).get(`/fulfillment/${order.id}`).set(wh).expect(200);
      expect(res.body).toMatchObject({ id: order.id, orderNumber: order.orderNumber, status: "PAID", shippingName: "Noy", shipment: null, notifyText: null });
      expect(res.body.storeName).toEqual(expect.any(String));
      expect(res.body.items).toEqual([
        expect.objectContaining({ variantId: f.v1.id, sku: "SKU-1", barcode: "8850001", quantity: 2, warehouseCode: "A" }),
        expect.objectContaining({ variantId: f.v2.id, sku: "SKU-2", barcode: null, quantity: 1 }),
      ]);
      expect((await request(server()).get("/fulfillment/nope").set(wh).expect(404)).body.code).toBe("ORDER_NOT_FOUND");
    });

    it("start: PAID → PACKING + shipment (packedBy); ເອີ້ນຊ້ຳ = idempotent; ບໍ່ແມ່ນ PAID/PACKING → 409", async () => {
      const order = await paidOrder();
      const res = await start(order.id).expect(200);
      expect(res.body.status).toBe("PACKING");
      expect(res.body.shipment).toMatchObject({ packedBy: { name: "WAREHOUSE" }, verifiedAt: null, notifyStatus: "NONE" });
      expect((await start(order.id).expect(200)).body.shipment.id).toBe(res.body.shipment.id);
      const unpaid = await request(server()).post("/orders").set(owner).send({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      expect((await start(unpaid.body.id).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("verify: barcode/SKU (ຕົວນ້ອຍໄດ້) ຄົບ → verifiedAt; ຂາດ/ເກີນ/ນອກບິນ → 409 PACK_MISMATCH ພ້ອມລາຍລະອຽດ; ຕ້ອງ PACKING", async () => {
      const order = await paidOrder();
      expect((await verify(order.id, FULL_SCANS).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
      await start(order.id).expect(200);

      const short = await verify(order.id, [{ code: "SKU-1", quantity: 1 }, { code: "SKU-2", quantity: 1 }]).expect(409);
      expect(short.body.code).toBe("PACK_MISMATCH");
      expect(short.body.missing).toEqual([{ sku: "SKU-1", expected: 2, scanned: 1 }]);
      const over = await verify(order.id, [{ code: "SKU-1", quantity: 3 }, { code: "SKU-2", quantity: 1 }]).expect(409);
      expect(over.body.missing).toEqual([{ sku: "SKU-1", expected: 2, scanned: 3 }]);
      const stranger = await verify(order.id, [...FULL_SCANS, { code: "XYZ", quantity: 1 }]).expect(409);
      expect(stranger.body.extra).toEqual(["XYZ"]);
      expect((await db.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).verifiedAt).toBeNull();

      const ok = await verify(order.id, FULL_SCANS).expect(200);
      expect(ok.body.shipment).toMatchObject({ verifiedBy: { name: "WAREHOUSE" }, verifyOverrideReason: null });
      expect(ok.body.shipment.verifiedAt).not.toBeNull();
    });

    it("override: ຕ້ອງມີ orders:write ນຳ (WAREHOUSE ບໍ່ມີ → 403); ບັນທຶກເຫດຜົນ + audit", async () => {
      const order = await paidOrder();
      await start(order.id).expect(200);
      await request(server()).post(`/fulfillment/${order.id}/override`).set(wh).send({ reason: "barcode damaged" }).expect(403);
      const manager = await bearerFor(app, "manager@role.test");
      await request(server()).post(`/fulfillment/${order.id}/override`).set(manager).send({ reason: "x" }).expect(400);
      const res = await request(server()).post(`/fulfillment/${order.id}/override`).set(manager).send({ reason: "barcode damaged" }).expect(200);
      expect(res.body.shipment).toMatchObject({ verifyOverrideReason: "barcode damaged", verifiedBy: { name: "MANAGER" } });
      expect(await db.auditLog.count({ where: { action: "fulfillment.override", entityId: order.id } })).toBe(1);
    });

    it("shipping: ແກ້ໄດ້ຕອນ PAID/PACKING (ວ່າງ = null); ຫຼັງສົ່ງ → 409", async () => {
      const order = await paidOrder();
      const res = await request(server()).patch(`/fulfillment/${order.id}/shipping`).set(wh).send({ shippingAddress: "Pakse", shippingPhone: "" }).expect(200);
      expect(res.body).toMatchObject({ shippingName: "Noy", shippingAddress: "Pakse", shippingPhone: null });
      await request(server()).patch(`/fulfillment/${order.id}/shipping`).set(wh).send({ shippingPhone: "020 1" }).expect(200);
      await start(order.id).expect(200);
      await verify(order.id, FULL_SCANS).expect(200);
      await ship(order.id).expect(200);
      expect((await request(server()).patch(`/fulfillment/${order.id}/shipping`).set(wh).send({ shippingName: "x" }).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });
  });

  describe("ship", () => {
    it("ກວດກ່ອນ: ບໍ່ verify → PACK_NOT_VERIFIED; courier ບໍ່ພົບ/ປິດ; ບໍ່ມີເບີຜູ້ຮັບ → SHIPPING_INFO_REQUIRED", async () => {
      const order = await paidOrder();
      await start(order.id).expect(200);
      expect((await ship(order.id).expect(409)).body.code).toBe("PACK_NOT_VERIFIED");
      await verify(order.id, FULL_SCANS).expect(200);
      expect((await ship(order.id, { courierId: "nope", trackingNumber: "A" }).expect(404)).body.code).toBe("COURIER_NOT_FOUND");
      await db.courier.update({ where: { id: courierId }, data: { isActive: false } });
      expect((await ship(order.id).expect(409)).body.code).toBe("COURIER_INACTIVE");
      await db.courier.update({ where: { id: courierId }, data: { isActive: true } });
      await db.order.update({ where: { id: order.id }, data: { shippingPhone: null } });
      expect((await ship(order.id).expect(409)).body.code).toBe("SHIPPING_INFO_REQUIRED");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PACKING");
    });

    it("ສຳເລັດ: SHIPPED + ຕັດສະຕ໋ອກ + shipment (courier, tracking, ລິ້ງ, shippedBy); order detail ມີ shipment; notifyText", async () => {
      const order = await paidOrder();
      await start(order.id).expect(200);
      await verify(order.id, FULL_SCANS).expect(200);
      const res = await ship(order.id).expect(200);
      expect(res.body.status).toBe("SHIPPED");
      expect(res.body.shipment).toMatchObject({
        courier: { code: "AN", name: "Anousith" },
        trackingNumber: "AN123",
        trackingUrl: "https://an.la/t/AN123",
        shippedBy: { name: "WAREHOUSE" },
      });
      expect(res.body.notifyText).toContain("AN123");
      const level = await db.stockLevel.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } } });
      expect(level).toMatchObject({ onHand: 8, reserved: 0 });
      await expectLedgerMatches(db);
      const detail = await request(server()).get(`/orders/${order.id}`).set(owner).expect(200);
      expect(detail.body.shipment).toMatchObject({ courierName: "Anousith", trackingNumber: "AN123", trackingUrl: "https://an.la/t/AN123" });
      // ສົ່ງຊ້ຳ → 409 (ບໍ່ແມ່ນ PACKING ແລ້ວ)
      expect((await ship(order.id).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("inTx ລົ້ມ → rollback ທັງໝົດ: ສະຖານະຍັງ PACKING, ສະຕ໋ອກບໍ່ຖືກຕັດ, shipment ບໍ່ມີ courier", async () => {
      const order = await paidOrder();
      await start(order.id).expect(200);
      await verify(order.id, FULL_SCANS).expect(200);
      const user = await db.user.findFirstOrThrow({ where: { email: "warehouse@role.test" } });
      const actor = { id: user.id, email: user.email, name: user.name, permissions: [] } as unknown as AuthUser;
      await expect(
        app.get(OrdersService).ship(order.id, actor, undefined, async (tx) => {
          await tx.shipment.update({ where: { orderId: order.id }, data: { courierId, trackingNumber: "X" } });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PACKING");
      expect(await db.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ courierId: null, trackingNumber: null });
      const level = await db.stockLevel.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } } });
      expect(level).toMatchObject({ onHand: 10, reserved: 2 });
    });

    it("ບິນທີ່ບໍ່ໄດ້ຜ່ານໜ້າແພັກ: order detail shipment = null", async () => {
      const order = await paidOrder();
      expect((await request(server()).get(`/orders/${order.id}`).set(owner).expect(200)).body.shipment).toBeNull();
    });
  });

  it("ສິດ: ACCOUNTANT ອ່ານໄດ້ ແຕ່ເລີ່ມແພັກບໍ່ໄດ້; CHAT_ADMIN ບໍ່ມີ logistics → 403", async () => {
    const order = await paidOrder();
    const accountant = await bearerFor(app, "accountant@role.test");
    await request(server()).get(`/fulfillment/${order.id}`).set(accountant).expect(200);
    await request(server()).post(`/fulfillment/${order.id}/start`).set(accountant).expect(403);
    const chat = await bearerFor(app, "chat_admin@role.test");
    await request(server()).get("/fulfillment").set(chat).expect(403);
  });
});

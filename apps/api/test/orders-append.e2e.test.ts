import type { INestApplication } from "@nestjs/common";
import { InsufficientStockError, type PrismaClient, receive } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/modules/orders/orders.service";
import { createTestApp, expectLedgerMatches, resetDb, seedCatalog } from "./helpers";

describe("OrdersService CF helpers", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let orders: OrdersService;
  let f: Awaited<ReturnType<typeof seedCatalog>>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    orders = app.get(OrdersService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 5 });
    });
  });

  const session = () =>
    db.liveSession.create({ data: { title: "L", kind: "LIVE", status: "LIVE", externalPostId: "P1" } });
  const customer = () => db.customer.create({ data: { name: "CF Customer", facebookUserId: "U1" } });

  const createCfOrder = async (sessionId: string, customerId: string, items: { variantId: string; quantity: number }[]) =>
    db.$transaction((tx) =>
      orders.createCfOrderInTx(
        tx,
        { customerId, items: items.map((item) => ({ ...item, discount: "0" })), shippingFee: "0" },
        { channel: "FACEBOOK", source: "LIVE_CF", liveSessionId: sessionId },
      ),
    );

  it("createCfOrderInTx: ບິນ LIVE_CF/FACEBOOK ຜູກ session, ຈອງສະຕ໋ອກ, ຍອດຖືກ", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 2 }]);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order).toMatchObject({ channel: "FACEBOOK", source: "LIVE_CF", liveSessionId: s.id, customerId: c.id, status: "PENDING_PAYMENT" });
    expect(order.total.toFixed(2)).toBe("200.00");
    expect(order.items).toHaveLength(1);
    expect(order.reservedUntil).not.toBeNull();
    const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
    expect(level.reserved).toBe(2);
    await expectLedgerMatches(db);
  });

  it("createCfOrderInTx: ສະຕ໋ອກບໍ່ພໍ → InsufficientStockError ແລະ ບໍ່ມີບິນຄ້າງ", async () => {
    const s = await session();
    const c = await customer();
    await expect(createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 6 }])).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await db.order.count()).toBe(0);
  });

  it("appendItemsInTx: ລວມແຖວເດີມ + ເພີ່ມແຖວໃໝ່, ຄິດຍອດໃໝ່, ຈອງສະເພາະສ່ວນເພີ່ມ, ຕໍ່ເວລາຈອງ", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 2 }]);
    // ເລື່ອນເວລາໝົດໃຫ້ໃກ້ ເພື່ອພິສູດວ່າຖືກຣີເຊັດ
    const soon = new Date(Date.now() + 60_000);
    await db.order.update({ where: { id }, data: { reservedUntil: soon } });

    await db.$transaction((tx) =>
      orders.appendItemsInTx(tx, id, [{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v2.id, quantity: 3 }], null),
    );

    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sku: "asc" } } } });
    expect(order.items.map((item) => [item.sku, item.quantity, item.lineTotal.toFixed(2)])).toEqual([
      ["SKU-1", 3, "300.00"],
      ["SKU-2", 3, "300.00"],
    ]);
    expect(order.subtotal.toFixed(2)).toBe("600.00");
    expect(order.total.toFixed(2)).toBe("600.00");
    expect(order.reservedUntil?.getTime()).toBeGreaterThan(soon.getTime() + 60_000);
    const levels = await db.stockLevel.findMany({ where: { warehouseId: f.whA.id }, orderBy: { variantId: "asc" } });
    expect(levels.map((level) => level.reserved).sort()).toEqual([3, 3]);
    await expectLedgerMatches(db);
  });

  it("appendItemsInTx: ສະຕ໋ອກບໍ່ພໍ → rollback ທັງໝົດ (ບິນເດີມບໍ່ປ່ຽນ)", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 4 }]);
    await expect(
      db.$transaction((tx) => orders.appendItemsInTx(tx, id, [{ variantId: f.v1.id, quantity: 2 }], null)),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order.items.map((item) => item.quantity)).toEqual([4]);
    expect(order.total.toFixed(2)).toBe("400.00");
    await expectLedgerMatches(db);
  });

  it("appendItemsInTx: ບິນທີ່ບໍ່ແມ່ນ PENDING_PAYMENT ຫຼື ໝົດເວລາຈອງ → ORDER_INVALID_STATE; ບິນບໍ່ມີ → ORDER_NOT_FOUND", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 1 }]);
    const append = () => db.$transaction((tx) => orders.appendItemsInTx(tx, id, [{ variantId: f.v2.id, quantity: 1 }], null));
    await db.order.update({ where: { id }, data: { status: "PAID" } });
    await expect(append()).rejects.toMatchObject({ response: { code: "ORDER_INVALID_STATE" } });
    await db.order.update({ where: { id }, data: { status: "PENDING_PAYMENT", reservedUntil: new Date(Date.now() - 1000) } });
    await expect(append()).rejects.toMatchObject({ response: { code: "ORDER_INVALID_STATE" } });
    await expect(
      db.$transaction((tx) => orders.appendItemsInTx(tx, "nope", [{ variantId: f.v2.id, quantity: 1 }], null)),
    ).rejects.toMatchObject({ response: { code: "ORDER_NOT_FOUND" } });
  });

  it("appendItemsInTx: variant ບໍ່ພົບ / ປິດຂາຍ → VARIANT_NOT_FOUND / VARIANT_NOT_AVAILABLE; variant ຊ້ຳໃນ additions ບໍ່ໄດ້", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 1 }]);
    const append = (items: { variantId: string; quantity: number }[]) =>
      db.$transaction((tx) => orders.appendItemsInTx(tx, id, items, null));
    await expect(append([{ variantId: "nope", quantity: 1 }])).rejects.toMatchObject({ response: { code: "VARIANT_NOT_FOUND" } });
    await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
    await expect(append([{ variantId: f.v2.id, quantity: 1 }])).rejects.toMatchObject({ response: { code: "VARIANT_NOT_AVAILABLE" } });
    await expect(
      append([{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v1.id, quantity: 1 }]),
    ).rejects.toMatchObject({ status: 400 });
  });
});

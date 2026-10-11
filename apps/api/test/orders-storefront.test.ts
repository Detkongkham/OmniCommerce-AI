import type { INestApplication } from "@nestjs/common";
import { type Prisma, type PrismaClient, receive } from "@oca/database";
import { createOrderSchema } from "@oca/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService, type WebOrderExtras } from "../src/modules/orders/orders.service";
import { createTestApp, expectLedgerMatches, resetDb, seedCatalog } from "./helpers";

describe("OrdersService.createFromStorefront", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let orders: OrdersService;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let courierId: string;

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
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 }));
    courierId = (await db.courier.create({ data: { code: "ANS", name: "Anousith" } })).id;
  });

  const input = (quantity = 2) =>
    createOrderSchema.parse({
      customer: { name: "ນາງ ກ", phone: "02055555555" },
      items: [{ variantId: f.v1.id, quantity }],
      shippingName: "ນາງ ກ",
      shippingPhone: "02055555555",
      shippingAddress: "ບ້ານ ກ",
    });
  const web = (patch: Partial<WebOrderExtras> = {}): WebOrderExtras => ({
    publicToken: `tok-${Math.random().toString(36).slice(2)}`,
    shippingCourierId: courierId,
    shippingBranch: "ໂພນທັນ",
    expectedTotal: "200.00",
    guard: async () => {},
    ...patch,
  });

  it("ສ້າງບິນ STOREFRONT/WEB_CHECKOUT ໂດຍບໍ່ມີພະນັກງານ, ຈອງສະຕ໋ອກ, audit userId null", async () => {
    const extras = web();
    const id = await orders.createFromStorefront(input(), extras, "1.2.3.4", "k1");
    const row = await db.order.findUniqueOrThrow({ where: { id }, include: { customer: true, items: true } });
    expect(row).toMatchObject({
      channel: "STOREFRONT",
      source: "WEB_CHECKOUT",
      status: "PENDING_PAYMENT",
      createdById: null,
      publicToken: extras.publicToken,
      shippingCourierId: courierId,
      shippingBranch: "ໂພນທັນ",
      idempotencyKey: "sf:k1",
    });
    expect(row.total.toFixed(2)).toBe("200.00");
    expect(row.shippingFee.toFixed(2)).toBe("0.00");
    expect(row.customer?.phone).toBe("02055555555");
    expect(row.reservedUntil?.getTime()).toBeGreaterThan(Date.now());
    const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
    expect(level.reserved).toBe(2);
    const audits = await db.auditLog.findMany({ where: { action: "order.create", entityId: id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: null, ip: "1.2.3.4" });
    await expectLedgerMatches(db);
  });

  it("expectedTotal ຂຽນຕ່າງຮູບແບບ (200 ກັບ 200.00) ຖືວ່າຕົງ", async () => {
    await expect(orders.createFromStorefront(input(), web({ expectedTotal: "200" }), undefined, "k1")).resolves.toEqual(expect.any(String));
  });

  it("key ຊ້ຳ + payload ເດີມ = id ເດີມ (ບິນດຽວ, ຈອງຄັ້ງດຽວ, token ເດີມ)", async () => {
    const first = web();
    const a = await orders.createFromStorefront(input(), first, undefined, "k1");
    const b = await orders.createFromStorefront(input(), web(), undefined, "k1");
    expect(b).toBe(a);
    expect(await db.order.count()).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: a } })).publicToken).toBe(first.publicToken);
    const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
    expect(level.reserved).toBe(2);
  });

  it("key ຊ້ຳ + payload ຕ່າງ = CONFLICT", async () => {
    await orders.createFromStorefront(input(), web(), undefined, "k1");
    await expect(
      orders.createFromStorefront(input(3), web({ expectedTotal: "300.00" }), undefined, "k1"),
    ).rejects.toMatchObject({ response: { code: "CONFLICT" } });
    await expect(
      orders.createFromStorefront(input(), web({ shippingBranch: "ອື່ນ" }), undefined, "k1"),
    ).rejects.toMatchObject({ response: { code: "CONFLICT" } });
  });

  it("key ຂອງເວັບບໍ່ຊົນກັບ key ຂອງ POST /orders ທີ່ຊື່ຄືກັນ", async () => {
    await db.order.create({
      data: { orderNumber: "SO-X", channel: "OFFLINE", source: "MANUAL", currency: "LAK", subtotal: "0", vatRate: "0", vatAmount: "0", total: "0", idempotencyKey: "k1", idempotencyHash: "h" },
    });
    await expect(orders.createFromStorefront(input(), web(), undefined, "k1")).resolves.toEqual(expect.any(String));
  });

  it("expectedTotal ບໍ່ຕົງ = PRICE_CHANGED ພ້ອມຍອດຈິງ; ບໍ່ມີບິນ ແລະ ບໍ່ຈອງສະຕ໋ອກ", async () => {
    await expect(
      orders.createFromStorefront(input(), web({ expectedTotal: "150.00" }), undefined, "k1"),
    ).rejects.toMatchObject({ response: { code: "PRICE_CHANGED", total: "200.00" } });
    expect(await db.order.count()).toBe(0);
    const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
    expect(level.reserved).toBe(0);
    expect(await db.auditLog.count({ where: { action: "order.create" } })).toBe(0);
  });

  it("guard ແລ່ນໃນ transaction ກ່ອນສ້າງບິນ; throw = ບໍ່ມີບິນ ແລະ ບໍ່ສ້າງລູກຄ້າ", async () => {
    let sawOrders = -1;
    const guard = async (tx: Prisma.TransactionClient) => {
      sawOrders = await tx.order.count();
      throw new Error("blocked");
    };
    await expect(orders.createFromStorefront(input(), web({ guard }), undefined, "k1")).rejects.toThrow("blocked");
    expect(sawOrders).toBe(0);
    expect(await db.order.count()).toBe(0);
    expect(await db.customer.count()).toBe(0);
  });
});

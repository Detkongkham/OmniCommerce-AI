import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/modules/orders/orders.service";
import type { AuthUser } from "../src/common/auth-types";
import { createTestApp, resetDb, seedBasics } from "./helpers";

describe("OrdersService.payWithin", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let orders: OrdersService;
  let actor: AuthUser;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    orders = app.get(OrdersService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    const { ownerUser } = await seedBasics(db);
    actor = { id: ownerUser.id } as AuthUser;
  });

  const makeOrder = (patch: object = {}) =>
    db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "10",
        vatRate: "0",
        vatAmount: "0",
        total: "10",
        reservedUntil: new Date(Date.now() + 3_600_000),
        ...patch,
      },
    });

  it("ຕັ້ງ PAID + paidAt ພາຍໃນ transaction ຂອງຜູ້ເອີ້ນ", async () => {
    const order = await makeOrder();
    await db.$transaction((tx) => orders.payWithin(tx, order.id, actor));
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidAt).not.toBeNull();
  });

  it("ຜູ້ເອີ້ນ throw ຫຼັງ payWithin → ກັບຄືນ PENDING_PAYMENT (atomic ກັບ transaction ພາຍນອກ)", async () => {
    const order = await makeOrder();
    await expect(
      db.$transaction(async (tx) => {
        await orders.payWithin(tx, order.id, actor);
        throw new Error("outer failure");
      }),
    ).rejects.toThrow("outer failure");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });

  it.each([["EXPIRED"], ["PAID"], ["CANCELLED"]])("ບິນ %s → ORDER_INVALID_STATE ແລະ ບໍ່ປ່ຽນຫຍັງ", async (status) => {
    const order = await makeOrder({ status });
    await expect(db.$transaction((tx) => orders.payWithin(tx, order.id, actor))).rejects.toMatchObject({
      response: { code: "ORDER_INVALID_STATE" },
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(status);
  });

  it("ໝົດເວລາຈອງ (ຍັງ PENDING_PAYMENT) → RESERVATION_EXPIRED", async () => {
    const order = await makeOrder({ reservedUntil: new Date(Date.now() - 1000) });
    await expect(db.$transaction((tx) => orders.payWithin(tx, order.id, actor))).rejects.toMatchObject({
      response: { code: "RESERVATION_EXPIRED" },
    });
  });

  it("ບໍ່ພົບບິນ → ORDER_NOT_FOUND", async () => {
    await expect(db.$transaction((tx) => orders.payWithin(tx, "nope", actor))).rejects.toMatchObject({
      response: { code: "ORDER_NOT_FOUND" },
    });
  });
});

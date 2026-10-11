import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, expireOrder, receive, reserveMany } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers, seedLiveSession } from "./helpers";

describe("CF claimed units are returned on expire/cancel", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let writer: { Authorization: string };
  let session: Awaited<ReturnType<typeof seedLiveSession>>;
  let seq = 0;
  const act = (id: string, action: string) =>
    request(app.getHttpServer()).post(`/orders/${id}/${action}`).set(writer).send({});
  const claimed = async () => (await db.liveSessionItem.findFirstOrThrow({ where: { code: "A1" } })).claimed;
  const itemId = () => session.items.find((item) => item.code === "A1")?.id as string;

  /** CF order with one comment per entry in `quantities`; claimed is set to the sum (+ extra). */
  async function cfOrder(quantities: number[], options: { reservedUntil?: Date; extraClaimed?: number } = {}) {
    seq += 1;
    const total = quantities.reduce((a, b) => a + b, 0);
    const order = await db.order.create({
      data: {
        orderNumber: `SO-CF${seq}`,
        channel: "FACEBOOK",
        source: "LIVE_CF",
        liveSessionId: session.id,
        status: "PENDING_PAYMENT",
        currency: "LAK",
        subtotal: "100.00",
        vatRate: "10",
        vatAmount: "9.09",
        total: "100.00",
        reservedUntil: options.reservedUntil ?? new Date(Date.now() + 3_600_000),
        items: {
          create: [
            {
              variantId: f.v1.id,
              warehouseId: f.whA.id,
              productName: "Product",
              sku: "SKU-1",
              unitPrice: "100.00",
              unitCost: "60.00",
              quantity: total,
              lineTotal: "100.00",
            },
          ],
        },
      },
    });
    await db.$transaction((tx) =>
      reserveMany(tx, [{ variantId: f.v1.id, warehouseId: f.whA.id, quantity: total }], { orderId: order.id }),
    );
    for (const quantity of quantities) {
      seq += 1;
      await db.cfComment.create({
        data: {
          externalCommentId: `c${seq}`,
          sessionId: session.id,
          authorExternalId: "U1",
          authorName: "U1",
          message: "CF A1",
          outcome: "ORDERED",
          lines: [{ itemId: itemId(), code: "A1", quantity }],
          orderId: order.id,
        },
      });
    }
    await db.liveSessionItem.update({
      where: { id: itemId() },
      data: { claimed: { increment: total + (options.extraClaimed ?? 0) } },
    });
    return order;
  }

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
    await db.product.update({ where: { id: f.product.id }, data: { status: "ACTIVE" } });
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 100 }));
    session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id, limit: 10 }] });
    writer = await bearerFor(app, "inv-write@test.local");
  });

  it("expire via worker function returns claimed and reopens the limit", async () => {
    const order = await cfOrder([4], { reservedUntil: new Date(Date.now() - 60_000) });
    expect(await claimed()).toBe(4);
    expect(await expireOrder(db, order.id)).toBe(true);
    expect(await claimed()).toBe(0);
  });

  it("cancel PENDING and PAID CF orders returns claimed", async () => {
    const a = await cfOrder([3]);
    const b = await cfOrder([2]);
    expect(await claimed()).toBe(5);
    await act(a.id, "cancel").expect(200);
    expect(await claimed()).toBe(2);
    await act(b.id, "pay").expect(200);
    await act(b.id, "cancel").expect(200);
    expect(await claimed()).toBe(0);
  });

  it("merged order with 2 comments returns both", async () => {
    const order = await cfOrder([2, 3]);
    expect(await claimed()).toBe(5);
    await act(order.id, "cancel").expect(200);
    expect(await claimed()).toBe(0);
  });

  it("pay, pack, ship, complete do NOT change claimed", async () => {
    const order = await cfOrder([3]);
    for (const action of ["pay", "pack", "ship", "complete"]) {
      await act(order.id, action).expect(200);
      expect(await claimed()).toBe(3);
    }
  });

  it("non-CF order cancel/expire is untouched", async () => {
    await cfOrder([2]);
    const plain = await db.order.create({
      data: {
        orderNumber: "SO-PLAIN",
        channel: "OFFLINE",
        source: "MANUAL",
        status: "PENDING_PAYMENT",
        currency: "LAK",
        subtotal: "100.00",
        vatRate: "10",
        vatAmount: "9.09",
        total: "100.00",
        reservedUntil: new Date(Date.now() - 60_000),
        items: {
          create: [
            {
              variantId: f.v1.id,
              warehouseId: f.whA.id,
              productName: "P",
              sku: "SKU-1",
              unitPrice: "100.00",
              unitCost: "60.00",
              quantity: 1,
              lineTotal: "100.00",
            },
          ],
        },
      },
    });
    await db.$transaction((tx) =>
      reserveMany(tx, [{ variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }], { orderId: plain.id }),
    );
    expect(await expireOrder(db, plain.id)).toBe(true);
    expect(await claimed()).toBe(2);
    expect((await db.order.findUniqueOrThrow({ where: { id: plain.id } })).status).toBe("EXPIRED");
  });

  it("a second cancel / expire attempt does not decrement twice", async () => {
    const a = await cfOrder([3]);
    const b = await cfOrder([2], { reservedUntil: new Date(Date.now() - 60_000) });
    expect(await claimed()).toBe(5);
    await act(a.id, "cancel").expect(200);
    await act(a.id, "cancel").expect(409);
    expect(await claimed()).toBe(2);
    expect(await expireOrder(db, b.id)).toBe(true);
    expect(await expireOrder(db, b.id)).toBe(false);
    await act(b.id, "cancel").expect(409);
    expect(await claimed()).toBe(0);
  });

  it("claimed never goes negative when lines exceed claimed", async () => {
    const order = await cfOrder([4]);
    await db.liveSessionItem.update({ where: { id: itemId() }, data: { claimed: 1 } });
    await act(order.id, "cancel").expect(200);
    expect(await claimed()).toBe(0);
  });

  it("ignores malformed lines but still returns valid ones", async () => {
    const order = await cfOrder([2]);
    await db.cfComment.update({
      where: { externalCommentId: `c${seq}` },
      data: { lines: [{ itemId: itemId(), code: "A1", quantity: 2 }, { nope: 1 }, "x", { itemId: itemId(), quantity: -5 }] },
    });
    await db.cfComment.create({
      data: {
        externalCommentId: "bad",
        sessionId: session.id,
        authorExternalId: "U9",
        authorName: "U9",
        message: "x",
        outcome: "ORDERED",
        lines: "garbage",
        orderId: order.id,
      },
    });
    await act(order.id, "cancel").expect(200);
    expect(await claimed()).toBe(0);
  });
});

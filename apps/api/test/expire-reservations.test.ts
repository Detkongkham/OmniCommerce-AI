import {
  type PrismaClient,
  createPrismaClient,
  expireOrder,
  findExpiredOrderIds,
  receive,
  reserveMany,
  runExpireReservations,
} from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog } from "./helpers";

describe("expire reservations (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let seq = 0;
  const NOW = new Date("2026-10-10T12:00:00.000Z");
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

  async function level() {
    const row = await db.stockLevel.findUniqueOrThrow({
      where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
    });
    return { onHand: row.onHand, reserved: row.reserved };
  }

  /** ສ້າງບິນ + ຈອງສະຕ໋ອກຈິງດ້ວຍເຄື່ອງຈັກ. */
  async function pendingOrder(options: { reservedUntil: Date; quantity?: number; status?: "PENDING_PAYMENT" | "PAID" }) {
    const quantity = options.quantity ?? 1;
    seq += 1;
    const order = await db.order.create({
      data: {
        orderNumber: `SO-T${seq}`,
        channel: "OFFLINE",
        source: "MANUAL",
        status: options.status ?? "PENDING_PAYMENT",
        currency: "LAK",
        subtotal: "100.00",
        vatRate: "10",
        vatAmount: "9.09",
        total: "100.00",
        reservedUntil: options.reservedUntil,
        items: {
          create: [
            {
              variantId: f.v1.id,
              warehouseId: f.whA.id,
              productName: "Product",
              sku: "SKU-1",
              unitPrice: "100.00",
              unitCost: "60.00",
              quantity,
              lineTotal: "100.00",
            },
          ],
        },
      },
    });
    await db.$transaction((tx) =>
      reserveMany(tx, [{ variantId: f.v1.id, warehouseId: f.whA.id, quantity }], { orderId: order.id }),
    );
    return order;
  }

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 100 }));
  });

  it("expireOrder: ບິນໝົດເວລາ → EXPIRED ແລະ ຄືນສະຕ໋ອກ ພ້ອມ movement RELEASE ຜູກ orderId", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1), quantity: 3 });
    expect(await level()).toEqual({ onHand: 100, reserved: 3 });

    expect(await expireOrder(db, order.id, NOW)).toBe(true);

    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect(await level()).toEqual({ onHand: 100, reserved: 0 });
    const release = await db.stockMovement.findFirstOrThrow({ where: { orderId: order.id, type: "RELEASE" } });
    expect(release).toMatchObject({ quantity: 3, actorId: null });
  });

  it("expireOrder: ເອີ້ນຊ້ຳ ຫຼື ບິນຍັງບໍ່ໝົດເວລາ ຫຼື ບິນ PAID → false ແລະ ບໍ່ແຕະສະຕ໋ອກ", async () => {
    const expired = await pendingOrder({ reservedUntil: minutes(-1) });
    const fresh = await pendingOrder({ reservedUntil: minutes(30) });
    const paid = await pendingOrder({ reservedUntil: minutes(-5), status: "PAID" });

    expect(await expireOrder(db, expired.id, NOW)).toBe(true);
    expect(await expireOrder(db, expired.id, NOW)).toBe(false);
    expect(await expireOrder(db, fresh.id, NOW)).toBe(false);
    expect(await expireOrder(db, paid.id, NOW)).toBe(false);
    expect(await level()).toEqual({ onHand: 100, reserved: 2 }); // fresh + paid ຍັງຈອງຢູ່
  });

  it("expireOrder ພ້ອມກັນຫຼາຍຄັ້ງ → ຄືນສະຕ໋ອກຄັ້ງດຽວ (ບໍ່ຕິດລົບ)", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1), quantity: 4 });
    const results = await Promise.all(Array.from({ length: 10 }, () => expireOrder(db, order.id, NOW)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await level()).toEqual({ onHand: 100, reserved: 0 });
    expect(await db.stockMovement.count({ where: { orderId: order.id, type: "RELEASE" } })).toBe(1);
  });

  it("findExpiredOrderIds: ສະເພາະ PENDING_PAYMENT ທີ່ໝົດເວລາ, ເກົ່າສຸດກ່ອນ, ເຄົາລົບ limit ແລະ excludeIds", async () => {
    const oldest = await pendingOrder({ reservedUntil: minutes(-30) });
    const older = await pendingOrder({ reservedUntil: minutes(-10) });
    await pendingOrder({ reservedUntil: minutes(10) });
    await pendingOrder({ reservedUntil: minutes(-20), status: "PAID" });

    expect(await findExpiredOrderIds(db, NOW, 10)).toEqual([oldest.id, older.id]);
    expect(await findExpiredOrderIds(db, NOW, 1)).toEqual([oldest.id]);
    expect(await findExpiredOrderIds(db, NOW, 10, [oldest.id])).toEqual([older.id]);
  });

  it("runExpireReservations: ລ້າງຫຼາຍບິນ, ວົນຫຼາຍຮອບເມື່ອເກີນ limit", async () => {
    for (let i = 0; i < 5; i += 1) await pendingOrder({ reservedUntil: minutes(-1 - i) });
    await pendingOrder({ reservedUntil: minutes(30) });

    const result = await runExpireReservations(db, { now: NOW, limit: 2 });

    expect(result).toEqual({ expired: 5, skipped: 0, failed: 0 });
    expect(await level()).toEqual({ onHand: 100, reserved: 1 });
    expect(await db.order.count({ where: { status: "EXPIRED" } })).toBe(5);
  });

  it("runExpireReservations: ບິນໜຶ່ງ throw ບໍ່ຢຸດບິນອື່ນ, ນັບ failed, ເອີ້ນ onError, ບໍ່ວົນຊ້ຳບິນທີ່ພັງ", async () => {
    const bad = await pendingOrder({ reservedUntil: minutes(-3) });
    const good = await pendingOrder({ reservedUntil: minutes(-2) });
    const errors: string[] = [];
    let badAttempts = 0;

    const result = await runExpireReservations(db, {
      now: NOW,
      limit: 1,
      onError: (orderId) => errors.push(orderId),
      expire: async (client, orderId, now) => {
        if (orderId === bad.id) {
          badAttempts += 1;
          throw new Error("boom");
        }
        return expireOrder(client, orderId, now);
      },
    });

    expect(result).toEqual({ expired: 1, skipped: 0, failed: 1 });
    expect(errors).toEqual([bad.id]);
    expect(badAttempts).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: good.id } })).status).toBe("EXPIRED");
    expect((await db.order.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("runExpireReservations: ບິນທີ່ expire() ຄືນ false (ຖືກ cancel ກ່ອນ) ນັບເປັນ skipped", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1) });
    const result = await runExpireReservations(db, {
      now: NOW,
      expire: async () => false,
    });
    expect(result).toEqual({ expired: 0, skipped: 1, failed: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });
});

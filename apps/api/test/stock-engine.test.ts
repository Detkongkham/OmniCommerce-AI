import {
  InsufficientStockError,
  type Prisma,
  type PrismaClient,
  adjust,
  createPrismaClient,
  receive,
  release,
  releaseMany,
  reserve,
  reserveMany,
  returnStock,
  ship,
  shipMany,
  transfer,
} from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog } from "./helpers";

type Tx = Prisma.TransactionClient;

describe("stock engine (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const run = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn);
  const key = (variantId: string, warehouseId: string) => ({ variantId, warehouseId });

  async function level(variantId: string, warehouseId: string) {
    const row = await db.stockLevel.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });
    return row ? { onHand: row.onHand, reserved: row.reserved } : null;
  }

  /** onHand/reserved ຕ້ອງເທົ່າກັບຜົນລວມຂອງ StockMovement (spec §4 invariant). */
  async function expectLedgerMatches() {
    const rows = await db.$queryRaw<
      { onHand: number; reserved: number; expectedOnHand: number; expectedReserved: number }[]
    >`
      SELECT l."onHand", l."reserved",
        COALESCE(SUM(CASE
          WHEN m."type" IN ('RECEIVE','RETURN','TRANSFER_IN','ADJUST') THEN m."quantity"
          WHEN m."type" IN ('SHIP','TRANSFER_OUT') THEN -m."quantity"
          ELSE 0 END), 0)::int AS "expectedOnHand",
        COALESCE(SUM(CASE
          WHEN m."type" = 'RESERVE' THEN m."quantity"
          WHEN m."type" IN ('RELEASE','SHIP') THEN -m."quantity"
          ELSE 0 END), 0)::int AS "expectedReserved"
      FROM "StockLevel" l
      LEFT JOIN "StockMovement" m ON m."variantId" = l."variantId" AND m."warehouseId" = l."warehouseId"
      GROUP BY l."id"`;
    for (const row of rows) {
      expect(row.onHand).toBe(row.expectedOnHand);
      expect(row.reserved).toBe(row.expectedReserved);
    }
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
  });

  it("receive ສ້າງແຖວ StockLevel ໃໝ່ ແລະ ເພີ່ມຕໍ່; ຂຽນ movement", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 10 }, { actorId: "u1", note: "PO-1" }));
    await run((tx) => receive(tx, { ...k, quantity: 5 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 15, reserved: 0 });

    const movements = await db.stockMovement.findMany({ orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity])).toEqual([
      ["RECEIVE", 10],
      ["RECEIVE", 5],
    ]);
    expect(movements[0]).toMatchObject({ actorId: "u1", note: "PO-1" });
    await expectLedgerMatches();
  });

  it("reserve ສຳເລັດເມື່ອພໍ ແລະ throw InsufficientStockError ເມື່ອບໍ່ພໍ (ພ້ອມ available)", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 5 }));
    await run((tx) => reserve(tx, { ...k, quantity: 3 }));

    const error = await run((tx) => reserve(tx, { ...k, quantity: 3 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).shortages).toEqual([
      { ...k, requested: 3, available: 2 },
    ]);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 3 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("reserve ໃສ່ variant ທີ່ບໍ່ເຄີຍມີສະຕ໋ອກ → ບໍ່ພໍ (available 0)", async () => {
    const error = await run((tx) => reserve(tx, { ...key(f.v1.id, f.whA.id), quantity: 1 })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).shortages[0]?.available).toBe(0);
  });

  it("release ແລະ ship ປ່ຽນ reserved/onHand ຖືກຕ້ອງ; ເກີນ reserved ບໍ່ໄດ້", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 10 }));
    await run((tx) => reserve(tx, { ...k, quantity: 6 }));

    await run((tx) => release(tx, { ...k, quantity: 2 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 10, reserved: 4 });

    await run((tx) => ship(tx, { ...k, quantity: 3 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 1 });

    await expect(run((tx) => ship(tx, { ...k, quantity: 2 }))).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(run((tx) => release(tx, { ...k, quantity: 2 }))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 1 });
    await expectLedgerMatches();
  });

  it("returnStock ເພີ່ມ onHand ແລະ ຂຽນ RETURN", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => returnStock(tx, { ...k, quantity: 2 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 2, reserved: 0 });
    expect(await db.stockMovement.count({ where: { type: "RETURN" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("adjust: ບວກສ້າງແຖວໄດ້; ລົບຕ້ອງບໍ່ເຮັດໃຫ້ onHand < reserved; movement ເກັບຄ່າຕິດລົບ", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => adjust(tx, { ...k, delta: 5 }, { note: "ນັບສະຕ໋ອກ" }));
    await run((tx) => reserve(tx, { ...k, quantity: 3 }));

    await expect(run((tx) => adjust(tx, { ...k, delta: -3 }, { note: "x" }))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    await run((tx) => adjust(tx, { ...k, delta: -2 }, { note: "ເສຍຫາຍ" }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });

    const adjustments = await db.stockMovement.findMany({ where: { type: "ADJUST" }, orderBy: { createdAt: "asc" } });
    expect(adjustments.map((m) => m.quantity)).toEqual([5, -2]);
    await expectLedgerMatches();
  });

  it("adjust ລົບໃສ່ variant ທີ່ບໍ່ມີແຖວ → ບໍ່ພໍ; delta 0 ຫຼື ບໍ່ແມ່ນ integer → RangeError", async () => {
    const k = key(f.v1.id, f.whA.id);
    await expect(run((tx) => adjust(tx, { ...k, delta: -1 }))).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(run((tx) => adjust(tx, { ...k, delta: 0 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => adjust(tx, { ...k, delta: 1.5 }))).rejects.toBeInstanceOf(RangeError);
  });

  it("quantity ≤ 0 ຫຼື ບໍ່ແມ່ນ integer → RangeError", async () => {
    const k = key(f.v1.id, f.whA.id);
    await expect(run((tx) => receive(tx, { ...k, quantity: 0 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => reserve(tx, { ...k, quantity: -1 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => receive(tx, { ...k, quantity: 1.2 }))).rejects.toBeInstanceOf(RangeError);
  });

  it("transfer: ຍ້າຍສະເພາະທີ່ຂາຍໄດ້ (onHand - reserved); ເຮັດ 2 movement", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => reserve(tx, { ...key(f.v1.id, f.whA.id), quantity: 3 }));
    const t = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id };

    await expect(run((tx) => transfer(tx, { ...t, quantity: 3 }))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(f.v1.id, f.whB.id)).toBeNull(); // rollback: ປາຍທາງບໍ່ຖືກສ້າງ

    await run((tx) => transfer(tx, { ...t, quantity: 2 }, { actorId: "u1" }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });
    expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 2, reserved: 0 });
    const types = (await db.stockMovement.findMany({ where: { type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }))
      .map((m) => `${m.type}:${m.warehouseId === f.whA.id ? "A" : "B"}:${m.quantity}`)
      .sort();
    expect(types).toEqual(["TRANSFER_IN:B:2", "TRANSFER_OUT:A:2"]);
    await expectLedgerMatches();
  });

  it("transfer ໄປສາງດຽວກັນ → RangeError", async () => {
    await expect(
      run((tx) => transfer(tx, { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whA.id, quantity: 1 })),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("reserve ພ້ອມກັນ 20 ຄັ້ງໃສ່ສະຕ໋ອກ 1 ຊິ້ນ → ສຳເລັດ 1 ຄັ້ງພໍດີ", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 1 }));

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => run((tx) => reserve(tx, { ...k, quantity: 1 }))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.reason instanceof InsufficientStockError)).toBe(true);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("reserveMany: ລາຍການສຸດທ້າຍບໍ່ພໍ → rollback ທັງໝົດ ແລະ ລາຍງານທຸກລາຍການທີ່ບໍ່ພໍ", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 1 }));
    const lines = [
      { ...key(f.v1.id, f.whA.id), quantity: 2 },
      { ...key(f.v2.id, f.whA.id), quantity: 4 }, // ບໍ່ພໍ (ມີ 1)
      { ...key(f.v1.id, f.whB.id), quantity: 1 }, // ບໍ່ພໍ (ບໍ່ມີແຖວ)
    ];

    const error = await run((tx) => reserveMany(tx, lines)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientStockError);
    const shortages = (error as InsufficientStockError).shortages;
    expect(shortages.map((s) => [s.variantId, s.warehouseId, s.requested, s.available]).sort()).toEqual(
      [
        [f.v2.id, f.whA.id, 4, 1],
        [f.v1.id, f.whB.id, 1, 0],
      ].sort(),
    );
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(0);
    await expectLedgerMatches();
  });

  it("reserveMany/releaseMany/shipMany ໃສ່ orderId ໃນ movement", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 5 }));
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "0",
        vatRate: "10",
        vatAmount: "0",
        total: "0",
      },
    });
    const lines = [
      { ...key(f.v2.id, f.whA.id), quantity: 2 },
      { ...key(f.v1.id, f.whA.id), quantity: 1 },
    ];
    await run((tx) => reserveMany(tx, lines, { orderId: order.id }));
    await run((tx) => shipMany(tx, [lines[0]!], { orderId: order.id }));
    await run((tx) => releaseMany(tx, [lines[1]!], { orderId: order.id }));

    expect(await level(f.v2.id, f.whA.id)).toEqual({ onHand: 3, reserved: 0 });
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 0 });
    const movements = await db.stockMovement.findMany({ where: { orderId: order.id } });
    expect(movements.map((m) => m.type).sort()).toEqual(["RELEASE", "RESERVE", "RESERVE", "SHIP"]);
    await expectLedgerMatches();
  });

  it("ບໍ່ deadlock ເມື່ອສອງ transaction ຈອງຊຸດດຽວກັນຄົນລະລຳດັບ (ວົນ 50 ຮອບ)", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 1000 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 1000 }));
    const forward = [
      { ...key(f.v1.id, f.whA.id), quantity: 1 },
      { ...key(f.v2.id, f.whA.id), quantity: 1 },
    ];
    const backward = [...forward].reverse();

    for (let i = 0; i < 50; i += 1) {
      const results = await Promise.allSettled([
        run((tx) => reserveMany(tx, forward)),
        run((tx) => reserveMany(tx, backward)),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    }
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 1000, reserved: 100 });
    expect(await level(f.v2.id, f.whA.id)).toEqual({ onHand: 1000, reserved: 100 });
    await expectLedgerMatches();
  });

  it("transfer ສອງທິດ A→B ແລະ B→A ພ້ອມກັນ ບໍ່ deadlock (ວົນ 30 ຮອບ)", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 500 }));
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whB.id), quantity: 500 }));
    const ab = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id, quantity: 1 };
    const ba = { variantId: f.v1.id, fromWarehouseId: f.whB.id, toWarehouseId: f.whA.id, quantity: 1 };

    for (let i = 0; i < 30; i += 1) {
      const results = await Promise.allSettled([run((tx) => transfer(tx, ab)), run((tx) => transfer(tx, ba))]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    }
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 500, reserved: 0 });
    expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 500, reserved: 0 });
    await expectLedgerMatches();
  });
});

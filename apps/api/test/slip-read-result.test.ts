import { type PrismaClient, createPrismaClient, markSlipReadFailed, storeSlipReadResult } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("storeSlipReadResult / markSlipReadFailed (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  const now = new Date("2026-10-07T10:00:00.000Z");
  const reader = { name: "fake", version: "1" };

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  const makeOrder = () =>
    db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "100000",
        vatRate: "0",
        vatAmount: "0",
        total: "100000",
        createdAt: new Date("2026-10-07T08:00:00.000Z"),
        reservedUntil: new Date("2026-10-07T11:00:00.000Z"),
      },
    });
  const makeSlip = (patch: object = {}) =>
    db.paymentSlip.create({
      data: {
        source: "UPLOAD",
        imageKey: "slips/k",
        imageMime: "image/png",
        imageBytes: 1,
        imageSha256: Math.random().toString(16).slice(2).padEnd(64, "0"),
        ...patch,
      },
    });

  it("ບັນທຶກຜົນທີ່ປັບເປັນມາດຕະຖານ, ຕັ້ງ READ, ເກັບຊື່ reader, ແລະ ຄິດ flag", async () => {
    const order = await makeOrder();
    const slip = await makeSlip({ orderId: order.id });
    const stored = await storeSlipReadResult(
      db,
      slip.id,
      reader,
      {
        amount: "₭ 100,000",
        currency: " lak ",
        paidAt: "2026-10-07T16:00:00+07:00",
        destAccount: "  010-12-00-0123 ",
        refNo: " REF-1 ",
        raw: { text: "hello" },
      },
      { now },
    );
    expect(stored).toBe(true);
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row).toMatchObject({
      status: "READ",
      readerName: "fake",
      readerVersion: "1",
      readCurrency: "LAK",
      readDestAccount: "010-12-00-0123",
      readRefNo: "REF-1",
    });
    expect(row.readAmount?.toFixed(2)).toBe("100000.00");
    expect(row.readPaidAt?.toISOString()).toBe("2026-10-07T09:00:00.000Z");
    expect(row.readRaw).toEqual({ value: { text: "hello" } });
    expect(row.flags).toEqual([]);
  });

  it("ຄ່າທີ່ແປງບໍ່ໄດ້ → null (ບໍ່ throw): ຍອດບໍ່ແມ່ນຕົວເລກ, ສະກຸນບໍ່ຮູ້ຈັກ, ວັນທີຜິດ, ຂໍ້ຄວາມວ່າງ → UNREADABLE_FIELDS", async () => {
    const slip = await makeSlip();
    await storeSlipReadResult(
      db,
      slip.id,
      reader,
      { amount: "abc", currency: "EUR", paidAt: "yesterday-ish", destAccount: "   ", refNo: "", raw: null },
      { now },
    );
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row.status).toBe("READ");
    expect([row.readAmount, row.readCurrency, row.readPaidAt, row.readDestAccount, row.readRefNo]).toEqual([null, null, null, null, null]);
    expect(row.flags).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ຜົນວ່າງຈາກ fake reader (raw ເປັນ {}) ຍັງເປັນ READ ເພື່ອໃຫ້ແອດມິນຕື່ມມື", async () => {
    const slip = await makeSlip();
    expect(await storeSlipReadResult(db, slip.id, reader, { raw: {} }, { now })).toBe(true);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
  });

  it("raw ໃຫຍ່ເກີນ → ເກັບແຕ່ { truncated: true }; ຂໍ້ຄວາມຍາວຖືກຕັດ 100 ໂຕ", async () => {
    const slip = await makeSlip();
    await storeSlipReadResult(db, slip.id, reader, { refNo: "x".repeat(500), raw: { blob: "y".repeat(30_000) } }, { now });
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row.readRaw).toEqual({ truncated: true });
    expect(row.readRefNo).toHaveLength(100);
  });

  it("ບໍ່ຂຽນທັບຖ້າສະຖານະບໍ່ແມ່ນ PENDING_READ (ແອດມິນປະຕິເສດ/ກວດແລ້ວ ລະຫວ່າງອ່ານ) ແລະ ບໍ່ແຕະ confirmed*", async () => {
    for (const status of ["READ", "READ_FAILED", "CONFIRMED", "REJECTED"] as const) {
      const slip = await makeSlip({ status, confirmedAmount: "5", readRefNo: "OLD" });
      expect(await storeSlipReadResult(db, slip.id, reader, { amount: "100", refNo: "NEW", raw: {} }, { now }), status).toBe(false);
      const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
      expect(row.status).toBe(status);
      expect(row.readRefNo).toBe("OLD");
      expect(row.confirmedAmount?.toFixed(2)).toBe("5.00");
    }
  });

  it("ບໍ່ພົບສະລິບ → false (ບໍ່ throw)", async () => {
    expect(await storeSlipReadResult(db, "nope", reader, { raw: {} }, { now })).toBe(false);
  });

  it("ບໍ່ເອີ້ນ evaluateSlip ເມື່ອ count = 0 (flags ເດີມຂອງສະລິບທີ່ບໍ່ແມ່ນ PENDING_READ ບໍ່ຖືກຄິດໃໝ່)", async () => {
    const slip = await makeSlip({ status: "READ", flags: ["AMOUNT_MISMATCH"] });
    expect(await storeSlipReadResult(db, slip.id, reader, { amount: "1", raw: {} }, { now })).toBe(false);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).flags).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ຍອດສູນ/ມີຈຸດຕົວຄັ່ນທີ່ກຳກວມ → null; ສະກຸນໂຕນ້ອຍ → ໂຕໃຫຍ່; ຍອດຕິດລົບ/ວັນທີຜິດບໍ່ throw", async () => {
    const zero = await makeSlip();
    await storeSlipReadResult(db, zero.id, reader, { amount: "0", currency: "thb", paidAt: "2026-13-45", raw: {} }, { now });
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: zero.id } });
    expect(row.readAmount).toBeNull();
    expect(row.readCurrency).toBe("THB");
    expect(row.readPaidAt).toBeNull();
    const ambiguous = await makeSlip();
    await storeSlipReadResult(db, ambiguous.id, reader, { amount: "12,50", raw: {} }, { now });
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: ambiguous.id } })).readAmount).toBeNull();
  });

  it("NUL (\\u0000) ໃນ raw ແລະ ຂໍ້ຄວາມ ບໍ່ເຮັດໃຫ້ Postgres ປະຕິເສດ; emoji/ລາວຍັງຢູ່ຄົບ", async () => {
    const slip = await makeSlip();
    const ok = await storeSlipReadResult(
      db,
      slip.id,
      reader,
      { refNo: "RE\u0000F-ສະບາຍດີ😀", destAccount: "01\u000012", raw: { text: "a\u0000b ສະບາຍດີ 😀", "k\u0000ey": ["x\u0000"] } },
      { now },
    );
    expect(ok).toBe(true);
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row.status).toBe("READ");
    expect(row.readRefNo).toBe("REF-ສະບາຍດີ😀");
    expect(row.readDestAccount).toBe("0112");
    expect(row.readRaw).toEqual({ value: { text: "ab ສະບາຍດີ 😀", key: ["x"] } });
  });

  it("READ_FAILED → retry (PENDING_READ) → ບັນທຶກໄດ້", async () => {
    const slip = await makeSlip();
    expect(await markSlipReadFailed(db, slip.id)).toBe(true);
    expect(await storeSlipReadResult(db, slip.id, reader, { amount: "10", raw: {} }, { now })).toBe(false);
    await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "PENDING_READ" } });
    expect(await storeSlipReadResult(db, slip.id, reader, { amount: "10", raw: {} }, { now })).toBe(true);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
  });

  it("markSlipReadFailed: PENDING_READ → READ_FAILED; ສະຖານະອື່ນບໍ່ແຕະ", async () => {
    const pending = await makeSlip();
    expect(await markSlipReadFailed(db, pending.id)).toBe(true);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("READ_FAILED");
    expect(await markSlipReadFailed(db, pending.id)).toBe(false);
    const confirmed = await makeSlip({ status: "CONFIRMED" });
    expect(await markSlipReadFailed(db, confirmed.id)).toBe(false);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: confirmed.id } })).status).toBe("CONFIRMED");
    expect(await markSlipReadFailed(db, "nope")).toBe(false);
  });
});

import { type PrismaClient, createPrismaClient, evaluateSlip } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("evaluateSlip (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  const now = new Date("2026-10-07T10:00:00.000Z");

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    await db.storeSetting.create({
      data: { id: 1, name: "t", receivingAccounts: [{ bank: "BCEL", accountNo: "01012000123" }] },
    });
  });

  const makeOrder = (patch: object = {}) =>
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
        ...patch,
      },
    });
  const makeSlip = (patch: object = {}) =>
    db.paymentSlip.create({
      data: {
        source: "UPLOAD",
        imageKey: "slips/k",
        imageMime: "image/png",
        imageBytes: 10,
        imageSha256: "a".repeat(64),
        status: "READ",
        readAmount: "100000",
        readCurrency: "LAK",
        readPaidAt: new Date("2026-10-07T09:00:00.000Z"),
        readDestAccount: "010-12-00-0123",
        readRefNo: "REF1",
        ...patch,
      },
    });

  it("ຖືກທຸກຢ່າງ → flags ວ່າງ ແລະ ບັນທຶກ", async () => {
    const order = await makeOrder();
    const slip = await makeSlip({ orderId: order.id, flags: ["AMOUNT_MISMATCH"] });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).flags).toEqual([]);
  });

  it("ບໍ່ມີບິນ → ຂ້າມກວດຍອດ; ໃຊ້ confirmed* ກ່ອນ read*", async () => {
    const slip = await makeSlip({ readAmount: "1", confirmedAmount: "100000" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
    const order = await makeOrder();
    await db.paymentSlip.update({ where: { id: slip.id }, data: { orderId: order.id, confirmedAmount: "5" } });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ຊ້ຳດ້ວຍ refNo ກັບສະລິບອື່ນ (ບໍ່ນັບ REJECTED)", async () => {
    const a = await makeSlip({ imageSha256: "b".repeat(64) });
    const b = await makeSlip({ imageSha256: "c".repeat(64) });
    expect(await evaluateSlip(db, b.id, { now })).toContain("DUPLICATE_REF");
    await db.paymentSlip.update({ where: { id: a.id }, data: { status: "REJECTED" } });
    expect(await evaluateSlip(db, b.id, { now })).not.toContain("DUPLICATE_REF");
  });

  it("ຊ້ຳດ້ວຍ sha256 ຂອງຮູບ", async () => {
    await makeSlip({ readRefNo: "X1" });
    const second = await makeSlip({ readRefNo: "X2" });
    expect(await evaluateSlip(db, second.id, { now })).toEqual(["DUPLICATE_IMAGE"]);
  });

  it("refNo ຕ່າງກັນແຕ່ບັນຊີ/ຮູບຕ່າງກັນ → ບໍ່ຊ້ຳ; ບໍ່ມີ refNo → ບໍ່ຊ້ຳດ້ວຍ refNo", async () => {
    await makeSlip({ readRefNo: "A", imageSha256: "d".repeat(64) });
    const other = await makeSlip({ readRefNo: null, imageSha256: "e".repeat(64) });
    expect(await evaluateSlip(db, other.id, { now })).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ບິນໝົດເວລາ/ບໍ່ຢູ່ PENDING_PAYMENT → ORDER_NOT_PAYABLE", async () => {
    const order = await makeOrder({ status: "EXPIRED" });
    const slip = await makeSlip({ orderId: order.id });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual(["ORDER_NOT_PAYABLE"]);
  });

  it("ບັນຊີຮ້ານເປັນ [] → ບໍ່ກວດບັນຊີປາຍທາງ", async () => {
    await db.storeSetting.update({ where: { id: 1 }, data: { receivingAccounts: [] } });
    const slip = await makeSlip({ readDestAccount: "999" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });

  it("ບໍ່ມີ StoreSetting ເລີຍ → ຖືວ່າບໍ່ມີບັນຊີຮ້ານ (ບໍ່ throw)", async () => {
    await db.storeSetting.deleteMany();
    const slip = await makeSlip({ readDestAccount: "999" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });

  it("ບໍ່ພົບສະລິບ → throw", async () => {
    await expect(evaluateSlip(db, "nope", { now })).rejects.toThrow("not found");
  });

  it("receivingAccounts ຮູບແບບຜິດໃນ DB → ຂ້າມລາຍການທີ່ຜິດ (ບໍ່ throw)", async () => {
    await db.storeSetting.update({ where: { id: 1 }, data: { receivingAccounts: [{ bad: true }, { bank: "A", accountNo: "01012000123" }] } });
    const slip = await makeSlip();
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });

  it("ບໍ່ນັບຕົວເອງເປັນຊ້ຳ (ສະລິບດຽວ refNo/sha256 ຂອງຕົວເອງ)", async () => {
    const only = await makeSlip({ confirmedRefNo: "REF1" });
    expect(await evaluateSlip(db, only.id, { now })).toEqual([]);
  });
});

import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("inventory migration", () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  it("StoreSetting.reservationMinutes ມີຄ່າເລີ່ມຕົ້ນ 30", async () => {
    const row = await db.storeSetting.create({ data: { name: "Test" } });
    expect(row.reservationMinutes).toBe(30);
  });

  it("reservationMinutes ຕ້ອງຢູ່ໃນ 1..10080", async () => {
    await expect(db.storeSetting.create({ data: { name: "T", reservationMinutes: 0 } })).rejects.toThrow();
    await resetDb(db);
    await expect(db.storeSetting.create({ data: { name: "T", reservationMinutes: 10081 } })).rejects.toThrow();
    await resetDb(db);
    const ok = await db.storeSetting.create({ data: { name: "T", reservationMinutes: 10080 } });
    expect(ok.reservationMinutes).toBe(10080);
  });

  it("sequence Order_number_seq ເພີ່ມຂຶ້ນເທື່ອລະ 1", async () => {
    const [a] = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
    const [b] = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
    expect(a).toBeDefined();
    expect(b?.n).toBe((a?.n ?? 0n) + 1n);
  });
});

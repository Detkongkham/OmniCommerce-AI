import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./env";
import { resetDb, seedBasics, seedCatalog } from "./helpers";
import { makeOrder } from "./report-fixtures";

const MIGRATION = readFileSync(
  join(REPO_ROOT, "packages/database/prisma/migrations/20261009000000_staff_kpi_analytics/migration.sql"),
  "utf8",
);
/** ສ່ວນ backfill ຂອງ migration (ແລ່ນຊ້ຳໄດ້: ແຕະສະເພາະແຖວທີ່ createdById ຍັງ null) */
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf('UPDATE "Order"'));

describe("staff_kpi_analytics migration", () => {
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

  it("backfill createdById ຈາກ audit order.create; ບິນບໍ່ມີ audit (CF) ຍັງ null", async () => {
    const { viewerUser } = await seedBasics(db);
    const f = await seedCatalog(db);
    const item = { variantId: f.v1.id, warehouseId: f.whA.id, unitPrice: "1", unitCost: "1", quantity: 1 };
    const manual = await makeOrder(db, { items: [item] });
    const cf = await makeOrder(db, { items: [item] });
    await db.auditLog.create({ data: { userId: viewerUser.id, action: "order.create", entity: "Order", entityId: manual.id } });

    expect(BACKFILL).toContain("SET \"createdById\"");
    await db.$executeRawUnsafe(BACKFILL);

    expect((await db.order.findUniqueOrThrow({ where: { id: manual.id } })).createdById).toBe(viewerUser.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: cf.id } })).createdById).toBeNull();
  });

  it("ລຶບຜູ້ໃຊ້ → createdById ເປັນ null (SET NULL), ບິນຍັງຢູ່", async () => {
    const { viewerUser } = await seedBasics(db);
    const f = await seedCatalog(db);
    const order = await makeOrder(db, {
      createdById: viewerUser.id,
      items: [{ variantId: f.v1.id, warehouseId: f.whA.id, unitPrice: "1", unitCost: "1", quantity: 1 }],
    });
    await db.user.delete({ where: { id: viewerUser.id } });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).createdById).toBeNull();
  });
});

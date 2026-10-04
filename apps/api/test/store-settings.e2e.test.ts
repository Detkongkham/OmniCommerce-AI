import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

describe("store settings (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
  });

  it("ຕ້ອງ login; ບໍ່ມີ inventory:read → 403", async () => {
    await request(server()).get("/settings/store").expect(401);
    const noInv = await bearerFor(app, "noinv@test.local");
    await request(server()).get("/settings/store").set(noInv).expect(403);
  });

  it("GET ສ້າງແຖວເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ບໍ່ຕ້ອງ seed)", async () => {
    const reader = await bearerFor(app, "inv-read@test.local");
    const res = await request(server()).get("/settings/store").set(reader).expect(200);
    expect(res.body).toEqual({
      name: "OCA Store",
      baseCurrency: "LAK",
      vatRate: 10,
      pricesIncludeVat: true,
      reservationMinutes: 30,
    });
    expect(await db.storeSetting.count()).toBe(1);
  });

  it("PATCH ແກ້ໄດ້ດ້ວຍ inventory:write ແລະ ຂຽນ audit; inventory:read ແກ້ບໍ່ໄດ້", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    const res = await request(server())
      .patch("/settings/store")
      .set(writer)
      .send({ name: "ຮ້ານນ້ອງ", vatRate: 7, reservationMinutes: 45, pricesIncludeVat: false })
      .expect(200);
    expect(res.body).toMatchObject({ name: "ຮ້ານນ້ອງ", vatRate: 7, reservationMinutes: 45, pricesIncludeVat: false });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "settings.store.update" } });
    expect(audit.entity).toBe("StoreSetting");

    const reader = await bearerFor(app, "inv-read@test.local");
    await request(server())
      .patch("/settings/store")
      .set(reader)
      .send({ name: "x" })
      .expect(403);
  });

  it("PATCH: body ວ່າງ / ຄ່າຜິດ / baseCurrency → 400", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    await request(server()).patch("/settings/store").set(writer).send({}).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ vatRate: 101 }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ reservationMinutes: 0 }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ baseCurrency: "USD" }).expect(400);
  });
});

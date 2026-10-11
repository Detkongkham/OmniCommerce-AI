import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("couriers (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let warehouse: { Authorization: string };
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    warehouse = await bearerFor(app, "warehouse@role.test");
  });

  it("ສ້າງ → ລາຍການ (ລຽງຕາມຊື່, ລວມທີ່ປິດ) → ແກ້ → ປິດ", async () => {
    const created = await request(server())
      .post("/couriers")
      .set(warehouse)
      .send({ code: " anousith ", name: "Anousith Express", trackingUrlTemplate: "https://anousith.la/track/{tracking}" })
      .expect(201);
    expect(created.body).toMatchObject({ code: "ANOUSITH", name: "Anousith Express", trackingUrlTemplate: "https://anousith.la/track/{tracking}", isActive: true });
    await request(server()).post("/couriers").set(warehouse).send({ code: "HAL", name: "HAL Express" }).expect(201);

    const patched = await request(server()).patch(`/couriers/${created.body.id}`).set(warehouse).send({ isActive: false, trackingUrlTemplate: "" }).expect(200);
    expect(patched.body).toMatchObject({ isActive: false, trackingUrlTemplate: null });

    const list = await request(server()).get("/couriers").set(warehouse).expect(200);
    expect(list.body.map((c: { code: string }) => c.code)).toEqual(["ANOUSITH", "HAL"]);
    expect(list.body[0].isActive).toBe(false);
  });

  it("code ຊ້ຳ → 409 DUPLICATE_VALUE; body ຜິດ → 400; id ບໍ່ພົບ → 404 COURIER_NOT_FOUND", async () => {
    await request(server()).post("/couriers").set(warehouse).send({ code: "HAL", name: "HAL" }).expect(201);
    const dup = await request(server()).post("/couriers").set(warehouse).send({ code: "hal", name: "Other" }).expect(409);
    expect(dup.body.code).toBe("DUPLICATE_VALUE");
    await request(server()).post("/couriers").set(warehouse).send({ code: "X", name: "X", trackingUrlTemplate: "https://x.la" }).expect(400);
    const missing = await request(server()).patch("/couriers/nope").set(warehouse).send({ name: "x" }).expect(404);
    expect(missing.body.code).toBe("COURIER_NOT_FOUND");
  });

  it("ສິດ: logistics:read ອ່ານ, logistics:write ແກ້", async () => {
    const accountant = await bearerFor(app, "accountant@role.test"); // logistics:read ເທົ່ານັ້ນ
    const chat = await bearerFor(app, "chat_admin@role.test"); // ບໍ່ມີ logistics
    await request(server()).get("/couriers").set(accountant).expect(200);
    await request(server()).post("/couriers").set(accountant).send({ code: "A", name: "A" }).expect(403);
    await request(server()).get("/couriers").set(chat).expect(403);
  });
});

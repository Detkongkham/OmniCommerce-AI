import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("warehouses (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();
  let writer: { Authorization: string };
  let reader: { Authorization: string };

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  it("ສ້າງ + ລາຍການ (default ຂຶ້ນກ່ອນ) + ສິດ", async () => {
    await request(server()).get("/warehouses").expect(401);
    await request(server()).post("/warehouses").set(reader).send({ code: "VTE", name: "ວຽງຈັນ" }).expect(403);

    const created = await request(server())
      .post("/warehouses")
      .set(writer)
      .send({ code: "VTE", name: "ສາງວຽງຈັນ", address: "Vientiane" })
      .expect(201);
    expect(created.body).toMatchObject({ code: "VTE", name: "ສາງວຽງຈັນ", isDefault: false, isActive: true });

    await db.warehouse.create({ data: { code: "MAIN", name: "Main", isDefault: true } });
    const list = await request(server()).get("/warehouses").set(reader).expect(200);
    expect(list.body.map((w: { code: string }) => w.code)).toEqual(["MAIN", "VTE"]);
    expect(await db.auditLog.count({ where: { action: "warehouse.create" } })).toBe(1);
  });

  it("code ຊ້ຳ → 409; code ຜິດຮູບແບບ → 400", async () => {
    const body = { code: "DUP", name: "x" };
    await request(server()).post("/warehouses").set(writer).send(body).expect(201);
    await request(server()).post("/warehouses").set(writer).send(body).expect(409);
    await request(server()).post("/warehouses").set(writer).send({ code: "lower", name: "x" }).expect(400);
  });

  it("PATCH ແກ້ຊື່ ແລະ ທີ່ຢູ່; ບໍ່ມີ id → 404", async () => {
    const { whB } = await seedCatalog(db);
    const res = await request(server())
      .patch(`/warehouses/${whB.id}`)
      .set(writer)
      .send({ name: "ຊື່ໃໝ່", address: null })
      .expect(200);
    expect(res.body).toMatchObject({ name: "ຊື່ໃໝ່", address: null });
    await request(server()).patch("/warehouses/nope").set(writer).send({ name: "x" }).expect(404);
  });

  it("POST /:id/default ປ່ຽນ default ຄັ້ງດຽວ ແລະ ບໍ່ເຮັດໃຫ້ມີສອງອັນ", async () => {
    const { whA, whB } = await seedCatalog(db);
    const res = await request(server()).post(`/warehouses/${whB.id}/default`).set(writer).expect(200);
    expect(res.body.isDefault).toBe(true);
    expect(await db.warehouse.findMany({ where: { isDefault: true }, select: { id: true } })).toEqual([{ id: whB.id }]);
    expect((await db.warehouse.findUniqueOrThrow({ where: { id: whA.id } })).isDefault).toBe(false);
  });

  it("ຕັ້ງສາງທີ່ປິດແລ້ວເປັນ default → 409", async () => {
    const { whB } = await seedCatalog(db);
    await db.warehouse.update({ where: { id: whB.id }, data: { isActive: false } });
    await request(server()).post(`/warehouses/${whB.id}/default`).set(writer).expect(409);
  });

  it("ປິດສາງ: ສາງ default → 409; ສາງທີ່ມີສະຕ໋ອກ → 409; ສາງວ່າງ → ສຳເລັດ", async () => {
    const { whA, whB, v1 } = await seedCatalog(db);
    await request(server()).patch(`/warehouses/${whA.id}`).set(writer).send({ isActive: false }).expect(409);

    await db.stockLevel.create({ data: { variantId: v1.id, warehouseId: whB.id, onHand: 2, reserved: 0 } });
    await request(server()).patch(`/warehouses/${whB.id}`).set(writer).send({ isActive: false }).expect(409);

    await db.stockLevel.deleteMany();
    const res = await request(server()).patch(`/warehouses/${whB.id}`).set(writer).send({ isActive: false }).expect(200);
    expect(res.body.isActive).toBe(false);
  });
});

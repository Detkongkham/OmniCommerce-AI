import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("stock (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let users: Awaited<ReturnType<typeof seedInventoryUsers>>;
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const server = () => app.getHttpServer();
  const post = (path: string, body: object, headers = writer) => request(server()).post(path).set(headers).send(body);

  async function level(variantId: string, warehouseId: string) {
    const row = await db.stockLevel.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId } } });
    return row ? { onHand: row.onHand, reserved: row.reserved } : null;
  }

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    users = await seedInventoryUsers(db);
    f = await seedCatalog(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  it("ສິດ: ບໍ່ login 401; read-only ເຮັດ POST ບໍ່ໄດ້ 403; ບໍ່ມີ inventory:read ອ່ານບໍ່ໄດ້ 403", async () => {
    await request(server()).get("/stock").expect(401);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }, reader).expect(403);
    const noInv = await bearerFor(app, "noinv@test.local");
    await request(server()).get("/stock").set(noInv).expect(403);
  });

  it("receive: ເພີ່ມ onHand, ຄືນ StockLevel DTO, ຂຽນ movement ພ້ອມ actorId + note ແລະ audit", async () => {
    const res = await post("/stock/receive", {
      variantId: f.v1.id,
      warehouseId: f.whA.id,
      quantity: 10,
      note: "PO-1",
    }).expect(201);
    expect(res.body).toMatchObject({
      variantId: f.v1.id,
      sku: "SKU-1",
      warehouseId: f.whA.id,
      warehouseCode: "A",
      onHand: 10,
      reserved: 0,
      available: 10,
      lowStockThreshold: null,
      isLow: false,
    });
    const movement = await db.stockMovement.findFirstOrThrow({ where: { type: "RECEIVE" } });
    expect(movement).toMatchObject({ quantity: 10, note: "PO-1", actorId: users.writer.id });
    expect(await db.auditLog.count({ where: { action: "stock.receive" } })).toBe(1);
  });

  it("ອ້າງອີງບໍ່ພົບ → 404; ສາງປິດ → 409; body ຜິດ → 400", async () => {
    await post("/stock/receive", { variantId: "nope", warehouseId: f.whA.id, quantity: 1 }).expect(404);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: "nope", quantity: 1 }).expect(404);
    await db.warehouse.update({ where: { id: f.whB.id }, data: { isActive: false } });
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 }).expect(409);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 0 }).expect(400);
  });

  it("adjust: ບວກ/ລົບ ຕ້ອງມີ note; ລົບເກີນ (onHand < reserved) → 409 ພ້ອມ shortages", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    await db.stockLevel.update({
      where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
      data: { reserved: 3 },
    });

    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -2 }).expect(400); // ບໍ່ມີ note
    const res = await post("/stock/adjust", {
      variantId: f.v1.id,
      warehouseId: f.whA.id,
      delta: -3,
      note: "ເສຍຫາຍ",
    }).expect(409);
    expect(res.body.shortages).toEqual([
      { variantId: f.v1.id, warehouseId: f.whA.id, sku: "SKU-1", requested: 3, available: 2 },
    ]);

    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -2, note: "ເສຍຫາຍ" }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });
    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: 4, note: "ນັບເພີ່ມ" }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 3 });
  });

  it("transfer: ຄືນ { from, to }; ບໍ່ພໍ → 409 ແລະ ບໍ່ປ່ຽນຫຍັງ; ສາງດຽວກັນ → 400", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    const body = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id };

    await post("/stock/transfer", { ...body, quantity: 6 }).expect(409);
    expect(await level(f.v1.id, f.whB.id)).toBeNull();

    const res = await post("/stock/transfer", { ...body, quantity: 2 }).expect(201);
    expect(res.body.from).toMatchObject({ warehouseCode: "A", onHand: 3 });
    expect(res.body.to).toMatchObject({ warehouseCode: "B", onHand: 2 });
    await post("/stock/transfer", { ...body, toWarehouseId: f.whA.id, quantity: 1 }).expect(400);
  });

  it("return: ເພີ່ມ onHand; orderId ທີ່ບໍ່ມີ → 404", async () => {
    await post("/stock/return", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 2 }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 2, reserved: 0 });
    await post("/stock/return", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1, orderId: "nope" }).expect(404);
  });

  it("PATCH /stock/:id/threshold ຕັ້ງ/ລ້າງ; ບໍ່ມີ id → 404", async () => {
    const rec = await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    const patch = (id: string, body: object) => request(server()).patch(`/stock/${id}/threshold`).set(writer).send(body);

    const set = await patch(rec.body.id, { lowStockThreshold: 5 }).expect(200);
    expect(set.body).toMatchObject({ lowStockThreshold: 5, isLow: true });
    const cleared = await patch(rec.body.id, { lowStockThreshold: null }).expect(200);
    expect(cleared.body).toMatchObject({ lowStockThreshold: null, isLow: false });
    await patch("nope", { lowStockThreshold: 1 }).expect(404);
    await patch(rec.body.id, { lowStockThreshold: -1 }).expect(400);
  });

  it("GET /stock: filter warehouseId / q / lowStock ແລະ pagination", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
    await post("/stock/receive", { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 20 });
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 });
    await db.stockLevel.updateMany({ where: { variantId: f.v1.id }, data: { lowStockThreshold: 5 } });

    const get = async (qs: string) => (await request(server()).get(`/stock${qs}`).set(reader).expect(200)).body;
    expect((await get("")).total).toBe(3);
    expect((await get(`?warehouseId=${f.whB.id}`)).items.map((i: { sku: string }) => i.sku)).toEqual(["SKU-1"]);
    expect((await get("?q=sku-2")).items).toHaveLength(1);

    const low = await get("?lowStock=true");
    expect(low.items.map((i: { warehouseCode: string }) => i.warehouseCode).sort()).toEqual(["A", "B"]); // v1 ທັງ 2 ສາງ (5<=5, 1<=5)
    expect(low.items.every((i: { isLow: boolean }) => i.isLow)).toBe(true);
    const paged = await get("?pageSize=2&page=2");
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(3);
  });

  it("GET /stock/movements: ໃໝ່→ເກົ່າ, ມີ sku/ຊື່ຜູ້ເຮັດ, filter type/variantId", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -1, note: "x" });
    await post("/stock/receive", { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 3 });

    const all = (await request(server()).get("/stock/movements").set(reader).expect(200)).body;
    expect(all.total).toBe(3);
    expect(all.items[0]).toMatchObject({ type: "RECEIVE", sku: "SKU-2", quantity: 3, actorName: "INV_WRITE" });

    const byType = (await request(server()).get("/stock/movements?type=ADJUST").set(reader).expect(200)).body;
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].quantity).toBe(-1);

    const byVariant = (await request(server()).get(`/stock/movements?variantId=${f.v2.id}`).set(reader).expect(200)).body;
    expect(byVariant.total).toBe(1);
  });
});

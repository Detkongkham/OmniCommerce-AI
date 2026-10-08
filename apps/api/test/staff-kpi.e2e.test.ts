import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedBasics, seedCatalog, seedConversation } from "./helpers";
import { makeOrder, storeTime } from "./report-fixtures";

describe("Staff KPI (/staff-kpi)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let owner: { Authorization: string };
  let ids: Awaited<ReturnType<typeof seedBasics>>;
  let catalog: Awaited<ReturnType<typeof seedCatalog>>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    ids = await seedBasics(db);
    catalog = await seedCatalog(db);
    owner = await bearerFor(app, "owner@test.local");
  });

  const line = () => ({ variantId: catalog.v1.id, warehouseId: catalog.whA.id, unitPrice: "100.00", unitCost: "60.00", quantity: 1 });
  const rowOf = (body: { rows: { user: { id: string } }[] }, id: string) => body.rows.find((row) => row.user.id === id);

  it("ນັບບິນ/ຍອດປິດການຂາຍ ຕາມຜູ້ເປີດບິນ ແລະ ຊ່ວງວັນທີ (ເວລາຮ້ານ)", async () => {
    const viewer = ids.viewerUser.id;
    await makeOrder(db, { createdById: viewer, status: "PAID", createdAt: storeTime("2026-10-01T00:30:00"), items: [line()] });
    await makeOrder(db, { createdById: viewer, status: "COMPLETED", createdAt: storeTime("2026-10-02T23:59:00"), items: [line(), { ...line(), variantId: catalog.v2.id }] });
    await makeOrder(db, { createdById: viewer, status: "CANCELLED", createdAt: storeTime("2026-10-02T10:00:00"), items: [line()] });
    await makeOrder(db, { createdById: viewer, status: "PENDING_PAYMENT", createdAt: storeTime("2026-10-02T10:00:00"), items: [line()] });
    // ນອກຊ່ວງ (23:59 ຂອງ 30/09 ເວລາຮ້ານ) ແລະ ບິນລະບົບ (CF)
    await makeOrder(db, { createdById: viewer, createdAt: storeTime("2026-09-30T23:59:00"), items: [line()] });
    await makeOrder(db, { createdById: null, createdAt: storeTime("2026-10-01T10:00:00"), items: [line()] });

    const res = await request(app.getHttpServer()).get("/staff-kpi?from=2026-10-01&to=2026-10-02").set(owner).expect(200);
    expect(res.body).toMatchObject({ from: "2026-10-01", to: "2026-10-02" });
    expect(rowOf(res.body, viewer)).toMatchObject({
      user: { id: viewer, name: "Viewer", roleName: "VIEWER", isActive: true },
      ordersCreated: 4,
      salesClosed: 2,
      salesAmount: "300.00",
    });
    expect(rowOf(res.body, ids.ownerUser.id)).toMatchObject({ ordersCreated: 0, salesAmount: "0.00", avgResponseSeconds: null });
    // ລຽງຍອດຂາຍຫຼາຍ→ໜ້ອຍ
    expect(res.body.rows[0].user.id).toBe(viewer);
  });

  it("ບິນຈາກ POST /orders ບັນທຶກ createdById; ກ່ອງທີ່ຍິງກວດ, ship/cancel ແລະ ADJUST ຖືກນັບໃຫ້ຜູ້ກະທຳ", async () => {
    await db.$transaction((tx) => receive(tx, { variantId: catalog.v1.id, warehouseId: catalog.whA.id, quantity: 10 }, {}));
    const create = () =>
      request(app.getHttpServer())
        .post("/orders")
        .set(owner)
        .send({ items: [{ variantId: catalog.v1.id, quantity: 1 }] })
        .expect(201);
    const a = (await create()).body as { id: string };
    const b = (await create()).body as { id: string };
    expect((await db.order.findUniqueOrThrow({ where: { id: a.id } })).createdById).toBe(ids.ownerUser.id);

    // ແພັກຜ່ານສະຖານີແພັກ (ໂມດູນ 8): start → ຍິງກວດຄົບ = 1 ກ່ອງ; ແລ້ວສົ່ງ
    await request(app.getHttpServer()).post(`/orders/${a.id}/pay`).set(owner).expect(200);
    await request(app.getHttpServer()).post(`/fulfillment/${a.id}/start`).set(owner).expect(200);
    await request(app.getHttpServer())
      .post(`/fulfillment/${a.id}/verify`)
      .set(owner)
      .send({ scans: [{ code: "SKU-1", quantity: 1 }] })
      .expect(200);
    await request(app.getHttpServer()).post(`/orders/${a.id}/ship`).set(owner).expect(200);
    await request(app.getHttpServer()).post(`/orders/${b.id}/cancel`).set(owner).send({ reason: "test" }).expect(200);
    await request(app.getHttpServer())
      .post("/stock/adjust")
      .set(owner)
      .send({ variantId: catalog.v1.id, warehouseId: catalog.whA.id, delta: -1, note: "broken" })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const res = await request(app.getHttpServer()).get(`/staff-kpi?from=${today}&to=${today}`).set(owner).expect(200);
    expect(rowOf(res.body, ids.ownerUser.id)).toMatchObject({
      ordersCreated: 2,
      salesClosed: 1,
      salesAmount: "100.00",
      ordersPacked: 1,
      ordersShipped: 1,
      ordersCancelled: 1,
      stockAdjustments: 1,
    });
  });

  it("ເວລາຕອບແຊັດ: ຮອບ IN ຕິດກັນນັບຄັ້ງດຽວ, OUT ຂອງລະບົບ ແລະ FAILED ບໍ່ນັບ", async () => {
    const viewer = ids.viewerUser.id;
    const conv = await seedConversation(db);
    const conv2 = await seedConversation(db);
    const msg = (conversationId: string, direction: "IN" | "OUT", at: string, extra: { sentByUserId?: string; status?: "SENT" | "FAILED" } = {}) =>
      db.message.create({ data: { conversationId, direction, text: "x", createdAt: storeTime(at), ...extra } });
    // ຮອບ 1: IN, IN (ຕິດກັນ) → viewer ຕອບຫຼັງ 60 ວິ ຈາກ IN ທຳອິດ
    await msg(conv.id, "IN", "2026-10-03T09:00:00");
    await msg(conv.id, "IN", "2026-10-03T09:00:30");
    await msg(conv.id, "OUT", "2026-10-03T09:00:50", { sentByUserId: viewer, status: "FAILED" });
    await msg(conv.id, "OUT", "2026-10-03T09:01:00", { sentByUserId: viewer });
    // ຮອບ 2: IN → owner ຕອບຫຼັງ 300 ວິ
    await msg(conv.id, "IN", "2026-10-03T10:00:00");
    await msg(conv.id, "OUT", "2026-10-03T10:05:00", { sentByUserId: ids.ownerUser.id });
    // ຮອບ 3: IN → viewer ຕອບຫຼັງ 180 ວິ (ສະເລ່ຍ viewer = 120)
    await msg(conv2.id, "IN", "2026-10-03T11:00:00");
    await msg(conv2.id, "OUT", "2026-10-03T11:03:00", { sentByUserId: viewer });
    await msg(conv2.id, "OUT", "2026-10-03T11:04:00", { sentByUserId: viewer });
    // ຮອບ 4: ລະບົບຕອບກ່ອນ (ບໍ່ມີ sentByUserId) → ບໍ່ນັບໃຫ້ໃຜ
    await msg(conv2.id, "IN", "2026-10-03T12:00:00");
    await msg(conv2.id, "OUT", "2026-10-03T12:00:01");
    await msg(conv2.id, "OUT", "2026-10-03T12:10:00", { sentByUserId: ids.ownerUser.id });

    const res = await request(app.getHttpServer()).get("/staff-kpi?from=2026-10-03&to=2026-10-03").set(owner).expect(200);
    expect(rowOf(res.body, viewer)).toMatchObject({ responses: 2, avgResponseSeconds: 120, messagesSent: 3 });
    expect(rowOf(res.body, ids.ownerUser.id)).toMatchObject({ responses: 1, avgResponseSeconds: 300, messagesSent: 2 });
  });

  it("daily: ຄົບທຸກມື້, ຜູ້ໃຊ້ບໍ່ພົບ = 404", async () => {
    const viewer = ids.viewerUser.id;
    await makeOrder(db, { createdById: viewer, createdAt: storeTime("2026-10-02T08:00:00"), items: [line()] });
    const res = await request(app.getHttpServer())
      .get(`/staff-kpi/${viewer}/daily?from=2026-10-01&to=2026-10-03`)
      .set(owner)
      .expect(200);
    expect(res.body.user.id).toBe(viewer);
    expect(res.body.days.map((day: { date: string }) => day.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(res.body.days[1]).toMatchObject({ ordersCreated: 1, salesClosed: 1, salesAmount: "100.00" });
    expect(res.body.days[0]).toMatchObject({ ordersCreated: 0, salesAmount: "0.00" });
    const missing = await request(app.getHttpServer()).get("/staff-kpi/nope/daily?from=2026-10-01&to=2026-10-03").set(owner).expect(404);
    expect(missing.body.code).toBe("USER_NOT_FOUND");
  });

  it("ຊ່ວງວັນທີຜິດ = 400; ບໍ່ມີ staff:read = 403", async () => {
    await request(app.getHttpServer()).get("/staff-kpi").set(owner).expect(400);
    await request(app.getHttpServer()).get("/staff-kpi?from=2026-10-05&to=2026-10-01").set(owner).expect(400);
    await request(app.getHttpServer()).get("/staff-kpi?from=2024-01-01&to=2026-01-01").set(owner).expect(400);
    const role = await db.role.create({ data: { name: "NONE", permissions: { create: [{ permission: "orders:read" }] } } });
    await db.user.create({ data: { email: "none@test.local", name: "None", passwordHash: (await db.user.findFirstOrThrow()).passwordHash, roleId: role.id } });
    const none = await bearerFor(app, "none@test.local");
    await request(app.getHttpServer()).get("/staff-kpi?from=2026-10-01&to=2026-10-01").set(none).expect(403);
  });
});

describe("Audit trail (/audit-logs)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let owner: { Authorization: string };
  let ids: Awaited<ReturnType<typeof seedBasics>>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    ids = await seedBasics(db);
    owner = await bearerFor(app, "owner@test.local");
    await db.auditLog.deleteMany();
    const at = (local: string) => storeTime(local);
    await db.auditLog.createMany({
      data: [
        { userId: ids.ownerUser.id, action: "order.create", entity: "Order", entityId: "o1", createdAt: at("2026-10-01T09:00:00") },
        { userId: ids.ownerUser.id, action: "order.cancel", entity: "Order", entityId: "o1", after: { status: "CANCELLED" }, createdAt: at("2026-10-02T09:00:00") },
        { userId: ids.viewerUser.id, action: "variant.update", entity: "ProductVariant", entityId: "v1", before: { price: "10.00", costPrice: "5.00" }, after: { price: "12.00", costPrice: "6.00" }, ip: "1.2.3.4", createdAt: at("2026-10-03T09:00:00") },
        { userId: null, action: "auth.login_failed", entity: "User", createdAt: at("2026-10-04T09:00:00") },
      ],
    });
  });

  it("ລຽງໃໝ່→ເກົ່າ, ມີຜູ້ໃຊ້, ແບ່ງໜ້າ", async () => {
    const res = await request(app.getHttpServer()).get("/audit-logs?pageSize=2").set(owner).expect(200);
    expect(res.body.total).toBe(4);
    expect(res.body.items.map((row: { action: string }) => row.action)).toEqual(["auth.login_failed", "variant.update"]);
    expect(res.body.items[0].user).toBeNull();
    expect(res.body.items[1]).toMatchObject({ user: { id: ids.viewerUser.id, name: "Viewer" }, ip: "1.2.3.4", entityId: "v1" });
  });

  it("ກັ່ນຕອງ: ຜູ້ໃຊ້, action ກົງ/prefix, entity+entityId, ວັນທີ", async () => {
    const get = async (qs: string) =>
      ((await request(app.getHttpServer()).get(`/audit-logs?${qs}`).set(owner).expect(200)).body.items as { action: string }[]).map((row) => row.action);
    expect(await get(`userId=${ids.ownerUser.id}`)).toEqual(["order.cancel", "order.create"]);
    expect(await get("action=order.*")).toEqual(["order.cancel", "order.create"]);
    expect(await get("action=order.create")).toEqual(["order.create"]);
    expect(await get("entity=Order&entityId=o1")).toEqual(["order.cancel", "order.create"]);
    expect(await get("from=2026-10-02&to=2026-10-03")).toEqual(["variant.update", "order.cancel"]);
    await request(app.getHttpServer()).get("/audit-logs?action=order.%25").set(owner).expect(400);
  });

  it("ຜູ້ບໍ່ມີ costs:read ບໍ່ເຫັນ costPrice ໃນ before/after", async () => {
    const viewer = await bearerFor(app, "viewer@test.local");
    const res = await request(app.getHttpServer()).get("/audit-logs?action=variant.update").set(viewer).expect(200);
    expect(res.body.items[0].before).toEqual({ price: "10.00" });
    expect(res.body.items[0].after).toEqual({ price: "12.00" });
    const full = await request(app.getHttpServer()).get("/audit-logs?action=variant.update").set(owner).expect(200);
    expect(full.body.items[0].after).toEqual({ price: "12.00", costPrice: "6.00" });
  });

  it("facets: action ແລະ entity ບໍ່ຊ້ຳ", async () => {
    const res = await request(app.getHttpServer()).get("/audit-logs/facets").set(owner).expect(200);
    expect(res.body.actions).toEqual(expect.arrayContaining(["order.cancel", "order.create", "variant.update", "auth.login_failed"]));
    expect(res.body.entities).toEqual(expect.arrayContaining(["Order", "ProductVariant", "User"]));
  });
});

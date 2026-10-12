import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCustomerOrder, seedCustomerOrders } from "./crm-fixtures";
import { bearerFor, createTestApp, resetDb, seedConversation, seedRoleUsers } from "./helpers";

describe("crm customers (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let warehouse: { Authorization: string };
  const server = () => app.getHttpServer();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    for (const key of Object.keys(ids)) delete ids[key];
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
    warehouse = await bearerFor(app, "warehouse@role.test");
  });

  /** ລູກຄ້າ 7 ຄົນ ກວມທຸກກຸ່ມ. ຍອດຊື້: A 10000, D 2000, B 900, F 400, C 50, E 40 */
  async function seedSegments() {
    const make = async (key: string, name: string, phone: string | null) => {
      // createdAt ຫ່າງກັນ 1 ວິ: ການລຽງ "created" ບໍ່ຂຶ້ນກັບຄວາມໄວຂອງ insert
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Object.keys(ids).length));
      const row = await db.customer.create({ data: { name, phone, createdAt } });
      ids[key] = row.id;
      return row.id;
    };
    await seedCustomerOrders(db, await make("A", "Anou Champion", "02055550001"), 10, 5, "1000.00"); // R5 F5 M5
    await seedCustomerOrders(db, await make("B", "Bounmy Loyal", "02055550002"), 3, 80, "300.00"); // R3 F3
    await seedCustomerOrders(db, await make("C", "Chan New", "02055550003"), 1, 10, "50.00"); // R5 F1
    await seedCustomerOrders(db, await make("D", "Deng Risk", "02055550004"), 4, 150, "500.00"); // R2 F3
    await seedCustomerOrders(db, await make("E", "Eak Lost", "02055550005"), 1, 400, "40.00"); // R1 F1 M1
    await seedCustomerOrders(db, await make("F", "Fa Regular", "02055550006"), 2, 70, "200.00"); // R3 F2
    const g = await make("G", "Gai Prospect", null);
    await seedCustomerOrder(db, g, { status: "PENDING_PAYMENT" });
    await seedCustomerOrder(db, g, { status: "CANCELLED" });
  }
  const list = (query = "", auth = manager) => request(server()).get(`/crm/customers${query}`).set(auth);

  describe("GET /crm/customers", () => {
    beforeEach(seedSegments);

    it("ສະຖິຕິ ແລະ ກຸ່ມ RFM ຂອງແຕ່ລະຄົນ; ບິນຄ້າງຈ່າຍ/ຍົກເລີກບໍ່ນັບ", async () => {
      const res = await list("?pageSize=50").expect(200);
      expect(res.body).toMatchObject({ total: 7, page: 1, pageSize: 50 });
      const byName = Object.fromEntries(res.body.items.map((row: { name: string }) => [row.name.split(" ")[0], row]));
      expect(byName.Anou).toMatchObject({ orderCount: 10, totalSpent: "10000.00", segment: "CHAMPION", phone: "02055550001" });
      expect(byName.Bounmy).toMatchObject({ orderCount: 3, totalSpent: "900.00", segment: "LOYAL" });
      expect(byName.Chan).toMatchObject({ orderCount: 1, segment: "NEW" });
      expect(byName.Deng).toMatchObject({ orderCount: 4, segment: "AT_RISK" });
      expect(byName.Eak).toMatchObject({ orderCount: 1, segment: "LOST" });
      expect(byName.Fa).toMatchObject({ orderCount: 2, segment: "REGULAR" });
      expect(byName.Gai).toMatchObject({ orderCount: 0, totalSpent: "0.00", lastPaidAt: null, segment: null });
      expect(typeof byName.Anou.lastPaidAt).toBe("string");
    });

    it("ລຽງ: lastOrder (ຄ່າເລີ່ມ, ບໍ່ເຄີຍຊື້ຢູ່ທ້າຍ), spent, created", async () => {
      const names = async (query: string) => (await list(query).expect(200)).body.items.map((row: { name: string }) => row.name.split(" ")[0]);
      expect(await names("")).toEqual(["Anou", "Chan", "Fa", "Bounmy", "Deng", "Eak", "Gai"]);
      expect(await names("?sort=spent")).toEqual(["Anou", "Deng", "Bounmy", "Fa", "Chan", "Eak", "Gai"]);
      expect((await names("?sort=created"))[0]).toBe("Gai");
    });

    it("ຄົ້ນຊື່ (ບໍ່ສົນຕົວພິມ) ຫຼື ເບີ; ກັ່ນຕອງກຸ່ມ; ແບ່ງໜ້າ", async () => {
      expect((await list("?q=deng").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.D]);
      expect((await list("?q=5550003").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.C]);
      // ຕົວອັກສອນພິເສດຂອງ LIKE ບໍ່ຖືກຕີຄວາມເປັນ wildcard
      expect((await list("?q=%25").expect(200)).body.total).toBe(0);
      const risk = await list("?segment=AT_RISK").expect(200);
      expect(risk.body).toMatchObject({ total: 1 });
      expect(risk.body.items[0].id).toBe(ids.D);
      const page2 = await list("?pageSize=3&page=2").expect(200);
      expect(page2.body).toMatchObject({ total: 7, page: 2, pageSize: 3 });
      expect(page2.body.items).toHaveLength(3);
    });

    it("query ຜິດ → 400", async () => {
      await list("?segment=VIP").expect(400);
      await list("?sort=name").expect(400);
    });
  });

  describe("GET /crm/customers/segments", () => {
    it("ຈຳນວນຕໍ່ກຸ່ມ + ຄົນທີ່ຍັງບໍ່ເຄີຍຊື້", async () => {
      await seedSegments();
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 7, noOrders: 1, segments: { CHAMPION: 1, LOYAL: 1, NEW: 1, AT_RISK: 1, LOST: 1, REGULAR: 1 } });
    });
    it("ບໍ່ມີລູກຄ້າ: ທຸກຄ່າເປັນ 0", async () => {
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 0, noOrders: 0, segments: { CHAMPION: 0, LOYAL: 0, NEW: 0, AT_RISK: 0, LOST: 0, REGULAR: 0 } });
    });
  });

  describe("ສິດ", () => {
    it("crm:read ອ່ານໄດ້; ບໍ່ມີ crm:read → 403; ບໍ່ login → 401", async () => {
      await list("", chat).expect(200);
      await list("", warehouse).expect(403);
      await request(server()).get("/crm/customers").expect(401);
      await request(server()).get("/crm/customers/segments").set(warehouse).expect(403);
    });
  });

  describe("GET /crm/customers/:id", () => {
    it("ຂໍ້ມູນ + ສະຖິຕິ + ຄະແນນ R/F/M", async () => {
      await seedSegments();
      await db.customer.update({ where: { id: ids.A }, data: { note: "ມັກສີແດງ", facebookUserId: "FB_A" } });
      await seedCustomerOrder(db, ids.A, { status: "PENDING_PAYMENT" });
      await seedConversation(db, { customerId: ids.A });
      const res = await request(server()).get(`/crm/customers/${ids.A}`).set(chat).expect(200);
      expect(res.body).toMatchObject({
        id: ids.A,
        name: "Anou Champion",
        phone: "02055550001",
        email: null,
        note: "ມັກສີແດງ",
        facebookLinked: true,
        orderCount: 10,
        totalSpent: "10000.00",
        averageOrder: "1000.00",
        openOrderCount: 1,
        conversationCount: 1,
        segment: "CHAMPION",
        rfm: { recency: 5, frequency: 5, monetary: 5 },
      });
      expect(new Date(res.body.firstPaidAt).getTime()).toBeLessThan(new Date(res.body.lastPaidAt).getTime());
    });

    it("ຍັງບໍ່ເຄີຍຊື້: ສະຖິຕິ 0, segment/rfm null", async () => {
      await seedSegments();
      const res = await request(server()).get(`/crm/customers/${ids.G}`).set(manager).expect(200);
      expect(res.body).toMatchObject({ orderCount: 0, totalSpent: "0.00", averageOrder: "0.00", firstPaidAt: null, lastPaidAt: null, openOrderCount: 1, segment: null, rfm: null, facebookLinked: false });
    });

    it("ບໍ່ພົບ → 404 CUSTOMER_NOT_FOUND; ບໍ່ມີສິດ → 403", async () => {
      const res = await request(server()).get("/crm/customers/nope").set(manager).expect(404);
      expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
      await request(server()).get("/crm/customers/nope").set(warehouse).expect(403);
    });
  });

  describe("ແຖບຂອງລູກຄ້າ", () => {
    it("orders: ທຸກສະຖານະ ໃໝ່ສຸດກ່ອນ ແບ່ງໜ້າ", async () => {
      await seedSegments();
      const res = await request(server()).get(`/crm/customers/${ids.G}/orders`).set(manager).expect(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(res.body.items.map((row: { status: string }) => row.status).sort()).toEqual(["CANCELLED", "PENDING_PAYMENT"]);
      expect(res.body.items[0]).toEqual({
        id: expect.any(String),
        orderNumber: expect.stringMatching(/^CRM-/),
        status: expect.any(String),
        channel: "OFFLINE",
        total: "100.00",
        createdAt: expect.any(String),
      });
      const paged = await request(server()).get(`/crm/customers/${ids.A}/orders?pageSize=4&page=3`).set(manager).expect(200);
      expect(paged.body).toMatchObject({ total: 10, page: 3, pageSize: 4 });
      expect(paged.body.items).toHaveLength(2);
    });

    it("conversations: ເຄສຂອງລູກຄ້າ ຫຼ້າສຸດກ່ອນ", async () => {
      await seedSegments();
      await seedConversation(db, { customerId: ids.B, displayName: "Old", lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      await seedConversation(db, { customerId: ids.B, displayName: "Recent", lastMessageAt: new Date("2026-10-10T00:00:00Z"), lastMessagePreview: "ສະບາຍດີ" });
      await seedConversation(db, { customerId: ids.A });
      const res = await request(server()).get(`/crm/customers/${ids.B}/conversations`).set(manager).expect(200);
      expect(res.body.map((row: { displayName: string }) => row.displayName)).toEqual(["Recent", "Old"]);
      expect(res.body[0]).toMatchObject({ channel: "FACEBOOK", status: "OPEN", lastMessagePreview: "ສະບາຍດີ" });
    });

    it("ລູກຄ້າບໍ່ພົບ → 404", async () => {
      await request(server()).get("/crm/customers/nope/orders").set(manager).expect(404);
      await request(server()).get("/crm/customers/nope/conversations").set(manager).expect(404);
    });
  });

  describe("PATCH /crm/customers/:id", () => {
    it("ແກ້ຊື່/ເບີ/ອີເມວ/ບັນທຶກ + audit; ຄ່າເປົ່າ = ລ້າງ", async () => {
      const row = await db.customer.create({ data: { name: "Old", phone: "02011111111", email: "old@x.co" } });
      const res = await request(server())
        .patch(`/crm/customers/${row.id}`)
        .set(manager)
        .send({ name: " ມະລິ ", phone: "02022222222", email: "", note: "ລູກຄ້າປະຈຳ" })
        .expect(200);
      expect(res.body).toMatchObject({ id: row.id, name: "ມະລິ", phone: "02022222222", email: null, note: "ລູກຄ້າປະຈຳ" });
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.update", entityId: row.id } });
      expect(audit.before).toMatchObject({ name: "Old", phone: "02011111111" });
      expect(audit.after).toMatchObject({ name: "ມະລິ", phone: "02022222222" });
    });

    it("ເບີຊ້ຳກັບຄົນອື່ນ → 409 CUSTOMER_PHONE_TAKEN ພ້ອມ customerId; ເບີເດີມຂອງຕົນເອງ ຜ່ານ", async () => {
      const owner = await db.customer.create({ data: { name: "Owner", phone: "02033333333" } });
      const other = await db.customer.create({ data: { name: "Other", phone: "02044444444" } });
      const res = await request(server()).patch(`/crm/customers/${other.id}`).set(manager).send({ phone: "02033333333" }).expect(409);
      expect(res.body).toMatchObject({ code: "CUSTOMER_PHONE_TAKEN", customerId: owner.id });
      await request(server()).patch(`/crm/customers/${other.id}`).set(manager).send({ phone: "02044444444", name: "Other 2" }).expect(200);
    });

    it("body ຜິດ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403", async () => {
      const row = await db.customer.create({ data: { name: "X" } });
      await request(server()).patch(`/crm/customers/${row.id}`).set(manager).send({}).expect(400);
      await request(server()).patch(`/crm/customers/${row.id}`).set(manager).send({ phone: "abc" }).expect(400);
      await request(server()).patch("/crm/customers/nope").set(manager).send({ name: "Y" }).expect(404);
      await request(server()).patch(`/crm/customers/${row.id}`).set(chat).send({ name: "Y" }).expect(403);
    });
  });

  describe("POST /crm/customers/:id/merge", () => {
    it("ຍ້າຍບິນ + ແຊັດ, ເຕີມຊ່ອງທີ່ຫວ່າງຂອງ target, ລຶບ source, audit", async () => {
      const target = await db.customer.create({ data: { name: "ມະລິ (ເວັບ)", phone: "02055550001" } });
      const source = await db.customer.create({ data: { name: "Mali FB", facebookUserId: "FB_1", email: "mali@x.co", note: "ຈາກ Live" } });
      await seedCustomerOrders(db, target.id, 1, 3, "100.00");
      await seedCustomerOrders(db, source.id, 2, 5, "200.00");
      const conversation = await seedConversation(db, { customerId: source.id });

      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({
        id: target.id,
        name: "ມະລິ (ເວັບ)",
        phone: "02055550001",
        email: "mali@x.co",
        note: "ຈາກ Live",
        facebookLinked: true,
        orderCount: 3,
        totalSpent: "500.00",
        conversationCount: 1,
      });
      expect(await db.customer.findUnique({ where: { id: source.id } })).toBeNull();
      expect(await db.order.count({ where: { customerId: target.id } })).toBe(3);
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBe(target.id);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.merge", entityId: target.id } });
      expect(audit.before).toMatchObject({ source: { id: source.id, name: "Mali FB", facebookUserId: "FB_1" } });
      expect(audit.after).toMatchObject({ movedOrders: 2, movedConversations: 1 });
    });

    it("ທັງສອງມີເບີ/Facebook: target ຮັກສາຂອງຕົນ, ຂອງ source ຖືກຖິ້ມ", async () => {
      const target = await db.customer.create({ data: { name: "T", phone: "02011111111", facebookUserId: "FB_T", note: "T note" } });
      const source = await db.customer.create({ data: { name: "S", phone: "02022222222", facebookUserId: "FB_S", note: "S note" } });
      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({ phone: "02011111111", note: "T note" });
      expect((await db.customer.findUniqueOrThrow({ where: { id: target.id } })).facebookUserId).toBe("FB_T");
      // ເບີທີ່ຖືກຖິ້ມ ວ່າງໃຫ້ລູກຄ້າໃໝ່ໃຊ້ໄດ້
      expect(await db.customer.findUnique({ where: { phone: "02022222222" } })).toBeNull();
    });

    it("ລວມເຂົ້າຕົວເອງ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403; ລົ້ມ = ບໍ່ມີຫຍັງປ່ຽນ", async () => {
      const target = await db.customer.create({ data: { name: "T" } });
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: target.id }).expect(400);
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: "nope" }).expect(404);
      await request(server()).post("/crm/customers/nope/merge").set(manager).send({ sourceId: target.id }).expect(404);
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(chat).send({ sourceId: "x" }).expect(403);
      expect(await db.customer.count()).toBe(1);
      expect(await db.auditLog.count({ where: { action: "customer.merge" } })).toBe(0);
    });
  });
});

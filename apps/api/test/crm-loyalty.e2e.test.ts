import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCustomerOrder } from "./crm-fixtures";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("crm loyalty (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
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
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
  });
  const adjust = (id: string, body: object, auth = manager) => request(server()).post(`/crm/customers/${id}/points/adjust`).set(auth).send(body);

  describe("ການຕັ້ງຄ່າຮ້ານ", () => {
    it("ຄ່າເລີ່ມຕົ້ນ: ປິດ, 10000 ກີບ/ແຕ້ມ, 100 ກີບ/ແຕ້ມ, 50%, 4 ລະດັບ", async () => {
      const res = await request(server()).get("/settings/store").set(manager).expect(200);
      expect(res.body).toMatchObject({ loyaltyEnabled: false, pointsEarnPer: "10000.00", pointValue: "100.00", pointsMaxRedeemPercent: 50 });
      expect(res.body.tierRules.map((rule: { tier: string }) => rule.tier)).toEqual(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
      expect(res.body.tierRules[1]).toEqual({ tier: "SILVER", minSpend: "2000000", multiplier: "1.25" });
    });

    it("PATCH ບັນທຶກ ແລະ ກວດ tierRules", async () => {
      const tierRules = [
        { tier: "BRONZE", minSpend: "0", multiplier: "1" },
        { tier: "SILVER", minSpend: "1000000", multiplier: "1.5" },
        { tier: "GOLD", minSpend: "3000000", multiplier: "2" },
        { tier: "PLATINUM", minSpend: "6000000", multiplier: "3" },
      ];
      const res = await request(server())
        .patch("/settings/store")
        .set(manager)
        .send({ loyaltyEnabled: true, pointsEarnPer: "5000", pointValue: "50", pointsMaxRedeemPercent: 30, tierRules })
        .expect(200);
      expect(res.body).toMatchObject({ loyaltyEnabled: true, pointsEarnPer: "5000.00", pointValue: "50.00", pointsMaxRedeemPercent: 30, tierRules });
      await request(server()).patch("/settings/store").set(manager).send({ tierRules: tierRules.slice(0, 3) }).expect(400);
      await request(server()).patch("/settings/store").set(manager).send({ pointsEarnPer: "0" }).expect(400);
    });
  });

  describe("POST /crm/customers/:id/points/adjust", () => {
    it("ບວກ/ລົບ ພ້ອມເຫດຜົນ, ຍອດບໍ່ຕິດລົບ, audit, ສະໝຸດໃໝ່ສຸດກ່ອນ", async () => {
      const row = await db.customer.create({ data: { name: "ມະລິ", phone: "02055550001" } });
      const plus = await adjust(row.id, { points: 120, note: "ຊົດເຊີຍສິນຄ້າຊ້າ" }).expect(200);
      expect(plus.body).toMatchObject({ id: row.id, pointsBalance: 120 });
      const minus = await adjust(row.id, { points: -20, note: "ແກ້ໄຂ" }).expect(200);
      expect(minus.body.pointsBalance).toBe(100);
      const over = await adjust(row.id, { points: -500, note: "ຜິດ" }).expect(409);
      expect(over.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT", balance: 100 });

      const ledger = await request(server()).get(`/crm/customers/${row.id}/points`).set(chat).expect(200);
      expect(ledger.body).toMatchObject({ total: 2, page: 1 });
      expect(ledger.body.items[0]).toEqual({
        id: expect.any(String),
        type: "ADJUST",
        points: -20,
        balanceAfter: 100,
        note: "ແກ້ໄຂ",
        orderId: null,
        orderNumber: null,
        createdAt: expect.any(String),
      });
      expect(ledger.body.items[1]).toMatchObject({ points: 120, balanceAfter: 120 });
      const audit = await db.auditLog.findMany({ where: { action: "customer.points.adjust", entityId: row.id } });
      expect(audit).toHaveLength(2);
      expect(audit[0]?.after).toMatchObject({ points: expect.any(Number), balance: expect.any(Number), note: expect.any(String) });
    });

    it("body ຜິດ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403", async () => {
      const row = await db.customer.create({ data: { name: "X" } });
      await adjust(row.id, { points: 0, note: "x" }).expect(400);
      await adjust(row.id, { points: 5 }).expect(400);
      await adjust("nope", { points: 5, note: "x" }).expect(404);
      await adjust(row.id, { points: 5, note: "x" }, chat).expect(403);
      await request(server()).get("/crm/customers/nope/points").set(manager).expect(404);
    });

    it("ສະໝຸດສະແດງເລກບິນຂອງແຖວທີ່ມາຈາກບິນ", async () => {
      const row = await db.customer.create({ data: { name: "X", pointsBalance: 50 } });
      const order = await seedCustomerOrder(db, row.id, { subtotal: "500.00" });
      await db.pointEntry.create({ data: { customerId: row.id, orderId: order.id, type: "EARN", points: 50, balanceAfter: 50 } });
      const ledger = await request(server()).get(`/crm/customers/${row.id}/points`).set(manager).expect(200);
      expect(ledger.body.items[0]).toMatchObject({ type: "EARN", orderId: order.id, orderNumber: order.orderNumber });
    });
  });

  describe("ລະດັບ ແລະ ແຕ້ມ ໃນລາຍຊື່/ລາຍລະອຽດ", () => {
    it("list: tier + pointsBalance, ກັ່ນຕອງ tier, ລຽງ points; segments ນັບຕໍ່ລະດັບ", async () => {
      await db.customer.create({ data: { name: "Gold", tier: "GOLD", pointsBalance: 300 } });
      await db.customer.create({ data: { name: "Silver", tier: "SILVER", pointsBalance: 900 } });
      await db.customer.create({ data: { name: "Plain" } });
      const all = await request(server()).get("/crm/customers?sort=points").set(manager).expect(200);
      expect(all.body.items.map((item: { name: string }) => item.name)).toEqual(["Silver", "Gold", "Plain"]);
      expect(all.body.items[0]).toMatchObject({ tier: "SILVER", pointsBalance: 900 });
      const gold = await request(server()).get("/crm/customers?tier=GOLD").set(manager).expect(200);
      expect(gold.body.items.map((item: { name: string }) => item.name)).toEqual(["Gold"]);
      expect(gold.body.total).toBe(1);
      const summary = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(summary.body.tiers).toEqual({ BRONZE: 1, SILVER: 1, GOLD: 1, PLATINUM: 0 });
    });

    it("detail: ຍອດຊື້ 12 ເດືອນ ແລະ ລະດັບຖັດໄປ (ຕາມ tierRules ຂອງຮ້ານ)", async () => {
      const row = await db.customer.create({ data: { name: "ມະລິ", tier: "SILVER", pointsBalance: 42 } });
      await seedCustomerOrder(db, row.id, { subtotal: "2500000.00", paidDaysAgo: 30 });
      await seedCustomerOrder(db, row.id, { subtotal: "9000000.00", paidDaysAgo: 400 });
      const res = await request(server()).get(`/crm/customers/${row.id}`).set(manager).expect(200);
      expect(res.body).toMatchObject({
        tier: "SILVER",
        pointsBalance: 42,
        spend12m: "2500000.00",
        nextTier: { tier: "GOLD", remaining: "2500000.00" },
        totalSpent: "11500000.00",
      });
    });

    it("merge: ຍ້າຍແຕ້ມ + ສະໝຸດ ແລະ ຄິດລະດັບໃໝ່", async () => {
      await db.storeSetting.create({ data: { id: 1, name: "T", loyaltyEnabled: true } });
      const target = await db.customer.create({ data: { name: "T", phone: "02011111111", pointsBalance: 10 } });
      const source = await db.customer.create({ data: { name: "S", facebookUserId: "FB_S", pointsBalance: 40 } });
      await db.pointEntry.create({ data: { customerId: source.id, type: "ADJUST", points: 40, balanceAfter: 40, note: "seed" } });
      await seedCustomerOrder(db, source.id, { subtotal: "2500000.00", paidDaysAgo: 5 });
      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({ pointsBalance: 50, tier: "SILVER", orderCount: 1 });
      expect(await db.pointEntry.count({ where: { customerId: target.id } })).toBe(1);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.merge" } });
      expect(audit.after).toMatchObject({ movedPoints: 40 });
    });
  });
});

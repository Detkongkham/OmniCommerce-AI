import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, expireOrder, receive, runRecomputeMemberTiers } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../src/common/auth-types";
import { OrdersService } from "../src/modules/orders/orders.service";
import { seedCustomerOrder } from "./crm-fixtures";
import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedRoleUsers } from "./helpers";

const PHONE = "02055555555";
const TIERS = [
  { tier: "BRONZE", minSpend: "0", multiplier: "1" },
  { tier: "SILVER", minSpend: "400", multiplier: "2" },
  { tier: "GOLD", minSpend: "5000", multiplier: "3" },
  { tier: "PLATINUM", minSpend: "10000", multiplier: "4" },
];

describe("loyalty points (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let f: Awaited<ReturnType<typeof seedCatalog>>;
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
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 100 }));
    // 10 ກີບ = 1 ແຕ້ມ, 1 ແຕ້ມ = 1 ກີບ, ໃຊ້ໄດ້ບໍ່ເກີນ 50% ຂອງຍອດ; VAT 0 ເພື່ອໃຫ້ total = subtotal
    await db.storeSetting.create({
      data: { id: 1, name: "T", vatRate: "0", loyaltyEnabled: true, pointsEarnPer: "10", pointValue: "1", pointsMaxRedeemPercent: 50, tierRules: TIERS },
    });
  });

  /** ບິນ 5 x 100 = 500 ຂອງລູກຄ້າ PHONE */
  const order = (body: object = {}) =>
    request(server())
      .post("/orders")
      .set(chat)
      .send({ items: [{ variantId: f.v1.id, quantity: 5 }], customer: { name: "ກ", phone: PHONE }, ...body });
  const pay = (id: string) => request(server()).post(`/orders/${id}/pay`).set(manager);
  const cancel = (id: string) => request(server()).post(`/orders/${id}/cancel`).set(manager).send({});
  const customer = () => db.customer.findUniqueOrThrow({ where: { phone: PHONE } });
  const entries = async () =>
    (await db.pointEntry.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((entry) => `${entry.type}:${entry.points}:${entry.balanceAfter}`);
  const givePoints = async (points: number) => {
    const row = await db.customer.upsert({ where: { phone: PHONE }, create: { name: "ກ", phone: PHONE }, update: {} });
    await db.customer.update({ where: { id: row.id }, data: { pointsBalance: points } });
    return row.id;
  };

  describe("ໄດ້ແຕ້ມ", () => {
    it("ບິນຈ່າຍແລ້ວ: floor(subtotal / 10) ແຕ້ມ, ບັນທຶກໃນບິນ ແລະ ສະໝຸດ", async () => {
      const created = await order().expect(201);
      expect(created.body).toMatchObject({ pointsEarned: 0, pointsRedeemed: 0, pointsDiscount: "0.00" });
      expect((await customer()).pointsBalance).toBe(0);
      const paid = await pay(created.body.id).expect(200);
      expect(paid.body).toMatchObject({ status: "PAID", pointsEarned: 50 });
      expect(await customer()).toMatchObject({ pointsBalance: 50, tier: "SILVER" });
      expect(await entries()).toEqual(["EARN:50:50"]);
    });

    it("ຕົວຄູນ = ລະດັບກ່ອນບິນ: ບິນທຳອິດ x1 (ແລ້ວຂຶ້ນ SILVER), ບິນທີສອງ x2", async () => {
      await pay((await order().expect(201)).body.id).expect(200);
      const second = await pay((await order().expect(201)).body.id).expect(200);
      expect(second.body.pointsEarned).toBe(100);
      expect(await customer()).toMatchObject({ pointsBalance: 150, tier: "SILVER" });
    });

    it("ຢືນຢັນຜ່ານ payWithin (ເສັ້ນທາງສະລິບ) ກໍໄດ້ແຕ້ມຄືກັນ", async () => {
      const created = await order().expect(201);
      const owner = await db.user.findFirstOrThrow({ where: { email: "owner@role.test" } });
      await db.$transaction((tx) => app.get(OrdersService).payWithin(tx, created.body.id, { id: owner.id } as AuthUser));
      expect((await customer()).pointsBalance).toBe(50);
    });

    it("ລະບົບປິດ ຫຼື ບິນບໍ່ມີລູກຄ້າ: ບໍ່ໄດ້ແຕ້ມ", async () => {
      const walkIn = await request(server()).post("/orders").set(chat).send({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      await pay(walkIn.body.id).expect(200);
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      const created = await order().expect(201);
      const paid = await pay(created.body.id).expect(200);
      expect(paid.body.pointsEarned).toBe(0);
      expect(await db.pointEntry.count()).toBe(0);
      expect(await customer()).toMatchObject({ pointsBalance: 0, tier: "BRONZE" });
    });

    it("ຍົກເລີກບິນທີ່ຈ່າຍແລ້ວ: ດຶງແຕ້ມຄືນ (ບໍ່ເກີນຍອດຄົງເຫຼືອ) ແລະ ລະດັບກັບຄືນ", async () => {
      const first = await pay((await order().expect(201)).body.id).expect(200); // +50
      // ໃຊ້ 30 ແຕ້ມໃນບິນທີສອງ → ຍອດ 20
      await order({ pointsToRedeem: 30 }).expect(201);
      await cancel(first.body.id).expect(200);
      expect(await entries()).toEqual(["EARN:50:50", "REDEEM:-30:20", "EARN_REVERSAL:-20:0"]);
      expect(await customer()).toMatchObject({ pointsBalance: 0, tier: "BRONZE" });
    });
  });

  describe("ແລກແຕ້ມ", () => {
    it("ຫັກເປັນເງິນໃນບິນ: subtotal/total ຫຼຸດ, discountTotal ລວມ, ແຕ້ມຖືກຫັກທັນທີ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 120 }).expect(201);
      expect(res.body).toMatchObject({ pointsRedeemed: 120, pointsDiscount: "120.00", subtotal: "380.00", discountTotal: "120.00", total: "380.00" });
      expect((await customer()).pointsBalance).toBe(80);
      expect(await entries()).toEqual(["REDEEM:-120:80"]);
      // ແຕ້ມທີ່ໄດ້ ຄິດຈາກຍອດຫຼັງຫັກແຕ້ມ
      const paid = await pay(res.body.id).expect(200);
      expect(paid.body.pointsEarned).toBe(38);
    });

    it("ໃຊ້ຮ່ວມກັບໂຄດ: ເພດານຄິດຈາກຍອດຫຼັງໂຄດ", async () => {
      await givePoints(1000);
      await request(server()).post("/coupons").set(manager).send({ code: "OFF100", type: "FIXED", value: "100" }).expect(201);
      const over = await order({ couponCode: "OFF100", pointsToRedeem: 201 }).expect(409);
      expect(over.body).toMatchObject({ code: "POINTS_INVALID", reason: "OVER_CAP", maxPoints: 200 });
      const ok = await order({ couponCode: "OFF100", pointsToRedeem: 200 }).expect(201);
      expect(ok.body).toMatchObject({ couponDiscount: "100.00", pointsDiscount: "200.00", subtotal: "200.00", discountTotal: "300.00", total: "200.00" });
    });

    it("ປະຕິເສດ: DISABLED, NO_CUSTOMER, INSUFFICIENT, OVER_CAP; ບໍ່ສ້າງບິນ ແລະ ບໍ່ຈອງສະຕ໋ອກ", async () => {
      await givePoints(40);
      const insufficient = await order({ pointsToRedeem: 41 }).expect(409);
      expect(insufficient.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT", balance: 40 });
      await db.customer.update({ where: { phone: PHONE }, data: { pointsBalance: 900 } });
      const cap = await order({ pointsToRedeem: 251 }).expect(409);
      expect(cap.body).toMatchObject({ reason: "OVER_CAP", maxPoints: 250 });
      const walkIn = await request(server()).post("/orders").set(chat).send({ items: [{ variantId: f.v1.id, quantity: 1 }], pointsToRedeem: 1 }).expect(409);
      expect(walkIn.body.reason).toBe("NO_CUSTOMER");
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      const disabled = await order({ pointsToRedeem: 1 }).expect(409);
      expect(disabled.body.reason).toBe("DISABLED");
      expect(await db.order.count()).toBe(0);
      expect(await db.pointEntry.count()).toBe(0);
      await expectLedgerMatches(db);
    });

    it("ສອງບິນແຂ່ງກັນໃຊ້ແຕ້ມເກີນຍອດ: ສຳເລັດດຽວ", async () => {
      await givePoints(200);
      const results = await Promise.all([order({ pointsToRedeem: 150 }), order({ pointsToRedeem: 150 })]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)?.body).toMatchObject({ code: "POINTS_INVALID", reason: "INSUFFICIENT" });
      expect((await customer()).pointsBalance).toBe(50);
      expect(await db.order.count()).toBe(1);
      await expectLedgerMatches(db);
    });

    it("ຍົກເລີກບິນຄ້າງຈ່າຍ: ຄືນແຕ້ມຄັ້ງດຽວ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 100 }).expect(201);
      await cancel(res.body.id).expect(200);
      expect(await entries()).toEqual(["REDEEM:-100:100", "REDEEM_REFUND:100:200"]);
      await cancel(res.body.id).expect(409);
      expect((await customer()).pointsBalance).toBe(200);
    });

    it("ບິນໝົດອາຍຸ: ຄືນແຕ້ມ ເຖິງລະບົບແຕ້ມຖືກປິດແລ້ວ; expire ຊ້ຳບໍ່ຄືນຊ້ຳ", async () => {
      await givePoints(200);
      const res = await order({ pointsToRedeem: 100 }).expect(201);
      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      await db.order.update({ where: { id: res.body.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      expect(await expireOrder(db, res.body.id)).toBe(true);
      expect(await expireOrder(db, res.body.id)).toBe(false);
      expect((await customer()).pointsBalance).toBe(200);
      expect(await db.pointEntry.count({ where: { type: "REDEEM_REFUND" } })).toBe(1);
      await expectLedgerMatches(db);
    });
  });

  describe("ງານຄິດລະດັບປະຈຳຄືນ", () => {
    it("ຫຼຸດລະດັບຄົນທີ່ຍອດຕົກອອກຈາກ 12 ເດືອນ, ຂຶ້ນລະດັບຄົນທີ່ຍອດເຖິງ; ລະບົບປິດ = ຂ້າມ", async () => {
      const lapsed = await db.customer.create({ data: { name: "Lapsed", tier: "GOLD" } });
      await seedCustomerOrder(db, lapsed.id, { subtotal: "6000.00", paidDaysAgo: 400 });
      const rising = await db.customer.create({ data: { name: "Rising" } });
      await seedCustomerOrder(db, rising.id, { subtotal: "600.00", paidDaysAgo: 10 });
      const idle = await db.customer.create({ data: { name: "Idle" } });

      expect(await runRecomputeMemberTiers(db)).toEqual({ checked: 2, changed: 2, skipped: false });
      const tierOf = async (id: string) => (await db.customer.findUniqueOrThrow({ where: { id } })).tier;
      expect(await tierOf(lapsed.id)).toBe("BRONZE");
      expect(await tierOf(rising.id)).toBe("SILVER");
      expect(await tierOf(idle.id)).toBe("BRONZE");

      await db.storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      await db.customer.update({ where: { id: idle.id }, data: { tier: "PLATINUM" } });
      expect(await runRecomputeMemberTiers(db)).toEqual({ checked: 0, changed: 0, skipped: true });
      expect(await tierOf(idle.id)).toBe("PLATINUM");
    });
  });
});

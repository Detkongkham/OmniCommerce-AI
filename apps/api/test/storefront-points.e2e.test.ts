import { randomUUID } from "node:crypto";
import { awardPointsForOrder, expireOrder, loadLoyaltyConfig } from "@oca/database";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { expectLedgerMatches } from "./helpers";
import { FORBIDDEN_KEYS, keysOf, setupStoreTest } from "./storefront-fixtures";

const PHONE = "02055555555";
const OTHER_PHONE = "02066666666";
const PIN = "123456";
const TIERS = [
  { tier: "BRONZE", minSpend: "0", multiplier: "1" },
  { tier: "SILVER", minSpend: "400", multiplier: "2" },
  { tier: "GOLD", minSpend: "5000", multiplier: "3" },
  { tier: "PLATINUM", minSpend: "10000", multiplier: "4" },
];

describe("storefront loyalty points (e2e)", () => {
  const { server, db, state } = setupStoreTest({ STORE_LOGIN_RATE_LIMIT: "1000" });

  beforeEach(async () => {
    // 10 ກີບ = 1 ແຕ້ມ, 1 ແຕ້ມ = 1 ກີບ, ໃຊ້ໄດ້ບໍ່ເກີນ 50% ຂອງຍອດ; VAT 0 ເພື່ອໃຫ້ total = subtotal
    const loyalty = { vatRate: "0", loyaltyEnabled: true, pointsEarnPer: "10", pointValue: "1", pointsMaxRedeemPercent: 50, tierRules: TIERS };
    await db().storeSetting.upsert({ where: { id: 1 }, create: { id: 1, name: "T", ...loyalty }, update: loyalty });
  });

  const orderBody = (patch: object = {}) => ({
    items: [{ variantId: state.f.v1.id, quantity: 3 }],
    name: "ນາງ ກ",
    phone: PHONE,
    address: "ບ້ານ ກ, ວຽງຈັນ",
    courierId: state.courier.id,
    branch: "ສາຂາ ໂພນທັນ",
    expectedTotal: "300.00",
    ...patch,
  });
  const placeOrder = (patch: object = {}, memberToken?: string) => {
    const req = request(server()).post("/store/orders").set("Idempotency-Key", randomUUID());
    if (memberToken !== undefined) req.set("Authorization", `Bearer ${memberToken}`);
    return req.send(orderBody(patch));
  };
  const check = (body: object = {}, memberToken?: string) => {
    const req = request(server()).post("/store/cart/check");
    if (memberToken !== undefined) req.set("Authorization", `Bearer ${memberToken}`);
    return req.send({ items: [{ variantId: state.f.v1.id, quantity: 3 }], ...body });
  };
  const getOrder = (token: string) => request(server()).get(`/store/orders/${token}`).expect(200);
  const customer = (phone = PHONE) => db().customer.findUniqueOrThrow({ where: { phone } });
  const setStatus = (token: string, status: "PAID" | "CANCELLED" | "EXPIRED" | "PENDING_PAYMENT") =>
    db().order.update({ where: { publicToken: token }, data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) } });

  /** ສະມາຊິກ PHONE ທີ່ມີ PIN (ຜ່ານບິນເວັບ 1 ຊິ້ນທີ່ຈ່າຍແລ້ວ) ແລະ ຍອດແຕ້ມ `balance` */
  const member = async (balance = 500, phone = PHONE) => {
    const placed = await placeOrder({ phone, items: [{ variantId: state.f.v1.id, quantity: 1 }], expectedTotal: "100.00" }).expect(201);
    await setStatus(placed.body.token, "PAID");
    const res = await request(server()).post(`/store/orders/${placed.body.token}/pin`).send({ pin: PIN }).expect(201);
    await db().customer.update({ where: { phone }, data: { pointsBalance: balance } });
    return res.body.memberToken as string;
  };

  describe("GET /store/config → loyalty", () => {
    it("ເປີດ: ກົດການໄດ້/ໃຊ້ແຕ້ມ ແລະ ລະດັບ (ເງິນເປັນ string)", async () => {
      const res = await request(server()).get("/store/config").expect(200);
      expect(res.body.loyalty).toEqual({
        enabled: true,
        earnPer: "10.00",
        pointValue: "1.00",
        maxRedeemPercent: 50,
        tiers: [
          { tier: "BRONZE", minSpend: "0.00", multiplier: "1" },
          { tier: "SILVER", minSpend: "400.00", multiplier: "2" },
          { tier: "GOLD", minSpend: "5000.00", multiplier: "3" },
          { tier: "PLATINUM", minSpend: "10000.00", multiplier: "4" },
        ],
      });
    });

    it("ປິດ: { enabled: false } ເທົ່ານັ້ນ", async () => {
      await db().storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      const res = await request(server()).get("/store/config").expect(200);
      expect(res.body.loyalty).toEqual({ enabled: false });
    });
  });

  describe("POST /store/cart/check", () => {
    it("guest: points null, pointsError null", async () => {
      const res = await check().expect(200);
      expect(res.body).toMatchObject({ points: null, pointsError: null, total: "300.00" });
    });

    it("guest ສົ່ງ pointsToRedeem / header ໃຊ້ບໍ່ໄດ້ → 401 MEMBER_REQUIRED", async () => {
      expect((await check({ pointsToRedeem: 10 }).expect(401)).body.code).toBe("MEMBER_REQUIRED");
      expect((await check({}, "not-a-token").expect(401)).body.code).toBe("MEMBER_REQUIRED");
    });

    it("ສະມາຊິກບໍ່ໃຊ້ແຕ້ມ: ຍອດແຕ້ມ ແລະ ແຕ້ມສູງສຸດທີ່ໃຊ້ໄດ້ (50% ຂອງ 300)", async () => {
      const token = await member(500);
      const res = await check({}, token).expect(200);
      expect(res.body).toMatchObject({
        points: { balance: 500, maxPoints: 150, redeemed: 0, discount: "0.00" },
        pointsError: null,
        subtotal: "300.00",
        total: "300.00",
      });
      const small = await member(40, OTHER_PHONE);
      expect((await check({}, small).expect(200)).body.points).toEqual({ balance: 40, maxPoints: 40, redeemed: 0, discount: "0.00" });
    });

    it("ສະມາຊິກໃຊ້ແຕ້ມໄດ້ → ສ່ວນຫຼຸດຫັກອອກຈາກ subtotal/total", async () => {
      const token = await member(500);
      const res = await check({ pointsToRedeem: 100 }, token).expect(200);
      expect(res.body).toMatchObject({
        points: { balance: 500, maxPoints: 150, redeemed: 100, discount: "100.00" },
        pointsError: null,
        subtotal: "200.00",
        total: "200.00",
        orderable: true,
      });
      expect((await customer()).pointsBalance).toBe(500);
    });

    it("ແຕ້ມໃຊ້ບໍ່ໄດ້ → pointsError (ບໍ່ລົ້ມທັງການກວດ), redeemed 0, ຍອດບໍ່ຫຼຸດ", async () => {
      const token = await member(500);
      const over = await check({ pointsToRedeem: 151 }, token).expect(200);
      expect(over.body).toMatchObject({
        points: { balance: 500, maxPoints: 150, redeemed: 0, discount: "0.00" },
        pointsError: { reason: "OVER_CAP", maxPoints: 150 },
        total: "300.00",
      });
      await db().customer.update({ where: { phone: PHONE }, data: { pointsBalance: 50 } });
      const insufficient = await check({ pointsToRedeem: 80 }, token).expect(200);
      expect(insufficient.body).toMatchObject({
        points: { balance: 50, maxPoints: 50, redeemed: 0, discount: "0.00" },
        pointsError: { reason: "INSUFFICIENT", balance: 50 },
        total: "300.00",
      });
    });

    it("ຊ້ອນກັບໂຄດ: ເພດານແຕ້ມຄິດຈາກຍອດຫຼັງໂຄດ, ສ່ວນຫຼຸດລວມ = ໂຄດ + ແຕ້ມ", async () => {
      await db().coupon.create({ data: { code: "OFF50", type: "FIXED", value: "50" } });
      const token = await member(500);
      const res = await check({ couponCode: "OFF50", pointsToRedeem: 100 }, token).expect(200);
      expect(res.body).toMatchObject({
        coupon: { code: "OFF50", discount: "50.00" },
        points: { balance: 500, maxPoints: 125, redeemed: 100, discount: "100.00" },
        pointsError: null,
        subtotal: "150.00",
        total: "150.00",
      });
    });

    it("ໂຄດໃຊ້ບໍ່ໄດ້ + ແຕ້ມ: couponError, ແຕ້ມຄິດຈາກຍອດທີ່ບໍ່ຫຼຸດດ້ວຍໂຄດ", async () => {
      const token = await member(500);
      const res = await check({ couponCode: "NOPE", pointsToRedeem: 100 }, token).expect(200);
      expect(res.body).toMatchObject({
        coupon: null,
        couponError: { reason: "NOT_FOUND" },
        points: { balance: 500, maxPoints: 150, redeemed: 100, discount: "100.00" },
        pointsError: null,
        subtotal: "200.00",
        total: "200.00",
      });
    });

    it("ລະບົບແຕ້ມປິດ: points null; ສົ່ງ pointsToRedeem → pointsError DISABLED", async () => {
      const token = await member(500);
      await db().storeSetting.update({ where: { id: 1 }, data: { loyaltyEnabled: false } });
      expect((await check({}, token).expect(200)).body).toMatchObject({ points: null, pointsError: null });
      const res = await check({ pointsToRedeem: 10 }, token).expect(200);
      expect(res.body).toMatchObject({ points: null, pointsError: { reason: "DISABLED" }, total: "300.00" });
    });
  });

  describe("POST /store/orders + pointsToRedeem", () => {
    it("ບໍ່ມີ session → 401 MEMBER_REQUIRED; ບໍ່ສ້າງບິນ", async () => {
      await member(500);
      const before = await db().order.count();
      const res = await placeOrder({ pointsToRedeem: 100, expectedTotal: "200.00" }).expect(401);
      expect(res.body.code).toBe("MEMBER_REQUIRED");
      expect((await placeOrder({ pointsToRedeem: 100, expectedTotal: "200.00" }, "bad").expect(401)).body.code).toBe("MEMBER_REQUIRED");
      expect(await db().order.count()).toBe(before);
    });

    it("ເບີຂອງ session ບໍ່ຕົງກັບເບີທີ່ສັ່ງ → 409 POINTS_INVALID PHONE_MISMATCH; ບໍ່ສ້າງບິນ", async () => {
      const token = await member(500);
      const before = await db().order.count();
      const res = await placeOrder({ phone: OTHER_PHONE, pointsToRedeem: 100, expectedTotal: "200.00" }, token).expect(409);
      expect(res.body).toMatchObject({ code: "POINTS_INVALID", reason: "PHONE_MISMATCH" });
      expect(await db().order.count()).toBe(before);
      expect((await customer()).pointsBalance).toBe(500);
    });

    it("ສຳເລັດ: ຫັກແຕ້ມ, ຍອດຫຼັງຫັກ ແລະ ບິນສະແດງ points", async () => {
      const token = await member(500);
      const res = await placeOrder({ pointsToRedeem: 100, expectedTotal: "200.00" }, token).expect(201);
      expect((await customer()).pointsBalance).toBe(400);
      const order = await getOrder(res.body.token);
      expect(order.body).toMatchObject({
        subtotal: "200.00",
        total: "200.00",
        points: { redeemed: 100, discount: "100.00" },
        pointsEarned: null,
        pinSetup: "NONE",
      });
      await expectLedgerMatches(db());
    });

    it("ໂຄດ + flash sale + ແຕ້ມ: total ຂອງ cart check ໃຊ້ເປັນ expectedTotal ໄດ້ ແລະ ບິນໄດ້ຍອດດຽວກັນ", async () => {
      const token = await member(500);
      const now = Date.now();
      await db().flashSale.create({
        data: {
          name: "Flash",
          startsAt: new Date(now - 60_000),
          endsAt: new Date(now + 3_600_000),
          items: { create: [{ variantId: state.f.v1.id, salePrice: "80" }] },
        },
      });
      await db().coupon.create({ data: { code: "OFF40", type: "FIXED", value: "40" } });
      // 3 x 80 = 240 → ໂຄດ 40 → 200 → ເພດານແຕ້ມ 100; ໃຊ້ 60 → 140
      const cart = await check({ couponCode: "OFF40", pointsToRedeem: 60 }, token).expect(200);
      expect(cart.body).toMatchObject({
        coupon: { code: "OFF40", discount: "40.00" },
        points: { balance: 500, maxPoints: 100, redeemed: 60, discount: "60.00" },
        pointsError: null,
        subtotal: "140.00",
        total: "140.00",
      });
      expect(cart.body.items[0]).toMatchObject({ unitPrice: "80.00", lineTotal: "240.00" });

      const res = await placeOrder({ couponCode: "OFF40", pointsToRedeem: 60, expectedTotal: cart.body.total }, token).expect(201);
      const row = await db().order.findUniqueOrThrow({ where: { publicToken: res.body.token }, include: { items: true } });
      expect(row.total.toFixed(2)).toBe(cart.body.total);
      expect(row.couponDiscount.toFixed(2)).toBe("40.00");
      expect(row.pointsDiscount.toFixed(2)).toBe("60.00");
      expect(row.discountTotal.toFixed(2)).toBe("100.00");
      expect(row.pointsRedeemed).toBe(60);
      expect(row.items[0]?.unitPrice.toFixed(2)).toBe("80.00");
      expect(row.items[0]?.flashSaleId).not.toBeNull();
      const entries = await db().pointEntry.findMany({ where: { orderId: row.id } });
      expect(entries.map((entry) => `${entry.type}:${entry.points}:${entry.balanceAfter}`)).toEqual(["REDEEM:-60:440"]);
      expect((await customer()).pointsBalance).toBe(440);
      expect((await getOrder(res.body.token)).body).toMatchObject({
        subtotal: "140.00",
        total: "140.00",
        coupon: { code: "OFF40", discount: "40.00" },
        points: { redeemed: 60, discount: "60.00" },
      });
    });

    it("expectedTotal ທີ່ບໍ່ຫັກແຕ້ມ → 409 PRICE_CHANGED ພ້ອມຍອດຫຼັງຫັກ; ແຕ້ມບໍ່ຖືກຫັກ", async () => {
      const token = await member(500);
      const res = await placeOrder({ pointsToRedeem: 100, expectedTotal: "300.00" }, token).expect(409);
      expect(res.body).toMatchObject({ code: "PRICE_CHANGED", total: "200.00" });
      expect((await customer()).pointsBalance).toBe(500);
    });

    it("ເກີນເພດານ → 409 POINTS_INVALID OVER_CAP", async () => {
      const token = await member(500);
      const res = await placeOrder({ pointsToRedeem: 151, expectedTotal: "149.00" }, token).expect(409);
      expect(res.body).toMatchObject({ code: "POINTS_INVALID", reason: "OVER_CAP", maxPoints: 150 });
      expect((await customer()).pointsBalance).toBe(500);
    });

    it("ບໍ່ໃຊ້ແຕ້ມ: header Authorization ຖືກມອງຂ້າມ (ເຖິງຜິດ) — guest checkout ຍັງໄດ້", async () => {
      await placeOrder({}, "garbage").expect(201);
      const res = await placeOrder({ phone: OTHER_PHONE }).expect(201);
      expect((await getOrder(res.body.token)).body).toMatchObject({ points: null, pinSetup: "AFTER_PAYMENT" });
    });

    it("ບິນທີ່ໃຊ້ແຕ້ມໝົດອາຍຸ → ຄືນແຕ້ມ (REDEEM_REFUND) ແລະ pinSetup NONE", async () => {
      const token = await member(500);
      const res = await placeOrder({ pointsToRedeem: 100, expectedTotal: "200.00" }, token).expect(201);
      expect((await customer()).pointsBalance).toBe(400);
      const row = await db().order.update({ where: { publicToken: res.body.token }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      expect((await getOrder(res.body.token)).body).toMatchObject({ status: "EXPIRED", pinSetup: "NONE" });
      expect(await expireOrder(db(), row.id)).toBe(true);
      expect((await customer()).pointsBalance).toBe(500);
      const entries = await db().pointEntry.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "asc" } });
      expect(entries.map((entry) => `${entry.type}:${entry.points}`)).toEqual(["REDEEM:-100", "REDEEM_REFUND:100"]);
      expect((await getOrder(res.body.token)).body).toMatchObject({ status: "EXPIRED", points: { redeemed: 100, discount: "100.00" } });
      await expectLedgerMatches(db());
    });
  });

  describe("GET /store/orders/:token → pointsEarned, pinSetup", () => {
    it("pinSetup: ລໍຈ່າຍ → AFTER_PAYMENT, ຈ່າຍແລ້ວ → AVAILABLE, ຕັ້ງ PIN ແລ້ວ → NONE", async () => {
      const res = await placeOrder().expect(201);
      expect((await getOrder(res.body.token)).body.pinSetup).toBe("AFTER_PAYMENT");
      await setStatus(res.body.token, "PAID");
      expect((await getOrder(res.body.token)).body.pinSetup).toBe("AVAILABLE");
      await request(server()).post(`/store/orders/${res.body.token}/pin`).send({ pin: PIN }).expect(201);
      expect((await getOrder(res.body.token)).body.pinSetup).toBe("NONE");
    });

    it("pinSetup NONE: ຍົກເລີກ, ໝົດອາຍຸ, ບໍ່ມີລູກຄ້າ", async () => {
      const res = await placeOrder().expect(201);
      for (const status of ["CANCELLED", "EXPIRED"] as const) {
        await setStatus(res.body.token, status);
        expect((await getOrder(res.body.token)).body.pinSetup).toBe("NONE");
      }
      await db().order.update({ where: { publicToken: res.body.token }, data: { status: "PAID", customerId: null } });
      expect((await getOrder(res.body.token)).body.pinSetup).toBe("NONE");
    });

    it("pointsEarned: null ກ່ອນຈ່າຍ; ຈ່າຍແລ້ວ = ແຕ້ມທີ່ໄດ້; ບໍ່ເປີດເຜີຍຂໍ້ມູນລູກຄ້າ", async () => {
      const res = await placeOrder().expect(201);
      const before = await getOrder(res.body.token);
      expect(before.body).toMatchObject({ points: null, pointsEarned: null });
      const row = await db().order.findUniqueOrThrow({ where: { publicToken: res.body.token } });
      await db().$transaction(async (tx) => {
        await tx.order.update({ where: { id: row.id }, data: { status: "PAID", paidAt: new Date() } });
        await awardPointsForOrder(tx, row.id, await loadLoyaltyConfig(tx));
      });
      const after = await getOrder(res.body.token);
      expect(after.body).toMatchObject({ status: "PAID", pointsEarned: 30, pinSetup: "AVAILABLE" });
      const keys = keysOf(after.body);
      for (const key of [...FORBIDDEN_KEYS, "id", "pinHash", "customer", "pointsBalance"]) expect(keys.has(key), key).toBe(false);
    });
  });
});

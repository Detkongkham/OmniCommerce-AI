import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedRoleUsers } from "./helpers";

describe("coupons (e2e)", () => {
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
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 50 }));
  });

  const create = (body: object, auth = manager) => request(server()).post("/coupons").set(auth).send(body);
  const order = (body: object = {}, auth = chat) =>
    request(server())
      .post("/orders")
      .set(auth)
      .send({ items: [{ variantId: f.v1.id, quantity: 5 }], customer: { name: "ກ", phone: "02055555555" }, ...body });

  describe("ຈັດການໂຄດ", () => {
    it("ສ້າງ (ລະຫັດເປັນຕົວພິມໃຫຍ່) → ລາຍການພ້ອມ usedCount → ແກ້ → ປິດ", async () => {
      const created = await create({ code: " new10 ", type: "PERCENT", value: "10", maxDiscount: "30", minSubtotal: "100", usageLimit: 5, note: " ລູກຄ້າໃໝ່ " }).expect(201);
      expect(created.body).toMatchObject({
        code: "NEW10",
        type: "PERCENT",
        value: "10.00",
        maxDiscount: "30.00",
        minSubtotal: "100.00",
        startsAt: null,
        endsAt: null,
        usageLimit: 5,
        perPhoneLimit: null,
        isActive: true,
        note: "ລູກຄ້າໃໝ່",
        usedCount: 0,
      });
      await order({ couponCode: "NEW10" }).expect(201);

      const patched = await request(server()).patch(`/coupons/${created.body.id}`).set(manager).send({ isActive: false, usageLimit: null, note: "" }).expect(200);
      expect(patched.body).toMatchObject({ isActive: false, usageLimit: null, note: null, usedCount: 1 });

      const list = await request(server()).get("/coupons").set(manager).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ code: "NEW10", usedCount: 1, isActive: false });
      expect(await db.auditLog.count({ where: { action: { in: ["coupon.create", "coupon.update"] } } })).toBe(2);
    });

    it("ລະຫັດຊ້ຳ → 409 DUPLICATE_VALUE; body ຜິດ → 400; id ບໍ່ພົບ → 404 COUPON_NOT_FOUND", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10" }).expect(201);
      const dup = await create({ code: "new10", type: "FIXED", value: "5" }).expect(409);
      expect(dup.body.code).toBe("DUPLICATE_VALUE");
      await create({ code: "X1", type: "PERCENT", value: "10" }).expect(400);
      await create({ code: "PCT", type: "PERCENT", value: "150" }).expect(400);
      await create({ code: "FIX", type: "FIXED", value: "10", maxDiscount: "5" }).expect(400);
      const missing = await request(server()).patch("/coupons/nope").set(manager).send({ isActive: false }).expect(404);
      expect(missing.body.code).toBe("COUPON_NOT_FOUND");
    });

    it("ແກ້: ກົດຂ້າມ field ກວດກັບຄ່າເດີມ; ໂຄດທີ່ຖືກໃຊ້ແລ້ວ ແກ້ລະຫັດ/ຊະນິດ/ຄ່າ ບໍ່ໄດ້", async () => {
      const fixed = await create({ code: "FIX20", type: "FIXED", value: "20" }).expect(201);
      // FIXED + maxDiscount ບໍ່ໄດ້ ເຖິງສົ່ງມາແຕ່ maxDiscount
      await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send({ maxDiscount: "5" }).expect(400);
      // endsAt ກ່ອນ startsAt ເດີມ
      await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send({ startsAt: "2026-10-10T00:00:00Z" }).expect(200);
      await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send({ endsAt: "2026-10-09T00:00:00Z" }).expect(400);
      // ຍັງບໍ່ຖືກໃຊ້: ປ່ຽນຄ່າໄດ້
      await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send({ value: "30", startsAt: null }).expect(200);

      await order({ couponCode: "FIX20" }).expect(201);
      for (const body of [{ code: "OTHER" }, { type: "PERCENT" }, { value: "40" }]) {
        const res = await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send(body).expect(409);
        expect(res.body.code).toBe("COUPON_IN_USE");
      }
      // ສົ່ງຄ່າເດີມມາ ບໍ່ຖືວ່າແກ້; field ອື່ນຍັງແກ້ໄດ້
      await request(server()).patch(`/coupons/${fixed.body.id}`).set(manager).send({ value: "30.00", minSubtotal: "50" }).expect(200);
    });

    it("ສິດ: promotion:read ເບິ່ງ, promotion:write ສ້າງ/ແກ້; preview ໃຊ້ orders:write", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10" }).expect(201);
      await request(server()).get("/coupons").set(chat).expect(200);
      await create({ code: "CHAT", type: "PERCENT", value: "10" }, chat).expect(403);
      const warehouse = await bearerFor(app, "warehouse@role.test");
      await request(server()).get("/coupons").set(warehouse).expect(403);
      await request(server()).post("/coupons/preview").set(chat).send({ code: "new10", subtotal: "500" }).expect(200);
      await request(server()).post("/coupons/preview").set(warehouse).send({ code: "new10", subtotal: "500" }).expect(403);
    });
  });

  describe("POST /coupons/preview", () => {
    it("ຄືນສ່ວນຫຼຸດ; ໃຊ້ບໍ່ໄດ້ → 409 COUPON_INVALID ພ້ອມ reason", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10", minSubtotal: "200", perPhoneLimit: 1 }).expect(201);
      const ok = await request(server()).post("/coupons/preview").set(chat).send({ code: "new10", subtotal: "500" }).expect(200);
      expect(ok.body).toEqual({ code: "NEW10", discount: "50.00" });
      const low = await request(server()).post("/coupons/preview").set(chat).send({ code: "NEW10", subtotal: "100" }).expect(409);
      expect(low.body).toMatchObject({ code: "COUPON_INVALID", reason: "MIN_SUBTOTAL", minSubtotal: "200.00" });
      const none = await request(server()).post("/coupons/preview").set(chat).send({ code: "NOPE", subtotal: "500" }).expect(409);
      expect(none.body).toMatchObject({ code: "COUPON_INVALID", reason: "NOT_FOUND" });
      // ມີເບີ → ກວດຕໍ່ເບີນຳ
      await order({ couponCode: "NEW10" }).expect(201);
      const used = await request(server()).post("/coupons/preview").set(chat).send({ code: "NEW10", subtotal: "500", phone: "02055555555" }).expect(409);
      expect(used.body.reason).toBe("PHONE_LIMIT");
    });
  });

  describe("POST /orders ດ້ວຍ couponCode", () => {
    it("ຫັກສ່ວນຫຼຸດ: subtotal ຫຼຸດ, discountTotal ລວມໂຄດ, lineTotal ຄືເກົ່າ; ບິນບັນທຶກໂຄດ", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10" }).expect(201);
      const res = await order({ couponCode: "new10" }).expect(201);
      expect(res.body).toMatchObject({
        couponCode: "NEW10",
        couponDiscount: "50.00",
        subtotal: "450.00",
        discountTotal: "50.00",
        total: "450.00",
        vatAmount: "40.91",
      });
      expect(res.body.items[0].lineTotal).toBe("500.00");
      const row = await db.order.findUniqueOrThrow({ where: { id: res.body.id as string }, include: { coupon: true } });
      expect(row.coupon?.code).toBe("NEW10");
      await expectLedgerMatches(db);
    });

    it("ລວມກັບສ່ວນຫຼຸດລາຍການ: ໂຄດຄິດຈາກຍອດຫຼັງສ່ວນຫຼຸດລາຍການ", async () => {
      await create({ code: "FIX100", type: "FIXED", value: "100" }).expect(201);
      const res = await order({ items: [{ variantId: f.v1.id, quantity: 5, discount: "50" }], couponCode: "FIX100" }).expect(201);
      expect(res.body).toMatchObject({ subtotal: "350.00", discountTotal: "150.00", couponDiscount: "100.00", total: "350.00" });
    });

    it("ບໍ່ສົ່ງໂຄດ → couponCode null, couponDiscount 0.00", async () => {
      const res = await order().expect(201);
      expect(res.body).toMatchObject({ couponCode: null, couponDiscount: "0.00", subtotal: "500.00" });
    });

    it("ໂຄດໃຊ້ບໍ່ໄດ້ → 409 COUPON_INVALID ພ້ອມ reason; ບໍ່ສ້າງບິນ ແລະ ບໍ່ຈອງສະຕ໋ອກ", async () => {
      await create({ code: "BIG", type: "PERCENT", value: "10", minSubtotal: "1000" }).expect(201);
      await create({ code: "OFF", type: "PERCENT", value: "10", isActive: false }).expect(201);
      await create({ code: "OLD", type: "PERCENT", value: "10", endsAt: "2020-01-01T00:00:00Z" }).expect(201);
      for (const [code, reason] of [["BIG", "MIN_SUBTOTAL"], ["OFF", "INACTIVE"], ["OLD", "EXPIRED"], ["NOPE", "NOT_FOUND"]] as const) {
        const res = await order({ couponCode: code }).expect(409);
        expect(res.body).toMatchObject({ code: "COUPON_INVALID", reason });
      }
      expect(await db.order.count()).toBe(0);
      expect(await db.customer.count()).toBe(0);
      const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
      expect(level.reserved).toBe(0);
    });

    it("perPhoneLimit: ເບີດຽວໃຊ້ໄດ້ຕາມຈຳນວນ; ບິນບໍ່ມີລູກຄ້າ → PHONE_REQUIRED", async () => {
      await create({ code: "ONCE", type: "FIXED", value: "10", perPhoneLimit: 1 }).expect(201);
      await order({ couponCode: "ONCE" }).expect(201);
      expect((await order({ couponCode: "ONCE" }).expect(409)).body.reason).toBe("PHONE_LIMIT");
      await order({ couponCode: "ONCE", customer: { name: "ຂ", phone: "02099999999" } }).expect(201);
      const anonymous = await request(server()).post("/orders").set(chat).send({ items: [{ variantId: f.v1.id, quantity: 1 }], couponCode: "ONCE" }).expect(409);
      expect(anonymous.body.reason).toBe("PHONE_REQUIRED");
    });

    it("usageLimit: ຍົກເລີກບິນ → ສິດຄືນ", async () => {
      await create({ code: "ONE", type: "FIXED", value: "10", usageLimit: 1 }).expect(201);
      const first = await order({ couponCode: "ONE" }).expect(201);
      expect((await order({ couponCode: "ONE", customer: { name: "ຂ", phone: "02099999999" } }).expect(409)).body.reason).toBe("USAGE_LIMIT");
      await request(server()).post(`/orders/${first.body.id as string}/cancel`).set(chat).send({}).expect(200);
      await order({ couponCode: "ONE", customer: { name: "ຂ", phone: "02099999999" } }).expect(201);
    });

    it("ສອງບິນແຂ່ງສິດສຸດທ້າຍພ້ອມກັນ → ສຳເລັດດຽວ", async () => {
      await create({ code: "ONE", type: "FIXED", value: "10", usageLimit: 1 }).expect(201);
      const results = await Promise.all([
        order({ couponCode: "ONE", customer: { name: "ກ", phone: "02011111111" } }),
        order({ couponCode: "ONE", customer: { name: "ຂ", phone: "02022222222" } }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await db.order.count({ where: { couponId: { not: null } } })).toBe(1);
      await expectLedgerMatches(db);
    });

    it("Idempotency-Key ດຽວກັນ + ໂຄດຕ່າງກັນ → 409 CONFLICT (ໂຄດເປັນສ່ວນຂອງ payload)", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10" }).expect(201);
      await order({ couponCode: "NEW10" }).set("Idempotency-Key", "k1").expect(201);
      const again = await order({ couponCode: "NEW10" }).set("Idempotency-Key", "k1").expect(201);
      expect(again.body.couponDiscount).toBe("50.00");
      expect(await db.order.count()).toBe(1);
      await order().set("Idempotency-Key", "k1").expect(409);
    });

    it("Analytics: gross = ຍອດກ່ອນສ່ວນຫຼຸດ, discounts ລວມໂຄດ, revenue ຫຼັງສ່ວນຫຼຸດ", async () => {
      await create({ code: "NEW10", type: "PERCENT", value: "10" }).expect(201);
      const owner = await bearerFor(app, "owner@role.test");
      const created = await order({ couponCode: "NEW10" }).expect(201);
      await request(server()).post(`/orders/${created.body.id as string}/pay`).set(owner).expect(200);
      const day = new Date().toISOString().slice(0, 10);
      const next = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const prev = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      const summary = await request(server()).get(`/analytics/summary?from=${prev}&to=${next}`).set(owner).expect(200);
      expect(day).toBeTruthy();
      expect(summary.body).toMatchObject({ grossSales: "500.00", discounts: "50.00", revenue: "409.09" });
    });
  });
});

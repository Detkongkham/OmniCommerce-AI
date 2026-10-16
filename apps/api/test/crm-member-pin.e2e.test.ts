import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearerFor, seedRoleUsers } from "./helpers";
import { setupStoreTest } from "./storefront-fixtures";

const PHONE = "02055555555";
const OTHER_PHONE = "02066666666";
const PIN = "123456";

/** PIN ເວັບໃນ CRM: ສະຖານະໃນລາຍລະອຽດ, reset ໂດຍພະນັກງານ ແລະ ກົດຂອງ PIN ຕອນລວມລູກຄ້າ */
describe("crm member PIN (e2e)", () => {
  const { server, app, db, state } = setupStoreTest({ STORE_LOGIN_RATE_LIMIT: "1000" });
  let manager: { Authorization: string };
  let chat: { Authorization: string };

  beforeEach(async () => {
    await seedRoleUsers(db());
    manager = await bearerFor(app(), "manager@role.test");
    chat = await bearerFor(app(), "chat_admin@role.test");
  });

  const placePaid = async (phone: string = PHONE) => {
    const res = await request(server())
      .post("/store/orders")
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [{ variantId: state.f.v1.id, quantity: 1 }],
        name: "ນາງ ກ",
        phone,
        address: "ບ້ານ ກ, ວຽງຈັນ",
        courierId: state.courier.id,
        branch: "ສາຂາ ໂພນທັນ",
        expectedTotal: "100.00",
      })
      .expect(201);
    await db().order.update({ where: { publicToken: res.body.token }, data: { status: "PAID", paidAt: new Date() } });
    return res.body as { orderNumber: string; token: string };
  };
  const setPin = (token: string, pin: string = PIN) => request(server()).post(`/store/orders/${token}/pin`).send({ pin });
  const login = (phone: string = PHONE, pin: string = PIN) => request(server()).post("/store/member/login").send({ phone, pin });
  /** ລູກຄ້າທີ່ມີ PIN (ຜ່ານບິນເວັບທີ່ຈ່າຍແລ້ວ) + token ຂອງ session */
  const member = async (phone: string = PHONE, pin: string = PIN) => {
    const order = await placePaid(phone);
    const res = await setPin(order.token, pin).expect(201);
    const customer = await db().customer.findFirstOrThrow({ where: { phone } });
    return { customer, memberToken: res.body.memberToken as string };
  };
  const me = (memberToken: string) => request(server()).get("/store/member/me").set("Authorization", `Bearer ${memberToken}`);
  const detail = (id: string, auth = manager) => request(server()).get(`/crm/customers/${id}`).set(auth);
  const reset = (id: string, auth = manager) => request(server()).post(`/crm/customers/${id}/pin/reset`).set(auth);
  const merge = (targetId: string, sourceId: string) => request(server()).post(`/crm/customers/${targetId}/merge`).set(manager).send({ sourceId });

  describe("GET /crm/customers/:id", () => {
    it("hasPin + pinLockedUntil (ສະເພາະລັອກທີ່ຍັງບໍ່ໝົດ); ບໍ່ສົ່ງ hash/ຕົວນັບ/version", async () => {
      const plain = await db().customer.create({ data: { name: "ບໍ່ມີ PIN" } });
      expect((await detail(plain.id).expect(200)).body).toMatchObject({ hasPin: false, pinLockedUntil: null, pinResetAt: null });

      const { customer } = await member();
      const res = await detail(customer.id, chat).expect(200);
      expect(res.body).toMatchObject({ hasPin: true, pinLockedUntil: null });
      for (const key of ["pinHash", "pinFailedCount", "pinVersion"]) expect(res.body).not.toHaveProperty(key);

      const until = new Date(Date.now() + 10 * 60 * 1000);
      await db().customer.update({ where: { id: customer.id }, data: { pinLockedUntil: until } });
      expect((await detail(customer.id).expect(200)).body.pinLockedUntil).toBe(until.toISOString());
      await db().customer.update({ where: { id: customer.id }, data: { pinLockedUntil: new Date(Date.now() - 1000) } });
      expect((await detail(customer.id).expect(200)).body.pinLockedUntil).toBeNull();
    });
  });

  describe("POST /crm/customers/:id/pin/reset", () => {
    it("ລ້າງ PIN + ລັອກ, session ເກົ່າໃຊ້ບໍ່ໄດ້, audit; ລູກຄ້າຕັ້ງ PIN ໃໝ່ຈາກບິນເວັບທີ່ຈ່າຍແລ້ວໄດ້", async () => {
      const { customer, memberToken } = await member();
      await me(memberToken).expect(200);
      await db().customer.update({ where: { id: customer.id }, data: { pinFailedCount: 3, pinLockedUntil: new Date(Date.now() + 60_000) } });

      const res = await reset(customer.id).expect(200);
      expect(res.body).toMatchObject({ id: customer.id, hasPin: false, pinLockedUntil: null, phone: PHONE });
      expect(res.body).not.toHaveProperty("pinHash");
      expect(await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
        pinHash: null,
        pinFailedCount: 0,
        pinLockedUntil: null,
        pinVersion: customer.pinVersion + 1,
      });
      expect((await me(memberToken).expect(401)).body.code).toBe("MEMBER_REQUIRED");
      expect((await login().expect(401)).body.code).toBe("MEMBER_LOGIN_FAILED");

      const audit = await db().auditLog.findFirstOrThrow({ where: { action: "customer.pin.reset", entityId: customer.id } });
      expect(audit.before).toMatchObject({ hasPin: true });
      expect(JSON.stringify([audit.before, audit.after])).not.toContain("argon2");

      const order = await placePaid();
      const again = await setPin(order.token, "654321").expect(201);
      await me(again.body.memberToken).expect(200);
      await login(PHONE, "654321").expect(200);
    });

    it("ຫຼັງ reset: ບິນເກົ່າທີ່ຈ່າຍກ່ອນ reset ຕັ້ງ PIN ບໍ່ໄດ້ (pinSetup NONE); ບິນໃໝ່ທີ່ຈ່າຍຫຼັງ reset ຕັ້ງໄດ້", async () => {
      const oldOrder = await placePaid();
      const { customer } = await member();
      const before = Date.now();
      await reset(customer.id).expect(200);
      const row = await db().customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(row.pinResetAt?.getTime()).toBeGreaterThanOrEqual(before);
      const audit = await db().auditLog.findFirstOrThrow({ where: { action: "customer.pin.reset", entityId: customer.id } });
      expect(audit.after).toMatchObject({ hasPin: false, pinResetAt: row.pinResetAt?.toISOString() });

      const view = await request(server()).get(`/store/orders/${oldOrder.token}`).expect(200);
      expect(view.body.pinSetup).toBe("NONE");
      expect(JSON.stringify(view.body)).not.toContain("pinResetAt");
      expect((await setPin(oldOrder.token).expect(409)).body).toMatchObject({ code: "ORDER_INVALID_STATE", reason: "PIN_RESET" });
      expect((await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).pinHash).toBeNull();
      expect((await detail(customer.id).expect(200)).body.pinResetAt).toBe(row.pinResetAt?.toISOString());

      // ບິນທີ່ສ້າງກ່ອນ reset ແຕ່ຈ່າຍຫຼັງ reset ກໍ່ໃຊ້ໄດ້ (ການຈ່າຍເກີດຫຼັງ reset)
      const res = await request(server())
        .post("/store/orders")
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ variantId: state.f.v1.id, quantity: 1 }],
          name: "ນາງ ກ",
          phone: PHONE,
          address: "ບ້ານ ກ, ວຽງຈັນ",
          courierId: state.courier.id,
          branch: "ສາຂາ ໂພນທັນ",
          expectedTotal: "100.00",
        })
        .expect(201);
      expect((await request(server()).get(`/store/orders/${res.body.token}`).expect(200)).body.pinSetup).toBe("AFTER_PAYMENT");
      await db().order.update({ where: { publicToken: res.body.token }, data: { status: "PAID", paidAt: new Date() } });
      expect((await request(server()).get(`/store/orders/${res.body.token}`).expect(200)).body.pinSetup).toBe("AVAILABLE");
      const again = await setPin(res.body.token, "654321").expect(201);
      await me(again.body.memberToken).expect(200);
    });

    it("ບິນທີ່ຈ່າຍກ່ອນ reset ແຕ່ຍັງບໍ່ມີ paidAt (ຂໍ້ມູນເກົ່າ) ກໍ່ໃຊ້ບໍ່ໄດ້", async () => {
      const { customer } = await member();
      const legacy = await placePaid();
      await db().order.update({ where: { publicToken: legacy.token }, data: { paidAt: null } });
      await reset(customer.id).expect(200);
      expect((await setPin(legacy.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("ລູກຄ້າທີ່ບໍ່ມີ PIN: ຍັງ reset ໄດ້ (version ເພີ່ມ + audit)", async () => {
      const row = await db().customer.create({ data: { name: "X" } });
      await reset(row.id).expect(200);
      await reset(row.id).expect(200);
      expect((await db().customer.findUniqueOrThrow({ where: { id: row.id } })).pinVersion).toBe(2);
      expect(await db().auditLog.count({ where: { action: "customer.pin.reset", entityId: row.id } })).toBe(2);
    });

    it("ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403; ບໍ່ login → 401", async () => {
      const { customer, memberToken } = await member();
      expect((await reset("nope").expect(404)).body.code).toBe("CUSTOMER_NOT_FOUND");
      await reset(customer.id, chat).expect(403);
      await request(server()).post(`/crm/customers/${customer.id}/pin/reset`).expect(401);
      await me(memberToken).expect(200);
      expect(await db().auditLog.count({ where: { action: "customer.pin.reset" } })).toBe(0);
    });
  });

  describe("PIN ຕັ້ງໄດ້ສະເພາະບິນທີ່ສັ່ງພາຍໃຕ້ເບີຂອງລູກຄ້າ", () => {
    it("ພະນັກງານແກ້ shippingPhone ຂອງບິນເປັນເບີອື່ນ → ບິນນັ້ນຕັ້ງ PIN ບໍ່ໄດ້ (pinSetup NONE)", async () => {
      const order = await placePaid();
      const row = await db().order.findUniqueOrThrow({ where: { publicToken: order.token } });
      await request(server()).patch(`/fulfillment/${row.id}/shipping`).set(manager).send({ shippingPhone: OTHER_PHONE }).expect(200);
      expect((await request(server()).get(`/store/orders/${order.token}`).expect(200)).body.pinSetup).toBe("NONE");
      expect((await setPin(order.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");

      // ລ້າງ shippingPhone (null) ກໍໃຊ້ບໍ່ໄດ້; ບິນທີ່ລໍຈ່າຍ ແລະ ເບີບໍ່ກົງ = NONE (ບໍ່ແມ່ນ AFTER_PAYMENT)
      await request(server()).patch(`/fulfillment/${row.id}/shipping`).set(manager).send({ shippingPhone: "" }).expect(200);
      expect((await setPin(order.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
      await db().order.update({ where: { id: row.id }, data: { status: "PENDING_PAYMENT", paidAt: null, shippingPhone: OTHER_PHONE } });
      expect((await request(server()).get(`/store/orders/${order.token}`).expect(200)).body.pinSetup).toBe("NONE");
      expect(await db().customer.findFirstOrThrow({ where: { phone: PHONE } })).toMatchObject({ pinHash: null });
    });
  });

  describe("PATCH /crm/customers/:id: PIN ຜູກກັບເບີ", () => {
    const patch = (id: string, body: object) => request(server()).patch(`/crm/customers/${id}`).set(manager).send(body);

    it("ປ່ຽນເບີ → ລ້າງ PIN + version ເພີ່ມ, session ເກົ່າ 401, audit ບັນທຶກ pinCleared", async () => {
      const { customer, memberToken } = await member();
      await db().customer.update({ where: { id: customer.id }, data: { pinFailedCount: 2, pinLockedUntil: new Date(Date.now() + 60_000) } });
      const res = await patch(customer.id, { phone: OTHER_PHONE }).expect(200);
      expect(res.body).toMatchObject({ phone: OTHER_PHONE, hasPin: false, pinLockedUntil: null });
      expect(await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
        pinHash: null,
        pinFailedCount: 0,
        pinLockedUntil: null,
        pinVersion: customer.pinVersion + 1,
      });
      expect((await me(memberToken).expect(401)).body.code).toBe("MEMBER_REQUIRED");
      await login(OTHER_PHONE).expect(401);
      const audit = await db().auditLog.findFirstOrThrow({ where: { action: "customer.update", entityId: customer.id } });
      expect(audit.after).toMatchObject({ phone: OTHER_PHONE, pinCleared: true });
      expect(JSON.stringify([audit.before, audit.after])).not.toContain("argon2");
    });

    it("ປ່ຽນເບີ → pinResetAt: ບິນເກົ່າຕັ້ງ PIN ບໍ່ໄດ້ອີກ", async () => {
      const { customer } = await member();
      const oldOrder = await placePaid();
      await patch(customer.id, { phone: OTHER_PHONE }).expect(200);
      expect((await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).pinResetAt).not.toBeNull();
      expect((await request(server()).get(`/store/orders/${oldOrder.token}`).expect(200)).body.pinSetup).toBe("NONE");
      expect((await setPin(oldOrder.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("ລ້າງເບີ → ລ້າງ PIN ຄືກັນ", async () => {
      const { customer, memberToken } = await member();
      await patch(customer.id, { phone: "" }).expect(200);
      expect((await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).pinHash).toBeNull();
      await me(memberToken).expect(401);
    });

    it("ເບີບໍ່ປ່ຽນ (ສົ່ງເບີເດີມ ຫຼື ບໍ່ສົ່ງ) → PIN ແລະ session ຍັງຢູ່", async () => {
      const { customer, memberToken } = await member();
      await patch(customer.id, { name: "ຊື່ໃໝ່", phone: PHONE }).expect(200);
      await patch(customer.id, { note: "VIP" }).expect(200);
      expect(await db().customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ pinHash: customer.pinHash, pinVersion: customer.pinVersion });
      await me(memberToken).expect(200);
      const audits = await db().auditLog.findMany({ where: { action: "customer.update", entityId: customer.id } });
      for (const audit of audits) expect(audit.after).not.toHaveProperty("pinCleared");
    });
  });

  describe("merge: ກົດຂອງ PIN", () => {
    it("target ມີ PIN: ຮັກສາ PIN ຂອງຕົນ; session ຂອງ source ໃຊ້ບໍ່ໄດ້", async () => {
      const target = await member(PHONE, "111111");
      const source = await member(OTHER_PHONE, "222222");
      await merge(target.customer.id, source.customer.id).expect(200);
      await me(target.memberToken).expect(200);
      await me(source.memberToken).expect(401);
      await login(PHONE, "111111").expect(200);
      await login(OTHER_PHONE, "222222").expect(401);
      expect((await detail(target.customer.id).expect(200)).body).toMatchObject({ phone: PHONE, hasPin: true });
    });

    it("target ບໍ່ມີ PIN ແລະ ບໍ່ມີເບີ: ຮັບເບີ + PIN ຂອງ source ພ້ອມກັນ; session ເກົ່າຂອງ source ໃຊ້ບໍ່ໄດ້", async () => {
      const target = await db().customer.create({ data: { name: "Mali FB", facebookUserId: "FB_1" } });
      const source = await member(OTHER_PHONE, "222222");
      await db().customer.update({ where: { id: source.customer.id }, data: { pinFailedCount: 2 } });
      const res = await merge(target.id, source.customer.id).expect(200);
      expect(res.body).toMatchObject({ phone: OTHER_PHONE, hasPin: true, pinLockedUntil: null });
      const row = await db().customer.findUniqueOrThrow({ where: { id: target.id } });
      expect(row).toMatchObject({ pinHash: source.customer.pinHash, pinFailedCount: 0, pinVersion: target.pinVersion + 1 });
      await me(source.memberToken).expect(401);
      const fresh = await login(OTHER_PHONE, "222222").expect(200);
      expect((await me(fresh.body.memberToken).expect(200)).body.name).toBe("Mali FB");
    });

    it("target ມີ PIN ແຕ່ບໍ່ມີເບີ (ຮັບເບີຂອງ source): PIN ທັງສອງຖືກຖິ້ມ, session ຂອງ target ໃຊ້ບໍ່ໄດ້", async () => {
      const target = await member(PHONE, "111111");
      // ພະນັກງານລ້າງເບີກ່ອນ PIN-ຜູກ-ເບີ: ສະຖານະເກົ່າທີ່ຍັງອາດມີໃນຖານ
      await db().customer.update({ where: { id: target.customer.id }, data: { phone: null } });
      const source = await member(OTHER_PHONE, "222222");
      const res = await merge(target.customer.id, source.customer.id).expect(200);
      expect(res.body).toMatchObject({ phone: OTHER_PHONE, hasPin: false });
      expect((await db().customer.findUniqueOrThrow({ where: { id: target.customer.id } })).pinVersion).toBe(target.customer.pinVersion + 1);
      await me(target.memberToken).expect(401);
      await me(source.memberToken).expect(401);
      await login(OTHER_PHONE, "111111").expect(401);
      const audit = await db().auditLog.findFirstOrThrow({ where: { action: "customer.merge", entityId: target.customer.id } });
      expect(audit.after).toMatchObject({ adoptedPin: false, pinCleared: true });
      await login(OTHER_PHONE, "222222").expect(401);
    });

    it("target ມີ PIN ແຕ່ບໍ່ມີເບີ: PIN ຖືກຖິ້ມ → pinResetAt, ບິນເກົ່າຂອງ source ຕັ້ງ PIN ບໍ່ໄດ້", async () => {
      const target = await member(PHONE, "111111");
      await db().customer.update({ where: { id: target.customer.id }, data: { phone: null } });
      const sourceOrder = await placePaid(OTHER_PHONE);
      const source = await db().customer.findUniqueOrThrow({ where: { phone: OTHER_PHONE } });
      await merge(target.customer.id, source.id).expect(200);
      expect((await db().customer.findUniqueOrThrow({ where: { id: target.customer.id } })).pinResetAt).not.toBeNull();
      expect((await setPin(sourceOrder.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("target ມີເບີ ແລະ ບໍ່ມີ PIN: ບິນເວັບທີ່ຈ່າຍແລ້ວຂອງ source (ເບີອື່ນ) ຕັ້ງ PIN ຂອງ target ບໍ່ໄດ້", async () => {
      const target = await db().customer.create({ data: { name: "T", phone: PHONE } });
      const sourceOrder = await placePaid(OTHER_PHONE);
      const source = await db().customer.findUniqueOrThrow({ where: { phone: OTHER_PHONE } });
      await merge(target.id, source.id).expect(200);
      const view = await request(server()).get(`/store/orders/${sourceOrder.token}`).expect(200);
      expect(view.body.pinSetup).toBe("NONE");
      expect((await setPin(sourceOrder.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
      expect((await db().customer.findUniqueOrThrow({ where: { id: target.id } })).pinHash).toBeNull();
      // ບິນໃໝ່ພາຍໃຕ້ເບີຂອງ target ຍັງໃຊ້ໄດ້
      const own = await placePaid(PHONE);
      await setPin(own.token).expect(201);
    });

    it("pinResetAt ຂອງ source ຕິດໄປກັບ target (ບິນເກົ່າຂອງ source ທີ່ຍ້າຍມາ ຕັ້ງ PIN ບໍ່ໄດ້)", async () => {
      const target = await db().customer.create({ data: { name: "Mali FB", facebookUserId: "FB_2" } });
      const sourceOrder = await placePaid(OTHER_PHONE);
      const source = await db().customer.findUniqueOrThrow({ where: { phone: OTHER_PHONE } });
      await reset(source.id).expect(200);
      const resetAt = (await db().customer.findUniqueOrThrow({ where: { id: source.id } })).pinResetAt;
      await merge(target.id, source.id).expect(200);
      expect((await db().customer.findUniqueOrThrow({ where: { id: target.id } })).pinResetAt).toEqual(resetAt);
      expect((await setPin(sourceOrder.token).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    });

    it("target ບໍ່ມີ PIN ແຕ່ຮັກສາເບີຂອງຕົນ: PIN ຂອງ source ຖືກຖິ້ມ", async () => {
      const target = await db().customer.create({ data: { name: "T", phone: PHONE } });
      const source = await member(OTHER_PHONE, "222222");
      const res = await merge(target.id, source.customer.id).expect(200);
      expect(res.body).toMatchObject({ phone: PHONE, hasPin: false });
      expect((await db().customer.findUniqueOrThrow({ where: { id: target.id } })).pinHash).toBeNull();
      await me(source.memberToken).expect(401);
      await login(OTHER_PHONE, "222222").expect(401);
      await login(PHONE, "222222").expect(401);
    });
  });
});

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
      expect((await detail(plain.id).expect(200)).body).toMatchObject({ hasPin: false, pinLockedUntil: null });

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

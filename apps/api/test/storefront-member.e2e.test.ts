import { createHmac, randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { MEMBER_PIN_LOCK_MINUTES, MEMBER_PIN_MAX_FAILURES } from "@oca/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { StoreMemberService } from "../src/modules/storefront/store-member.service";
import { bearerFor, seedBasics } from "./helpers";
import { FORBIDDEN_KEYS, keysOf, setupStoreTest } from "./storefront-fixtures";

const PHONE = "02055555555";
const PIN = "123456";
const ME_KEYS = ["name", "nextTier", "phone", "pointsBalance", "pointsMultiplier", "spend12m", "tier"];

describe("storefront member (e2e)", () => {
  const { server, app, db, state } = setupStoreTest({ STORE_LOGIN_RATE_LIMIT: "1000" });

  const place = async (patch: object = {}) => {
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
        ...patch,
      })
      .expect(201);
    return res.body as { orderNumber: string; token: string };
  };
  const pay = (token: string, status: "PAID" | "PACKING" | "SHIPPED" | "COMPLETED" = "PAID") =>
    db().order.update({ where: { publicToken: token }, data: { status, paidAt: new Date() } });
  const placePaid = async (patch: object = {}) => {
    const order = await place(patch);
    await pay(order.token);
    return order;
  };
  const setPin = (token: string, pin: unknown = PIN) => request(server()).post(`/store/orders/${token}/pin`).send({ pin });
  const login = (pin: string = PIN, phone: string = PHONE) => request(server()).post("/store/member/login").send({ phone, pin });
  /** ລູກຄ້າທີ່ມີ PIN ແລ້ວ (ຜ່ານບິນເວັບທີ່ຈ່າຍແລ້ວ) + token ຂອງ session */
  const member = async () => {
    const order = await placePaid();
    const res = await setPin(order.token).expect(201);
    return { order, memberToken: res.body.memberToken as string };
  };
  const get = (path: string, memberToken: string) => request(server()).get(path).set("Authorization", `Bearer ${memberToken}`);
  const customer = () => db().customer.findFirstOrThrow({ where: { phone: PHONE } });
  const expectNoLeak = (payload: unknown) => {
    const keys = keysOf(payload);
    for (const key of [...FORBIDDEN_KEYS, "id", "pinHash", "pinFailedCount", "pinLockedUntil", "pinVersion", "note", "actorId"]) {
      expect(keys.has(key), key).toBe(false);
    }
  };

  describe("POST /store/orders/:token/pin", () => {
    it("ບິນເວັບທີ່ຈ່າຍແລ້ວ → 201: ເກັບ PIN ເປັນ argon2 ແລະ ເຂົ້າລະບົບໃຫ້ທັນທີ", async () => {
      const order = await placePaid();
      const res = await setPin(order.token).expect(201);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(Object.keys(res.body).sort()).toEqual(["member", "memberToken"]);
      expect(Object.keys(res.body.member).sort()).toEqual(ME_KEYS);
      expect(res.body.member).toMatchObject({ name: "ນາງ ກ", phone: PHONE, pointsBalance: 0, tier: "BRONZE" });
      expectNoLeak(res.body);

      const row = await customer();
      expect(row.pinHash).toMatch(/^\$argon2id\$/);
      expect(row.pinHash).not.toContain(PIN);
      const me = await get("/store/member/me", res.body.memberToken).expect(200);
      expect(me.body).toEqual(res.body.member);
    });

    it("ທຸກສະຖານະຫຼັງຈ່າຍ (PACKING/SHIPPED/COMPLETED) ຕັ້ງໄດ້", async () => {
      for (const [index, status] of (["PACKING", "SHIPPED", "COMPLETED"] as const).entries()) {
        const order = await place({ phone: `0201111111${index}` });
        await pay(order.token, status);
        await setPin(order.token).expect(201);
      }
    });

    it("ຕັ້ງໄດ້ຄັ້ງດຽວ: ຄັ້ງທີ 2 (ບິນເດີມ ຫຼື ບິນອື່ນຂອງລູກຄ້າຄົນດຽວ) → 409 PIN_ALREADY_SET ແລະ PIN ເດີມຍັງຢູ່", async () => {
      const { order } = await member();
      const hash = (await customer()).pinHash;
      const again = await setPin(order.token, "654321").expect(409);
      expect(again.body.code).toBe("PIN_ALREADY_SET");
      const other = await placePaid();
      expect((await setPin(other.token, "654321").expect(409)).body.code).toBe("PIN_ALREADY_SET");
      expect((await customer()).pinHash).toBe(hash);
      await login("654321").expect(401);
      await login().expect(200);
    });

    it("ສອງຄຳຂໍພ້ອມກັນ → ສຳເລັດອັນດຽວ, ອີກອັນ 409 PIN_ALREADY_SET", async () => {
      const order = await placePaid();
      const results = await Promise.all([setPin(order.token, "111111"), setPin(order.token, "222222")]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)?.body.code).toBe("PIN_ALREADY_SET");
      const winner = results.findIndex((res) => res.status === 201) === 0 ? "111111" : "222222";
      await login(winner).expect(200);
    });

    it("ບິນຍັງບໍ່ຈ່າຍ / ໝົດອາຍຸ / ຍົກເລີກ → 409 ORDER_INVALID_STATE; ບໍ່ຕັ້ງ PIN", async () => {
      const order = await place();
      for (const status of ["PENDING_PAYMENT", "EXPIRED", "CANCELLED"] as const) {
        await db().order.update({ where: { publicToken: order.token }, data: { status } });
        const res = await setPin(order.token).expect(409);
        expect(res.body).toMatchObject({ code: "ORDER_INVALID_STATE", status });
        expectNoLeak(res.body);
      }
      expect((await customer()).pinHash).toBeNull();
    });

    it("ບິນທີ່ບໍ່ແມ່ນຂອງເວັບ ຫຼື ບໍ່ມີລູກຄ້າ → 409 ORDER_INVALID_STATE (ບໍ່ມີ status: ບໍ່ແມ່ນບັນຫາສະຖານະ)", async () => {
      const order = await placePaid();
      await db().order.update({ where: { publicToken: order.token }, data: { channel: "FACEBOOK" } });
      const channel = await setPin(order.token).expect(409);
      expect(channel.body.code).toBe("ORDER_INVALID_STATE");
      expect(channel.body).not.toHaveProperty("status");
      await db().order.update({ where: { publicToken: order.token }, data: { channel: "STOREFRONT", customerId: null } });
      const orphan = await setPin(order.token).expect(409);
      expect(orphan.body.code).toBe("ORDER_INVALID_STATE");
      expect(orphan.body).not.toHaveProperty("status");
      expect((await customer()).pinHash).toBeNull();
    });

    it("token ບໍ່ມີ/ຜິດຮູບແບບ → 404 ORDER_NOT_FOUND; PIN ບໍ່ແມ່ນເລກ 6 ຕົວ → 400", async () => {
      const order = await placePaid();
      const row = await db().order.findFirstOrThrow();
      for (const token of ["x", "A".repeat(43), row.id]) {
        expect((await setPin(token).expect(404)).body.code).toBe("ORDER_NOT_FOUND");
      }
      for (const pin of ["12345", "1234567", "12345a", 123456]) await setPin(order.token, pin).expect(400);
      await request(server()).post(`/store/orders/${order.token}/pin`).send({ pin: PIN, phone: PHONE }).expect(400);
      expect((await customer()).pinHash).toBeNull();
    });
  });

  describe("POST /store/member/login", () => {
    it("ເບີ + PIN ຖືກ → 200 { memberToken, member }", async () => {
      await member();
      const res = await login().expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(Object.keys(res.body).sort()).toEqual(["member", "memberToken"]);
      expect(res.body.member).toMatchObject({ name: "ນາງ ກ", phone: PHONE });
      expectNoLeak(res.body);
      await get("/store/member/me", res.body.memberToken).expect(200);
    });

    it("ເບີບໍ່ມີ / ລູກຄ້າບໍ່ມີ PIN / PIN ຜິດ → 401 MEMBER_LOGIN_FAILED ຄືກັນທຸກກໍລະນີ", async () => {
      await member();
      await db().customer.create({ data: { name: "ບໍ່ມີ PIN", phone: "02077777777" } });
      const bodies = [
        (await login(PIN, "02099999999").expect(401)).body,
        (await login(PIN, "02077777777").expect(401)).body,
        (await login("000000").expect(401)).body,
      ];
      for (const body of bodies) {
        expect(body).toEqual(bodies[0]);
        expect(body.code).toBe("MEMBER_LOGIN_FAILED");
      }
      // ລູກຄ້າທີ່ບໍ່ມີ PIN ບໍ່ຖືກນັບ/ລັອກ
      expect(await db().customer.findFirstOrThrow({ where: { phone: "02077777777" } })).toMatchObject({ pinFailedCount: 0, pinLockedUntil: null });
      expect((await customer()).pinFailedCount).toBe(1);
    });

    it("body ຜິດຮູບແບບ → 400", async () => {
      await login("12345").expect(400);
      await login(PIN, "abc").expect(400);
      await request(server()).post("/store/member/login").send({ phone: PHONE }).expect(400);
    });

    it(`ຜິດ ${MEMBER_PIN_MAX_FAILURES} ຄັ້ງຕິດກັນ → 429 MEMBER_LOCKED ພ້ອມ retryAfterSeconds; PIN ຖືກກໍ່ຖືກປະຕິເສດລະຫວ່າງລັອກ`, async () => {
      await member();
      for (let attempt = 1; attempt < MEMBER_PIN_MAX_FAILURES; attempt += 1) {
        expect((await login("000000").expect(401)).body.code).toBe("MEMBER_LOGIN_FAILED");
      }
      expect((await customer()).pinFailedCount).toBe(MEMBER_PIN_MAX_FAILURES - 1);

      const locked = await login("000000").expect(429);
      expect(locked.body.code).toBe("MEMBER_LOCKED");
      expect(locked.body.retryAfterSeconds).toBeGreaterThan((MEMBER_PIN_LOCK_MINUTES - 1) * 60);
      expect(locked.body.retryAfterSeconds).toBeLessThanOrEqual(MEMBER_PIN_LOCK_MINUTES * 60);
      expectNoLeak(locked.body);
      const row = await customer();
      expect(row.pinFailedCount).toBe(0);
      expect(row.pinLockedUntil?.getTime()).toBeGreaterThan(Date.now());

      const correct = await login().expect(429);
      expect(correct.body.code).toBe("MEMBER_LOCKED");
      expect(correct.body.retryAfterSeconds).toBeGreaterThan(0);
      // ຄຳຂໍລະຫວ່າງລັອກ ບໍ່ຍືດເວລາລັອກ
      expect((await customer()).pinLockedUntil).toEqual(row.pinLockedUntil);
    });

    /** ຜິດຈົນຖືກລັອກ ແລ້ວເລື່ອນເວລາລັອກໄປອະດີດ (ສະຖານະທີ່ເກີດຈິງຫຼັງລໍຄົບເວລາ: ຕົວນັບ 0 + ລັອກໝົດອາຍຸ) */
    const lockThenExpire = async () => {
      for (let attempt = 1; attempt < MEMBER_PIN_MAX_FAILURES; attempt += 1) await login("000000").expect(401);
      await login("000000").expect(429);
      await db().customer.updateMany({ where: { phone: PHONE }, data: { pinLockedUntil: new Date(Date.now() - 1000) } });
      expect((await customer()).pinFailedCount).toBe(0);
    };

    it("ຫຼັງໝົດເວລາລັອກ: PIN ຖືກ → 200 ແລະ ລ້າງລັອກ", async () => {
      await member();
      await lockThenExpire();
      await login().expect(200);
      expect(await customer()).toMatchObject({ pinFailedCount: 0, pinLockedUntil: null });
    });

    it("ຫຼັງໝົດເວລາລັອກ: PIN ຜິດ → 401, ຕົວນັບເລີ່ມ 1 ແລະ ລັອກເກົ່າຖືກລ້າງ (ບໍ່ລັອກຄືນທັນທີ)", async () => {
      await member();
      await lockThenExpire();
      expect((await login("000000").expect(401)).body.code).toBe("MEMBER_LOGIN_FAILED");
      expect(await customer()).toMatchObject({ pinFailedCount: 1, pinLockedUntil: null });
      await login().expect(200);
    });

    it("ເຂົ້າສຳເລັດ ລ້າງຕົວນັບ: ຜິດ 4 → ຖືກ → ຜິດ 4 ຍັງບໍ່ລັອກ", async () => {
      await member();
      for (let attempt = 0; attempt < MEMBER_PIN_MAX_FAILURES - 1; attempt += 1) await login("000000").expect(401);
      await login().expect(200);
      expect((await customer()).pinFailedCount).toBe(0);
      for (let attempt = 0; attempt < MEMBER_PIN_MAX_FAILURES - 1; attempt += 1) await login("000000").expect(401);
      await login().expect(200);
    });

    it("ເດົາພ້ອມກັນຫຼາຍຄຳຂໍ: ນັບຄົບທຸກຄັ້ງ (ບໍ່ເສຍຕົວນັບ) ແລະ ລັອກ", async () => {
      await member();
      const results = await Promise.all(Array.from({ length: MEMBER_PIN_MAX_FAILURES + 3 }, () => login("000000")));
      expect(results.filter((res) => res.status === 401)).toHaveLength(MEMBER_PIN_MAX_FAILURES - 1);
      expect(results.filter((res) => res.status === 429)).toHaveLength(4);
      await login().expect(429);
    });
  });

  describe("session ຂອງສະມາຊິກ", () => {
    const paths = ["/store/member/me", "/store/member/orders", "/store/member/points"];
    const expectRequired = async (header?: string) => {
      for (const path of paths) {
        const req = request(server()).get(path);
        const res = await (header === undefined ? req : req.set("Authorization", header)).expect(401);
        expect(res.body.code).toBe("MEMBER_REQUIRED");
      }
    };

    it("ບໍ່ມີ header / ບໍ່ແມ່ນ Bearer / token ມົ້ວ → 401 MEMBER_REQUIRED", async () => {
      await member();
      await expectRequired();
      await expectRequired("Basic abc");
      await expectRequired("Bearer not-a-jwt");
    });

    it("access token ຂອງພະນັກງານ → 401 MEMBER_REQUIRED", async () => {
      await member();
      await seedBasics(db());
      const staff = await bearerFor(app(), "owner@test.local");
      await expectRequired(staff.Authorization);
    });

    it("token ຖືກແກ້ (payload ຫຼື ລາຍເຊັນ) → 401 MEMBER_REQUIRED", async () => {
      const { memberToken } = await member();
      const other = await db().customer.create({ data: { name: "ຄົນອື່ນ", phone: "02077777777", pinHash: "x" } });
      const [header, payload, signature] = memberToken.split(".") as [string, string, string];
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
      expect(claims).toMatchObject({ aud: "member", pv: 0 });
      const forged = Buffer.from(JSON.stringify({ ...claims, sub: other.id })).toString("base64url");
      await expectRequired(`Bearer ${header}.${forged}.${signature}`);
      await expectRequired(`Bearer ${header}.${payload}.${signature.slice(0, -2)}AA`);
      const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      await expectRequired(`Bearer ${none}.${forged}.`);
    });

    it("ເຊັນດ້ວຍກະແຈສະມາຊິກທີ່ຖືກ ແຕ່ audience ຜິດ/ບໍ່ມີ ຫຼື ໝົດອາຍຸ → 401 MEMBER_REQUIRED", async () => {
      const { memberToken } = await member();
      const me = await customer();
      // ກະແຈແບບດຽວກັບ service: test ບໍ່ຕັ້ງ MEMBER_JWT_SECRET ຈຶ່ງແຕກຈາກ JWT_ACCESS_SECRET
      expect(process.env.MEMBER_JWT_SECRET || undefined).toBeUndefined(); // ຄ່າວ່າງ (ສຳເນົາຈາກ .env.example) = ບໍ່ຕັ້ງ
      const secret = createHmac("sha256", process.env.JWT_ACCESS_SECRET as string).update("oca-member-session").digest("hex");
      const sign = (payload: object, options: { audience?: string; expiresIn?: number } = {}) =>
        app().get(JwtService).signAsync({ pv: me.pinVersion, ...payload }, { subject: me.id, secret, algorithm: "HS256", ...options });

      // ກະແຈທີ່ແຕກເອງໃຊ້ໄດ້ຈິງ: token ທີ່ຖືກຕ້ອງຜ່ານ (ບໍ່ດັ່ງນັ້ນ 401 ລຸ່ມນີ້ອາດມາຈາກກະແຈຜິດ)
      await get("/store/member/me", await sign({}, { audience: "member", expiresIn: 60 })).expect(200);
      await expectRequired(`Bearer ${await sign({}, { audience: "staff", expiresIn: 60 })}`);
      await expectRequired(`Bearer ${await sign({}, { expiresIn: 60 })}`);
      const past = Math.floor(Date.now() / 1000) - 3600;
      await expectRequired(`Bearer ${await sign({ iat: past - 60, exp: past }, { audience: "member" })}`);
      await get("/store/member/me", memberToken).expect(200);
    });

    it("optionalMember: ບໍ່ມີ header ຫຼື header ວ່າງ/ຜິດ = null (guest); token ຖືກ = ລູກຄ້າ", async () => {
      const { memberToken } = await member();
      const service = app().get(StoreMemberService);
      expect(await service.optionalMember(undefined)).toBeNull();
      for (const header of ["", "Bearer ", "Bearer not-a-jwt"]) {
        expect(await service.optionalMember(header)).toBeNull();
      }
      const me = await customer();
      expect(await service.optionalMember(`Bearer ${memberToken}`)).toEqual({ id: me.id, name: me.name, phone: PHONE, pointsBalance: 0, tier: "BRONZE" });
    });

    it("pinVersion ປ່ຽນ (reset PIN) ຫຼື PIN ຖືກລຶບ ຫຼື ລູກຄ້າຖືກລຶບ → session ເກົ່າໃຊ້ບໍ່ໄດ້", async () => {
      const { memberToken } = await member();
      await get("/store/member/me", memberToken).expect(200);
      await db().customer.updateMany({ where: { phone: PHONE }, data: { pinVersion: { increment: 1 } } });
      await expectRequired(`Bearer ${memberToken}`);
      await db().customer.updateMany({ where: { phone: PHONE }, data: { pinVersion: 0, pinHash: null } });
      await expectRequired(`Bearer ${memberToken}`);
      await db().customer.deleteMany({ where: { phone: PHONE } });
      await expectRequired(`Bearer ${memberToken}`);
    });
  });

  describe("GET /store/member/me", () => {
    it("ຍອດແຕ້ມ, ລະດັບ, ຍອດຊື້ 12 ເດືອນ, ລະດັບຖັດໄປ ແລະ ຕົວຄູນ (ເງິນເປັນ string)", async () => {
      const { memberToken } = await member();
      await db().customer.updateMany({ where: { phone: PHONE }, data: { pointsBalance: 42, note: "ບັນທຶກພາຍໃນ" } });
      const res = await get("/store/member/me", memberToken).expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      // ລະບົບແຕ້ມປິດ (ບໍ່ມີ StoreSetting) ກໍ່ຍັງຄືນຍອດ/ລະດັບ
      expect(res.body).toEqual({
        name: "ນາງ ກ",
        phone: PHONE,
        pointsBalance: 42,
        tier: "BRONZE",
        spend12m: "100.00",
        nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "1999900.00" },
        pointsMultiplier: "1",
      });
      expect(JSON.stringify(res.body)).not.toContain("ບັນທຶກພາຍໃນ");
    });

    it("ລະດັບທີ່ບັນທຶກເປັນຂັ້ນສູງສຸດ ເຖິງຍອດຊື້ຕ່ຳ → nextTier null ແລະ ຕົວຄູນຂອງລະດັບ", async () => {
      const { memberToken } = await member();
      await db().customer.updateMany({ where: { phone: PHONE }, data: { tier: "PLATINUM" } });
      const res = await get("/store/member/me", memberToken).expect(200);
      expect(res.body).toMatchObject({ tier: "PLATINUM", spend12m: "100.00", nextTier: null, pointsMultiplier: "2" });
    });

    it("nextTier ນັບຈາກລະດັບທີ່ບັນທຶກ ບໍ່ແມ່ນຈາກຍອດຊື້: ຂັ້ນຖັດຈາກ tier, remaining ບໍ່ຕິດລົບ", async () => {
      const { memberToken } = await member();
      // ລະດັບສູງກວ່າຍອດຊື້ (ຍັງບໍ່ຖືກຫຼຸດ): ຂັ້ນຖັດໄປແມ່ນ GOLD ບໍ່ແມ່ນ SILVER
      await db().customer.updateMany({ where: { phone: PHONE }, data: { tier: "SILVER" } });
      const ahead = await get("/store/member/me", memberToken).expect(200);
      expect(ahead.body).toMatchObject({
        tier: "SILVER",
        nextTier: { tier: "GOLD", minSpend: "5000000.00", remaining: "4999900.00" },
        pointsMultiplier: "1.25",
      });
      // ຍອດຊື້ເກີນເກນແລ້ວ ແຕ່ລະດັບຍັງບໍ່ທັນຖືກຄິດໃໝ່: ຍັງຊີ້ຂັ້ນຖັດຈາກ tier ແລະ ເຫຼືອ 0
      await db().customer.updateMany({ where: { phone: PHONE }, data: { tier: "BRONZE" } });
      await db().order.updateMany({ data: { subtotal: "3000000.00" } });
      const behind = await get("/store/member/me", memberToken).expect(200);
      expect(behind.body).toMatchObject({
        tier: "BRONZE",
        spend12m: "3000000.00",
        nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "0.00" },
      });
    });
  });

  describe("GET /store/member/orders", () => {
    it("ບິນທຸກຊ່ອງທາງຂອງລູກຄ້າ ໃໝ່ກ່ອນ; token ສະເພາະບິນເວັບ; ບໍ່ເຫັນບິນຂອງຄົນອື່ນ", async () => {
      const { order, memberToken } = await member();
      const me = await customer();
      const base = { currency: "LAK", subtotal: "50.00", vatRate: "10.00", vatAmount: "4.55", total: "50.00" } as const;
      await db().order.create({
        data: { ...base, orderNumber: "FB-1", customerId: me.id, channel: "FACEBOOK", source: "CHAT", status: "COMPLETED", createdAt: new Date(Date.now() + 60_000) },
      });
      await place({ phone: "02077777777" });

      const res = await get("/store/member/orders", memberToken).expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 10 });
      expect(res.body.items).toEqual([
        { orderNumber: "FB-1", createdAt: expect.any(String), status: "COMPLETED", total: "50.00", channel: "FACEBOOK", token: null },
        { orderNumber: order.orderNumber, createdAt: expect.any(String), status: "PAID", total: "100.00", channel: "STOREFRONT", token: order.token },
      ]);
      expectNoLeak(res.body);
    });

    it("ແບ່ງໜ້າລະ 10; ບິນລໍຈ່າຍທີ່ເກີນເວລາຈອງ ສະແດງເປັນ EXPIRED", async () => {
      const { memberToken } = await member();
      const me = await customer();
      const base = { currency: "LAK", subtotal: "50.00", vatRate: "10.00", vatAmount: "4.55", total: "50.00" } as const;
      for (let index = 0; index < 11; index += 1) {
        await db().order.create({
          data: {
            ...base,
            orderNumber: `OLD-${index}`,
            customerId: me.id,
            channel: "OFFLINE",
            source: "MANUAL",
            status: "PENDING_PAYMENT",
            reservedUntil: new Date(Date.now() - 1000),
            createdAt: new Date(Date.now() - (index + 1) * 60_000),
          },
        });
      }
      const first = await get("/store/member/orders", memberToken).expect(200);
      expect(first.body).toMatchObject({ total: 12, page: 1, pageSize: 10 });
      expect(first.body.items).toHaveLength(10);
      expect(first.body.items[1]).toMatchObject({ orderNumber: "OLD-0", status: "EXPIRED" });
      const second = await get("/store/member/orders?page=2", memberToken).expect(200);
      expect(second.body.items.map((item: { orderNumber: string }) => item.orderNumber)).toEqual(["OLD-9", "OLD-10"]);
      await get("/store/member/orders?page=0", memberToken).expect(400);
    });
  });

  describe("GET /store/member/points", () => {
    it("ສະໝຸດແຕ້ມ ໃໝ່ກ່ອນ ພ້ອມເລກບິນ; ບໍ່ມີບັນທຶກຂອງພະນັກງານ", async () => {
      const { order, memberToken } = await member();
      const me = await customer();
      const row = await db().order.findUniqueOrThrow({ where: { publicToken: order.token } });
      const staff = (await seedBasics(db())).ownerUser;
      await db().pointEntry.create({
        data: { customerId: me.id, orderId: row.id, type: "EARN", points: 10, balanceAfter: 10, createdAt: new Date(Date.now() - 60_000) },
      });
      await db().pointEntry.create({
        data: { customerId: me.id, type: "ADJUST", points: -3, balanceAfter: 7, note: "ລູກຄ້າຈົ່ມ ຫັກແຕ້ມ", actorId: staff.id },
      });
      const stranger = await db().customer.create({ data: { name: "ຄົນອື່ນ", phone: "02077777777" } });
      await db().pointEntry.create({ data: { customerId: stranger.id, type: "ADJUST", points: 99, balanceAfter: 99 } });

      const res = await get("/store/member/points", memberToken).expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toEqual({
        items: [
          { createdAt: expect.any(String), type: "ADJUST", points: -3, balanceAfter: 7, orderNumber: null },
          { createdAt: expect.any(String), type: "EARN", points: 10, balanceAfter: 10, orderNumber: order.orderNumber },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      });
      expect(JSON.stringify(res.body)).not.toContain("ຈົ່ມ");
      expectNoLeak(res.body);
    });

    it("ແບ່ງໜ້າລະ 10", async () => {
      const { memberToken } = await member();
      const me = await customer();
      for (let index = 1; index <= 11; index += 1) {
        await db().pointEntry.create({
          data: { customerId: me.id, type: "ADJUST", points: 1, balanceAfter: index, createdAt: new Date(Date.now() - (12 - index) * 60_000) },
        });
      }
      const first = await get("/store/member/points", memberToken).expect(200);
      expect(first.body).toMatchObject({ total: 11, page: 1, pageSize: 10 });
      expect(first.body.items[0].balanceAfter).toBe(11);
      const second = await get("/store/member/points?page=2", memberToken).expect(200);
      expect(second.body.items.map((item: { balanceAfter: number }) => item.balanceAfter)).toEqual([1]);
    });
  });
});

describe("storefront member rate limit (e2e)", () => {
  const { server } = setupStoreTest({ STORE_LOGIN_RATE_LIMIT: "2" });

  it("ເຂົ້າລະບົບ + ຕັ້ງ PIN ນັບລວມກັນຕໍ່ IP: ເກີນ → 429 TOO_MANY_ATTEMPTS", async () => {
    const login = () => request(server()).post("/store/member/login").send({ phone: PHONE, pin: PIN });
    await login().expect(401);
    await request(server()).post(`/store/orders/${"A".repeat(43)}/pin`).send({ pin: PIN }).expect(404);
    expect((await login().expect(429)).body.code).toBe("TOO_MANY_ATTEMPTS");
    const pin = await request(server()).post(`/store/orders/${"A".repeat(43)}/pin`).send({ pin: PIN }).expect(429);
    expect(pin.body.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

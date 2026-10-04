import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_PASSWORD, createTestApp, loginAs, refreshCookieOf, resetDb, seedBasics } from "./helpers";

describe("auth (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedBasics(db);
  });

  it("login ສຳເລັດ: ໄດ້ access token, user ແລະ cookie httpOnly (ບໍ່ມີ refresh token ໃນ body)", async () => {
    const res = await request(server())
      .post("/auth/login")
      .send({ email: "Owner@Test.local", password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.user).toMatchObject({ email: "owner@test.local", roleName: "OWNER" });
    expect(res.body.user.permissions).toHaveLength(24);
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookies).toContain("oca_rt=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("Path=/auth");

    const user = await db.user.findUniqueOrThrow({ where: { email: "owner@test.local" } });
    expect(user.lastLoginAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "auth.login", userId: user.id } })).toBe(1);
  });

  it("login ຜິດ (ລະຫັດຜິດ, ບໍ່ມີ email, ບັນຊີຖືກປິດ) ໄດ້ 401 ຂໍ້ຄວາມດຽວກັນ ແລະ ບັນທຶກ audit", async () => {
    const wrongPassword = await request(server())
      .post("/auth/login")
      .send({ email: "owner@test.local", password: "wrong-password" })
      .expect(401);
    const unknownEmail = await request(server())
      .post("/auth/login")
      .send({ email: "nobody@test.local", password: TEST_PASSWORD })
      .expect(401);
    await db.user.update({ where: { email: "viewer@test.local" }, data: { isActive: false } });
    const inactive = await request(server())
      .post("/auth/login")
      .send({ email: "viewer@test.local", password: TEST_PASSWORD })
      .expect(401);

    expect(wrongPassword.body.message).toBe("Invalid credentials");
    expect(unknownEmail.body.message).toBe("Invalid credentials");
    expect(inactive.body.message).toBe("Invalid credentials");
    expect(await db.auditLog.count({ where: { action: "auth.login_failed" } })).toBe(3);
  });

  it("login ດ້ວຍ body ຜິດຮູບແບບ ໄດ້ 400", async () => {
    await request(server()).post("/auth/login").send({ email: "x", password: "short" }).expect(400);
  });

  it("GET /auth/me ຕ້ອງມີ token ທີ່ຖືກຕ້ອງ", async () => {
    await request(server()).get("/auth/me").expect(401);
    await request(server()).get("/auth/me").set("Authorization", "Bearer garbage").expect(401);

    const { accessToken } = await loginAs(app, "viewer@test.local");
    const res = await request(server()).get("/auth/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(res.body).toMatchObject({ email: "viewer@test.local", roleName: "VIEWER", permissions: ["staff:read"] });
  });

  it("ບັນຊີທີ່ຖືກປິດຫຼັງ login: access token ເດີມໃຊ້ບໍ່ໄດ້ທັນທີ", async () => {
    const { accessToken } = await loginAs(app, "viewer@test.local");
    await db.user.update({ where: { email: "viewer@test.local" }, data: { isActive: false } });
    await request(server()).get("/auth/me").set("Authorization", `Bearer ${accessToken}`).expect(401);
  });

  it("refresh ຫມູນ token ໃໝ່; ການໃຊ້ token ເກົ່າຊ້ຳ revoke ທັງ family", async () => {
    const first = await loginAs(app, "owner@test.local");
    const second = await request(server()).post("/auth/refresh").set("Cookie", first.cookie).expect(200);
    const rotated = refreshCookieOf(second);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(first.cookie);
    expect(second.body.accessToken).toEqual(expect.any(String));

    await request(server()).post("/auth/refresh").set("Cookie", first.cookie).expect(401);
    await request(server()).post("/auth/refresh").set("Cookie", rotated as string).expect(401);
    expect(await db.auditLog.count({ where: { action: "auth.refresh_reuse" } })).toBe(1);
  });

  it("refresh ໂດຍບໍ່ມີ cookie ຫຼື cookie ມົ່ວ ໄດ້ 401", async () => {
    await request(server()).post("/auth/refresh").expect(401);
    await request(server()).post("/auth/refresh").set("Cookie", "oca_rt=not-a-real-token").expect(401);
  });

  it("logout revoke token ແລະ ລ້າງ cookie", async () => {
    const { cookie } = await loginAs(app, "owner@test.local");
    const res = await request(server()).post("/auth/logout").set("Cookie", cookie).expect(200);
    expect(refreshCookieOf(res)).toBeUndefined();
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toContain("oca_rt=;");
    await request(server()).post("/auth/refresh").set("Cookie", cookie).expect(401);
    expect(await db.auditLog.count({ where: { action: "auth.logout" } })).toBe(1);
  });

  it("login ເກີນຈຳນວນຕໍ່ນາທີ ໄດ້ 429", async () => {
    const limited = await createTestApp({ LOGIN_RATE_LIMIT: "3" });
    try {
      for (let i = 0; i < 3; i++) {
        await request(limited.app.getHttpServer())
          .post("/auth/login")
          .send({ email: "x@test.local", password: "wrong-password" })
          .expect(401);
      }
      await request(limited.app.getHttpServer())
        .post("/auth/login")
        .send({ email: "x@test.local", password: "wrong-password" })
        .expect(429);
    } finally {
      await limited.app.close();
    }
  });
});

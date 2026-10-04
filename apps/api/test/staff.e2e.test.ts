import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_PASSWORD, createTestApp, loginAs, refreshCookieOf, resetDb, seedBasics } from "./helpers";

describe("staff (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let ids: Awaited<ReturnType<typeof seedBasics>>;
  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    ids = await seedBasics(db);
  });

  it("ຕ້ອງ login; VIEWER (staff:read) ອ່ານໄດ້ ແຕ່ສ້າງບໍ່ໄດ້", async () => {
    await request(server()).get("/staff").expect(401);
    const { accessToken } = await loginAs(app, "viewer@test.local");

    const list = await request(server()).get("/staff").set(bearer(accessToken)).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0]).not.toHaveProperty("passwordHash");

    await request(server())
      .post("/staff")
      .set(bearer(accessToken))
      .send({ email: "n@test.local", name: "N", password: "Password123!", roleId: ids.viewer.id })
      .expect(403);
  });

  it("OWNER ສ້າງພະນັກງານ: ບໍ່ເຫັນ passwordHash, login ໄດ້, ມີ audit", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const res = await request(server())
      .post("/staff")
      .set(bearer(accessToken))
      .send({ email: "New@Test.local", name: "ນ້ອງໃໝ່", password: "NewPassword1!", roleId: ids.viewer.id })
      .expect(201);

    expect(res.body).toMatchObject({ email: "new@test.local", name: "ນ້ອງໃໝ່", roleName: "VIEWER", isActive: true });
    expect(res.body).not.toHaveProperty("passwordHash");
    await loginAs(app, "new@test.local", "NewPassword1!");

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "staff.create" } });
    expect(audit.entityId).toBe(res.body.id);
    expect(JSON.stringify(audit.after)).not.toContain("assword");
  });

  it("ສ້າງ: email ຊ້ຳ 409, role ບໍ່ມີ 400, body ຜິດ 400", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const send = (body: object) => request(server()).post("/staff").set(bearer(accessToken)).send(body);
    const valid = { email: "dup@test.local", name: "D", password: "Password123!", roleId: ids.viewer.id };

    await send(valid).expect(201);
    await send(valid).expect(409);
    await send({ ...valid, email: "other@test.local", roleId: "missing" }).expect(400);
    await send({ ...valid, email: "short@test.local", password: "short" }).expect(400);
  });

  it("ແກ້ຊື່ ແລະ ປ່ຽນ role; body ເປົ່າ 400; id ບໍ່ມີ 404", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const patch = (id: string, body: object) =>
      request(server()).patch(`/staff/${id}`).set(bearer(accessToken)).send(body);

    const res = await patch(ids.viewerUser.id, { name: "Renamed" }).expect(200);
    expect(res.body.name).toBe("Renamed");
    await patch(ids.viewerUser.id, {}).expect(400);
    await patch("missing-id", { name: "X" }).expect(404);
    expect(await db.auditLog.count({ where: { action: "staff.update" } })).toBe(1);
  });

  it("ປິດບັນຊີ: token ເດີມໃຊ້ບໍ່ໄດ້ ແລະ refresh ຖືກ revoke", async () => {
    const owner = await loginAs(app, "owner@test.local");
    const viewer = await loginAs(app, "viewer@test.local");

    await request(server())
      .patch(`/staff/${ids.viewerUser.id}`)
      .set(bearer(owner.accessToken))
      .send({ isActive: false })
      .expect(200);

    await request(server()).get("/auth/me").set(bearer(viewer.accessToken)).expect(401);
    await request(server()).post("/auth/refresh").set("Cookie", viewer.cookie).expect(401);
  });

  it("ປ່ຽນລະຫັດຜ່ານ: ລະຫັດເກົ່າໃຊ້ບໍ່ໄດ້, refresh ເກົ່າຖືກ revoke", async () => {
    const owner = await loginAs(app, "owner@test.local");
    const viewer = await loginAs(app, "viewer@test.local");

    await request(server())
      .patch(`/staff/${ids.viewerUser.id}`)
      .set(bearer(owner.accessToken))
      .send({ password: "BrandNewPass1!" })
      .expect(200);

    await request(server()).post("/auth/refresh").set("Cookie", viewer.cookie).expect(401);
    await request(server())
      .post("/auth/login")
      .send({ email: "viewer@test.local", password: TEST_PASSWORD })
      .expect(401);
    const relogin = await request(server())
      .post("/auth/login")
      .send({ email: "viewer@test.local", password: "BrandNewPass1!" })
      .expect(200);
    expect(refreshCookieOf(relogin)).toBeDefined();
  });

  it("ປິດ ຫຼື ປ່ຽນ role ຂອງ OWNER ຄົນສຸດທ້າຍບໍ່ໄດ້ (409); ມີ OWNER ອີກຄົນແລ້ວເຮັດໄດ້", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const patch = (id: string, body: object) =>
      request(server()).patch(`/staff/${id}`).set(bearer(accessToken)).send(body);

    await patch(ids.ownerUser.id, { isActive: false }).expect(409);
    await patch(ids.ownerUser.id, { roleId: ids.viewer.id }).expect(409);

    await db.user.create({
      data: { email: "owner2@test.local", name: "Owner2", passwordHash: "x", roleId: ids.owner.id },
    });
    await patch(ids.ownerUser.id, { roleId: ids.viewer.id }).expect(200);
  });
});

import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_PASSWORD, createTestApp, loginAs, refreshCookieOf, resetDb, seedBasics, seedHr } from "./helpers";

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
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|tokenHash/);
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

  it("ສ້າງ: email ຊ້ຳ 409, role ບໍ່ມີ 404, body ຜິດ 400", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const send = (body: object) => request(server()).post("/staff").set(bearer(accessToken)).send(body);
    const valid = { email: "dup@test.local", name: "D", password: "Password123!", roleId: ids.viewer.id };

    await send(valid).expect(201);
    await send(valid).expect(409);
    const noRole = await send({ ...valid, email: "other@test.local", roleId: "missing" }).expect(404);
    expect(noRole.body.code).toBe("ROLE_NOT_FOUND");
    await send({ ...valid, email: "short@test.local", password: "short" }).expect(400);
  });

  it("ແກ້ຊື່ ແລະ ປ່ຽນ role; body ເປົ່າ 400; id ບໍ່ມີ 404", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const patch = (id: string, body: object) =>
      request(server()).patch(`/staff/${id}`).set(bearer(accessToken)).send(body);

    const res = await patch(ids.viewerUser.id, { name: "Renamed" }).expect(200);
    expect(res.body.name).toBe("Renamed");
    await patch(ids.viewerUser.id, {}).expect(400);
    await patch(ids.viewerUser.id, { name: "X", unknownKey: 1 }).expect(400);
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

  it("OWNER ປ່ຽນ role ຂອງ OWNER ຄົນອື່ນໄດ້ ເມື່ອມີ OWNER ເຫຼືອ; ແກ້ຕົນເອງບໍ່ໄດ້ (403)", async () => {
    // The 409 last-OWNER path is only reachable via a race (an acting OWNER is always
    // an active OWNER and self-demotion is forbidden); see the concurrency test below.
    const { accessToken } = await loginAs(app, "owner@test.local");
    const patch = (id: string, body: object) =>
      request(server()).patch(`/staff/${id}`).set(bearer(accessToken)).send(body);

    await patch(ids.ownerUser.id, { isActive: false }).expect(403);
    await patch(ids.ownerUser.id, { roleId: ids.viewer.id }).expect(403);

    const owner2 = await db.user.create({
      data: { email: "owner2@test.local", name: "Owner2", passwordHash: "x", roleId: ids.owner.id },
    });
    await patch(owner2.id, { roleId: ids.viewer.id }).expect(200);
  });

  describe("privilege escalation", () => {
    let hrToken: string;
    let hrUserId: string;
    let hrRoleId: string;
    const hrReq = {
      patch: (id: string, body: object) =>
        request(server()).patch(`/staff/${id}`).set(bearer(hrToken)).send(body),
      post: (body: object) => request(server()).post("/staff").set(bearer(hrToken)).send(body),
    };

    beforeEach(async () => {
      const { hr, hrUser } = await seedHr(db);
      hrUserId = hrUser.id;
      hrRoleId = hr.id;
      hrToken = (await loginAs(app, "hr@test.local")).accessToken;
    });

    it("HR cannot make itself OWNER", async () => {
      const res = await hrReq.patch(hrUserId, { roleId: ids.owner.id }).expect(403);
      expect(res.body.message).toBe("Only an OWNER can assign the OWNER role");
      expect((await db.user.findUniqueOrThrow({ where: { id: hrUserId } })).roleId).toBe(hrRoleId);
    });

    it("HR cannot reset the password of, deactivate, or rename an OWNER", async () => {
      await hrReq.patch(ids.ownerUser.id, { password: "HackedPass123!" }).expect(403);
      await hrReq.patch(ids.ownerUser.id, { isActive: false }).expect(403);
      await hrReq.patch(ids.ownerUser.id, { name: "Pwned" }).expect(403);
      const owner = await db.user.findUniqueOrThrow({ where: { id: ids.ownerUser.id } });
      expect(owner.isActive).toBe(true);
      expect(owner.name).toBe("Owner");
      await loginAs(app, "owner@test.local");
    });

    it("HR cannot promote another user to OWNER, nor create an OWNER", async () => {
      await hrReq.patch(ids.viewerUser.id, { roleId: ids.owner.id }).expect(403);
      const res = await hrReq
        .post({ email: "x@test.local", name: "X", password: "Password123!", roleId: ids.owner.id })
        .expect(403);
      expect(res.body.message).toBe("Only an OWNER can assign the OWNER role");
      expect(await db.user.count({ where: { email: "x@test.local" } })).toBe(0);
    });

    it("HR can create staff with a non-owner role and edit non-owner staff", async () => {
      await hrReq
        .post({ email: "ok@test.local", name: "Ok", password: "Password123!", roleId: ids.viewer.id })
        .expect(201);
      await hrReq.patch(ids.viewerUser.id, { name: "Renamed" }).expect(200);
      await hrReq.patch(ids.viewerUser.id, { roleId: hrRoleId }).expect(200);
    });

    it("HR cannot change its own role or deactivate itself, but can rename itself", async () => {
      const res = await hrReq.patch(hrUserId, { roleId: ids.viewer.id }).expect(403);
      expect(res.body.message).toBe("Cannot change your own role or status");
      await hrReq.patch(hrUserId, { isActive: false }).expect(403);
      await hrReq.patch(hrUserId, { roleId: hrRoleId, name: "HR2" }).expect(200);
    });
  });

  it("OWNER can still assign the OWNER role (create and update)", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const created = await request(server())
      .post("/staff")
      .set(bearer(accessToken))
      .send({ email: "o3@test.local", name: "O3", password: "Password123!", roleId: ids.owner.id })
      .expect(201);
    expect(created.body.roleName).toBe("OWNER");
    const promoted = await request(server())
      .patch(`/staff/${ids.viewerUser.id}`)
      .set(bearer(accessToken))
      .send({ roleId: ids.owner.id })
      .expect(200);
    expect(promoted.body.roleName).toBe("OWNER");
  });

  it("two concurrent PATCHes cannot leave zero active OWNERs", async () => {
    const owner2 = await db.user.create({
      data: {
        email: "owner2@test.local",
        name: "Owner2",
        passwordHash: ids.ownerUser.passwordHash,
        roleId: ids.owner.id,
      },
    });
    const t1 = (await loginAs(app, "owner@test.local")).accessToken;
    const t2 = (await loginAs(app, "owner2@test.local")).accessToken;

    // Deterministic interleaving: hold a lock on both OWNER rows from a separate transaction,
    // fire both requests, wait until both are blocked on that lock, then release.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "roleId" = ${ids.owner.id} FOR UPDATE`;
        locked();
        await gate;
      },
      { timeout: 15_000 },
    );
    await lockTaken;

    const requests = Promise.all([
      request(server()).patch(`/staff/${owner2.id}`).set(bearer(t1)).send({ isActive: false }),
      request(server()).patch(`/staff/${ids.ownerUser.id}`).set(bearer(t2)).send({ roleId: ids.viewer.id }),
    ]);
    for (let i = 0; i < 200; i++) {
      const [{ n }] = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (n >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    release();
    await holder;
    const [a, b] = await requests;

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.user.count({ where: { isActive: true, role: { name: "OWNER" } } })).toBeGreaterThanOrEqual(1);
  });
});

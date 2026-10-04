import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, loginAs, resetDb, seedBasics } from "./helpers";

describe("roles and permissions (e2e)", () => {
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

  it("GET /permissions ຄືນລາຍການທັງ 24; GET /roles ມີ permission ແລະ userCount", async () => {
    const { accessToken } = await loginAs(app, "viewer@test.local");
    const perms = await request(server()).get("/permissions").set(bearer(accessToken)).expect(200);
    expect(perms.body.permissions).toHaveLength(24);

    const roles = await request(server()).get("/roles").set(bearer(accessToken)).expect(200);
    const viewer = roles.body.find((r: { name: string }) => r.name === "VIEWER");
    expect(viewer).toMatchObject({ permissions: ["staff:read"], userCount: 1, isSystem: false });
  });

  it("VIEWER ສ້າງ role ບໍ່ໄດ້ (403)", async () => {
    const { accessToken } = await loginAs(app, "viewer@test.local");
    await request(server())
      .post("/roles")
      .set(bearer(accessToken))
      .send({ name: "X", permissions: [] })
      .expect(403);
  });

  it("ສ້າງ role: ເອົາ permission ຊ້ຳອອກ; ຊື່ຊ້ຳ 409; permission ບໍ່ຖືກຕ້ອງ 400", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const post = (body: object) => request(server()).post("/roles").set(bearer(accessToken)).send(body);

    const res = await post({ name: "Sales", permissions: ["inbox:read", "inbox:read", "inbox:write"] }).expect(201);
    expect(res.body).toMatchObject({ name: "Sales", isSystem: false, permissions: ["inbox:read", "inbox:write"] });

    await post({ name: "Sales", permissions: [] }).expect(409);
    await post({ name: "Bad", permissions: ["staff:delete"] }).expect(400);
    expect(await db.auditLog.count({ where: { action: "role.create" } })).toBe(1);
  });

  it("ແກ້ role: ແທນ permission ທັງໝົດ; role ລະບົບແກ້ບໍ່ໄດ້ (409)", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const put = (id: string, body: object) =>
      request(server()).put(`/roles/${id}`).set(bearer(accessToken)).send(body);

    const res = await put(ids.viewer.id, { name: "VIEWER2", permissions: ["crm:read", "crm:write"] }).expect(200);
    expect(res.body).toMatchObject({ name: "VIEWER2", permissions: ["crm:read", "crm:write"] });

    await put(ids.owner.id, { name: "OWNER", permissions: ["staff:read"] }).expect(409);
    await put("missing-id", { name: "X", permissions: [] }).expect(404);
  });

  it("ລຶບ role: ມີຄົນໃຊ້ 409, role ລະບົບ 409, ບໍ່ມີຄົນໃຊ້ 204", async () => {
    const { accessToken } = await loginAs(app, "owner@test.local");
    const del = (id: string) => request(server()).delete(`/roles/${id}`).set(bearer(accessToken));

    await del(ids.viewer.id).expect(409);
    await del(ids.owner.id).expect(409);

    const spare = await db.role.create({ data: { name: "SPARE" } });
    await del(spare.id).expect(204);
    expect(await db.role.count({ where: { id: spare.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "role.delete" } })).toBe(1);
  });
});

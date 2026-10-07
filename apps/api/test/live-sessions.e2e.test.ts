import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";

describe("live sessions (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: { Authorization: string };
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
    f = await seedCatalog(db);
    auth = await bearerFor(app, "chat_admin@role.test");
  });

  const create = (body: object = { title: "Live ຄືນນີ້", kind: "LIVE", externalPostId: "P1" }) =>
    request(server()).post("/live-sessions").set(auth).send(body);
  const addItem = (id: string, body: object) => request(server()).post(`/live-sessions/${id}/items`).set(auth).send(body);

  it("ສ້າງ → ອ່ານ → ລາຍການ (DRAFT, ບັນທຶກຜູ້ສ້າງ, ກອງຕາມສະຖານະ)", async () => {
    const res = await create().expect(201);
    expect(res.body).toMatchObject({ title: "Live ຄືນນີ້", kind: "LIVE", status: "DRAFT", externalPostId: "P1", publicReplyEnabled: true, itemCount: 0, commentCount: 0, items: [] });
    const got = await request(server()).get(`/live-sessions/${res.body.id}`).set(auth).expect(200);
    expect(got.body.id).toBe(res.body.id);
    const list = await request(server()).get("/live-sessions").set(auth).expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1 });
    expect(list.body.items[0].id).toBe(res.body.id);
    const none = await request(server()).get("/live-sessions?status=LIVE").set(auth).expect(200);
    expect(none.body.total).toBe(0);
    const creator = await db.liveSession.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(creator.createdById).not.toBeNull();
  });

  it("body ຜິດ → 400; id ບໍ່ພົບ → 404 LIVE_SESSION_NOT_FOUND", async () => {
    await create({ title: "", kind: "LIVE" }).expect(400);
    await create({ title: "x", kind: "OTHER" }).expect(400);
    const res = await request(server()).get("/live-sessions/nope").set(auth).expect(404);
    expect(res.body.code).toBe("LIVE_SESSION_NOT_FOUND");
  });

  it("ແກ້ໄຂ title/externalPostId/publicReplyEnabled; externalPostId ແກ້ບໍ່ໄດ້ເມື່ອ LIVE", async () => {
    const { body } = await create().expect(201);
    const patched = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ title: "ໃໝ່", publicReplyEnabled: false, externalPostId: "P2" }).expect(200);
    expect(patched.body).toMatchObject({ title: "ໃໝ່", publicReplyEnabled: false, externalPostId: "P2" });
    await addItem(body.id, { code: "a1", variantId: f.v1.id }).expect(201);
    await request(server()).post(`/live-sessions/${body.id}/start`).set(auth).expect(200);
    const res = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ externalPostId: "P3" }).expect(409);
    expect(res.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ title: "ຍັງແກ້ຊື່ໄດ້" }).expect(200);
  });

  it("ລະຫັດ: normalize, ຊ້ຳ → 409 DUPLICATE_VALUE, variant ບໍ່ພົບ → 404, ປິດຂາຍ → 409, ສະແດງ sku", async () => {
    const { body } = await create().expect(201);
    const ok = await addItem(body.id, { code: " ດຳ  m ", variantId: f.v1.id, limit: 5 }).expect(201);
    expect(ok.body).toMatchObject({ code: "ດຳ M", variantId: f.v1.id, sku: "SKU-1", limit: 5, claimed: 0 });
    const dup = await addItem(body.id, { code: "ດຳ M", variantId: f.v2.id }).expect(409);
    expect(dup.body.code).toBe("DUPLICATE_VALUE");
    const missing = await addItem(body.id, { code: "B", variantId: "nope" }).expect(404);
    expect(missing.body.code).toBe("VARIANT_NOT_FOUND");
    await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
    const inactive = await addItem(body.id, { code: "C", variantId: f.v2.id }).expect(409);
    expect(inactive.body.code).toBe("VARIANT_NOT_AVAILABLE");
    const detail = await request(server()).get(`/live-sessions/${body.id}`).set(auth).expect(200);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.itemCount).toBe(1);
  });

  it("ແກ້/ລຶບລະຫັດ: ໄດ້ເມື່ອ claimed=0; ມີຄົນ CF ແລ້ວ → 409 LIVE_ITEM_IN_USE (limit ຕໍ່າກວ່າ claimed ກໍບໍ່ໄດ້); item ບໍ່ພົບ → 404", async () => {
    const { body } = await create().expect(201);
    const item = (await addItem(body.id, { code: "A1", variantId: f.v1.id }).expect(201)).body;
    const patched = await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ variantId: f.v2.id, limit: 3 }).expect(200);
    expect(patched.body).toMatchObject({ variantId: f.v2.id, sku: "SKU-2", limit: 3 });
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 2 } });
    const inUse = await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ variantId: f.v1.id }).expect(409);
    expect(inUse.body.code).toBe("LIVE_ITEM_IN_USE");
    await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ limit: 1 }).expect(409);
    await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ limit: 10 }).expect(200);
    await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(409);
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 0 } });
    await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(204);
    const gone = await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(404);
    expect(gone.body.code).toBe("LIVE_ITEM_NOT_FOUND");
  });

  it("start: ຕ້ອງມີ externalPostId ແລະ ≥1 ລະຫັດ; ສະຖານະຕ້ອງ DRAFT; ໂພສດຽວກັນ LIVE ຊ້ອນບໍ່ໄດ້", async () => {
    const noPost = (await create({ title: "x", kind: "POST" }).expect(201)).body;
    await addItem(noPost.id, { code: "A1", variantId: f.v1.id }).expect(201);
    await request(server()).post(`/live-sessions/${noPost.id}/start`).set(auth).expect(400);

    const noItems = (await create({ title: "y", kind: "LIVE", externalPostId: "P9" }).expect(201)).body;
    await request(server()).post(`/live-sessions/${noItems.id}/start`).set(auth).expect(400);

    const a = (await create().expect(201)).body;
    await addItem(a.id, { code: "A1", variantId: f.v1.id }).expect(201);
    const started = await request(server()).post(`/live-sessions/${a.id}/start`).set(auth).expect(200);
    expect(started.body).toMatchObject({ status: "LIVE" });
    expect(started.body.startedAt).not.toBeNull();
    const again = await request(server()).post(`/live-sessions/${a.id}/start`).set(auth).expect(409);
    expect(again.body.code).toBe("LIVE_SESSION_INVALID_STATE");

    const b = (await create().expect(201)).body; // externalPostId P1 ຊ້ຳກັບ a ທີ່ LIVE
    await addItem(b.id, { code: "A1", variantId: f.v1.id }).expect(201);
    const clash = await request(server()).post(`/live-sessions/${b.id}/start`).set(auth).expect(409);
    expect(clash.body.code).toBe("DUPLICATE_VALUE");
  });

  it("end: LIVE → ENDED (endedAt); ບໍ່ແມ່ນ LIVE → 409; ENDED ເພີ່ມ/ແກ້ລະຫັດບໍ່ໄດ້; ບິນທີ່ຈອງແລ້ວບໍ່ຖືກຍົກເລີກ", async () => {
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
    await request(server()).post(`/live-sessions/${s.id}/end`).set(auth).expect(200).expect((res) => {
      expect(res.body.status).toBe("ENDED");
      expect(res.body.endedAt).not.toBeNull();
    });
    const again = await request(server()).post(`/live-sessions/${s.id}/end`).set(auth).expect(409);
    expect(again.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    const add = await addItem(s.id, { code: "B", variantId: f.v2.id }).expect(409);
    expect(add.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    const draft = (await create().expect(201)).body;
    await request(server()).post(`/live-sessions/${draft.id}/end`).set(auth).expect(409);
  });

  it("ສິດ: CHAT_ADMIN ເຮັດໄດ້; WAREHOUSE/ACCOUNTANT ອ່ານບໍ່ໄດ້ (403); ມີ live-cf:read ຢ່າງດຽວສ້າງບໍ່ໄດ້", async () => {
    for (const email of ["warehouse@role.test", "accountant@role.test"]) {
      const headers = await bearerFor(app, email);
      await request(server()).get("/live-sessions").set(headers).expect(403);
      await request(server()).post("/live-sessions").set(headers).send({ title: "x", kind: "LIVE" }).expect(403);
    }
    const role = await db.role.create({ data: { name: "LIVE_READ", permissions: { create: [{ permission: "live-cf:read" }] } } });
    const user = await db.user.findFirstOrThrow({ where: { email: "chat_admin@role.test" } });
    await db.user.create({ data: { email: "live-read@test.local", name: "r", passwordHash: user.passwordHash, roleId: role.id } });
    const reader = await bearerFor(app, "live-read@test.local");
    await request(server()).get("/live-sessions").set(reader).expect(200);
    await request(server()).post("/live-sessions").set(reader).send({ title: "x", kind: "LIVE" }).expect(403);
  });

  it("limit: ເທົ່າກັບ claimed ໄດ້, ຕໍ່າກວ່າ → 409 LIVE_ITEM_IN_USE (ບໍ່ແມ່ນ 500 ຈາກ CHECK); ລ້າງ limit ເປັນ null ໄດ້", async () => {
    const { body } = await create().expect(201);
    const item = (await addItem(body.id, { code: "A1", variantId: f.v1.id, limit: 5 }).expect(201)).body;
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 3 } });
    const url = `/live-sessions/${body.id}/items/${item.id}`;
    const low = await request(server()).patch(url).set(auth).send({ limit: 2 }).expect(409);
    expect(low.body.code).toBe("LIVE_ITEM_IN_USE");
    await request(server()).patch(url).set(auth).send({ limit: 3 }).expect(200);
    const cleared = await request(server()).patch(url).set(auth).send({ limit: null }).expect(200);
    expect(cleared.body.limit).toBeNull();
  });

  it("ລ້າງ externalPostId ຕອນ LIVE ບໍ່ໄດ້ (LIVE_SESSION_INVALID_STATE); ຕອນ DRAFT ໄດ້", async () => {
    const { body } = await create().expect(201);
    const cleared = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ externalPostId: null }).expect(200);
    expect(cleared.body.externalPostId).toBeNull();
    await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ externalPostId: "P1" }).expect(200);
    await addItem(body.id, { code: "a1", variantId: f.v1.id }).expect(201);
    await request(server()).post(`/live-sessions/${body.id}/start`).set(auth).expect(200);
    const res = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ externalPostId: null }).expect(409);
    expect(res.body.code).toBe("LIVE_SESSION_INVALID_STATE");
  });
});

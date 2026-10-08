import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedRoleUsers, uploadTestImage } from "./helpers";

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe("posts (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let chat: { Authorization: string };
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
    chat = await bearerFor(app, "chat_admin@role.test");
  });

  const createPost = (body: Record<string, unknown>) => request(server()).post("/posts").set(chat).send(body);

  async function postSession(opts: { withItem?: boolean; kind?: "LIVE" | "POST"; status?: "DRAFT" | "LIVE" } = {}) {
    const session = await db.liveSession.create({ data: { title: "ໂພສ CF", kind: opts.kind ?? "POST", status: opts.status ?? "DRAFT" } });
    if (opts.withItem ?? true) {
      const { v1 } = await seedCatalog(db);
      await db.liveSessionItem.create({ data: { sessionId: session.id, code: "A1", variantId: v1.id } });
    }
    return session;
  }

  it("ສ້າງຮ່າງພ້ອມຮູບ (ອັບໂຫຼດ + URL) → ອ່ານ → ແກ້ (ແທນຮູບທັງຊຸດ) → ລຶບ", async () => {
    const image = await uploadTestImage(app, chat);
    const created = await createPost({
      message: "  ສິນຄ້າໃໝ່ມາແລ້ວ  ",
      media: [{ mediaFileId: image.id }, { url: "https://cdn.test/a.jpg" }],
    }).expect(201);
    expect(created.body).toMatchObject({
      message: "ສິນຄ້າໃໝ່ມາແລ້ວ",
      status: "DRAFT",
      scheduledAt: null,
      publishedAt: null,
      externalPostId: null,
      permalinkUrl: null,
      errorCode: null,
      cfLinkError: null,
      liveSession: null,
      createdBy: { name: "CHAT_ADMIN" },
    });
    expect(created.body.media).toEqual([
      { id: expect.any(String), position: 0, mediaFileId: image.id, url: image.path },
      { id: expect.any(String), position: 1, mediaFileId: null, url: "https://cdn.test/a.jpg" },
    ]);
    const id = created.body.id as string;

    await request(server()).get(`/posts/${id}`).set(chat).expect(200);
    const patched = await request(server()).patch(`/posts/${id}`).set(chat).send({ media: [{ url: "https://cdn.test/b.jpg" }] }).expect(200);
    expect(patched.body.media).toEqual([{ id: expect.any(String), position: 0, mediaFileId: null, url: "https://cdn.test/b.jpg" }]);
    expect(patched.body.message).toBe("ສິນຄ້າໃໝ່ມາແລ້ວ");

    await request(server()).delete(`/posts/${id}`).set(chat).expect(204);
    await request(server()).get(`/posts/${id}`).set(chat).expect(404);
    // ໄຟລ໌ຍັງຢູ່ (ໃຊ້ຊ້ຳໄດ້)
    expect(await db.mediaFile.count()).toBe(1);
    const actions = (await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["post.create", "post.update", "post.delete"]);
  });

  it("validation: ບໍ່ມີເນື້ອຫາ, ຮູບບໍ່ພົບ, URL http, ແກ້ຈົນວ່າງ", async () => {
    await createPost({ message: "  " }).expect(400);
    const missing = await createPost({ message: "x", media: [{ mediaFileId: "nope" }] }).expect(404);
    expect(missing.body.code).toBe("MEDIA_NOT_FOUND");
    await createPost({ message: "x", media: [{ url: "http://a.test/x.jpg" }] }).expect(400);
    const created = await createPost({ message: "x" }).expect(201);
    const empty = await request(server()).patch(`/posts/${created.body.id}`).set(chat).send({ message: "" }).expect(400);
    expect(empty.body.code).toBe("VALIDATION_FAILED");
    const notFound = await request(server()).patch("/posts/nope").set(chat).send({ message: "y" }).expect(404);
    expect(notFound.body.code).toBe("POST_NOT_FOUND");
  });

  it("schedule (ເວລາ) → ແກ້ຍັງ SCHEDULED → ປ່ຽນເວລາ → cancel → DRAFT; schedule ບໍ່ໃສ່ເວລາ = now", async () => {
    const { body: post } = await createPost({ message: "x" }).expect(201);
    const at = inHours(5);
    const scheduled = await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({ scheduledAt: at }).expect(200);
    expect(scheduled.body).toMatchObject({ status: "SCHEDULED", scheduledAt: at });

    const edited = await request(server()).patch(`/posts/${post.id}`).set(chat).send({ message: "y" }).expect(200);
    expect(edited.body).toMatchObject({ status: "SCHEDULED", message: "y", scheduledAt: at });

    const later = inHours(8);
    await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({ scheduledAt: later }).expect(200);
    const cancelled = await request(server()).post(`/posts/${post.id}/cancel`).set(chat).expect(200);
    expect(cancelled.body).toMatchObject({ status: "DRAFT", scheduledAt: null });
    const again = await request(server()).post(`/posts/${post.id}/cancel`).set(chat).expect(409);
    expect(again.body.code).toBe("POST_INVALID_STATE");

    const before = Date.now();
    const now = await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({}).expect(200);
    expect(now.body.status).toBe("SCHEDULED");
    expect(new Date(now.body.scheduledAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({ scheduledAt: inHours(-1) }).expect(400);
    const row = await db.socialPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.scheduledById).not.toBeNull();
  });

  it("PUBLISHING / PUBLISHED ອ່ານຢ່າງດຽວ; FAILED: retry → SCHEDULED, ແກ້ → DRAFT (ລ້າງ error)", async () => {
    const { body: post } = await createPost({ message: "x" }).expect(201);
    for (const status of ["PUBLISHING", "PUBLISHED"] as const) {
      await db.socialPost.update({ where: { id: post.id }, data: { status } });
      for (const res of [
        await request(server()).patch(`/posts/${post.id}`).set(chat).send({ message: "y" }),
        await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({}),
        await request(server()).post(`/posts/${post.id}/retry`).set(chat),
        await request(server()).delete(`/posts/${post.id}`).set(chat),
      ]) {
        expect(res.status, status).toBe(409);
        expect(res.body.code).toBe("POST_INVALID_STATE");
      }
    }

    await db.socialPost.update({ where: { id: post.id }, data: { status: "FAILED", errorCode: "CHANNEL_AUTH", errorMessage: "bad token" } });
    const retried = await request(server()).post(`/posts/${post.id}/retry`).set(chat).expect(200);
    expect(retried.body).toMatchObject({ status: "SCHEDULED", errorCode: null, errorMessage: null });

    await db.socialPost.update({ where: { id: post.id }, data: { status: "FAILED", errorCode: "CHANNEL_AUTH" } });
    const edited = await request(server()).patch(`/posts/${post.id}`).set(chat).send({ message: "z" }).expect(200);
    expect(edited.body).toMatchObject({ status: "DRAFT", errorCode: null, scheduledAt: null });
  });

  it("ລາຍການ: ກອງ status ແລະ ຊ່ວງເວລາ (scheduledAt/publishedAt); ລຽງໃໝ່→ເກົ່າ", async () => {
    const a = (await createPost({ message: "a" }).expect(201)).body;
    const b = (await createPost({ message: "b" }).expect(201)).body;
    const c = (await createPost({ message: "c" }).expect(201)).body;
    await db.socialPost.update({ where: { id: b.id }, data: { status: "SCHEDULED", scheduledAt: new Date("2026-12-10T03:00:00Z") } });
    await db.socialPost.update({
      where: { id: c.id },
      data: { status: "PUBLISHED", scheduledAt: new Date("2026-11-30T03:00:00Z"), publishedAt: new Date("2026-12-01T03:00:00Z"), externalPostId: "1_2" },
    });

    const all = await request(server()).get("/posts").set(chat).expect(200);
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 30 });
    expect(all.body.items.map((p: { message: string }) => p.message)).toEqual(["c", "b", "a"]);
    expect(all.body.items[0]).toMatchObject({ permalinkUrl: "https://www.facebook.com/1_2" });

    const scheduled = await request(server()).get("/posts?status=SCHEDULED").set(chat).expect(200);
    expect(scheduled.body.items.map((p: { id: string }) => p.id)).toEqual([b.id]);

    const december = await request(server())
      .get("/posts")
      .query({ from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" })
      .set(chat)
      .expect(200);
    expect(december.body.items.map((p: { id: string }) => p.id).sort()).toEqual([b.id, c.id].sort());
    expect(a.id).toBeDefined();
  });

  it("ເຊື່ອມ session Post CF: ຖືກ → ສະແດງ; ປະເພດ LIVE / ບໍ່ແມ່ນ DRAFT / ຖືກໂພສອື່ນໃຊ້ → 409; ບໍ່ພົບ → 404; ຖອດ = null", async () => {
    const session = await postSession();
    const { body: post } = await createPost({ message: "x", liveSessionId: session.id }).expect(201);
    expect(post.liveSession).toEqual({ id: session.id, title: "ໂພສ CF", status: "DRAFT" });

    const taken = await createPost({ message: "y", liveSessionId: session.id }).expect(409);
    expect(taken.body.code).toBe("LIVE_SESSION_INVALID_STATE");

    const live = await db.liveSession.create({ data: { title: "Live", kind: "LIVE" } });
    expect((await createPost({ message: "y", liveSessionId: live.id }).expect(409)).body.code).toBe("LIVE_SESSION_INVALID_STATE");
    const started = await db.liveSession.create({ data: { title: "S", kind: "POST", status: "LIVE", externalPostId: "9_9" } });
    expect((await createPost({ message: "y", liveSessionId: started.id }).expect(409)).body.code).toBe("LIVE_SESSION_INVALID_STATE");
    expect((await createPost({ message: "y", liveSessionId: "nope" }).expect(404)).body.code).toBe("LIVE_SESSION_NOT_FOUND");

    const unlinked = await request(server()).patch(`/posts/${post.id}`).set(chat).send({ liveSessionId: null }).expect(200);
    expect(unlinked.body.liveSession).toBeNull();
  });

  it("schedule ກັບ session ທີ່ບໍ່ມີລະຫັດ CF ຫຼື ຖືກໃສ່ post id ແລ້ວ → 409 LIVE_SESSION_INVALID_STATE", async () => {
    const empty = await postSession({ withItem: false });
    const { body: post } = await createPost({ message: "x", liveSessionId: empty.id }).expect(201);
    const res = await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({}).expect(409);
    expect(res.body.code).toBe("LIVE_SESSION_INVALID_STATE");

    const ready = await db.liveSession.create({ data: { title: "R", kind: "POST" } });
    const { v1 } = await seedCatalog(db);
    await db.liveSessionItem.create({ data: { sessionId: ready.id, code: "B1", variantId: v1.id } });
    await request(server()).patch(`/posts/${post.id}`).set(chat).send({ liveSessionId: ready.id }).expect(200);
    await db.liveSession.update({ where: { id: ready.id }, data: { externalPostId: "1_1" } });
    expect((await request(server()).post(`/posts/${post.id}/schedule`).set(chat).send({}).expect(409)).body.code).toBe("LIVE_SESSION_INVALID_STATE");
  });

  it("ສິດ: ACCOUNTANT ບໍ່ມີ posting → 403; MANAGER ອ່ານ/ຂຽນໄດ້", async () => {
    const accountant = await bearerFor(app, "accountant@role.test");
    await request(server()).get("/posts").set(accountant).expect(403);
    const manager = await bearerFor(app, "manager@role.test");
    await request(server()).post("/posts").set(manager).send({ message: "m" }).expect(201);
  });
});

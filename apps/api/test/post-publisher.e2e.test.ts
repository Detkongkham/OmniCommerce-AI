import type { INestApplication } from "@nestjs/common";
import * as simulator from "@oca/channels/simulator";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StorageService } from "../src/common/storage/storage.service";
import { PUBLISHING_STALE_MS, PostPublisherService } from "../src/modules/posting/post-publisher.service";
import { TEST_PNG, bearerFor, createTestApp, resetDb, seedCatalog, seedRoleUsers, uploadTestImage } from "./helpers";

describe("post publisher (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let publisher: PostPublisherService;
  let chat: { Authorization: string };
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({ FACEBOOK_PAGE_ACCESS_TOKEN: "page-token", FACEBOOK_GRAPH_BASE_URL: graph.url }));
    publisher = app.get(PostPublisherService);
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await publisher.runDue(); // ລໍຮອບທີ່ຄ້າງຈາກ test ກ່ອນ
    await resetDb(db);
    graph.reset();
    await seedRoleUsers(db);
    chat = await bearerFor(app, "chat_admin@role.test");
  });

  async function draft(body: Record<string, unknown>): Promise<string> {
    const res = await request(server()).post("/posts").set(chat).send(body).expect(201);
    return res.body.id as string;
  }

  /** ຕັ້ງໃຫ້ຮອດເວລາແລ້ວ (ບໍ່ຜ່ານ API ເພື່ອບໍ່ kick) */
  async function due(id: string): Promise<void> {
    await db.socialPost.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) } });
  }

  it("ໂພສທີ່ຮອດເວລາ: ອັບໂຫຼດໄຟລ໌ (multipart) + URL ແລ້ວ feed → PUBLISHED + externalPostId; ຍັງບໍ່ຮອດເວລາ = ບໍ່ແຕະ", async () => {
    const image = await uploadTestImage(app, chat);
    const id = await draft({ message: "ສິນຄ້າໃໝ່", media: [{ mediaFileId: image.id }, { url: "https://cdn.test/a.jpg" }] });
    const later = await draft({ message: "later" });
    await due(id);
    await db.socialPost.update({ where: { id: later }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() + 3_600_000) } });

    expect(await publisher.runDue()).toEqual({ published: 1, failed: 0, uncertain: 0 });

    expect(graph.photos).toEqual([
      expect.objectContaining({ url: null, mimeType: "image/png", size: TEST_PNG.length, published: false }),
      expect.objectContaining({ url: "https://cdn.test/a.jpg", published: false }),
    ]);
    expect(graph.posts).toEqual([
      expect.objectContaining({ message: "ສິນຄ້າໃໝ່", attachedMedia: graph.photos.map((photo) => photo.id), authorization: "Bearer page-token" }),
    ]);
    const res = await request(server()).get(`/posts/${id}`).set(chat).expect(200);
    expect(res.body).toMatchObject({ status: "PUBLISHED", externalPostId: graph.posts[0]?.id, errorCode: null });
    expect(res.body.publishedAt).not.toBeNull();
    expect(res.body.permalinkUrl).toBe(`https://www.facebook.com/${graph.posts[0]?.id}`);
    expect((await db.socialPost.findUniqueOrThrow({ where: { id: later } })).status).toBe("SCHEDULED");
    expect(await db.auditLog.count({ where: { action: "post.publish", entityId: id } })).toBe(1);
  });

  it("schedule ບໍ່ໃສ່ເວລາ (ໂພສທັນທີ) ໂພສໂດຍບໍ່ລໍ tick", async () => {
    const id = await draft({ message: "now" });
    await request(server()).post(`/posts/${id}/schedule`).set(chat).send({}).expect(200);
    await publisher.runDue();
    expect((await db.socialPost.findUniqueOrThrow({ where: { id } })).status).toBe("PUBLISHED");
    expect(graph.posts.map((post) => post.message)).toEqual(["now"]);
  });

  it("Graph ປະຕິເສດ → FAILED + errorCode/errorMessage; retry → ໂພສສຳເລັດ", async () => {
    const id = await draft({ message: "x" });
    await due(id);
    graph.failNext({ status: 400, code: 200, message: "(#200) Requires pages_manage_posts permission" });
    expect(await publisher.runDue()).toMatchObject({ published: 0, failed: 1 });
    const failed = await db.socialPost.findUniqueOrThrow({ where: { id } });
    expect(failed).toMatchObject({ status: "FAILED", errorCode: "SEND_REJECTED", errorMessage: "(#200) Requires pages_manage_posts permission" });
    expect(await db.auditLog.count({ where: { action: "post.publish_failed", entityId: id } })).toBe(1);

    await request(server()).post(`/posts/${id}/retry`).set(chat).expect(200);
    await publisher.runDue();
    expect(await db.socialPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PUBLISHED", errorCode: null, errorMessage: null });
  });

  it("ໄຟລ໌ຫາຍຈາກ disk → FAILED MEDIA_MISSING ໂດຍບໍ່ເອີ້ນ Graph", async () => {
    const image = await uploadTestImage(app, chat);
    const id = await draft({ message: "x", media: [{ mediaFileId: image.id }] });
    const file = await db.mediaFile.findUniqueOrThrow({ where: { id: image.id } });
    await app.get(StorageService).delete(file.storageKey);
    await due(id);
    await publisher.runDue();
    expect(await db.socialPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "FAILED", errorCode: "MEDIA_MISSING" });
    expect(graph.photos).toEqual([]);
    expect(graph.posts).toEqual([]);
  });

  it("ບໍ່ມີ page token → FAILED CHANNEL_NOT_CONFIGURED", async () => {
    const other = await createTestApp();
    try {
      const otherPublisher = other.app.get(PostPublisherService);
      const id = await draft({ message: "x" });
      await due(id);
      await otherPublisher.runDue();
      expect(await db.socialPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_NOT_CONFIGURED" });
    } finally {
      await other.app.close();
    }
  });

  it("PUBLISHING ຄ້າງເກີນ 10 ນາທີ → FAILED PUBLISH_UNCERTAIN (ບໍ່ໂພສຊ້ຳ); ທີ່ຫາກໍ່ claim ບໍ່ແຕະ", async () => {
    const stale = await draft({ message: "stale" });
    const fresh = await draft({ message: "fresh" });
    await db.socialPost.update({ where: { id: stale }, data: { status: "PUBLISHING", publishingAt: new Date(Date.now() - PUBLISHING_STALE_MS - 1000) } });
    await db.socialPost.update({ where: { id: fresh }, data: { status: "PUBLISHING", publishingAt: new Date() } });
    expect(await publisher.runDue()).toEqual({ published: 0, failed: 0, uncertain: 1 });
    expect(await db.socialPost.findUniqueOrThrow({ where: { id: stale } })).toMatchObject({ status: "FAILED", errorCode: "PUBLISH_UNCERTAIN" });
    expect((await db.socialPost.findUniqueOrThrow({ where: { id: fresh } })).status).toBe("PUBLISHING");
    expect(graph.posts).toEqual([]);
  });

  it("ສອງ instance ແລ່ນພ້ອມກັນ → ແຕ່ລະໂພສຂຶ້ນເພຈຄັ້ງດຽວ", async () => {
    const other = await createTestApp({ FACEBOOK_PAGE_ACCESS_TOKEN: "page-token", FACEBOOK_GRAPH_BASE_URL: graph.url });
    try {
      const ids = [await draft({ message: "a" }), await draft({ message: "b" }), await draft({ message: "c" })];
      for (const id of ids) await due(id);
      const [one, two] = await Promise.all([publisher.processDue(), other.app.get(PostPublisherService).processDue()]);
      expect((one?.published ?? 0) + (two?.published ?? 0)).toBe(3);
      expect(graph.posts.map((post) => post.message).sort()).toEqual(["a", "b", "c"]);
    } finally {
      await other.app.close();
    }
  });

  it("ເຊື່ອມ Post CF: ໂພສສຳເລັດ → session ໄດ້ externalPostId ແລະ ເປັນ LIVE", async () => {
    const { v1 } = await seedCatalog(db);
    const session = await db.liveSession.create({ data: { title: "CF", kind: "POST", items: { create: [{ code: "A1", variantId: v1.id }] } } });
    const id = await draft({ message: "CF A1", liveSessionId: session.id });
    await request(server()).post(`/posts/${id}/schedule`).set(chat).send({}).expect(200);
    await publisher.runDue();

    const post = await db.socialPost.findUniqueOrThrow({ where: { id } });
    expect(post).toMatchObject({ status: "PUBLISHED", cfLinkError: null });
    expect(await db.liveSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: "LIVE", externalPostId: post.externalPostId });
    const started = await db.auditLog.findFirstOrThrow({ where: { action: "live.start", entityId: session.id } });
    expect(started.userId).toBe(post.scheduledById);
  });

  it("ເຊື່ອມ Post CF ລົ້ມ (ລະຫັດ CF ຖືກລຶບກ່ອນໂພສ) → ໂພສຍັງ PUBLISHED + cfLinkError; session ມີ post id ໃຫ້ start ເອງ", async () => {
    const { v1 } = await seedCatalog(db);
    const session = await db.liveSession.create({ data: { title: "CF", kind: "POST", items: { create: [{ code: "A1", variantId: v1.id }] } } });
    const id = await draft({ message: "CF", liveSessionId: session.id });
    await due(id);
    await db.liveSessionItem.deleteMany({ where: { sessionId: session.id } });
    await publisher.runDue();

    const post = await db.socialPost.findUniqueOrThrow({ where: { id } });
    expect(post).toMatchObject({ status: "PUBLISHED", cfLinkError: "BAD_REQUEST" });
    expect(await db.liveSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: "DRAFT", externalPostId: post.externalPostId });
  });

  it("session ຖືກ start ເອງກ່ອນໂພສ → cfLinkError LIVE_SESSION_INVALID_STATE ແລະ ບໍ່ຂຽນທັບ post id", async () => {
    const { v1 } = await seedCatalog(db);
    const session = await db.liveSession.create({ data: { title: "CF", kind: "POST", items: { create: [{ code: "A1", variantId: v1.id }] } } });
    const id = await draft({ message: "CF", liveSessionId: session.id });
    await due(id);
    await db.liveSession.update({ where: { id: session.id }, data: { status: "LIVE", externalPostId: "manual_1" } });
    await publisher.runDue();
    expect(await db.socialPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PUBLISHED", cfLinkError: "LIVE_SESSION_INVALID_STATE" });
    expect((await db.liveSession.findUniqueOrThrow({ where: { id: session.id } })).externalPostId).toBe("manual_1");
  });
});

import type { INestApplication } from "@nestjs/common";
import { signBody } from "@oca/channels";
import * as simulator from "@oca/channels/simulator";
import { type PrismaClient, receive } from "@oca/database";
import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CfIngestService } from "../src/modules/live-cf/cf-ingest.service";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";

const SECRET = "app-secret-test";
const PAGE = "PAGE1";
const POST = "PAGE1_POST1";
// commentId ຕ້ອງບໍ່ຊ້ຳຂ້າມຮອບ: jobId ຂອງ queue ເທົ່າກັບ commentId
const RUN = Date.now().toString(36);

describe("CF comments ledger API (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: { Authorization: string };
  let seq = 0;
  const server = () => app.getHttpServer();

  const comment = (fromId: string, message: string) => {
    seq += 1;
    const commentId = `${POST}_${RUN}_l${seq}`;
    const raw = JSON.stringify(
      simulator.commentPayload({ pageId: PAGE, postId: POST, commentId, fromId, fromName: `User ${fromId}`, message }),
    );
    return request(server())
      .post("/webhooks/facebook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signBody(SECRET, raw))
      .send(raw)
      .then(() => ({ commentId }));
  };
  const ledgerOf = (commentId: string) =>
    vi.waitFor(
      async () => {
        const row = await db.cfComment.findUnique({ where: { externalCommentId: commentId } });
        expect(row).not.toBeNull();
        return row;
      },
      { timeout: 8000, interval: 50 },
    );
  const settled = (commentId: string) =>
    vi.waitFor(
      async () => {
        const row = await db.cfComment.findUniqueOrThrow({ where: { externalCommentId: commentId } });
        expect(row.replyStatus).not.toBe("NONE");
        expect(row.replyStatus).not.toBe("SENDING");
        return row;
      },
      { timeout: 8000, interval: 50 },
    );
  const liveSession = async () => {
    const session = await seedLiveSession(db, {
      externalPostId: POST,
      items: [
        { code: "A1", variantId: f.v1.id, limit: null },
        { code: "B02", variantId: f.v2.id, limit: null },
      ],
    });
    const ingest = app.get(CfIngestService);
    for (const post of [POST, "OTHER"]) ingest.invalidate(post);
    return session;
  };

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "verify-me",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
    const prefix = process.env.QUEUE_PREFIX ?? "";
    if (prefix.startsWith("oca-test-")) {
      const redis = new Redis(process.env.REDIS_URL ?? "");
      try {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 500);
          cursor = next;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== "0");
      } finally {
        redis.disconnect();
      }
    }
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(db);
    graph.reset();
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 5 });
    });
    await seedRoleUsers(db);
    auth = await bearerFor(app, "chat_admin@role.test");
  });

  it("GET /live-sessions/:id/comments: ແບ່ງໜ້າ, ກອງ outcome, ມີ orderNumber, ໃໝ່ສຸດກ່ອນ", async () => {
    const s = await liveSession();
    const a = await comment("U1", "A1");
    await settled(a.commentId);
    const b = await comment("U2", "ສະບາຍດີ");
    await ledgerOf(b.commentId);
    const all = await request(server()).get(`/live-sessions/${s.id}/comments`).set(auth).expect(200);
    expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
    expect(all.body.items.map((item: { externalCommentId: string }) => item.externalCommentId)).toEqual([b.commentId, a.commentId]);
    const ordered = await request(server()).get(`/live-sessions/${s.id}/comments?outcome=ORDERED`).set(auth).expect(200);
    expect(ordered.body.total).toBe(1);
    expect(ordered.body.items[0]).toMatchObject({ outcome: "ORDERED", replyStatus: "SENT", authorName: "User U1" });
    expect(ordered.body.items[0].orderNumber).toMatch(/^SO-/);
    const paged = await request(server()).get(`/live-sessions/${s.id}/comments?pageSize=1&page=2`).set(auth).expect(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.items[0].externalCommentId).toBe(a.commentId);
    await request(server()).get(`/live-sessions/${s.id}/comments?outcome=NOPE`).set(auth).expect(400);
    const missing = await request(server()).get("/live-sessions/nope/comments").set(auth).expect(404);
    expect(missing.body.code).toBe("LIVE_SESSION_NOT_FOUND");
  });

  it("list ມີແຖວ ERROR ແລະ NO_MATCH ນຳ ແລະກອງໄດ້", async () => {
    const s = await liveSession();
    await db.cfComment.createMany({
      data: [
        { sessionId: s.id, externalCommentId: `${RUN}_err`, authorExternalId: "U9", authorName: "E", message: "A1", outcome: "ERROR" },
        { sessionId: s.id, externalCommentId: `${RUN}_nm`, authorExternalId: "U8", authorName: "N", message: "hi", outcome: "NO_MATCH" },
      ],
    });
    const all = await request(server()).get(`/live-sessions/${s.id}/comments`).set(auth).expect(200);
    expect(all.body.total).toBe(2);
    const err = await request(server()).get(`/live-sessions/${s.id}/comments?outcome=ERROR`).set(auth).expect(200);
    expect(err.body.items.map((i: { externalCommentId: string }) => i.externalCommentId)).toEqual([`${RUN}_err`]);
    const none = await request(server()).get(`/live-sessions/${s.id}/comments?outcome=NO_MATCH`).set(auth).expect(200);
    expect(none.body.total).toBe(1);
  });

  it("resend: ສົ່ງ FAILED ໃໝ່ສຳເລັດ → SENT, ບໍ່ສ້າງບິນຊ້ຳ, ບໍ່ຕອບຄອມເມັ້ນສາທາລະນະຊ້ຳ", async () => {
    const s = await liveSession();
    graph.failNext({ status: 500, code: 2, message: "boom" });
    const { commentId } = await comment("U1", "A1");
    const failed = await settled(commentId);
    expect(failed.replyStatus).toBe("FAILED");
    expect(failed.replyErrorCode).toBe("CHANNEL_UNAVAILABLE");
    const res = await request(server()).post(`/live-sessions/${s.id}/comments/${failed.id}/resend`).set(auth).expect(200);
    expect(res.body).toMatchObject({ id: failed.id, replyStatus: "SENT", replyErrorCode: null });
    expect(await db.order.count()).toBe(1);
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.commentReplies).toHaveLength(0);
  });

  it("resend ພ້ອມກັນ 2 ຄຳຂໍ: ສົ່ງ private reply ເທື່ອດຽວເທົ່ານັ້ນ", async () => {
    const s = await liveSession();
    graph.failNext({ status: 500, code: 2, message: "boom" });
    const { commentId } = await comment("U1", "A1");
    const failed = await settled(commentId);
    const url = `/live-sessions/${s.id}/comments/${failed.id}/resend`;
    const results = await Promise.all([request(server()).post(url).set(auth), request(server()).post(url).set(auth)]);
    for (const res of results) expect([200, 409]).toContain(res.status);
    await settled(commentId);
    expect(graph.privateReplies).toHaveLength(1);
    expect((await db.cfComment.findUniqueOrThrow({ where: { id: failed.id } })).replyStatus).toBe("SENT");
  });

  it("resend: ບໍ່ແມ່ນ FAILED (SENT/SENDING/NONE) → 409; ຄອມເມັ້ນຕ່າງ session / ບໍ່ພົບ → 404", async () => {
    const s = await liveSession();
    const { commentId } = await comment("U1", "A1");
    const row = await settled(commentId);
    expect(row.replyStatus).toBe("SENT");
    await request(server()).post(`/live-sessions/${s.id}/comments/${row.id}/resend`).set(auth).expect(409);
    for (const status of ["SENDING", "NONE"] as const) {
      await db.cfComment.update({ where: { id: row.id }, data: { replyStatus: status } });
      await request(server()).post(`/live-sessions/${s.id}/comments/${row.id}/resend`).set(auth).expect(409);
    }
    const other = await seedLiveSession(db, { externalPostId: "OTHER", items: [] });
    const wrong = await request(server()).post(`/live-sessions/${other.id}/comments/${row.id}/resend`).set(auth).expect(404);
    expect(wrong.body.code).toBe("CF_COMMENT_NOT_FOUND");
    await request(server()).post(`/live-sessions/${s.id}/comments/nope/resend`).set(auth).expect(404);
    const noSession = await request(server()).post(`/live-sessions/nope/comments/${row.id}/resend`).set(auth).expect(404);
    expect(noSession.body.code).toBe("LIVE_SESSION_NOT_FOUND");
  });

  it("ສິດ: resend ຕ້ອງ live-cf:write; ອ່ານ ledger ຕ້ອງ live-cf:read", async () => {
    const s = await liveSession();
    const warehouse = await bearerFor(app, "warehouse@role.test");
    await request(server()).get(`/live-sessions/${s.id}/comments`).set(warehouse).expect(403);
    await request(server()).post(`/live-sessions/${s.id}/comments/x/resend`).set(warehouse).expect(403);
  });
});

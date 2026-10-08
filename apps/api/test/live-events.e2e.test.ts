import type { INestApplication } from "@nestjs/common";
import { signBody } from "@oca/channels";
import * as simulator from "@oca/channels/simulator";
import { type PrismaClient, receive } from "@oca/database";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CfIngestService } from "../src/modules/live-cf/cf-ingest.service";
import { LiveEventsService } from "../src/modules/live-cf/live-events.service";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";
import { openSseStream } from "./sse-client";

const SECRET = "app-secret-test";
const RUN = Date.now().toString(36);

describe("live events (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let port: number;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: { Authorization: string };
  let events: LiveEventsService;
  const server = () => app.getHttpServer();
  const url = (id: string) => `http://127.0.0.1:${port}/live-sessions/${id}/events`;

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    events = app.get(LiveEventsService);
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(db);
    graph.reset();
    await seedRoleUsers(db);
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 });
    });
    auth = await bearerFor(app, "chat_admin@role.test");
  });

  describe("GET /live-sessions/:id/events (SSE)", () => {
    it("ready ກ່ອນ; ໄດ້ live.updated ຂອງ session ຕົນ ແຕ່ບໍ່ໄດ້ຂອງ session ອື່ນ", async () => {
      const mine = await seedLiveSession(db);
      const other = await seedLiveSession(db, { externalPostId: "POST_2" });
      const stream = openSseStream(url(mine.id), auth);
      try {
        const res = await stream.connect();
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        await stream.readUntil("event: ready");
        await events.publish({ type: "live.updated", sessionId: other.id });
        await events.publish({ type: "live.updated", sessionId: mine.id });
        const seen = await stream.readUntil(mine.id);
        expect(seen).toContain("event: live.updated");
        expect(seen).not.toContain(other.id);
      } finally {
        stream.close();
      }
    });

    it("ຕ້ອງ login + live-cf:read; session ບໍ່ພົບ → 404", async () => {
      const session = await seedLiveSession(db);
      expect((await fetch(url(session.id))).status).toBe(401);
      const warehouse = await bearerFor(app, "warehouse@role.test");
      expect((await fetch(url(session.id), { headers: warehouse })).status).toBe(403);
      const missing = await fetch(url("nope"), { headers: auth });
      expect(missing.status).toBe(404);
      expect(((await missing.json()) as { code: string }).code).toBe("LIVE_SESSION_NOT_FOUND");
    });
  });

  describe("ຜູ້ publish", () => {
    const published = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.map(([event]) => (event as { sessionId: string }).sessionId);

    it("start / ເພີ່ມ-ແກ້-ລຶບລະຫັດ / featured / ຈົບ → publish sessionId", async () => {
      const spy = vi.spyOn(events, "publish");
      const session = await seedLiveSession(db, { status: "DRAFT" });
      const base = `/live-sessions/${session.id}`;
      const item = await request(server()).post(`${base}/items`).set(auth).send({ code: "A1", variantId: f.v1.id }).expect(201);
      await request(server()).patch(`${base}/items/${item.body.id}`).set(auth).send({ limit: 3 }).expect(200);
      await request(server()).put(`${base}/featured`).set(auth).send({ itemId: item.body.id }).expect(200);
      await request(server()).patch(base).set(auth).send({ title: "x" }).expect(200);
      await request(server()).post(`${base}/start`).set(auth).expect(200);
      await request(server()).post(`${base}/items`).set(auth).send({ code: "B2", variantId: f.v2.id }).expect(201);
      const b2 = await db.liveSessionItem.findFirstOrThrow({ where: { sessionId: session.id, code: "B2" } });
      await request(server()).delete(`${base}/items/${b2.id}`).set(auth).expect(204);
      await request(server()).post(`${base}/end`).set(auth).expect(200);
      expect(published(spy)).toEqual(Array(8).fill(session.id));
    });

    it("ຄອມເມັ້ນ CF ຜ່ານ webhook → publish (ຫຼັງບັນທຶກ ledger); resend → publish", async () => {
      const session = await seedLiveSession(db, { externalPostId: `P_${RUN}`, items: [{ code: "A1", variantId: f.v1.id }] });
      app.get(CfIngestService).invalidate(`P_${RUN}`);
      const spy = vi.spyOn(events, "publish");
      const raw = JSON.stringify(
        simulator.commentPayload({ pageId: "PAGE1", postId: `P_${RUN}`, commentId: `P_${RUN}_c1`, fromId: "U1", fromName: "Noy", message: "A1" }),
      );
      await request(server()).post("/webhooks/facebook").set("content-type", "application/json").set("x-hub-signature-256", signBody(SECRET, raw)).send(raw).expect(200);
      const row = await vi.waitFor(
        async () => {
          const found = await db.cfComment.findUniqueOrThrow({ where: { externalCommentId: `P_${RUN}_c1` } });
          expect(["SENT", "FAILED"]).toContain(found.replyStatus);
          return found;
        },
        { timeout: 8000, interval: 50 },
      );
      await vi.waitFor(() => expect(published(spy)).toContain(session.id), { timeout: 2000, interval: 20 });

      spy.mockClear();
      await db.cfComment.update({ where: { id: row.id }, data: { replyStatus: "FAILED", replyErrorCode: "CHANNEL_UNAVAILABLE" } });
      await request(server()).post(`/live-sessions/${session.id}/comments/${row.id}/resend`).set(auth).expect(200);
      expect(published(spy)).toContain(session.id);
    });

    it("ຊຳລະ/ຍົກເລີກບິນ CF → publish; ບິນທົ່ວໄປ → ບໍ່ publish", async () => {
      const session = await seedLiveSession(db);
      const owner = await bearerFor(app, "owner@role.test");
      const create = (liveSessionId: string | null) =>
        db.order.create({
          data: {
            orderNumber: `T-${Math.random().toString(36).slice(2)}`,
            channel: "FACEBOOK",
            source: liveSessionId ? "LIVE_CF" : "MANUAL",
            currency: "LAK",
            subtotal: "100",
            vatRate: "0",
            vatAmount: "0",
            total: "100",
            liveSessionId,
            reservedUntil: new Date(Date.now() + 600_000),
          },
        });
      const spy = vi.spyOn(events, "publish");
      const cf = await create(session.id);
      const plain = await create(null);
      await request(server()).post(`/orders/${cf.id}/pay`).set(owner).expect(200);
      await request(server()).post(`/orders/${cf.id}/cancel`).set(owner).send({}).expect(200);
      await request(server()).post(`/orders/${plain.id}/pay`).set(owner).expect(200);
      expect(published(spy)).toEqual([session.id, session.id]);
    });
  });
});

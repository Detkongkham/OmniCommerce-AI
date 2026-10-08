import type { INestApplication } from "@nestjs/common";
import { signBody } from "@oca/channels";
import * as simulator from "@oca/channels/simulator";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CfIngestService } from "../src/modules/live-cf/cf-ingest.service";
import { CfQueueService } from "../src/modules/live-cf/cf-queue.service";
import { createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedLiveSession } from "./helpers";

const SECRET = "app-secret-test";
const PAGE = "PAGE1";
const POST = "PAGE1_POST1";
const POST2 = "PAGE1_POST2";
// commentId ຕ້ອງບໍ່ຊ້ຳຂ້າມ test/ຮອບ: jobId ຂອງ queue ເທົ່າກັບ commentId (ກັນຊ້ຳ) ແລະ job ເກົ່າຍັງຢູ່ໃນ Redis
const RUN = Date.now().toString(36);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("CF engine (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let seq = 0;
  const server = () => app.getHttpServer();

  const postWebhook = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return request(server())
      .post("/webhooks/facebook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature ?? signBody(SECRET, raw))
      .send(raw);
  };
  const comment = (fromId: string, message: string, overrides: { commentId?: string; postId?: string } = {}) => {
    seq += 1;
    const commentId = overrides.commentId ?? `${POST}_${RUN}_c${seq}`;
    return postWebhook(
      simulator.commentPayload({
        pageId: PAGE,
        postId: overrides.postId ?? POST,
        commentId,
        fromId,
        fromName: `User ${fromId}`,
        message,
      }),
    ).then((res) => ({ res, commentId }));
  };
  const ledgerOf = (commentId: string) =>
    vi.waitFor(
      async () => {
        const row = await db.cfComment.findUnique({
          where: { externalCommentId: commentId },
          include: { order: { include: { items: true } } },
        });
        expect(row).not.toBeNull();
        return row;
      },
      { timeout: 8000, interval: 50 },
    ).then((row) => row as NonNullable<typeof row>);
  const settled = (commentId: string) =>
    vi.waitFor(
      async () => {
        const row = await db.cfComment.findUniqueOrThrow({
          where: { externalCommentId: commentId },
          include: { order: { include: { items: true } } },
        });
        expect(row.replyStatus).not.toBe("NONE");
        expect(row.replyStatus).not.toBe("SENDING");
        return row;
      },
      { timeout: 8000, interval: 50 },
    );

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
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 5 });
    });
  });
  // test seed session ໂດຍກົງໃນ DB (ບໍ່ຜ່ານ API) ຈຶ່ງຕ້ອງລ້າງ cache ກອງຂອງ ingest ເອງ ແທນ LiveSessionsService
  const invalidateCache = () => {
    const ingest = app.get(CfIngestService);
    for (const post of [POST, POST2, "OTHER"]) ingest.invalidate(post);
  };
  const liveSession = async (
    items = [
      { code: "A1", variantId: "", limit: null as number | null },
      { code: "B02", variantId: "", limit: null as number | null },
    ],
    overrides: Partial<{ externalPostId: string; status: "DRAFT" | "LIVE" | "ENDED"; publicReplyEnabled: boolean }> = {},
  ) => {
    const session = await seedLiveSession(db, {
      externalPostId: POST,
      ...overrides,
      items: items.map((item, index) => ({ ...item, variantId: index === 0 ? f.v1.id : f.v2.id })),
    });
    invalidateCache();
    return session;
  };
  const reserved = async (variantId: string) =>
    (await db.stockLevel.findFirstOrThrow({ where: { variantId, warehouseId: f.whA.id } })).reserved;
  const claimed = async (code: string) => (await db.liveSessionItem.findFirstOrThrow({ where: { code } })).claimed;

  it("1. main path: order, reservation, private + public reply", async () => {
    const session = await liveSession();
    await db.storeSetting.upsert({
      where: { id: 1 },
      create: { id: 1, name: "S", paymentInstructions: "BCEL 123" },
      update: { paymentInstructions: "BCEL 123" },
    });
    const { res, commentId } = await comment("U1", "CF A1 2");
    expect(res.status).toBe(200);
    const row = await settled(commentId);
    expect(row.outcome).toBe("ORDERED");
    expect(row.replyStatus).toBe("SENT");
    expect(row.order).toMatchObject({
      source: "LIVE_CF",
      channel: "FACEBOOK",
      liveSessionId: session.id,
      status: "PENDING_PAYMENT",
    });
    expect(row.order?.items.map((item) => ({ sku: item.sku, quantity: item.quantity }))).toEqual([
      { sku: "SKU-1", quantity: 2 },
    ]);
    const customer = await db.customer.findUniqueOrThrow({ where: { facebookUserId: "U1" } });
    expect(customer.name).toBe("User U1");
    expect(await reserved(f.v1.id)).toBe(2);
    expect(await claimed("A1")).toBe(2);
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.privateReplies[0]?.commentId).toBe(commentId);
    expect(graph.privateReplies[0]?.text).toContain(row.order?.orderNumber);
    expect(graph.privateReplies[0]?.text).toContain("BCEL 123");
    expect(graph.commentReplies).toHaveLength(1);
    expect(graph.commentReplies[0]?.text).toContain("ຮັບ CF ແລ້ວ");
    await expectLedgerMatches(db);
  });

  it("2. non-CF comment: NO_MATCH ledger, no order, no reply", async () => {
    await liveSession();
    const { commentId } = await comment("U1", "ລາຄາເທົ່າໃດ");
    const row = await ledgerOf(commentId);
    expect(row.outcome).toBe("NO_MATCH");
    expect(row.orderId).toBeNull();
    await sleep(300);
    expect(await db.order.count()).toBe(0);
    expect(graph.privateReplies).toHaveLength(0);
    expect(graph.commentReplies).toHaveLength(0);
  });

  it("3. comments on posts without a LIVE session leave no ledger", async () => {
    await liveSession();
    const other = await comment("U1", "CF A1", { postId: "OTHER" });
    expect(other.res.status).toBe(200);
    await db.liveSession.deleteMany();
    for (const status of ["DRAFT", "ENDED"] as const) {
      await liveSession(undefined, { status });
      const { res } = await comment("U1", "CF A1");
      expect(res.status).toBe(200);
      await db.liveSession.deleteMany();
      invalidateCache();
    }
    await sleep(300);
    expect(await db.cfComment.count()).toBe(0);
    expect(await db.order.count()).toBe(0);
  });

  it("4. duplicate commentId: one order, one ledger, one reservation", async () => {
    await liveSession();
    const first = await comment("U1", "CF A1", { commentId: `${POST}_${RUN}_dup` });
    const second = await comment("U1", "CF A1", { commentId: `${POST}_${RUN}_dup` });
    expect(first.res.status).toBe(200);
    expect(second.res.status).toBe(200);
    await settled(`${POST}_${RUN}_dup`);
    await sleep(300);
    expect(await db.order.count()).toBe(1);
    expect(await db.cfComment.count()).toBe(1);
    expect(await reserved(f.v1.id)).toBe(1);
    expect(graph.privateReplies).toHaveLength(1);
  });

  it("5. insufficient stock: OUT_OF_STOCK, no order, rejected replies", async () => {
    await liveSession();
    const { commentId } = await comment("U1", "CF A1 9");
    const row = await settled(commentId);
    expect(row.outcome).toBe("OUT_OF_STOCK");
    expect(row.replyStatus).toBe("SENT");
    expect(await db.order.count()).toBe(0);
    expect(await reserved(f.v1.id)).toBe(0);
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.privateReplies[0]?.text).toContain("A1");
    expect(graph.privateReplies[0]?.text).toContain("ໝົດ");
    expect(graph.commentReplies).toHaveLength(1);
    expect(graph.commentReplies[0]?.text).toContain("ຂໍໂທດ");
  });

  it("6. all-or-nothing: a failing line reserves nothing", async () => {
    await liveSession();
    const { commentId } = await comment("U1", "CF A1 2 B02 9");
    const row = await settled(commentId);
    expect(row.outcome).toBe("OUT_OF_STOCK");
    expect(await reserved(f.v1.id)).toBe(0);
    expect(await reserved(f.v2.id)).toBe(0);
    expect(await claimed("A1")).toBe(0);
    expect(await db.order.count()).toBe(0);
    await expectLedgerMatches(db);
  });

  it("7. per-code limit across customers", async () => {
    await liveSession([
      { code: "A1", variantId: "", limit: 3 },
      { code: "B02", variantId: "", limit: null },
    ]);
    const run = async (user: string, text: string) => (await settled((await comment(user, text)).commentId)).outcome;
    expect(await run("U1", "CF A1 2")).toBe("ORDERED");
    expect(await run("U2", "CF A1 2")).toBe("LIMIT_REACHED");
    expect(await claimed("A1")).toBe(2);
    expect(await run("U3", "CF A1")).toBe("ORDERED");
    expect(await claimed("A1")).toBe(3);
    expect(await run("U4", "CF A1")).toBe("LIMIT_REACHED");
    expect(await claimed("A1")).toBe(3);
    expect(await reserved(f.v1.id)).toBe(3);
  });

  it("8. same customer merges into the open PENDING order", async () => {
    await liveSession();
    const first = await settled((await comment("U1", "CF A1")).commentId);
    const second = await settled((await comment("U1", "CF B02 2")).commentId);
    expect(await db.order.count()).toBe(1);
    expect(second.orderId).toBe(first.orderId);
    const order = await db.order.findUniqueOrThrow({ where: { id: first.orderId as string }, include: { items: true } });
    expect(order.items).toHaveLength(2);
    expect(order.total.toFixed(2)).toBe("300.00");
    expect(order.reservedUntil?.getTime()).toBeGreaterThanOrEqual(first.order?.reservedUntil?.getTime() ?? Infinity);
    const third = await settled((await comment("U1", "CF A1")).commentId);
    expect(third.orderId).toBe(first.orderId);
    const merged = await db.order.findUniqueOrThrow({ where: { id: first.orderId as string }, include: { items: true } });
    expect(merged.items).toHaveLength(2);
    expect(merged.items.find((item) => item.sku === "SKU-1")?.quantity).toBe(2);
    expect(merged.total.toFixed(2)).toBe("400.00");
    expect(await reserved(f.v1.id)).toBe(2);
    await expectLedgerMatches(db);
  });

  it("9. an expired order is not merged into", async () => {
    await liveSession();
    await settled((await comment("U1", "CF A1")).commentId);
    await db.order.updateMany({ data: { reservedUntil: new Date(Date.now() - 1000) } });
    await settled((await comment("U1", "CF A1")).commentId);
    expect(await db.order.count()).toBe(2);
  });

  it("10a. race: 5 commenters on the last unit with session limit 1", async () => {
    await liveSession([
      { code: "A1", variantId: "", limit: 1 },
      { code: "B02", variantId: "", limit: null },
    ]);
    const results = await Promise.all(["U1", "U2", "U3", "U4", "U5"].map((user) => comment(user, "CF A1")));
    const rows = await Promise.all(results.map((r) => settled(r.commentId)));
    expect(rows.filter((row) => row.outcome === "ORDERED")).toHaveLength(1);
    expect(rows.filter((row) => row.outcome === "LIMIT_REACHED")).toHaveLength(4);
    expect(await claimed("A1")).toBe(1);
    expect(await reserved(f.v1.id)).toBe(1);
    expect(await db.order.count()).toBe(1);
    await expectLedgerMatches(db);
  });

  it("10b. race: 5 commenters on the last unit of stock (no limit)", async () => {
    const v3 = await db.productVariant.create({ data: { productId: f.product.id, sku: "SKU-3", price: "100.00", costPrice: "60.00" } });
    await db.$transaction((tx) => receive(tx, { variantId: v3.id, warehouseId: f.whA.id, quantity: 1 }));
    await seedLiveSession(db, { externalPostId: POST, items: [{ code: "C3", variantId: v3.id, limit: null }] });
    invalidateCache();
    const results = await Promise.all(["U1", "U2", "U3", "U4", "U5"].map((user) => comment(user, "CF C3")));
    const rows = await Promise.all(results.map((r) => settled(r.commentId)));
    expect(rows.filter((row) => row.outcome === "ORDERED")).toHaveLength(1);
    expect(rows.filter((row) => row.outcome === "OUT_OF_STOCK")).toHaveLength(4);
    expect(await reserved(v3.id)).toBe(1);
    expect(await db.order.count()).toBe(1);
    await expectLedgerMatches(db);
  });

  it("11. private reply rejected: ledger ORDERED, reply FAILED, order kept, no public reply", async () => {
    await liveSession();
    graph.failNext({ status: 400, code: 100, message: "(#100) bad" });
    const { commentId } = await comment("U1", "CF A1");
    const row = await settled(commentId);
    expect(row.outcome).toBe("ORDERED");
    expect(row.replyStatus).toBe("FAILED");
    expect(row.replyErrorCode).toBe("SEND_REJECTED");
    expect(row.order).not.toBeNull();
    expect(await reserved(f.v1.id)).toBe(1);
    expect(graph.commentReplies).toHaveLength(0);
  });

  it("12. publicReplyEnabled=false: private reply only", async () => {
    await liveSession(undefined, { publicReplyEnabled: false });
    const { commentId } = await comment("U1", "CF A1");
    const row = await settled(commentId);
    expect(row.replyStatus).toBe("SENT");
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.commentReplies).toHaveLength(0);
  });

  it("13. returning customer across sessions reuses the Customer", async () => {
    await liveSession();
    await seedLiveSession(db, {
      externalPostId: POST2,
      title: "Second",
      items: [{ code: "A1", variantId: f.v1.id, limit: null }],
    });
    invalidateCache();
    await settled((await comment("U1", "CF A1")).commentId);
    await settled((await comment("U1", "CF A1", { postId: POST2 })).commentId);
    expect(await db.customer.count()).toBe(1);
    expect(await db.order.count()).toBe(2);
  });

  it("14. bad signature: 401 and no ledger", async () => {
    await liveSession();
    const payload = simulator.commentPayload({
      pageId: PAGE,
      postId: POST,
      commentId: `${POST}_${RUN}_bad`,
      fromId: "U1",
      fromName: "User U1",
      message: "CF A1",
    });
    const res = await postWebhook(payload, "sha256=deadbeef");
    expect(res.status).toBe(401);
    await sleep(300);
    expect(await db.cfComment.count()).toBe(0);
  });

  it("15. the Page's own comment creates no ledger", async () => {
    await liveSession();
    const { res } = await comment(PAGE, "CF A1");
    expect(res.status).toBe(200);
    await sleep(300);
    expect(await db.cfComment.count()).toBe(0);
    expect(await db.order.count()).toBe(0);
  });

  it("16. enqueue failure: webhook answers 500 so Meta retries", async () => {
    await liveSession();
    const spy = vi.spyOn(app.get(CfQueueService), "add").mockRejectedValueOnce(new Error("redis down"));
    const { res, commentId } = await comment("U1", "CF A1");
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await db.cfComment.count()).toBe(0);
    // Meta ສົ່ງຊ້ຳ: ຄັ້ງນີ້ເຂົ້າ queue ແລະ ປະມວນຜົນ
    const retry = await comment("U1", "CF A1", { commentId });
    expect(retry.res.status).toBe(200);
    expect((await settled(commentId)).outcome).toBe("ORDERED");
  });
});

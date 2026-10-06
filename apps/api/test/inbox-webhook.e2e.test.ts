import type { INestApplication } from "@nestjs/common";
import { signBody, simulator } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb } from "./helpers";

const SECRET = "app-secret-test";
const VERIFY = "verify-me";
const PAGE = "PAGE1";

describe("Facebook webhook (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  const server = () => app.getHttpServer();

  const post = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return request(server())
      .post("/webhooks/facebook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature ?? signBody(SECRET, raw))
      .send(raw);
  };
  const say = (psid: string, mid: string, text: string, timestamp?: number) =>
    post(simulator.messagePayload({ pageId: PAGE, psid, mid, text, timestamp }));

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: VERIFY,
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
  });

  describe("GET handshake", () => {
    const get = (query: Record<string, string>) => request(server()).get("/webhooks/facebook").query(query);

    it("verify token ຖືກ → ຄືນ challenge ເປັນ text/plain", async () => {
      const res = await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "12345" }).expect(200);
      expect(res.text).toBe("12345");
      expect(res.headers["content-type"]).toContain("text/plain");
    });
    it("token ຜິດ, mode ຜິດ ຫຼື ບໍ່ມີ challenge → 403", async () => {
      await get({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }).expect(403);
      await get({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" }).expect(403);
      await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY }).expect(403);
    });
    it("challenge ທີ່ມີຕົວອັກສອນພິເສດ (ກັນສະທ້ອນ HTML) → 403", async () => {
      await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "<script>" }).expect(403);
    });
  });

  describe("POST ລາຍເຊັນ", () => {
    it("ບໍ່ມີ/ຜິດລາຍເຊັນ → 401 ແລະ ບໍ່ບັນທຶກຫຍັງ", async () => {
      const payload = simulator.messagePayload({ pageId: PAGE, psid: "U1", mid: "m1", text: "hi" });
      await request(server()).post("/webhooks/facebook").send(payload).expect(401);
      await post(payload, "sha256=deadbeef").expect(401);
      await post(payload, signBody("other-secret", JSON.stringify(payload))).expect(401);
      expect(await db.conversation.count()).toBe(0);
      expect(await db.message.count()).toBe(0);
    });

    it("body ຖືກແກ້ຫຼັງເຊັນ → 401", async () => {
      const original = JSON.stringify(simulator.messagePayload({ pageId: PAGE, psid: "U1", mid: "m1", text: "hi" }));
      const tampered = original.replace('"hi"', '"hacked"');
      await request(server())
        .post("/webhooks/facebook")
        .set("content-type", "application/json")
        .set("x-hub-signature-256", signBody(SECRET, original))
        .send(tampered)
        .expect(401);
      expect(await db.message.count()).toBe(0);
    });
  });

  describe("POST ຂໍ້ຄວາມ", () => {
    it("thread ໃໝ່ → ສ້າງເຄສ + ຂໍ້ຄວາມ IN; unread 1, preview, OPEN, ຊື່ default", async () => {
      const res = await say("U1234", "m1", "ສະບາຍດີ", 1_700_000_000_000).expect(200);
      expect(res.body).toEqual({ received: 1 });
      const conversation = await db.conversation.findFirstOrThrow({ include: { messages: true } });
      expect(conversation).toMatchObject({
        channel: "FACEBOOK",
        externalThreadId: "U1234",
        status: "OPEN",
        unreadCount: 1,
        lastMessagePreview: "ສະບາຍດີ",
        displayName: "Facebook 1234",
        customerId: null,
        assigneeId: null,
      });
      expect(conversation.lastMessageAt).toEqual(new Date(1_700_000_000_000));
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({
        direction: "IN",
        externalId: "m1",
        text: "ສະບາຍດີ",
        status: "SENT",
        sentByUserId: null,
      });
      expect(conversation.messages[0]?.createdAt).toEqual(new Date(1_700_000_000_000));
    });

    it("mid ຊ້ຳ (Meta ສົ່ງຊ້ຳ) → 200 ແຕ່ບໍ່ເພີ່ມຂໍ້ຄວາມ ແລະ ບໍ່ເພີ່ມ unread", async () => {
      await say("U1", "m1", "hi").expect(200);
      await say("U1", "m1", "hi").expect(200);
      expect(await db.message.count()).toBe(1);
      expect((await db.conversation.findFirstOrThrow()).unreadCount).toBe(1);
    });

    it("ຂໍ້ຄວາມຕໍ່ມາໃນ thread ດຽວກັນ → ເຄສເດີມ, unread 2, preview ອັບເດດ", async () => {
      await say("U1", "m1", "ທຳອິດ", 1000).expect(200);
      await say("U1", "m2", "ທີສອງ", 2000).expect(200);
      expect(await db.conversation.count()).toBe(1);
      const conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ unreadCount: 2, lastMessagePreview: "ທີສອງ" });
      expect(conversation.lastMessageAt).toEqual(new Date(2000));
    });

    it("ຂໍ້ຄວາມເກົ່າທີ່ມາຊ້າ (out of order) ບໍ່ຍ້າຍ preview/lastMessageAt ຖອຍຫຼັງ ແຕ່ນັບ unread", async () => {
      await say("U1", "m2", "ໃໝ່", 2000).expect(200);
      await say("U1", "m1", "ເກົ່າ", 1000).expect(200);
      const conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ unreadCount: 2, lastMessagePreview: "ໃໝ່" });
      expect(conversation.lastMessageAt).toEqual(new Date(2000));
    });

    it("ເຄສທີ່ປິດແລ້ວ ເປີດຄືນເມື່ອລູກຄ້າທັກມາໃໝ່", async () => {
      await say("U1", "m1", "hi").expect(200);
      await db.conversation.updateMany({ data: { status: "CLOSED", unreadCount: 0 } });
      await say("U1", "m2", "ຍັງຢູ່ບໍ").expect(200);
      expect(await db.conversation.findFirstOrThrow()).toMatchObject({ status: "OPEN", unreadCount: 1 });
    });

    it("ຮູບຢ່າງດຽວ: ເກັບ attachments, text=null, preview=null", async () => {
      await post(
        simulator.messagePayload({
          pageId: PAGE,
          psid: "U1",
          mid: "m1",
          attachments: [{ type: "image", url: "https://cdn.example/a.jpg" }],
        }),
      ).expect(200);
      const message = await db.message.findFirstOrThrow();
      expect(message.text).toBeNull();
      expect(message.attachments).toEqual([{ type: "image", url: "https://cdn.example/a.jpg" }]);
      expect((await db.conversation.findFirstOrThrow()).lastMessagePreview).toBeNull();
    });

    it("preview ຖືກຕັດ ≤ 120 ຕົວ ແຕ່ຂໍ້ຄວາມເກັບເຕັມ", async () => {
      const long = "ກ".repeat(500);
      await say("U1", "m1", long).expect(200);
      expect((await db.conversation.findFirstOrThrow()).lastMessagePreview).toBe("ກ".repeat(120));
      expect((await db.message.findFirstOrThrow()).text).toBe(long);
    });
  });

  describe("POST echo ແລະ ເຫດການທີ່ບໍ່ຮູ້ຈັກ", () => {
    it("echo → ຂໍ້ຄວາມ OUT; ເຄສໃໝ່ unread 0; ເຄສເດີມ unread ບໍ່ປ່ຽນ ແລະ ບໍ່ເປີດຄືນ", async () => {
      await post(simulator.echoPayload({ pageId: PAGE, psid: "U9", mid: "e1", text: "ແອດມິນຕອບ" })).expect(200);
      let conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ externalThreadId: "U9", unreadCount: 0, lastMessagePreview: "ແອດມິນຕອບ" });
      expect(await db.message.findFirstOrThrow()).toMatchObject({ direction: "OUT", externalId: "e1", sentByUserId: null });

      await db.conversation.update({ where: { id: conversation.id }, data: { status: "CLOSED", unreadCount: 2 } });
      await post(simulator.echoPayload({ pageId: PAGE, psid: "U9", mid: "e2", text: "ອີກຄັ້ງ" })).expect(200);
      conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ status: "CLOSED", unreadCount: 2 });
    });

    it("delivery/read/payload ທີ່ບໍ່ແມ່ນ page → 200 ແຕ່ບໍ່ບັນທຶກ", async () => {
      await post(simulator.deliveryPayload({ pageId: PAGE, psid: "U1", mids: ["m1"] })).expect(200);
      const res = await post({ object: "instagram", entry: [] }).expect(200);
      expect(res.body).toEqual({ received: 0 });
      expect(await db.conversation.count()).toBe(0);
    });
  });

  describe("ຊື່ໂປຣໄຟລ໌ (best-effort)", () => {
    const waitForName = async (expected: string) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const row = await db.conversation.findFirst();
        if (row?.displayName === expected) return row;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`displayName never became ${expected}`);
    };

    it("ດຶງຊື່ຈາກ Graph ຫຼັງຂໍ້ຄວາມທຳອິດ", async () => {
      graph.profiles.set("U7", "Somchai Vong");
      await say("U7", "m1", "hi").expect(200);
      await waitForName("Somchai Vong");
    });

    it("ດຶງຊື່ບໍ່ໄດ້ ບໍ່ກະທົບການຮັບຂໍ້ຄວາມ (ຊື່ default ຄົງເດີມ)", async () => {
      await say("U8", "m1", "hi").expect(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await db.conversation.findFirstOrThrow()).displayName).toBe("Facebook U8");
      expect(await db.message.count()).toBe(1);
    });

    it("ບໍ່ຂຽນທັບຊື່ທີ່ຖືກແກ້/ຮູ້ແລ້ວ", async () => {
      graph.profiles.set("U7", "Somchai Vong");
      await say("U7", "m1", "hi").expect(200);
      await waitForName("Somchai Vong");
      graph.profiles.set("U7", "Other Name");
      await say("U7", "m2", "hello").expect(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await db.conversation.findFirstOrThrow()).displayName).toBe("Somchai Vong");
    });
  });
});

describe("Facebook webhook ເມື່ອຍັງບໍ່ໄດ້ຕັ້ງຄ່າ (e2e)", () => {
  it("GET ແລະ POST → 503 CHANNEL_NOT_CONFIGURED", async () => {
    const { app } = await createTestApp({ FACEBOOK_APP_SECRET: "", FACEBOOK_WEBHOOK_VERIFY_TOKEN: "" });
    try {
      const get = await request(app.getHttpServer())
        .get("/webhooks/facebook")
        .query({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" })
        .expect(503);
      expect(get.body.code).toBe("CHANNEL_NOT_CONFIGURED");
      const post = await request(app.getHttpServer()).post("/webhooks/facebook").send({}).expect(503);
      expect(post.body.code).toBe("CHANNEL_NOT_CONFIGURED");
    } finally {
      await app.close();
    }
  });
});

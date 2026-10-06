import type { INestApplication } from "@nestjs/common";
import { simulator } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../src/modules/inbox/channel-registry";
import { PRISMA } from "../src/prisma/prisma.module";
import { bearerFor, createTestApp, resetDb, seedConversation, seedInboxReader, seedRoleUsers } from "./helpers";

describe("conversations (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let chat: { Authorization: string };
  let reader: { Authorization: string };
  let chatUserId: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: "s",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
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
    await seedRoleUsers(db);
    await seedInboxReader(db);
    chat = await bearerFor(app, "chat_admin@role.test");
    reader = await bearerFor(app, "inbox-read@test.local");
    chatUserId = (await db.user.findUniqueOrThrow({ where: { email: "chat_admin@role.test" } })).id;
  });

  describe("GET /conversations", () => {
    it("ຕ້ອງ login ແລະ inbox:read", async () => {
      await request(server()).get("/conversations").expect(401);
      const accountant = await bearerFor(app, "accountant@role.test");
      await request(server()).get("/conversations").set(accountant).expect(403);
      await request(server()).get("/conversations").set(reader).expect(200);
    });

    it("ຮູບແບບ DTO + ລຽງ lastMessageAt ຫຼ້າສຸດກ່ອນ + ແບ່ງໜ້າ", async () => {
      const customer = await db.customer.create({ data: { name: "ສົມຊາຍ", phone: "020111111" } });
      const old = await seedConversation(db, { displayName: "Old", lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      const mid = await seedConversation(db, {
        displayName: "Mid",
        lastMessageAt: new Date("2026-10-02T00:00:00Z"),
        unreadCount: 3,
        lastMessagePreview: "hello",
        assigneeId: chatUserId,
        customerId: customer.id,
      });
      const fresh = await seedConversation(db, { displayName: "New", lastMessageAt: new Date("2026-10-03T00:00:00Z") });

      const res = await request(server()).get("/conversations?pageSize=2").set(reader).expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([fresh.id, mid.id]);
      expect(res.body.items[1]).toEqual({
        id: mid.id,
        channel: "FACEBOOK",
        displayName: "Mid",
        status: "OPEN",
        unreadCount: 3,
        lastMessageAt: "2026-10-02T00:00:00.000Z",
        lastMessagePreview: "hello",
        assignee: { id: chatUserId, name: "CHAT_ADMIN" },
        customer: { id: customer.id, name: "ສົມຊາຍ", phone: "020111111" },
        createdAt: expect.any(String),
      });
      const page2 = await request(server()).get("/conversations?pageSize=2&page=2").set(reader).expect(200);
      expect(page2.body.items.map((item: { id: string }) => item.id)).toEqual([old.id]);
    });

    it("ກອງ status / assignee (me, unassigned, id) / unread / q", async () => {
      const mine = await seedConversation(db, { displayName: "Mine", assigneeId: chatUserId, unreadCount: 1 });
      const free = await seedConversation(db, { displayName: "Free Somchai", lastMessagePreview: "ຂໍລາຄາ" });
      const closed = await seedConversation(db, { displayName: "Closed", status: "CLOSED" });
      const ids = async (query: string) =>
        ((await request(server()).get(`/conversations?${query}`).set(chat).expect(200)).body.items as { id: string }[])
          .map((item) => item.id)
          .sort();
      expect(await ids("status=CLOSED")).toEqual([closed.id]);
      expect(await ids("status=OPEN")).toEqual([mine.id, free.id].sort());
      expect(await ids("assignee=me")).toEqual([mine.id]);
      expect(await ids(`assignee=${chatUserId}`)).toEqual([mine.id]);
      expect(await ids("assignee=unassigned")).toEqual([free.id, closed.id].sort());
      expect(await ids("unread=true")).toEqual([mine.id]);
      expect(await ids("unread=false")).toEqual([free.id, closed.id].sort());
      expect(await ids("q=somchai")).toEqual([free.id]);
      expect(await ids(`q=${encodeURIComponent("ລາຄາ")}`)).toEqual([free.id]);
    });

    it("query ຜິດ → 400 VALIDATION_FAILED", async () => {
      const res = await request(server()).get("/conversations?status=NOPE").set(reader).expect(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("GET /conversations/:id ແລະ /messages", () => {
    it("get ຄືນ DTO; id ບໍ່ມີ → 404 CONVERSATION_NOT_FOUND (ທັງ get ແລະ messages)", async () => {
      const conversation = await seedConversation(db, { displayName: "A" });
      const res = await request(server()).get(`/conversations/${conversation.id}`).set(reader).expect(200);
      expect(res.body).toMatchObject({ id: conversation.id, displayName: "A", assignee: null, customer: null });
      const missing = await request(server()).get("/conversations/nope").set(reader).expect(404);
      expect(missing.body.code).toBe("CONVERSATION_NOT_FOUND");
      await request(server()).get("/conversations/nope/messages").set(reader).expect(404);
    });

    it("messages: ໃໝ່ສຸດກ່ອນ, cursor beforeId ໄດ້ໜ້າຖັດໄປ, hasMore ຖືກ, ບໍ່ປົນເຄສອື່ນ", async () => {
      const conversation = await seedConversation(db);
      const other = await seedConversation(db);
      const base = Date.parse("2026-10-01T00:00:00Z");
      for (let i = 1; i <= 5; i++) {
        await db.message.create({
          data: { conversationId: conversation.id, direction: i % 2 ? "IN" : "OUT", text: `m${i}`, createdAt: new Date(base + i * 1000) },
        });
      }
      await db.message.create({ data: { conversationId: other.id, direction: "IN", text: "other" } });

      const first = await request(server()).get(`/conversations/${conversation.id}/messages?limit=2`).set(reader).expect(200);
      expect(first.body.items.map((m: { text: string }) => m.text)).toEqual(["m5", "m4"]);
      expect(first.body.hasMore).toBe(true);
      expect(first.body.items[0]).toEqual({
        id: expect.any(String),
        direction: "IN",
        text: "m5",
        attachments: [],
        status: "SENT",
        errorCode: null,
        sentBy: null,
        createdAt: "2026-10-01T00:00:05.000Z",
      });

      const lastId = first.body.items[1].id as string;
      const second = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=2&beforeId=${lastId}`)
        .set(reader)
        .expect(200);
      expect(second.body.items.map((m: { text: string }) => m.text)).toEqual(["m3", "m2"]);
      expect(second.body.hasMore).toBe(true);

      const third = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=2&beforeId=${second.body.items[1].id}`)
        .set(reader)
        .expect(200);
      expect(third.body.items.map((m: { text: string }) => m.text)).toEqual(["m1"]);
      expect(third.body.hasMore).toBe(false);
    });

    it("beforeId ທີ່ບໍ່ຢູ່ໃນເຄສນີ້ → 404", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const message = await db.message.create({ data: { conversationId: b.id, direction: "IN", text: "x" } });
      await request(server()).get(`/conversations/${a.id}/messages?beforeId=${message.id}`).set(reader).expect(404);
    });

    it("ສະແດງຜູ້ສົ່ງ, ສະຖານະ ແລະ errorCode ຂອງຂໍ້ຄວາມຂາອອກ", async () => {
      const conversation = await seedConversation(db);
      await db.message.create({
        data: { conversationId: conversation.id, direction: "OUT", text: "x", status: "FAILED", errorCode: "OUTSIDE_WINDOW", sentByUserId: chatUserId },
      });
      const res = await request(server()).get(`/conversations/${conversation.id}/messages`).set(reader).expect(200);
      expect(res.body.items[0]).toMatchObject({
        direction: "OUT",
        status: "FAILED",
        errorCode: "OUTSIDE_WINDOW",
        sentBy: { id: chatUserId, name: "CHAT_ADMIN" },
      });
    });
  });

  describe("POST /conversations/:id/messages (ຕອບ)", () => {
    it("ສຳເລັດ: ສົ່ງຜ່ານ Graph ດ້ວຍ token, ບັນທຶກ SENT + mid + ຜູ້ສົ່ງ, ລ້າງ unread, ອັບເດດ preview", async () => {
      const conversation = await seedConversation(db, {
        externalThreadId: "U1",
        unreadCount: 4,
        lastMessageAt: new Date("2026-01-01T00:00:00Z"),
      });
      const res = await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set(chat)
        .send({ text: "  ສະບາຍດີ  " })
        .expect(201);
      expect(res.body).toMatchObject({
        direction: "OUT",
        text: "ສະບາຍດີ",
        status: "SENT",
        errorCode: null,
        sentBy: { id: chatUserId, name: "CHAT_ADMIN" },
      });
      expect(graph.sent).toEqual([{ recipientId: "U1", text: "ສະບາຍດີ", authorization: "Bearer page-token" }]);
      const row = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
      expect(row.externalId).toBe("m_sim_1");
      const after = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
      expect(after.unreadCount).toBe(0);
      expect(after.lastMessagePreview).toBe("ສະບາຍດີ");
      expect(after.lastMessageAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime());
    });

    it("ເກີນໜ້າຕ່າງ 24 ຊມ: 201 ແຕ່ຂໍ້ຄວາມ FAILED errorCode=OUTSIDE_WINDOW (ບັນທຶກໄວ້ ບໍ່ເສຍ)", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      graph.failNext({ status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." });
      const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      expect(res.body).toMatchObject({ status: "FAILED", errorCode: "OUTSIDE_WINDOW", text: "hi" });
      const row = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
      expect(row).toMatchObject({ status: "FAILED", errorCode: "OUTSIDE_WINDOW", externalId: null });
    });

    it("token ຜິດ → FAILED CHANNEL_AUTH; Meta ລົ້ມ → FAILED CHANNEL_UNAVAILABLE", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      graph.failNext({ status: 400, code: 190, message: "Invalid OAuth access token." });
      const auth = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "a" }).expect(201);
      expect(auth.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_AUTH" });
      graph.failNext({ status: 500, code: 1, message: "boom" });
      const down = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "b" }).expect(201);
      expect(down.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_UNAVAILABLE" });
    });

    it("echo ມາກ່ອນ response ຂອງ Graph (race) → ເຫຼືອແຖວດຽວ ແລະ ຜູ້ສົ່ງເປັນຄົນຕອບ", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      // webhook echo ຂອງຂໍ້ຄວາມນີ້ມາຮອດກ່ອນ ດ້ວຍ mid ທີ່ Graph ປອມຈະໃຫ້
      await db.message.create({
        data: { conversationId: conversation.id, direction: "OUT", externalId: graph.nextMessageId(), text: "hi", status: "SENT" },
      });
      const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      expect(res.body).toMatchObject({ status: "SENT", sentBy: { id: chatUserId } });
      const rows = await db.message.findMany({ where: { conversationId: conversation.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ externalId: "m_sim_1", sentByUserId: chatUserId });
    });

    it("ສິດ: inbox:read ຢ່າງດຽວ → 403 ແລະ ບໍ່ສົ່ງຫຍັງ; ເຄສບໍ່ມີ → 404", async () => {
      const conversation = await seedConversation(db);
      await request(server()).post(`/conversations/${conversation.id}/messages`).set(reader).send({ text: "x" }).expect(403);
      expect(graph.sent).toEqual([]);
      const res = await request(server()).post("/conversations/nope/messages").set(chat).send({ text: "x" }).expect(404);
      expect(res.body.code).toBe("CONVERSATION_NOT_FOUND");
      expect(await db.message.count()).toBe(0);
    });

    it("ຂໍ້ຄວາມວ່າງ/ຍາວເກີນ 2000/ມີ field ເກີນ → 400 ແລະ ບໍ່ບັນທຶກ", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/messages`;
      await request(server()).post(url).set(chat).send({ text: "   " }).expect(400);
      await request(server()).post(url).set(chat).send({ text: "a".repeat(2001) }).expect(400);
      await request(server()).post(url).set(chat).send({ text: "x", extra: 1 }).expect(400);
      await request(server()).post(url).set(chat).send({}).expect(400);
      expect(await db.message.count()).toBe(0);
    });
  });

  describe("POST /conversations/:id/messages ເມື່ອ channel ບໍ່ໄດ້ຕັ້ງ token", () => {
    it("201 ແຕ່ FAILED errorCode=CHANNEL_NOT_CONFIGURED", async () => {
      const { app: bare, db: bareDb } = await createTestApp({ FACEBOOK_PAGE_ACCESS_TOKEN: "" });
      try {
        await resetDb(bareDb);
        await seedRoleUsers(bareDb);
        const headers = await bearerFor(bare, "chat_admin@role.test");
        const conversation = await seedConversation(bareDb);
        const res = await request(bare.getHttpServer())
          .post(`/conversations/${conversation.id}/messages`)
          .set(headers)
          .send({ text: "x" })
          .expect(201);
        expect(res.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_NOT_CONFIGURED" });
      } finally {
        await bare.close();
      }
    });
  });

  describe("PATCH /conversations/:id", () => {
    it("ມອບໝາຍ, ປິດ, ລິ້ງລູກຄ້າ ແລະ ຖອນ (null); ບັນທຶກ audit", async () => {
      const conversation = await seedConversation(db);
      const customer = await db.customer.create({ data: { name: "C1" } });
      const res = await request(server())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ assigneeId: chatUserId, status: "CLOSED", customerId: customer.id })
        .expect(200);
      expect(res.body).toMatchObject({
        status: "CLOSED",
        assignee: { id: chatUserId, name: "CHAT_ADMIN" },
        customer: { id: customer.id, name: "C1", phone: null },
      });
      const cleared = await request(server())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ assigneeId: null, customerId: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ status: "CLOSED", assignee: null, customer: null });
      expect(await db.auditLog.count({ where: { action: "conversation.update", entityId: conversation.id } })).toBe(2);
    });

    it("assignee ບໍ່ມີ ຫຼື ຖືກປິດໃຊ້ງານ → 404 USER_NOT_FOUND; customer ບໍ່ມີ → 404 CUSTOMER_NOT_FOUND", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}`;
      expect((await request(server()).patch(url).set(chat).send({ assigneeId: "nope" }).expect(404)).body.code).toBe("USER_NOT_FOUND");
      // ປິດໃຊ້ງານຄົນອື່ນ (ບໍ່ແມ່ນຜູ້ເອີ້ນ: ຜູ້ເອີ້ນທີ່ຖືກປິດຈະໄດ້ 401 ກ່ອນ)
      const inactive = await db.user.update({ where: { email: "accountant@role.test" }, data: { isActive: false } });
      expect((await request(server()).patch(url).set(chat).send({ assigneeId: inactive.id }).expect(404)).body.code).toBe("USER_NOT_FOUND");
      expect((await request(server()).patch(url).set(chat).send({ customerId: "nope" }).expect(404)).body.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("body ວ່າງ/status ຜິດ → 400; ບໍ່ມີ id → 404; inbox:read ຢ່າງດຽວ → 403", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}`;
      await request(server()).patch(url).set(chat).send({}).expect(400);
      await request(server()).patch(url).set(chat).send({ status: "NOPE" }).expect(400);
      await request(server()).patch("/conversations/nope").set(chat).send({ status: "OPEN" }).expect(404);
      await request(server()).patch(url).set(reader).send({ status: "CLOSED" }).expect(403);
    });
  });

  describe("POST /conversations/:id/read", () => {
    it("ລ້າງ unread; ເຄສທີ່ unread=0 ຢູ່ແລ້ວກໍໄດ້ 200; ຕ້ອງ inbox:write; ບໍ່ມີ id → 404", async () => {
      const conversation = await seedConversation(db, { unreadCount: 5 });
      const url = `/conversations/${conversation.id}/read`;
      await request(server()).post(url).set(reader).expect(403);
      const res = await request(server()).post(url).set(chat).expect(200);
      expect(res.body.unreadCount).toBe(0);
      await request(server()).post(url).set(chat).expect(200);
      await request(server()).post("/conversations/nope/read").set(chat).expect(404);
    });

    it("ຂໍ້ຄວາມຂາເຂົ້າທີ່ມາລະຫວ່າງອ່ານ (ຫຼັງ read ຖືກອ່ານແລ້ວ ກ່ອນ update) ບໍ່ຖືກລ້າງ unread", async () => {
      const conversation = await seedConversation(db, { unreadCount: 2, lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      const prisma = app.get<PrismaClient>(PRISMA);
      const original = prisma.conversation.findUnique.bind(prisma.conversation);
      const spy = vi.spyOn(prisma.conversation, "findUnique").mockImplementationOnce(((args: never) =>
        original(args).then(async (row) => {
          // ຂໍ້ຄວາມໃໝ່ເຂົ້າຫຼັງ service ອ່ານແຖວແລ້ວ
          await db.conversation.update({
            where: { id: conversation.id },
            data: { unreadCount: { increment: 1 }, lastMessageAt: new Date("2026-10-01T00:05:00Z") },
          });
          return row;
        })) as never);
      try {
        await request(server()).post(`/conversations/${conversation.id}/read`).set(chat).expect(200);
      } finally {
        spy.mockRestore();
      }
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).unreadCount).toBe(3);
    });
  });

  describe("POST /conversations/:id/customer", () => {
    it("ສ້າງລູກຄ້າ + ລິ້ງໃນຄັ້ງດຽວ", async () => {
      const conversation = await seedConversation(db);
      const res = await request(server())
        .post(`/conversations/${conversation.id}/customer`)
        .set(chat)
        .send({ name: "ນາງ ດາລາ", phone: "+8562055550000" })
        .expect(201);
      expect(res.body.customer).toMatchObject({ name: "ນາງ ດາລາ", phone: "+8562055550000" });
      const customer = await db.customer.findFirstOrThrow({ where: { phone: "+8562055550000" } });
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBe(customer.id);
    });

    it("ເບີຊ້ຳ → 409 DUPLICATE_VALUE ແລະ ບໍ່ລິ້ງ; ເຄສລິ້ງແລ້ວ → 409 ແລະ ບໍ່ສ້າງລູກຄ້າເພີ່ມ", async () => {
      await db.customer.create({ data: { name: "Existing", phone: "020999999" } });
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/customer`;
      const dup = await request(server()).post(url).set(chat).send({ name: "X", phone: "020999999" }).expect(409);
      expect(dup.body.code).toBe("DUPLICATE_VALUE");
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBeNull();

      await request(server()).post(url).set(chat).send({ name: "First" }).expect(201);
      const before = await db.customer.count();
      const again = await request(server()).post(url).set(chat).send({ name: "Second" }).expect(409);
      expect(again.body.code).toBe("CONFLICT");
      expect(await db.customer.count()).toBe(before);
    });

    it("name ວ່າງ/phone ຜິດ → 400; ບໍ່ມີ id → 404; inbox:read ຢ່າງດຽວ → 403", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/customer`;
      await request(server()).post(url).set(chat).send({ name: " " }).expect(400);
      await request(server()).post(url).set(chat).send({ name: "A", phone: "abc" }).expect(400);
      await request(server()).post("/conversations/nope/customer").set(chat).send({ name: "A" }).expect(404);
      await request(server()).post(url).set(reader).send({ name: "A" }).expect(403);
    });
  });
  describe("ການຕອບ: race ແລະ ຄວາມຖືກຕ້ອງຫຼັງສົ່ງ", () => {
    it("ຕອບປົກກະຕິ (ບໍ່ມີຂໍ້ຄວາມເຂົ້າພ້ອມກັນ) → unread ເປັນ 0", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1", unreadCount: 2 });
      await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).unreadCount).toBe(0);
    });

    it("ຂໍ້ຄວາມຂາເຂົ້າມາລະຫວ່າງສົ່ງ → ຍັງເຫຼືອ unread ຂອງມັນ (ບໍ່ຖືກລ້າງ)", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1", unreadCount: 2, lastMessageAt: new Date("2026-01-01T00:00:00Z") });
      const registry = app.get(ChannelRegistry);
      const spy = vi.spyOn(registry.facebook, "sendText").mockImplementation(async () => {
        await db.conversation.update({
          where: { id: conversation.id },
          data: { unreadCount: { increment: 1 }, lastMessageAt: new Date(Date.now() + 1000) },
        });
        return { ok: true, externalId: "m_race_1" };
      });
      try {
        await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      } finally {
        spy.mockRestore();
      }
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).unreadCount).toBe(3);
    });

    it("ສົ່ງສຳເລັດແລ້ວ ແຕ່ຂັ້ນຕອນຫຼັງສົ່ງ (ອັບເດດເຄສ) ລົ້ມ → ຍັງ 201 SENT", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      const prisma = app.get<PrismaClient>(PRISMA);
      const spy = vi.spyOn(prisma.conversation, "updateMany").mockRejectedValueOnce(new Error("db hiccup"));
      try {
        const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
        expect(res.body).toMatchObject({ status: "SENT", text: "hi" });
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("channel ທີ່ບໍ່ມີ adapter (INSTAGRAM) → 201 FAILED CHANNEL_NOT_CONFIGURED", async () => {
      const conversation = await db.conversation.create({
        data: { channel: "INSTAGRAM", externalThreadId: "ig1", displayName: "IG", lastMessageAt: new Date() },
      });
      const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "x" }).expect(201);
      expect(res.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_NOT_CONFIGURED" });
    });
  });

  describe("ກວດເພີ່ມ: q, audit, ຂອບ limit", () => {
    it("q ຄົ້ນ preview, ບໍ່ສົນຕົວພິມ, q ວ່າງ = ບໍ່ກອງ", async () => {
      const a = await seedConversation(db, { displayName: "Aaa", lastMessagePreview: "Need Discount" });
      const b = await seedConversation(db, { displayName: "Bbb" });
      const ids = async (query: string) =>
        ((await request(server()).get(`/conversations?${query}`).set(reader).expect(200)).body.items as { id: string }[])
          .map((item) => item.id)
          .sort();
      expect(await ids("q=discount")).toEqual([a.id]);
      expect(await ids("q=")).toEqual([a.id, b.id].sort());
    });

    it("PATCH ບັນທຶກ audit ມີ before/after; assigneeId:null ຖອນຜູ້ຮັບຜິດຊອບ", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}`;
      await request(server()).patch(url).set(chat).send({ assigneeId: chatUserId, status: "CLOSED" }).expect(200);
      const res = await request(server()).patch(url).set(chat).send({ assigneeId: null }).expect(200);
      expect(res.body.assignee).toBeNull();
      const logs = await db.auditLog.findMany({ where: { action: "conversation.update", entityId: conversation.id }, orderBy: { createdAt: "asc" } });
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        before: { assigneeId: null, status: "OPEN", customerId: null },
        after: { assigneeId: chatUserId, status: "CLOSED", customerId: null },
      });
      expect(logs[1]).toMatchObject({
        before: { assigneeId: chatUserId, status: "CLOSED" },
        after: { assigneeId: null, status: "CLOSED" },
      });
    });

    it("limit ຂອບ: ພໍດີ limit → hasMore false; limit+1 → true", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/messages?limit=2`;
      for (let i = 1; i <= 2; i++) {
        await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: `m${i}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)) } });
      }
      expect((await request(server()).get(url).set(reader).expect(200)).body.hasMore).toBe(false);
      await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "m3", createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 3)) } });
      expect((await request(server()).get(url).set(reader).expect(200)).body.hasMore).toBe(true);
    });

    it("createdAt ຊ້ຳກັນ: ແບ່ງໜ້າບໍ່ຂ້າມ/ບໍ່ຊ້ຳ (tie-break ດ້ວຍ id)", async () => {
      const conversation = await seedConversation(db);
      const same = new Date("2026-10-01T00:00:00Z");
      for (const text of ["t1", "t2", "t3"]) {
        await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text, createdAt: same } });
      }
      const seen: string[] = [];
      let beforeId: string | undefined;
      for (let page = 0; page < 3; page++) {
        const res = await request(server())
          .get(`/conversations/${conversation.id}/messages?limit=1${beforeId ? `&beforeId=${beforeId}` : ""}`)
          .set(reader)
          .expect(200);
        expect(res.body.items).toHaveLength(1);
        seen.push(res.body.items[0].text);
        beforeId = res.body.items[0].id;
        expect(res.body.hasMore).toBe(page < 2);
      }
      expect(seen.sort()).toEqual(["t1", "t2", "t3"]);
    });
  });
});

import type { INestApplication } from "@nestjs/common";
import { signBody } from "@oca/channels";
import * as simulator from "@oca/channels/simulator";
import type { PrismaClient } from "@oca/database";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedConversation, seedInboxReader, seedRoleUsers } from "./helpers";

const SECRET = "app-secret-test";

describe("GET /inbox/events (SSE e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let port: number;
  let chat: { Authorization: string };
  let reader: { Authorization: string };

  beforeAll(async () => {
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
    }));
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    await seedInboxReader(db);
    chat = await bearerFor(app, "chat_admin@role.test");
    reader = await bearerFor(app, "inbox-read@test.local");
  });

  const url = () => `http://127.0.0.1:${port}/inbox/events`;

  /** ອ່ານ stream ຈົນກວ່າຈະມີຂໍ້ຄວາມທີ່ຕ້ອງການ (ມີ timeout ກັນ test ຄ້າງ) */
  function openStream(headers: Record<string, string>, target: string = url()) {
    const controller = new AbortController();
    let buffer = "";
    let body: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const decoder = new TextDecoder();

    async function readChunk(needle: string, remaining: number) {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          (body as ReadableStreamDefaultReader<Uint8Array>).read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timeout waiting for ${needle}; got: ${buffer}`)), remaining);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      async connect() {
        const res = await fetch(target, { headers, signal: controller.signal });
        body = res.body?.getReader();
        return res;
      },
      async readUntil(needle: string, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (!buffer.includes(needle)) {
          const remaining = deadline - Date.now();
          if (remaining <= 0 || !body) throw new Error(`timeout waiting for ${needle}; got: ${buffer}`);
          const chunk = await readChunk(needle, remaining);
          if (chunk.done) throw new Error(`stream ended; got: ${buffer}`);
          buffer += decoder.decode(chunk.value, { stream: true });
        }
        return buffer;
      },
      /** ອ່ານຈົນ server ປິດ stream ເອງ (ບໍ່ abort ຝັ່ງ client); ລົ້ມເມື່ອເກີນເວລາ */
      async readUntilEnd(timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const remaining = deadline - Date.now();
          if (remaining <= 0 || !body) throw new Error(`stream did not end; got: ${buffer}`);
          const chunk = await readChunk("end", remaining);
          if (chunk.done) return buffer;
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      },
      close() {
        controller.abort();
      },
    };
  }

  it("ຕ້ອງ login ແລະ inbox:read", async () => {
    expect((await fetch(url())).status).toBe(401);
    const accountant = await bearerFor(app, "accountant@role.test");
    expect((await fetch(url(), { headers: accountant })).status).toBe(403);
  });

  it("ສົ່ງ event ready ກ່ອນ ແລ້ວຕາມດ້ວຍ conversation.updated ເມື່ອມີຂໍ້ຄວາມເຂົ້າທາງ webhook", async () => {
    const stream = openStream(reader);
    try {
      const res = await stream.connect();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      await stream.readUntil("event: ready");

      const raw = JSON.stringify(simulator.messagePayload({ pageId: "P", psid: "U1", mid: "m1", text: "hi" }));
      await request(app.getHttpServer())
        .post("/webhooks/facebook")
        .set("content-type", "application/json")
        .set("x-hub-signature-256", signBody(SECRET, raw))
        .send(raw)
        .expect(200);

      const conversation = await db.conversation.findFirstOrThrow();
      const seen = await stream.readUntil("conversation.updated");
      expect(seen).toContain(conversation.id);
    } finally {
      stream.close();
    }
  });

  it("ໄດ້ event ເມື່ອແອດມິນປ່ຽນເຄສ (PATCH) ນຳ", async () => {
    const conversation = await seedConversation(db);
    const stream = openStream(chat);
    try {
      await stream.connect();
      await stream.readUntil("event: ready");
      await request(app.getHttpServer())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ status: "CLOSED" })
        .expect(200);
      const seen = await stream.readUntil("conversation.updated");
      expect(seen).toContain(conversation.id);
    } finally {
      stream.close();
    }
  });

  it("ຫຼາຍ client ໄດ້ event ເທົ່າກັນ", async () => {
    const conversation = await seedConversation(db);
    const a = openStream(chat);
    const b = openStream(reader);
    try {
      await a.connect();
      await b.connect();
      await a.readUntil("event: ready");
      await b.readUntil("event: ready");
      await request(app.getHttpServer()).patch(`/conversations/${conversation.id}`).set(chat).send({ status: "CLOSED" }).expect(200);
      expect(await a.readUntil(conversation.id)).toContain("conversation.updated");
      expect(await b.readUntil(conversation.id)).toContain("conversation.updated");
    } finally {
      a.close();
      b.close();
    }
  });

  it("ປິດ stream ເອງເມື່ອ app ປິດ (ບໍ່ຕ້ອງລໍ client abort)", async () => {
    const own = await createTestApp({ FACEBOOK_APP_SECRET: SECRET });
    await own.app.listen(0);
    const ownPort = (own.app.getHttpServer().address() as AddressInfo).port;
    const stream = openStream(reader, `http://127.0.0.1:${ownPort}/inbox/events`);
    try {
      expect((await stream.connect()).status).toBe(200);
      await stream.readUntil("event: ready");
      await own.app.close();
      await stream.readUntilEnd();
    } finally {
      stream.close();
    }
  });

  it("ຕັດ stream ເມື່ອຄົບອາຍຸ access token (ຕ້ອງ reconnect ດ້ວຍ token ໃໝ່)", async () => {
    const own = await createTestApp({ FACEBOOK_APP_SECRET: SECRET, ACCESS_TOKEN_TTL_SECONDS: "2" });
    await own.app.listen(0);
    const ownPort = (own.app.getHttpServer().address() as AddressInfo).port;
    const stream = openStream(await bearerFor(own.app, "inbox-read@test.local"), `http://127.0.0.1:${ownPort}/inbox/events`);
    try {
      expect((await stream.connect()).status).toBe(200);
      await stream.readUntil("event: ready");
      const startedAt = Date.now();
      await stream.readUntilEnd(6000);
      expect(Date.now() - startedAt).toBeGreaterThan(500);
    } finally {
      stream.close();
      await own.app.close();
    }
  });

  it("Redis ໃຊ້ບໍ່ໄດ້: ຕອບ error ທີ່ຊັດເຈນ ແລະ ບໍ່ຄ້າງ", async () => {
    const own = await createTestApp({ FACEBOOK_APP_SECRET: SECRET, REDIS_URL: "redis://127.0.0.1:1" });
    await own.app.listen(0);
    const ownPort = (own.app.getHttpServer().address() as AddressInfo).port;
    const stream = openStream(reader, `http://127.0.0.1:${ownPort}/inbox/events`);
    try {
      const res = await stream.connect();
      expect(res.status).toBe(503);
      const body = await stream.readUntilEnd();
      expect(JSON.parse(body)).toMatchObject({ statusCode: 503, code: "INTERNAL_ERROR" });
    } finally {
      stream.close();
      await own.app.close();
    }
  });
});

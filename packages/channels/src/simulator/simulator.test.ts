import { type IncomingMessage, createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { FacebookAdapter } from "../facebook/adapter";
import { parseFacebookComments, parseFacebookWebhook } from "../facebook/parse";
import { isValidSignature } from "../facebook/signature";
import { type FakeGraph, commentPayload, deliveryPayload, echoPayload, messagePayload, postSignedWebhook, startFakeGraph } from "./index";

describe("payload builders ກັບ parser", () => {
  it("messagePayload → message", () => {
    const events = parseFacebookWebhook(messagePayload({ pageId: "P", psid: "U1", mid: "m1", text: "ສະບາຍດີ", timestamp: 100 }));
    expect(events).toEqual([
      { kind: "message", channel: "FACEBOOK", threadId: "U1", externalId: "m1", text: "ສະບາຍດີ", attachments: [], timestamp: new Date(100) },
    ]);
  });
  it("messagePayload ມີຮູບ", () => {
    const [event] = parseFacebookWebhook(
      messagePayload({ pageId: "P", psid: "U1", mid: "m2", attachments: [{ type: "image", url: "https://x/y.jpg" }] }),
    );
    expect(event).toMatchObject({ text: null, attachments: [{ type: "image", url: "https://x/y.jpg" }] });
  });
  it("echoPayload → echo ຂອງ thread ລູກຄ້າ", () => {
    const [event] = parseFacebookWebhook(echoPayload({ pageId: "P", psid: "U1", mid: "m3", text: "ຕອບ" }));
    expect(event).toMatchObject({ kind: "echo", threadId: "U1", externalId: "m3", text: "ຕອບ" });
  });
  it("deliveryPayload ຖືກຂ້າມ", () => {
    expect(parseFacebookWebhook(deliveryPayload({ pageId: "P", psid: "U1", mids: ["m1"] }))).toEqual([]);
  });
});

describe("fake Graph server", () => {
  let graph: FakeGraph | undefined;
  afterEach(async () => {
    await graph?.close();
    graph = undefined;
  });
  const adapterFor = (g: FakeGraph, token = "tok") => new FacebookAdapter({ pageAccessToken: token, graphBaseUrl: g.url });

  it("ຮັບ Send API, ບັນທຶກຂໍ້ຄວາມ ແລະ ໃຫ້ message_id ຕາມລຳດັບ", async () => {
    graph = await startFakeGraph({ token: "tok" });
    expect(graph.nextMessageId()).toBe("m_sim_1");
    expect(await adapterFor(graph).sendText("U1", "hello")).toEqual({ ok: true, externalId: "m_sim_1" });
    expect(await adapterFor(graph).sendText("U2", "again")).toEqual({ ok: true, externalId: "m_sim_2" });
    expect(graph.sent).toEqual([
      { recipientId: "U1", text: "hello", authorization: "Bearer tok" },
      { recipientId: "U2", text: "again", authorization: "Bearer tok" },
    ]);
  });

  it("token ຜິດ → CHANNEL_AUTH", async () => {
    graph = await startFakeGraph({ token: "tok" });
    expect(await adapterFor(graph, "wrong").sendText("U1", "x")).toMatchObject({ ok: false, code: "CHANNEL_AUTH" });
    expect(graph.sent).toEqual([]);
  });

  it("failNext ໃຊ້ຄັ້ງດຽວ (ເຊັ່ນ ເກີນໜ້າຕ່າງ 24 ຊມ) ແລ້ວກັບເປັນປົກກະຕິ", async () => {
    graph = await startFakeGraph();
    graph.failNext({ status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." });
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: false, code: "OUTSIDE_WINDOW" });
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: true });
  });

  it("profile: ຮູ້ຈັກ id ເທົ່ານັ້ນ (ຫຼື autoProfiles)", async () => {
    graph = await startFakeGraph();
    graph.profiles.set("U1", "Somchai Vong");
    expect(await adapterFor(graph).fetchProfile("U1")).toEqual({ name: "Somchai Vong" });
    expect(await adapterFor(graph).fetchProfile("U2")).toBeNull();
    const auto = await startFakeGraph({ autoProfiles: true });
    try {
      expect(await adapterFor(auto).fetchProfile("U9")).toEqual({ name: "Sim U9" });
    } finally {
      await auto.close();
    }
  });

  it("reset ລ້າງ sent/failures/profiles ແລະ ເລີ່ມນັບ message_id ໃໝ່", async () => {
    graph = await startFakeGraph();
    await adapterFor(graph).sendText("U1", "x");
    graph.failNext({ status: 500, code: 1, message: "boom" });
    graph.profiles.set("U1", "A B");
    graph.reset();
    expect(graph.sent).toEqual([]);
    expect(graph.profiles.size).toBe(0);
    expect(graph.nextMessageId()).toBe("m_sim_1");
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: true });
  });
});

describe("fake Graph server hardening", () => {
  const graphs: FakeGraph[] = [];
  const start = async (options?: Parameters<typeof startFakeGraph>[0]) => {
    const g = await startFakeGraph(options);
    graphs.push(g);
    return g;
  };
  afterEach(async () => {
    await Promise.all(graphs.splice(0).map((g) => g.close()));
  });
  const adapterFor = (g: FakeGraph) => new FacebookAdapter({ pageAccessToken: "tok", graphBaseUrl: g.url });
  const rawRequest = (g: FakeGraph, method: string, path: string, body?: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(`${g.url}${path}`, { method, headers: { "content-type": "application/json" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      });
      req.on("error", reject);
      req.end(body);
    });

  it("socket ຖືກທຳລາຍກາງ body ບໍ່ເກີດ unhandled rejection ແລະ server ຍັງໃຊ້ໄດ້", async () => {
    const g = await start();
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      const req = httpRequest(`${g.url}/me/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "100" },
      });
      req.on("error", () => {});
      req.write('{"recipient":');
      await new Promise((resolve) => setTimeout(resolve, 50));
      req.destroy();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(rejections).toEqual([]);
      expect(await adapterFor(g).sendText("U1", "x")).toMatchObject({ ok: true });
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("close() ເອີ້ນຊ້ຳໄດ້", async () => {
    const g = await start();
    await g.close();
    await g.close();
  });

  it("close() ບໍ່ຄ້າງເມື່ອມີ keep-alive connection", async () => {
    const g = await start();
    const response = await fetch(`${g.url}/me/messages`, { method: "DELETE", headers: { connection: "keep-alive" } });
    await response.text();
    await g.close();
  });

  it("listen ຜິດພາດ (port ຖືກໃຊ້ແລ້ວ) → reject", async () => {
    const g = await start();
    const port = Number(new URL(g.url).port);
    await expect(startFakeGraph({ port })).rejects.toMatchObject({ code: "EADDRINUSE" });
  });

  it("path/method ທີ່ບໍ່ຮູ້ຈັກ → 404", async () => {
    const g = await start();
    expect((await rawRequest(g, "DELETE", "/me/messages")).status).toBe(404);
  });

  it("POST body JSON ເພ → 400", async () => {
    const g = await start();
    expect((await rawRequest(g, "POST", "/me/messages", "{not json")).status).toBe(400);
  });

  it("GET /me/messages ບໍ່ແມ່ນ profile ເຖິງເປີດ autoProfiles → 404", async () => {
    const g = await start({ autoProfiles: true });
    expect((await rawRequest(g, "GET", "/me/messages")).status).toBe(404);
    expect((await rawRequest(g, "GET", "/v21.0/U1?fields=first_name")).status).toBe(200);
  });
});

describe("postSignedWebhook", () => {
  it("ເຊັນ body ທີ່ສົ່ງຈິງດ້ວຍ app secret", async () => {
    let captured: { body: string; header: string | string[] | undefined } | undefined;
    const server = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        captured = { body: Buffer.concat(chunks).toString("utf8"), header: req.headers["x-hub-signature-256"] };
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const payload = messagePayload({ pageId: "P", psid: "U1", mid: "m1", text: "ສະບາຍດີ", timestamp: 1 });
      const response = await postSignedWebhook({ url: `http://127.0.0.1:${port}/webhooks/facebook`, appSecret: "s3cret", payload });
      expect(response.status).toBe(200);
      expect(captured?.body).toBe(JSON.stringify(payload));
      expect(isValidSignature("s3cret", Buffer.from(captured?.body ?? ""), captured?.header as string)).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("comments", () => {
  it("commentPayload ຖືກ parse ໂດຍ parseFacebookComments", () => {
    const events = parseFacebookComments(
      commentPayload({ pageId: "P", postId: "P_1", commentId: "P_1_9", fromId: "U1", fromName: "ກ", message: "A1", timestamp: 1_700_000_000_000 }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ postId: "P_1", commentId: "P_1_9", authorId: "U1", message: "A1" });
    expect(events[0]?.timestamp.getTime()).toBe(1_700_000_000_000);
  });
  it("parentId ຂອງ commentPayload: default = postId; ກຳນົດເອງໄດ້", () => {
    const input = { pageId: "P", postId: "P_1", commentId: "P_1_9", fromId: "U1", fromName: "ກ", message: "A1" };
    expect(parseFacebookComments(commentPayload(input))[0]?.parentId).toBe("P_1");
    expect(parseFacebookComments(commentPayload({ ...input, parentId: "P_1_8" }))[0]?.parentId).toBe("P_1_8");
  });
  it("verb ອື່ນຖືກຂ້າມ", () => {
    expect(parseFacebookComments(commentPayload({ pageId: "P", postId: "P_1", commentId: "c", fromId: "U1", fromName: "ກ", message: "A1", verb: "edited" }))).toEqual([]);
  });
  it("fake graph ບັນທຶກ private_replies ແລະ comments; failNext ໃຊ້ກັບທັງສອງ", async () => {
    const graph = await startFakeGraph({ token: "t" });
    try {
      const adapter = new FacebookAdapter({ pageAccessToken: "t", graphBaseUrl: graph.url });
      expect(await adapter.sendPrivateReply("P_1_9", "hi")).toMatchObject({ ok: true });
      expect(await adapter.replyToComment("P_1_9", "ok")).toMatchObject({ ok: true });
      expect(graph.privateReplies).toEqual([{ commentId: "P_1_9", text: "hi", authorization: "Bearer t" }]);
      expect(graph.commentReplies).toEqual([{ commentId: "P_1_9", text: "ok", authorization: "Bearer t" }]);
      graph.failNext({ status: 400, code: 100, message: "(#100) bad" });
      expect(await adapter.sendPrivateReply("P_1_9", "again")).toMatchObject({ ok: false, code: "SEND_REJECTED" });
      graph.reset();
      expect(graph.privateReplies).toEqual([]);
      expect(graph.commentReplies).toEqual([]);
    } finally {
      await graph.close();
    }
  });
  it("onCommentReply ຖືກເອີ້ນພ້ອມ kind", async () => {
    const seen: Array<[string, string, string]> = [];
    const graph = await startFakeGraph({ token: "t", onCommentReply: (kind, reply) => seen.push([kind, reply.commentId, reply.text]) });
    try {
      const adapter = new FacebookAdapter({ pageAccessToken: "t", graphBaseUrl: graph.url });
      await adapter.sendPrivateReply("P_1_9", "hi");
      await adapter.replyToComment("P_1_9", "ok");
      expect(seen).toEqual([
        ["private", "P_1_9", "hi"],
        ["public", "P_1_9", "ok"],
      ]);
    } finally {
      await graph.close();
    }
  });
});

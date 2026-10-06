import { afterEach, describe, expect, it } from "vitest";
import { FacebookAdapter } from "../facebook/adapter";
import { parseFacebookWebhook } from "../facebook/parse";
import { type FakeGraph, deliveryPayload, echoPayload, messagePayload, startFakeGraph } from "./index";

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

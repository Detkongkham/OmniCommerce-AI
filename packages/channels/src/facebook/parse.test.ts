import { describe, expect, it } from "vitest";
import { parseFacebookComments, parseFacebookWebhook } from "./parse";

const wrap = (...messaging: unknown[]) => ({ object: "page", entry: [{ id: "PAGE", time: 1, messaging }] });

describe("parseFacebookWebhook", () => {
  it("ຂໍ້ຄວາມຕົວອັກສອນຂອງລູກຄ້າ → kind=message, threadId=sender", () => {
    const events = parseFacebookWebhook(
      wrap({ sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1_700_000_000_000, message: { mid: "m1", text: "ສະບາຍດີ" } }),
    );
    expect(events).toEqual([
      {
        kind: "message",
        channel: "FACEBOOK",
        threadId: "U1",
        externalId: "m1",
        text: "ສະບາຍດີ",
        attachments: [],
        timestamp: new Date(1_700_000_000_000),
      },
    ]);
  });

  it("echo (is_echo) → kind=echo ແລະ threadId=recipient (ລູກຄ້າ)", () => {
    const [event] = parseFacebookWebhook(
      wrap({ sender: { id: "PAGE" }, recipient: { id: "U1" }, timestamp: 5, message: { mid: "m2", is_echo: true, text: "ຕອບແລ້ວ", app_id: 1 } }),
    );
    expect(event).toMatchObject({ kind: "echo", threadId: "U1", externalId: "m2", text: "ຕອບແລ້ວ" });
  });

  it("attachment: ເກັບ type ແລະ url; ຂໍ້ຄວາມທີ່ມີແຕ່ຮູບ text=null", () => {
    const [event] = parseFacebookWebhook(
      wrap({
        sender: { id: "U1" },
        recipient: { id: "PAGE" },
        timestamp: 5,
        message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }, { type: "location", payload: {} }] },
      }),
    );
    expect(event).toMatchObject({
      text: null,
      attachments: [
        { type: "image", url: "https://x/y.jpg" },
        { type: "location", url: null },
      ],
    });
  });

  it("ຂ້າມ delivery/read/postback ແລະ ຂໍ້ຄວາມທີ່ບໍ່ມີ mid ຫຼື ບໍ່ມີທັງ text ແລະ attachment", () => {
    const events = parseFacebookWebhook(
      wrap(
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, delivery: { mids: ["m1"], watermark: 1 } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, read: { watermark: 1 } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, postback: { payload: "x" } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, message: { text: "no mid" } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, message: { mid: "m9" } },
        { recipient: { id: "PAGE" }, timestamp: 1, message: { mid: "m10", text: "no sender" } },
      ),
    );
    expect(events).toEqual([]);
  });

  it("ຫຼາຍ entry/messaging ຖືກແປງຄົບ; ບໍ່ມີ timestamp = ເວລາປັດຈຸບັນ", () => {
    const before = Date.now();
    const events = parseFacebookWebhook({
      object: "page",
      entry: [
        { id: "PAGE", messaging: [{ sender: { id: "A" }, recipient: { id: "PAGE" }, message: { mid: "a", text: "1" } }] },
        { id: "PAGE", messaging: [{ sender: { id: "B" }, recipient: { id: "PAGE" }, message: { mid: "b", text: "2" } }] },
      ],
    });
    expect(events.map((event) => event.threadId)).toEqual(["A", "B"]);
    expect(events[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("payload ຜິດຮູບແບບ/ບໍ່ແມ່ນ page = []", () => {
    for (const payload of [null, undefined, "x", 1, [], {}, { object: "instagram", entry: [] }, { object: "page" }, { object: "page", entry: "x" }, { object: "page", entry: [null, { messaging: "x" }] }]) {
      expect(parseFacebookWebhook(payload)).toEqual([]);
    }
  });

  it("timestamp ນອກຊ່ວງ (1e308, -1e20) → ໃຊ້ເວລາປັດຈຸບັນ ບໍ່ແມ່ນ Invalid Date", () => {
    for (const timestamp of [1e308, -1e20]) {
      const [event] = parseFacebookWebhook(
        wrap({ sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp, message: { mid: "mt", text: "x" } }),
      );
      expect(Number.isNaN(event?.timestamp.getTime())).toBe(false);
    }
  });
});

describe("parseFacebookComments", () => {
  const change = (value: object, pageId = "PAGE1") => ({
    object: "page",
    entry: [{ id: pageId, time: 1_700_000_000, changes: [{ field: "feed", value }] }],
  });
  const base = {
    item: "comment",
    verb: "add",
    comment_id: "100_200",
    post_id: "100_300",
    from: { id: "U1", name: "ນາງ ກ" },
    message: "A1 2",
    created_time: 1_700_000_000,
  };

  it("ແປງຄອມເມັ້ນໃໝ່", () => {
    expect(parseFacebookComments(change(base))).toEqual([
      {
        channel: "FACEBOOK",
        postId: "100_300",
        commentId: "100_200",
        authorId: "U1",
        authorName: "ນາງ ກ",
        message: "A1 2",
        timestamp: new Date(1_700_000_000_000),
      },
    ]);
  });
  it("ຂ້າມ edited/remove, ປະເພດອື່ນ (reaction, post), ຄອມເມັ້ນຂອງ Page ເອງ, ຂໍ້ຄວາມວ່າງ, field ຂາດ", () => {
    expect(parseFacebookComments(change({ ...base, verb: "edited" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, verb: "remove" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, item: "reaction" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, from: { id: "PAGE1", name: "Shop" } }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, message: "   " }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, comment_id: undefined }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, post_id: undefined }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, from: undefined }))).toEqual([]);
  });
  it("ບໍ່ມີ name → ຊື່ຊົ່ວຄາວ; message ຍາວເກີນຖືກຕັດ 1000 ຕົວ", () => {
    const [event] = parseFacebookComments(change({ ...base, from: { id: "U1234" }, message: "x".repeat(2000) }));
    expect(event?.authorName).toBe("Facebook 1234");
    expect(event?.message).toHaveLength(1000);
  });
  it("payload ຜິດຮູບແບບ → [] (ບໍ່ throw) ແລະ messaging ບໍ່ຖືກນັບເປັນຄອມເມັ້ນ", () => {
    for (const payload of [null, 1, "x", {}, { object: "user" }, { object: "page", entry: "x" }, { object: "page", entry: [null, { changes: "x" }] }]) {
      expect(parseFacebookComments(payload)).toEqual([]);
    }
    expect(parseFacebookComments({ object: "page", entry: [{ id: "P", messaging: [{}] }] })).toEqual([]);
  });
});

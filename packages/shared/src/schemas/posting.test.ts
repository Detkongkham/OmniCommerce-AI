import { describe, expect, it } from "vitest";
import {
  POST_MEDIA_MAX,
  POST_MESSAGE_MAX,
  POST_SCHEDULE_MAX_DAYS,
  createPostSchema,
  facebookPermalink,
  postListQuerySchema,
  schedulePostSchema,
  updatePostSchema,
} from "./posting";

const DAY = 24 * 60 * 60 * 1000;

describe("createPostSchema", () => {
  it("trim ຂໍ້ຄວາມ, media default [], liveSessionId optional", () => {
    expect(createPostSchema.parse({ message: "  ສະບາຍດີ  " })).toEqual({ message: "ສະບາຍດີ", media: [] });
    expect(
      createPostSchema.parse({ message: "", media: [{ mediaFileId: "m1" }, { url: "https://x.test/a.jpg" }], liveSessionId: "s1" }),
    ).toEqual({ message: "", media: [{ mediaFileId: "m1" }, { url: "https://x.test/a.jpg" }], liveSessionId: "s1" });
  });

  it("ຕ້ອງມີຂໍ້ຄວາມ ຫຼື ຮູບ", () => {
    expect(createPostSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(createPostSchema.safeParse({ message: "", media: [] }).success).toBe(false);
  });

  it("ຈຳກັດຄວາມຍາວ ແລະ ຈຳນວນຮູບ", () => {
    expect(createPostSchema.safeParse({ message: "a".repeat(POST_MESSAGE_MAX) }).success).toBe(true);
    expect(createPostSchema.safeParse({ message: "a".repeat(POST_MESSAGE_MAX + 1) }).success).toBe(false);
    const media = Array.from({ length: POST_MEDIA_MAX + 1 }, (_, i) => ({ mediaFileId: `m${i}` }));
    expect(createPostSchema.safeParse({ message: "x", media }).success).toBe(false);
    expect(createPostSchema.safeParse({ message: "x", media: media.slice(1) }).success).toBe(true);
  });

  it("URL ຕ້ອງເປັນ https ແລະ ແຕ່ລະຮູບມີແຫຼ່ງດຽວ", () => {
    expect(createPostSchema.safeParse({ message: "x", media: [{ url: "http://x.test/a.jpg" }] }).success).toBe(false);
    expect(createPostSchema.safeParse({ message: "x", media: [{ url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(createPostSchema.safeParse({ message: "x", media: [{ mediaFileId: "m1", url: "https://x.test/a.jpg" }] }).success).toBe(false);
    expect(createPostSchema.safeParse({ message: "x", media: [{}] }).success).toBe(false);
  });

  it("ປະຕິເສດ field ທີ່ບໍ່ຮູ້ຈັກ", () => {
    expect(createPostSchema.safeParse({ message: "x", status: "PUBLISHED" }).success).toBe(false);
  });
});

describe("updatePostSchema", () => {
  it("ທຸກ field optional ແຕ່ຕ້ອງມີຢ່າງໜ້ອຍອັນດຽວ; liveSessionId null = ຖອດ", () => {
    expect(updatePostSchema.parse({ liveSessionId: null })).toEqual({ liveSessionId: null });
    expect(updatePostSchema.parse({ message: " hi " })).toEqual({ message: "hi" });
    expect(updatePostSchema.safeParse({}).success).toBe(false);
  });
});

describe("schedulePostSchema", () => {
  it("ບໍ່ສົ່ງເວລາ = ໂພສທັນທີ", () => {
    expect(schedulePostSchema.parse({})).toEqual({});
  });

  it("ເວລາຕ້ອງຢູ່ໃນອະນາຄົດ (ຍອມ 1 ນາທີ) ແລະ ບໍ່ເກີນ 180 ວັນ", () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(schedulePostSchema.parse({ scheduledAt: soon }).scheduledAt).toEqual(new Date(soon));
    expect(schedulePostSchema.safeParse({ scheduledAt: new Date(Date.now() - 5 * 60_000).toISOString() }).success).toBe(false);
    expect(
      schedulePostSchema.safeParse({ scheduledAt: new Date(Date.now() + (POST_SCHEDULE_MAX_DAYS + 1) * DAY).toISOString() }).success,
    ).toBe(false);
    expect(schedulePostSchema.safeParse({ scheduledAt: "tomorrow" }).success).toBe(false);
  });
});

describe("postListQuerySchema", () => {
  it("default ແລະ ແປງຄ່າ", () => {
    expect(postListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(
      postListQuerySchema.parse({ status: "SCHEDULED", from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", pageSize: "100" }),
    ).toEqual({
      page: 1,
      pageSize: 100,
      status: "SCHEDULED",
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-11-01T00:00:00.000Z"),
    });
  });

  it("ປະຕິເສດ status ຜິດ ແລະ from > to", () => {
    expect(postListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(postListQuerySchema.safeParse({ from: "2026-11-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }).success).toBe(false);
  });
});

describe("facebookPermalink", () => {
  it("ສ້າງລິ້ງຈາກ id ຂອງໂພສ (encode)", () => {
    expect(facebookPermalink("123_456")).toBe("https://www.facebook.com/123_456");
    expect(facebookPermalink("a/b")).toBe("https://www.facebook.com/a%2Fb");
  });
});

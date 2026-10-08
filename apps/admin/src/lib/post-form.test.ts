import { POST_MESSAGE_MAX } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { translate } from "./i18n/dictionary";
import { defaultScheduleTime, emptyPostForm, mediaDraft, postFormFromDto, validatePostForm } from "./post-form";
import type { SocialPostDto } from "./posts";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate("en", key, params);
const NOW = new Date("2026-10-09T01:20:00.000Z"); // 08:20 ເວລາລາວ

const post = (patch: Partial<SocialPostDto> = {}): SocialPostDto => ({
  id: "p1",
  message: "hello",
  status: "DRAFT",
  scheduledAt: null,
  publishedAt: null,
  externalPostId: null,
  permalinkUrl: null,
  errorCode: null,
  errorMessage: null,
  cfLinkError: null,
  liveSession: null,
  media: [],
  createdBy: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...patch,
});

describe("post form", () => {
  it("ຄ່າເລີ່ມຕົ້ນ: ໂພສທັນທີ, ເວລາ = ອີກ 1 ຊມ ປັດນາທີ (ເວລາລາວ)", () => {
    expect(defaultScheduleTime(NOW)).toBe("2026-10-09T09:00");
    expect(emptyPostForm(NOW)).toMatchObject({ message: "", media: [], liveSessionId: "", when: "now" });
  });

  it("fromDto: ໂພສທີ່ຕັ້ງເວລາໃນອະນາຄົດ = later + ເວລາລາວ; ຮູບ + session", () => {
    const form = postFormFromDto(
      post({
        status: "SCHEDULED",
        scheduledAt: "2026-10-10T03:00:00.000Z",
        liveSession: { id: "s1", title: "CF", status: "DRAFT" },
        media: [{ id: "x", position: 0, mediaFileId: "m1", url: "/media/files/a.png" }],
      }),
      NOW,
    );
    expect(form).toMatchObject({ when: "later", scheduledAt: "2026-10-10T10:00", liveSessionId: "s1" });
    expect(form.media).toEqual([{ key: expect.any(String), mediaFileId: "m1", url: "/media/files/a.png" }]);
    expect(postFormFromDto(post({ status: "FAILED", scheduledAt: "2026-10-01T00:00:00.000Z" }), NOW).when).toBe("now");
  });

  it("validate: ຕ້ອງມີເນື້ອຫາ, ຄວາມຍາວ, ແປງຮູບເປັນ input ຂອງ API", () => {
    expect(validatePostForm({ ...emptyPostForm(NOW), message: "  " }, false, t, NOW)).toEqual({ ok: false, messages: ["Add a message or at least one image"] });
    expect(validatePostForm({ ...emptyPostForm(NOW), message: "a".repeat(POST_MESSAGE_MAX + 1) }, false, t, NOW).ok).toBe(false);
    const ok = validatePostForm(
      {
        ...emptyPostForm(NOW),
        message: " hi ",
        media: [mediaDraft({ mediaFileId: "m1", url: "/media/files/a.png" }), mediaDraft({ mediaFileId: null, url: "https://cdn.test/b.jpg" })],
      },
      true,
      t,
      NOW,
    );
    expect(ok).toEqual({
      ok: true,
      content: { message: "hi", media: [{ mediaFileId: "m1" }, { url: "https://cdn.test/b.jpg" }], liveSessionId: null },
      scheduledAt: undefined,
    });
  });

  it("validate ເວລາ: ສະເພາະຕອນໂພສແບບ later; ຕ້ອງໃນອະນາຄົດ ແລະ ≤ 180 ວັນ", () => {
    const base = { ...emptyPostForm(NOW), message: "x", when: "later" as const };
    expect(validatePostForm({ ...base, scheduledAt: "2026-10-09T08:00" }, true, t, NOW).ok).toBe(false);
    expect(validatePostForm({ ...base, scheduledAt: "2026-10-09T08:00" }, false, t, NOW).ok).toBe(true);
    expect(validatePostForm({ ...base, scheduledAt: "2027-06-01T08:00" }, true, t, NOW).ok).toBe(false);
    expect(validatePostForm({ ...base, scheduledAt: "" }, true, t, NOW).ok).toBe(false);
    expect(validatePostForm({ ...base, scheduledAt: "2026-10-09T09:30" }, true, t, NOW)).toMatchObject({ ok: true, scheduledAt: "2026-10-09T02:30:00.000Z" });
  });
});

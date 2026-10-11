import { POST_MEDIA_MAX, POST_MESSAGE_MAX, POST_SCHEDULE_MAX_DAYS, type PostMediaInput } from "@oca/shared";
import type { Translate } from "./i18n/dictionary";
import { type SocialPostDto, laosLocalToIso, toLaosLocal } from "./posts";

export interface MediaDraft {
  /** key ຂອງ React (ຄົງທີ່ຕອນເລື່ອນລຳດັບ) */
  key: string;
  mediaFileId: string | null;
  /** path ຂອງໄຟລ໌ທີ່ອັບໂຫຼດ ຫຼື URL https ພາຍນອກ */
  url: string;
}

export interface PostFormState {
  message: string;
  media: MediaDraft[];
  liveSessionId: string;
  when: "now" | "later";
  /** datetime-local ເວລາລາວ */
  scheduledAt: string;
}

let draftCounter = 0;
export function mediaDraft(input: { mediaFileId: string | null; url: string }): MediaDraft {
  draftCounter += 1;
  return { key: `m${draftCounter}`, ...input };
}

/** ຄ່າເລີ່ມຕົ້ນຂອງເວລາ: ອີກ 1 ຊົ່ວໂມງ ປັດເປັນນາທີ 0 */
export function defaultScheduleTime(now: Date = new Date()): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setUTCMinutes(0, 0, 0);
  return toLaosLocal(next);
}

export function emptyPostForm(now: Date = new Date()): PostFormState {
  return { message: "", media: [], liveSessionId: "", when: "now", scheduledAt: defaultScheduleTime(now) };
}

export function postFormFromDto(post: SocialPostDto, now: Date = new Date()): PostFormState {
  const scheduled = post.status === "SCHEDULED" && post.scheduledAt !== null && new Date(post.scheduledAt).getTime() > now.getTime();
  return {
    message: post.message,
    media: post.media.map((item) => mediaDraft({ mediaFileId: item.mediaFileId, url: item.url })),
    liveSessionId: post.liveSession?.id ?? "",
    when: scheduled ? "later" : "now",
    scheduledAt: scheduled && post.scheduledAt ? toLaosLocal(post.scheduledAt) : defaultScheduleTime(now),
  };
}

export interface PostContentInput {
  message: string;
  media: PostMediaInput[];
  liveSessionId: string | null;
}

export type PostFormResult =
  | { ok: true; content: PostContentInput; scheduledAt: string | undefined }
  | { ok: false; messages: string[] };

/**
 * ກວດຟອມ. `publish` = ກົດໂພສ/ຕັ້ງເວລາ (ກວດເວລານຳ); ບັນທຶກຮ່າງບໍ່ກວດເວລາ.
 * scheduledAt ທີ່ຄືນ: undefined = ໂພສທັນທີ.
 */
export function validatePostForm(form: PostFormState, publish: boolean, t: Translate, now: Date = new Date()): PostFormResult {
  const messages: string[] = [];
  const message = form.message.trim();
  if (message.length === 0 && form.media.length === 0) messages.push(t("posts.validation.empty"));
  if (message.length > POST_MESSAGE_MAX) messages.push(t("posts.validation.tooLong", { max: POST_MESSAGE_MAX }));
  let scheduledAt: string | undefined;
  if (publish && form.when === "later") {
    const iso = laosLocalToIso(form.scheduledAt);
    const time = iso ? new Date(iso).getTime() : Number.NaN;
    const max = now.getTime() + POST_SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000;
    if (!iso || !(time > now.getTime()) || time > max) messages.push(t("posts.validation.scheduledAt", { days: POST_SCHEDULE_MAX_DAYS }));
    else scheduledAt = iso;
  }
  if (messages.length > 0) return { ok: false, messages };
  return {
    ok: true,
    content: {
      message,
      media: form.media.slice(0, POST_MEDIA_MAX).map((item) => (item.mediaFileId ? { mediaFileId: item.mediaFileId } : { url: item.url })),
      liveSessionId: form.liveSessionId || null,
    },
    scheduledAt,
  };
}

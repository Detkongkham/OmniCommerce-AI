import { z } from "zod";
import { MESSAGE_SEND_ERRORS } from "./inbox";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const SOCIAL_POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

/** ສະຖານະທີ່ແກ້ໄຂ/ລຶບໄດ້ */
export const EDITABLE_POST_STATUSES = ["DRAFT", "SCHEDULED", "FAILED"] as const satisfies readonly SocialPostStatus[];

export const POST_MESSAGE_MAX = 5000;
export const POST_MEDIA_MAX = 10;
export const POST_SCHEDULE_MAX_DAYS = 180;
/** ຍອມເວລາທີ່ຜ່ານມາແລ້ວໜ້ອຍໜຶ່ງ (ໂມງເຄື່ອງ client ຊ້າ) */
const SCHEDULE_PAST_TOLERANCE_MS = 60_000;

export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];

/** ລະຫັດຄວາມລົ້ມເຫຼວທີ່ເກັບໃນ `SocialPost.errorCode` */
export const POST_PUBLISH_ERRORS = [...MESSAGE_SEND_ERRORS, "PUBLISH_UNCERTAIN", "MEDIA_MISSING"] as const;
export type PostPublishError = (typeof POST_PUBLISH_ERRORS)[number];

export function isPostPublishError(value: unknown): value is PostPublishError {
  return typeof value === "string" && (POST_PUBLISH_ERRORS as readonly string[]).includes(value);
}

/** ລິ້ງເປີດໂພສຈາກ id ທີ່ Graph ຄືນ (`<pageId>_<postId>`) */
export function facebookPermalink(externalPostId: string): string {
  return `https://www.facebook.com/${encodeURIComponent(externalPostId)}`;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1).max(100);

const postMediaSchema = z.union([
  z.strictObject({ mediaFileId: idSchema }),
  z.strictObject({
    url: z
      .string()
      .trim()
      .max(2000)
      .regex(/^https:\/\/\S+$/, "ຕ້ອງເປັນລິ້ງ https"),
  }),
]);
export type PostMediaInput = z.infer<typeof postMediaSchema>;

const messageSchema = z.string().trim().max(POST_MESSAGE_MAX);
const mediaListSchema = z.array(postMediaSchema).max(POST_MEDIA_MAX, `ຮູບບໍ່ເກີນ ${POST_MEDIA_MAX} ຮູບ`);
const hasContent = (value: { message?: string; media?: unknown[] }) =>
  (value.message ?? "").length > 0 || (value.media ?? []).length > 0;
const EMPTY_POST_MESSAGE = "ຕ້ອງມີຂໍ້ຄວາມ ຫຼື ຮູບ";

export const createPostSchema = z
  .strictObject({
    message: messageSchema,
    media: mediaListSchema.default([]),
    liveSessionId: idSchema.optional(),
  })
  .refine(hasContent, { message: EMPTY_POST_MESSAGE, path: ["message"] });
export type CreatePostInput = z.infer<typeof createPostSchema>;

/** ຄວາມວ່າງຂອງເນື້ອຫາກວດໃນ service (ຕ້ອງລວມກັບຄ່າເດີມ) */
export const updatePostSchema = z
  .strictObject({
    message: messageSchema.optional(),
    media: mediaListSchema.optional(),
    liveSessionId: idSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const schedulePostSchema = z.strictObject({
  scheduledAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() >= Date.now() - SCHEDULE_PAST_TOLERANCE_MS, "ເວລາຕ້ອງຢູ່ໃນອະນາຄົດ")
    .refine(
      (date) => date.getTime() <= Date.now() + POST_SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000,
      `ຕັ້ງເວລາລ່ວງໜ້າໄດ້ບໍ່ເກີນ ${POST_SCHEDULE_MAX_DAYS} ວັນ`,
    )
    .optional(),
});
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const postListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    status: z.enum(SOCIAL_POST_STATUSES).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, { message: "from ຕ້ອງບໍ່ຫຼັງ to", path: ["from"] });
export type PostListQuery = z.infer<typeof postListQuerySchema>;

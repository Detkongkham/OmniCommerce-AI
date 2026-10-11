import { z } from "zod";
import { normalizeCfText } from "../cf-parser";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const LIVE_SESSION_KINDS = ["LIVE", "POST"] as const;
export const LIVE_SESSION_STATUSES = ["DRAFT", "LIVE", "ENDED"] as const;
export const CF_OUTCOMES = ["ORDERED", "NO_MATCH", "OUT_OF_STOCK", "LIMIT_REACHED", "ERROR"] as const;
export const CF_REPLY_STATUSES = ["NONE", "SENDING", "SENT", "FAILED"] as const;

export type LiveSessionKind = (typeof LIVE_SESSION_KINDS)[number];
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];
export type CfOutcome = (typeof CF_OUTCOMES)[number];
export type CfReplyStatus = (typeof CF_REPLY_STATUSES)[number];

// ---------------------------------------------------------------------------
// body / query
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);
const titleSchema = z.string().trim().min(1).max(100);
/** id ຂອງໂພສ/ວິດີໂອ Facebook ຕາມທີ່ webhook ສົ່ງ (ເຊັ່ນ 123_456) */
const externalPostIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{1,200}$/, "id ຂອງໂພສຕ້ອງເປັນຕົວອັກສອນ/ເລກ/_/./- ເທົ່ານັ້ນ");
const limitSchema = z.number().int().min(1).max(100_000).nullable();

/** ລະຫັດ CF: normalize ກ່ອນເກັບ (ຕົວໃຫຍ່, ເລກ ASCII, ຍຸບຊ່ອງວ່າງ) ຍາວ 1..30 */
export const cfCodeSchema = z
  .string()
  .transform(normalizeCfText)
  .pipe(
    z
      .string()
      .min(1)
      .max(30)
      // , ; + ເປັນຕົວແຍກໃນ parser ຈຶ່ງຈັບຄູ່ລະຫັດທີ່ມີຕົວເຫຼົ່ານີ້ບໍ່ໄດ້ຈັກເທື່ອ
      .refine((code) => !/[,;+]/.test(code), "ລະຫັດຫ້າມມີ , ; ຫຼື +"),
  );

const requireNonEmpty = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";

export const createLiveSessionSchema = z.strictObject({
  title: titleSchema,
  kind: z.enum(LIVE_SESSION_KINDS),
  externalPostId: externalPostIdSchema.nullable().optional(),
  publicReplyEnabled: z.boolean().default(true),
});

export const updateLiveSessionSchema = z
  .strictObject({
    title: titleSchema.optional(),
    externalPostId: externalPostIdSchema.nullable().optional(),
    publicReplyEnabled: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const createLiveItemSchema = z.strictObject({
  code: cfCodeSchema,
  variantId: idSchema,
  limit: limitSchema.optional(),
});

export const updateLiveItemSchema = z
  .strictObject({
    variantId: idSchema.optional(),
    limit: limitSchema.optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const liveSessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(LIVE_SESSION_STATUSES).optional(),
});

export const cfCommentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  outcome: z.enum(CF_OUTCOMES).optional(),
});

/** ສິນຄ້າທີ່ກຳລັງນຳສະເໜີເທິງ Host screen; null = ບໍ່ມີ */
export const setFeaturedSchema = z.strictObject({ itemId: idSchema.nullable() });

// ---------------------------------------------------------------------------
// event realtime ຂອງ session (API ແລະ worker publish ຜ່ານ Redis; SSE ສົ່ງຕໍ່ client ທີ່ refetch ເອງ)
// ---------------------------------------------------------------------------
export const LIVE_EVENTS_CHANNEL = "oca:live:events";

export interface LiveEvent {
  type: "live.updated";
  sessionId: string;
}

export function isLiveEvent(value: unknown): value is LiveEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as LiveEvent).type === "live.updated" &&
    typeof (value as LiveEvent).sessionId === "string"
  );
}

export type SetFeaturedInput = z.infer<typeof setFeaturedSchema>;
export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type UpdateLiveSessionInput = z.infer<typeof updateLiveSessionSchema>;
export type CreateLiveItemInput = z.infer<typeof createLiveItemSchema>;
export type UpdateLiveItemInput = z.infer<typeof updateLiveItemSchema>;
export type LiveSessionListQuery = z.infer<typeof liveSessionListQuerySchema>;
export type CfCommentListQuery = z.infer<typeof cfCommentListQuerySchema>;

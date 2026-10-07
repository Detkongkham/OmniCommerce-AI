import { z } from "zod";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const CONVERSATION_STATUSES = ["OPEN", "CLOSED"] as const;
export const MESSAGE_DIRECTIONS = ["IN", "OUT"] as const;
export const MESSAGE_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
/** ເຫດຜົນທີ່ສົ່ງຂໍ້ຄວາມອອກບໍ່ສຳເລັດ (ເກັບໃນ Message.errorCode; UI ແປເປັນພາສາລາວ). */
export const MESSAGE_SEND_ERRORS = [
  "OUTSIDE_WINDOW", // ເກີນໜ້າຕ່າງ 24 ຊົ່ວໂມງຂອງ Meta
  "CHANNEL_AUTH", // token ຜິດ/ໝົດອາຍຸ
  "CHANNEL_NOT_CONFIGURED",
  "CHANNEL_UNAVAILABLE", // ເຄືອຂ່າຍ / Meta ລົ້ມຊົ່ວຄາວ / rate limit
  "SEND_REJECTED", // Meta ປະຕິເສດດ້ວຍເຫດຜົນອື່ນ
] as const;

/** Messenger ຈຳກັດຂໍ້ຄວາມ 2000 ຕົວອັກສອນ. */
export const MAX_MESSAGE_LENGTH = 2000;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export type MessageSendError = (typeof MESSAGE_SEND_ERRORS)[number];

export function isMessageSendError(value: unknown): value is MessageSendError {
  return typeof value === "string" && (MESSAGE_SEND_ERRORS as readonly string[]).includes(value);
}

/** event ເບົາທີ່ສົ່ງຜ່ານ Redis/SSE; client ຕ້ອງ refetch ເອງ. */
export interface InboxEvent {
  type: "conversation.updated";
  conversationId: string;
}

// ---------------------------------------------------------------------------
// query / body
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(CONVERSATION_STATUSES).optional(),
  /** "me" | "unassigned" | id ຂອງຜູ້ໃຊ້ */
  assignee: z.string().trim().min(1).max(100).optional(),
  unread: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  q: z.string().trim().max(100).optional(),
});

/** cursor ແບບ "ກ່ອນຂໍ້ຄວາມນີ້" (ໃໝ່ສຸດກ່ອນ) ເພື່ອບໍ່ໃຫ້ໜ້າເລື່ອນເມື່ອມີຂໍ້ຄວາມໃໝ່ເຂົ້າ. */
export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeId: idSchema.optional(),
});

export const sendMessageSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const updateConversationSchema = z
  .strictObject({
    assigneeId: idSchema.nullable().optional(),
    status: z.enum(CONVERSATION_STATUSES).optional(),
    customerId: idSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");

export const createCustomerFromChatSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .regex(/^\+?[0-9]{6,15}$/, "ເບີໂທບໍ່ຖືກຕ້ອງ")
    .optional(),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateCustomerFromChatInput = z.infer<typeof createCustomerFromChatSchema>;

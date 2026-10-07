import type { Prisma } from "@oca/database";

export const CONVERSATION_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
} as const satisfies Prisma.ConversationInclude;

export const MESSAGE_INCLUDE = {
  sentBy: { select: { id: true, name: true } },
} as const satisfies Prisma.MessageInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export interface ConversationDto {
  id: string;
  channel: string;
  displayName: string;
  status: "OPEN" | "CLOSED";
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  attachments: { type: string; url: string | null }[];
  status: "PENDING" | "SENT" | "FAILED";
  errorCode: string | null;
  sentBy: { id: string; name: string } | null;
  createdAt: string;
}

export function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    channel: row.channel,
    displayName: row.displayName,
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    assignee: row.assignee,
    customer: row.customer,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    direction: row.direction,
    text: row.text,
    attachments: Array.isArray(row.attachments) ? (row.attachments as MessageDto["attachments"]) : [],
    status: row.status,
    errorCode: row.errorCode,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
  };
}

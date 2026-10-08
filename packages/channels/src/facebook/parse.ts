import type { CommentEvent, InboundAttachment, InboundEvent } from "../types";
import { isRecord } from "../util";

function idOf(value: unknown): string | null {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 ? value.id : null;
}

function parseAttachments(value: unknown): InboundAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    type: typeof item.type === "string" ? item.type : "unknown",
    url: isRecord(item.payload) && typeof item.payload.url === "string" ? item.payload.url : null,
  }));
}

function timestampOf(value: unknown): Date {
  if (typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function parseMessaging(item: unknown): InboundEvent | null {
  if (!isRecord(item) || !isRecord(item.message)) return null;
  const message = item.message;
  const externalId = typeof message.mid === "string" && message.mid.length > 0 ? message.mid : null;
  const sender = idOf(item.sender);
  const recipient = idOf(item.recipient);
  if (!externalId || !sender || !recipient) return null;

  const text = typeof message.text === "string" && message.text.length > 0 ? message.text : null;
  const attachments = parseAttachments(message.attachments);
  if (text === null && attachments.length === 0) return null;

  const echo = message.is_echo === true;
  return {
    kind: echo ? "echo" : "message",
    channel: "FACEBOOK",
    // echo: ຜູ້ສົ່ງຄືເພຈ ຈຶ່ງ thread ຂອງລູກຄ້າຢູ່ຝັ່ງ recipient
    threadId: echo ? recipient : sender,
    externalId,
    text,
    attachments,
    timestamp: timestampOf(item.timestamp),
  };
}

/** delivery/read/postback ແລະ ອື່ນໆ ຖືກຂ້າມ (ຄືນ []) */
export function parseFacebookWebhook(payload: unknown): InboundEvent[] {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: InboundEvent[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.messaging)) continue;
    for (const item of entry.messaging) {
      const event = parseMessaging(item);
      if (event) events.push(event);
    }
  }
  return events;
}

const COMMENT_MAX_LENGTH = 1000;

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseCommentChange(change: unknown, pageId: string | null): CommentEvent | null {
  if (!isRecord(change) || change.field !== "feed" || !isRecord(change.value)) return null;
  const value = change.value;
  if (value.item !== "comment" || value.verb !== "add") return null;
  const commentId = nonEmptyString(value.comment_id);
  const postId = nonEmptyString(value.post_id);
  const authorId = idOf(value.from);
  if (!commentId || !postId || !authorId) return null;
  // ຄອມເມັ້ນຂອງ Page ເອງ (ເຊັ່ນ ຕອບລູກຄ້າ) ບໍ່ແມ່ນ CF
  if (pageId !== null && authorId === pageId) return null;
  const message = typeof value.message === "string" ? value.message.slice(0, COMMENT_MAX_LENGTH) : "";
  if (message.trim().length === 0) return null;
  const name = isRecord(value.from) ? nonEmptyString(value.from.name) : null;
  // created_time ຂອງ feed ເປັນວິນາທີ (ຕ່າງຈາກ messaging ທີ່ເປັນ ms)
  const seconds = typeof value.created_time === "number" ? value.created_time : null;
  const timestamp = seconds !== null && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  return {
    channel: "FACEBOOK",
    postId,
    commentId,
    authorId,
    authorName: name ?? `Facebook ${authorId.slice(-4)}`,
    message,
    parentId: nonEmptyString(value.parent_id),
    timestamp,
  };
}

/** ຄອມເມັ້ນໃໝ່ (verb=add) ຈາກ webhook field `feed`; ປະເພດອື່ນ/ຜິດຮູບແບບ = ຂ້າມ (ບໍ່ throw) */
export function parseFacebookComments(payload: unknown): CommentEvent[] {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: CommentEvent[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    const pageId = nonEmptyString(entry.id);
    for (const change of entry.changes) {
      const event = parseCommentChange(change, pageId);
      if (event) events.push(event);
    }
  }
  return events;
}

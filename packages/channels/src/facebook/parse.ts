import type { InboundAttachment, InboundEvent } from "../types";
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
    timestamp: typeof item.timestamp === "number" ? new Date(item.timestamp) : new Date(),
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

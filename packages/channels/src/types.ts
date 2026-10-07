import type { MessageSendError } from "@oca/shared";

export type ChannelId = "FACEBOOK";

export type InboundAttachment = { type: string; url: string | null };

/** ເຫດການມາດຕະຖານທີ່ທຸກ channel ແປງມາ. `echo` = ຂໍ້ຄວາມທີ່ຮ້ານສົ່ງອອກ (ຈາກແອັບຂອງ channel ຫຼື ຈາກ API ຂອງເຮົາເອງ). */
export interface InboundEvent {
  kind: "message" | "echo";
  channel: ChannelId;
  /** ລະຫັດຂອງລູກຄ້າໃນ channel (PSID ຂອງ Messenger) */
  threadId: string;
  /** ລະຫັດຂໍ້ຄວາມຂອງ channel (mid) ໃຊ້ກັນຊ້ຳ */
  externalId: string;
  text: string | null;
  attachments: InboundAttachment[];
  timestamp: Date;
}

/** ຄອມເມັ້ນໃໝ່ໃນໂພສ/Live (webhook field `feed`) */
export interface CommentEvent {
  channel: ChannelId;
  /** post_id ທີ່ Meta ສົ່ງ (ໃຊ້ຈັບຄູ່ກັບ LiveSession.externalPostId) */
  postId: string;
  commentId: string;
  /** ລະຫັດຜູ້ຄອມເມັ້ນ (ອາດບໍ່ຕົງກັບ PSID ຂອງ Messenger) */
  authorId: string;
  authorName: string;
  message: string;
  timestamp: Date;
}

export type SendResult =
  | { ok: true; externalId: string }
  | { ok: false; code: MessageSendError; detail: string };

export interface ChannelProfile {
  name: string;
}

export interface ChannelAdapter {
  readonly channel: ChannelId;
  /** ກວດລາຍເຊັນຂອງ webhook ຈາກ raw body (ບໍ່ throw) */
  verifySignature(rawBody: Buffer, header: string | undefined): boolean;
  /** ແປງ payload ເປັນເຫດການ; payload ຜິດຮູບແບບ/ປະເພດທີ່ບໍ່ຮູ້ = [] (ບໍ່ throw) */
  parseWebhook(payload: unknown): InboundEvent[];
  /** ບໍ່ throw: ຄວາມລົ້ມເຫຼວທັງໝົດຄືນເປັນ `{ ok: false }` */
  sendText(threadId: string, text: string): Promise<SendResult>;
  /** ບໍ່ throw: ດຶງບໍ່ໄດ້ = null */
  fetchProfile(threadId: string): Promise<ChannelProfile | null>;
}

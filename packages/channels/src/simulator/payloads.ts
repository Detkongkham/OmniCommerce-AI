/** ຕົວສ້າງ webhook payload ແບບ Messenger (ໃຊ້ໃນ simulator ແລະ test; ຮູບແບບຕາມເອກະສານ Meta). */

export interface MessagePayloadInput {
  pageId: string;
  psid: string;
  mid: string;
  text?: string;
  attachments?: { type: string; url: string }[];
  timestamp?: number;
}

const wrap = (pageId: string, timestamp: number, messaging: object) => ({
  object: "page",
  entry: [{ id: pageId, time: timestamp, messaging: [messaging] }],
});

export function messagePayload(input: MessagePayloadInput): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.psid },
    recipient: { id: input.pageId },
    timestamp,
    message: {
      mid: input.mid,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.attachments
        ? { attachments: input.attachments.map((item) => ({ type: item.type, payload: { url: item.url } })) }
        : {}),
    },
  });
}

export function echoPayload(input: { pageId: string; psid: string; mid: string; text: string; timestamp?: number }): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.pageId },
    recipient: { id: input.psid },
    timestamp,
    message: { mid: input.mid, is_echo: true, app_id: 1, text: input.text },
  });
}

export function deliveryPayload(input: { pageId: string; psid: string; mids: string[]; timestamp?: number }): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.psid },
    recipient: { id: input.pageId },
    timestamp,
    delivery: { mids: input.mids, watermark: timestamp },
  });
}

/** webhook ຄອມເມັ້ນ (field `feed`). timestamp ເປັນ ms; ໃນ payload ແປງເປັນວິນາທີຄືກັບ Meta */
export function commentPayload(input: {
  pageId: string;
  postId: string;
  commentId: string;
  fromId: string;
  fromName: string;
  message: string;
  verb?: "add" | "edited" | "remove";
  timestamp?: number;
}): object {
  const seconds = Math.floor((input.timestamp ?? Date.now()) / 1000);
  return {
    object: "page",
    entry: [
      {
        id: input.pageId,
        time: seconds,
        changes: [
          {
            field: "feed",
            value: {
              from: { id: input.fromId, name: input.fromName },
              item: "comment",
              comment_id: input.commentId,
              post_id: input.postId,
              parent_id: input.postId,
              verb: input.verb ?? "add",
              message: input.message,
              created_time: seconds,
            },
          },
        ],
      },
    ],
  };
}

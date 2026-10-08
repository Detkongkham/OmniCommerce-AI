import type { CfCommentDto, LiveItemDto, LiveSessionDetailDto, LiveSessionDto } from "@/lib/types";

/** ຂໍ້ມູນຕົວຢ່າງຂອງ test ໃນ components/live */
export const ITEM: LiveItemDto = {
  id: "i1",
  code: "A1",
  variantId: "v1",
  sku: "SHIRT-BLK-M",
  productName: "Shirt",
  variantName: "Black / M",
  limit: 10,
  claimed: 0,
};

export const SESSION_ROW: LiveSessionDto = {
  id: "s1",
  title: "Friday live",
  kind: "LIVE",
  status: "DRAFT",
  externalPostId: "111_222",
  publicReplyEnabled: true,
  featuredItemId: null,
  startedAt: null,
  endedAt: null,
  createdAt: "2026-10-08T03:00:00.000Z",
  itemCount: 1,
  commentCount: 0,
};

export const SESSION: LiveSessionDetailDto = { ...SESSION_ROW, items: [ITEM] };

export const COMMENT: CfCommentDto = {
  id: "c1",
  externalCommentId: "111_222_c1",
  authorExternalId: "U1",
  authorName: "Noy",
  message: "A1 x2",
  outcome: "ORDERED",
  lines: [{ itemId: "i1", code: "A1", quantity: 2 }],
  orderId: "o1",
  orderNumber: "OCA-0001",
  replyStatus: "SENT",
  replyErrorCode: null,
  createdAt: "2026-10-08T03:05:00.000Z",
};

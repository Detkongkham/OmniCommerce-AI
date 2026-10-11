import type { Prisma } from "@oca/database";
import type { CfOutcome, CfReplyStatus, LiveSessionKind, LiveSessionStatus } from "@oca/shared";

export const SESSION_INCLUDE = {
  _count: { select: { items: true, comments: true } },
} as const satisfies Prisma.LiveSessionInclude;

export const SESSION_DETAIL_INCLUDE = {
  ...SESSION_INCLUDE,
  items: {
    orderBy: { createdAt: "asc" },
    include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
  },
} as const satisfies Prisma.LiveSessionInclude;

export const ITEM_INCLUDE = {
  variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
} as const satisfies Prisma.LiveSessionItemInclude;

export interface CfLedgerLine {
  itemId: string;
  code: string;
  quantity: number;
}

/** ອ່ານ lines (Json) ແບບປ້ອງກັນ: ຕັດລາຍການທີ່ຮູບແບບບໍ່ຖືກອອກ */
export function ledgerLines(value: unknown): CfLedgerLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { itemId, code, quantity } = entry as Record<string, unknown>;
    return typeof itemId === "string" && typeof code === "string" && typeof quantity === "number"
      ? [{ itemId, code, quantity }]
      : [];
  });
}

export const COMMENT_INCLUDE = {
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.CfCommentInclude;

type SessionRow = Prisma.LiveSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;
type SessionDetailRow = Prisma.LiveSessionGetPayload<{ include: typeof SESSION_DETAIL_INCLUDE }>;
type ItemRow = Prisma.LiveSessionItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
export type CommentRow = Prisma.CfCommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export interface LiveItemDto {
  id: string;
  code: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  limit: number | null;
  claimed: number;
}

export interface LiveSessionDto {
  id: string;
  title: string;
  kind: LiveSessionKind;
  status: LiveSessionStatus;
  externalPostId: string | null;
  publicReplyEnabled: boolean;
  /** ສິນຄ້າທີ່ກຳລັງນຳສະເໜີເທິງ Host screen */
  featuredItemId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  itemCount: number;
  commentCount: number;
}

export interface LiveSessionDetailDto extends LiveSessionDto {
  items: LiveItemDto[];
}

export interface CfCommentDto {
  id: string;
  externalCommentId: string;
  authorExternalId: string;
  authorName: string;
  message: string;
  outcome: CfOutcome;
  lines: CfLedgerLine[] | null;
  orderId: string | null;
  orderNumber: string | null;
  replyStatus: CfReplyStatus;
  replyErrorCode: string | null;
  createdAt: Date;
}

export function toItemDto(row: ItemRow): LiveItemDto {
  return {
    id: row.id,
    code: row.code,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    variantName: row.variant.name,
    limit: row.limit,
    claimed: row.claimed,
  };
}

export function toSessionDto(row: SessionRow): LiveSessionDto {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    externalPostId: row.externalPostId,
    publicReplyEnabled: row.publicReplyEnabled,
    featuredItemId: row.featuredItemId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    commentCount: row._count.comments,
  };
}

export function toSessionDetailDto(row: SessionDetailRow): LiveSessionDetailDto {
  return { ...toSessionDto(row), items: row.items.map(toItemDto) };
}

export function toCommentDto(row: CommentRow): CfCommentDto {
  return {
    id: row.id,
    externalCommentId: row.externalCommentId,
    authorExternalId: row.authorExternalId,
    authorName: row.authorName,
    message: row.message,
    outcome: row.outcome,
    lines: row.lines === null ? null : ledgerLines(row.lines),
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    replyStatus: row.replyStatus,
    replyErrorCode: row.replyErrorCode,
    createdAt: row.createdAt,
  };
}

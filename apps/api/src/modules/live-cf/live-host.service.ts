import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import type { CfOutcome, LiveSessionKind, LiveSessionStatus, OrderStatus } from "@oca/shared";
import { apiError } from "../../common/api-error";
import { money } from "../../common/money";
import { PRISMA } from "../../prisma/prisma.module";
import { type CfLedgerLine, ledgerLines } from "./live-cf.mapper";

/** ຍັງຂາຍໄດ້ ≤ ຄ່ານີ້ = "ໃກ້ໝົດ" */
export const LOW_STOCK_THRESHOLD = 3;
export const HOST_RECENT_LIMIT = 20;

const RESERVED_STATUSES: OrderStatus[] = ["PENDING_PAYMENT"];
const PAID_STATUSES: OrderStatus[] = ["PAID", "PACKING", "SHIPPED", "COMPLETED"];

export type HostItemLevel = "OK" | "LOW" | "SOLD_OUT";

export interface HostItemDto {
  id: string;
  code: string;
  productName: string;
  variantName: string | null;
  sku: string;
  price: string;
  imageUrl: string | null;
  limit: number | null;
  claimed: number;
  /** onHand − reserved ໃນສາງຫຼັກ (ສາງທີ່ບິນ CF ຈອງ); null = ບໍ່ມີສາງຫຼັກ */
  stockAvailable: number | null;
  /** min(limit − claimed, stockAvailable); null = ບໍ່ຈຳກັດທັງສອງ */
  remaining: number | null;
  level: HostItemLevel;
}

export interface HostSnapshotDto {
  session: {
    id: string;
    title: string;
    kind: LiveSessionKind;
    status: LiveSessionStatus;
    startedAt: Date | null;
    endedAt: Date | null;
    featuredItemId: string | null;
  };
  items: HostItemDto[];
  totals: {
    buyers: number;
    orders: number;
    reservedAmount: string;
    paidAmount: string;
    unitsClaimed: number;
    comments: number;
  };
  recent: {
    id: string;
    authorName: string;
    message: string;
    outcome: CfOutcome;
    lines: Pick<CfLedgerLine, "code" | "quantity">[];
    createdAt: Date;
  }[];
}

export function levelOf(remaining: number | null): HostItemLevel {
  if (remaining === null) return "OK";
  if (remaining <= 0) return "SOLD_OUT";
  return remaining <= LOW_STOCK_THRESHOLD ? "LOW" : "OK";
}

/** ຂໍ້ມູນຂອງ Host screen ໃນ request ດຽວ (query ເບົາ: aggregate + ຈຳກັດ recent) */
@Injectable()
export class LiveHostService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async snapshot(id: string): Promise<HostSnapshotDto> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            variant: {
              select: {
                sku: true,
                name: true,
                price: true,
                images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
                product: {
                  select: {
                    name: true,
                    // ຮູບລວມຂອງສິນຄ້າ (ບໍ່ແມ່ນຂອງ variant ອື່ນ)
                    images: { where: { variantId: null }, orderBy: { position: "asc" }, take: 1, select: { url: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");

    const variantIds = session.items.map((item) => item.variantId);
    const [warehouse, buyersRows, orderGroups, comments, recent] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "authorExternalId") AS count FROM "CfComment"
        WHERE "sessionId" = ${id} AND "outcome" = 'ORDERED'`,
      this.prisma.order.groupBy({ by: ["status"], where: { liveSessionId: id }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.cfComment.count({ where: { sessionId: id } }),
      this.prisma.cfComment.findMany({
        where: { sessionId: id, outcome: { not: "NO_MATCH" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HOST_RECENT_LIMIT,
        select: { id: true, authorName: true, message: true, outcome: true, lines: true, createdAt: true },
      }),
    ]);
    const levels = warehouse
      ? await this.prisma.stockLevel.findMany({
          where: { warehouseId: warehouse.id, variantId: { in: variantIds } },
          select: { variantId: true, onHand: true, reserved: true },
        })
      : [];
    const availableByVariant = new Map(levels.map((level) => [level.variantId, level.onHand - level.reserved]));

    const items = session.items.map((item): HostItemDto => {
      const stockAvailable = warehouse ? (availableByVariant.get(item.variantId) ?? 0) : null;
      const candidates = [item.limit === null ? null : item.limit - item.claimed, stockAvailable].filter(
        (value): value is number => value !== null,
      );
      const remaining = candidates.length === 0 ? null : Math.max(0, Math.min(...candidates));
      return {
        id: item.id,
        code: item.code,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        price: money(item.variant.price),
        imageUrl: item.variant.images[0]?.url ?? item.variant.product.images[0]?.url ?? null,
        limit: item.limit,
        claimed: item.claimed,
        stockAvailable,
        remaining,
        level: levelOf(remaining),
      };
    });

    const sumOf = (statuses: OrderStatus[]) =>
      orderGroups
        .filter((group) => statuses.includes(group.status))
        .reduce((sum, group) => sum.add(group._sum.total ?? 0), new Prisma.Decimal(0));
    const orders = orderGroups
      .filter((group) => group.status !== "CANCELLED" && group.status !== "EXPIRED")
      .reduce((sum, group) => sum + group._count._all, 0);

    return {
      session: {
        id: session.id,
        title: session.title,
        kind: session.kind,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        featuredItemId: session.featuredItemId,
      },
      items,
      totals: {
        buyers: Number(buyersRows[0]?.count ?? 0),
        orders,
        reservedAmount: money(sumOf(RESERVED_STATUSES)),
        paidAmount: money(sumOf(PAID_STATUSES)),
        unitsClaimed: session.items.reduce((sum, item) => sum + item.claimed, 0),
        comments,
      },
      recent: recent.map((row) => ({
        id: row.id,
        authorName: row.authorName,
        message: row.message,
        outcome: row.outcome,
        lines: ledgerLines(row.lines).map(({ code, quantity }) => ({ code, quantity })),
        createdAt: row.createdAt,
      })),
    };
  }
}

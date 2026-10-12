import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import { type CrmCustomerListQuery, type CrmPageQuery, RFM_SEGMENTS, type RfmSegment } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import { money } from "../../common/money";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { customerStatsCte } from "./customer-stats.sql";

export interface CrmCustomerListItemDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  /** ບິນທີ່ນັບ (PAID..COMPLETED) */
  orderCount: number;
  totalSpent: string;
  lastPaidAt: Date | null;
  /** null = ຍັງບໍ່ເຄີຍຊື້ */
  segment: RfmSegment | null;
}

export interface CrmSegmentSummaryDto {
  total: number;
  noOrders: number;
  segments: Record<RfmSegment, number>;
}

export interface CrmCustomerDetailDto extends CrmCustomerListItemDto {
  note: string | null;
  /** ຜູກກັບບັນຊີ Facebook (ລູກຄ້າຈາກ CF) */
  facebookLinked: boolean;
  averageOrder: string;
  firstPaidAt: Date | null;
  /** ບິນ PENDING_PAYMENT */
  openOrderCount: number;
  conversationCount: number;
  /** ຄະແນນ 1–5; null = ຍັງບໍ່ເຄີຍຊື້ */
  rfm: { recency: number; frequency: number; monetary: number } | null;
}

export interface CrmCustomerOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  total: string;
  createdAt: Date;
}

export interface CrmCustomerConversationDto {
  id: string;
  channel: string;
  displayName: string;
  status: string;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
}

interface StatsRow {
  orderCount: number;
  totalSpent: Prisma.Decimal;
  firstPaidAt: Date;
  lastPaidAt: Date;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
}

interface ListRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  orderCount: number | null;
  totalSpent: Prisma.Decimal | null;
  lastPaidAt: Date | null;
  segment: RfmSegment | null;
}

const ZERO = new Prisma.Decimal(0);

const ORDER_BY: Record<CrmCustomerListQuery["sort"], Prisma.Sql> = {
  lastOrder: Prisma.sql`r."lastPaidAt" DESC NULLS LAST, c."createdAt" DESC, c.id`,
  spent: Prisma.sql`COALESCE(r."totalSpent", 0) DESC, c."createdAt" DESC, c.id`,
  created: Prisma.sql`c."createdAt" DESC, c.id`,
};

function toListItem(row: ListRow): CrmCustomerListItemDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.createdAt,
    orderCount: row.orderCount ?? 0,
    totalSpent: money(row.totalSpent ?? ZERO),
    lastPaidAt: row.lastPaidAt,
    segment: row.segment,
  };
}

/** Customer 360 (ໂມດູນ 11). ຄົ້ນລູກຄ້າສຳລັບຟອມເປີດບິນ ຍັງຢູ່ GET /customers ຂອງໂມດູນ orders */
@Injectable()
export class CrmCustomersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: CrmCustomerListQuery): Promise<Page<CrmCustomerListItemDto>> {
    const conditions: Prisma.Sql[] = [];
    if (query.q) {
      // position() ແທນ LIKE: ຄຳຄົ້ນບໍ່ຖືກຕີຄວາມເປັນ wildcard
      conditions.push(Prisma.sql`(position(lower(${query.q}) in lower(c."name")) > 0 OR position(${query.q} in COALESCE(c."phone", '')) > 0)`);
    }
    if (query.segment) conditions.push(Prisma.sql`r.segment = ${query.segment}`);
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const cte = customerStatsCte(new Date());
    const { skip, take } = pageArgs(query.page, query.pageSize);

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        ${cte}
        SELECT c.id, c."name", c."phone", c."email", c."createdAt",
               r."orderCount", r."totalSpent", r."lastPaidAt", r.segment
        FROM "Customer" c LEFT JOIN rfm r ON r.id = c.id
        ${where}
        ORDER BY ${ORDER_BY[query.sort]}
        LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        ${cte}
        SELECT COUNT(*)::int AS total FROM "Customer" c LEFT JOIN rfm r ON r.id = c.id ${where}`),
    ]);
    return toPage(rows.map(toListItem), counted[0]?.total ?? 0, query.page, query.pageSize);
  }

  async segments(): Promise<CrmSegmentSummaryDto> {
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<{ segment: RfmSegment; count: number }[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT segment, COUNT(*)::int AS count FROM rfm GROUP BY segment`),
      this.prisma.customer.count(),
    ]);
    const segments = Object.fromEntries(RFM_SEGMENTS.map((segment) => [segment, 0])) as Record<RfmSegment, number>;
    for (const row of rows) segments[row.segment] = row.count;
    const withOrders = rows.reduce((sum, row) => sum + row.count, 0);
    return { total, noOrders: total - withOrders, segments };
  }

  async get(id: string): Promise<CrmCustomerDetailDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    const [stats, openOrderCount, conversationCount] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT "orderCount", "totalSpent", "firstPaidAt", "lastPaidAt", r, f, m, segment FROM rfm WHERE id = ${id}`),
      this.prisma.order.count({ where: { customerId: id, status: "PENDING_PAYMENT" } }),
      this.prisma.conversation.count({ where: { customerId: id } }),
    ]);
    const row = stats[0];
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.createdAt,
      note: customer.note,
      facebookLinked: customer.facebookUserId !== null,
      orderCount: row?.orderCount ?? 0,
      totalSpent: money(row?.totalSpent ?? ZERO),
      averageOrder: money(row ? row.totalSpent.div(row.orderCount) : ZERO),
      firstPaidAt: row?.firstPaidAt ?? null,
      lastPaidAt: row?.lastPaidAt ?? null,
      openOrderCount,
      conversationCount,
      segment: row?.segment ?? null,
      rfm: row ? { recency: row.r, frequency: row.f, monetary: row.m } : null,
    };
  }

  async orders(id: string, query: CrmPageQuery): Promise<Page<CrmCustomerOrderDto>> {
    await this.requireCustomer(id);
    const where = { customerId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: { id: true, orderNumber: true, status: true, channel: true, total: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({ ...row, total: money(row.total) })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async conversations(id: string): Promise<CrmCustomerConversationDto[]> {
    await this.requireCustomer(id);
    return this.prisma.conversation.findMany({
      where: { customerId: id },
      select: { id: true, channel: true, displayName: true, status: true, lastMessageAt: true, lastMessagePreview: true },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 50,
    });
  }

  private async requireCustomer(id: string): Promise<void> {
    const found = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
  }
}

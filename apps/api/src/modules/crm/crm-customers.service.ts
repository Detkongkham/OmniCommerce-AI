import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { type Customer, Prisma, type PrismaClient, adjustPoints, customerSpend12m, loadLoyaltyConfig, recomputeTier } from "@oca/database";
import {
  type AdjustPointsInput,
  type CrmCustomerListQuery,
  type CrmPageQuery,
  MEMBER_TIERS,
  type MemberTier,
  type MergeCustomerInput,
  type NextTierInfo,
  RFM_SEGMENTS,
  type RfmSegment,
  type UpdateCustomerInput,
  nextTierAfter,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { money } from "../../common/money";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { pointsRejection } from "../../common/points-error";
import { isUniqueViolation } from "../../common/prisma-errors";
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
  tier: MemberTier;
  pointsBalance: number;
}

export interface CrmSegmentSummaryDto {
  total: number;
  noOrders: number;
  segments: Record<RfmSegment, number>;
  tiers: Record<MemberTier, number>;
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
  /** ຍອດຊື້ 12 ເດືອນຫຼ້າສຸດ (ຕົວກຳນົດລະດັບ) */
  spend12m: string;
  /** ລະດັບຖັດຈາກ `tier` (ທີ່ບັນທຶກ), ເກນ ແລະ ຍອດທີ່ຕ້ອງຊື້ຕື່ມ (ບໍ່ຕິດລົບ); null = ລະດັບສູງສຸດແລ້ວ */
  nextTier: NextTierInfo | null;
  /** ຕັ້ງ PIN ເວັບແລ້ວ (ບໍ່ສົ່ງ hash) */
  hasPin: boolean;
  /** ລັອກການເຂົ້າລະບົບເວັບຮອດ; null = ບໍ່ລັອກ ຫຼື ລັອກໝົດອາຍຸແລ້ວ */
  pinLockedUntil: Date | null;
}

export interface CrmPointEntryDto {
  id: string;
  type: string;
  /** ມີເຄື່ອງໝາຍ: ບວກ = ໄດ້, ລົບ = ໃຊ້ */
  points: number;
  balanceAfter: number;
  note: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: Date;
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
  tier: MemberTier;
  pointsBalance: number;
}

const ZERO = new Prisma.Decimal(0);

const ORDER_BY: Record<CrmCustomerListQuery["sort"], Prisma.Sql> = {
  lastOrder: Prisma.sql`r."lastPaidAt" DESC NULLS LAST, c."createdAt" DESC, c.id`,
  spent: Prisma.sql`COALESCE(r."totalSpent", 0) DESC, c."createdAt" DESC, c.id`,
  points: Prisma.sql`c."pointsBalance" DESC, c."createdAt" DESC, c.id`,
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
    tier: row.tier,
    pointsBalance: row.pointsBalance,
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
    if (query.tier) conditions.push(Prisma.sql`c."tier" = ${query.tier}::"MemberTier"`);
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const cte = customerStatsCte(new Date());
    const { skip, take } = pageArgs(query.page, query.pageSize);

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        ${cte}
        SELECT c.id, c."name", c."phone", c."email", c."createdAt", c."tier"::text AS "tier", c."pointsBalance",
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
    const [rows, total, tierRows] = await Promise.all([
      this.prisma.$queryRaw<{ segment: RfmSegment; count: number }[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT segment, COUNT(*)::int AS count FROM rfm GROUP BY segment`),
      this.prisma.customer.count(),
      this.prisma.customer.groupBy({ by: ["tier"], _count: { _all: true } }),
    ]);
    const tiers = Object.fromEntries(MEMBER_TIERS.map((tier) => [tier, 0])) as Record<MemberTier, number>;
    for (const row of tierRows) tiers[row.tier] = row._count._all;
    const segments = Object.fromEntries(RFM_SEGMENTS.map((segment) => [segment, 0])) as Record<RfmSegment, number>;
    for (const row of rows) segments[row.segment] = row.count;
    const withOrders = rows.reduce((sum, row) => sum + row.count, 0);
    return { total, noOrders: total - withOrders, segments, tiers };
  }

  async get(id: string): Promise<CrmCustomerDetailDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    const [stats, openOrderCount, conversationCount, spend12m, loyalty] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT "orderCount", "totalSpent", "firstPaidAt", "lastPaidAt", r, f, m, segment FROM rfm WHERE id = ${id}`),
      this.prisma.order.count({ where: { customerId: id, status: "PENDING_PAYMENT" } }),
      this.prisma.conversation.count({ where: { customerId: id } }),
      customerSpend12m(this.prisma, id),
      loadLoyaltyConfig(this.prisma),
    ]);
    const row = stats[0];
    const now = new Date();
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
      tier: customer.tier,
      pointsBalance: customer.pointsBalance,
      spend12m,
      nextTier: nextTierAfter(loyalty.tierRules, customer.tier, spend12m),
      hasPin: customer.pinHash !== null,
      pinLockedUntil: customer.pinLockedUntil && customer.pinLockedUntil > now ? customer.pinLockedUntil : null,
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

  async points(id: string, query: CrmPageQuery): Promise<Page<CrmPointEntryDto>> {
    await this.requireCustomer(id);
    const where = { customerId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pointEntry.findMany({
        where,
        include: { order: { select: { orderNumber: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.pointEntry.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        points: row.points,
        balanceAfter: row.balanceAfter,
        note: row.note,
        orderId: row.orderId,
        orderNumber: row.order?.orderNumber ?? null,
        createdAt: row.createdAt,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async adjustPoints(id: string, input: AdjustPointsInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    let balance: number | null;
    try {
      balance = await this.prisma.$transaction((tx) => adjustPoints(tx, { customerId: id, points: input.points, note: input.note, actorId: actor.id }));
    } catch (error) {
      throw pointsRejection(error);
    }
    if (balance === null) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    await this.audit.record({
      userId: actor.id,
      action: "customer.points.adjust",
      entity: "Customer",
      entityId: id,
      after: { points: input.points, balance, note: input.note },
      ip,
    });
    return this.get(id);
  }

  /** ລ້າງ PIN ເວັບ + ລັອກ ແລະ ເພີ່ມ pinVersion: session ສະມາຊິກທີ່ອອກໄປແລ້ວ (claim pv) ໃຊ້ບໍ່ໄດ້ທັນທີ */
  async resetPin(id: string, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    const existing = await this.prisma.customer.findUnique({ where: { id }, select: { pinHash: true } });
    if (!existing) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    // updateMany: ລູກຄ້າຖືກລຶບ (ລວມ) ລະຫວ່າງອ່ານ ແລະ ບັນທຶກ = 404 ບໍ່ແມ່ນ 500
    const updated = await this.prisma.customer.updateMany({
      where: { id },
      data: { pinHash: null, pinFailedCount: 0, pinLockedUntil: null, pinVersion: { increment: 1 } },
    });
    if (updated.count === 0) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    await this.audit.record({
      userId: actor.id,
      action: "customer.pin.reset",
      entity: "Customer",
      entityId: id,
      before: { hasPin: existing.pinHash !== null },
      after: { hasPin: false },
      ip,
    });
    return this.get(id);
  }

  private async requireCustomer(id: string): Promise<void> {
    const found = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
  }

  async update(id: string, input: UpdateCustomerInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    if (input.phone) {
      const owner = await this.prisma.customer.findUnique({ where: { phone: input.phone }, select: { id: true } });
      if (owner && owner.id !== id) throw phoneTaken(owner.id);
    }
    // PIN ເວັບເປັນຂອງເບີ: ປ່ຽນ/ລ້າງເບີ = ລ້າງ PIN + ເພີ່ມ pinVersion ໃນການບັນທຶກດຽວກັນ (session ເກົ່າຕາຍ).
    // ລ້າງທຸກຄັ້ງທີ່ເບີປ່ຽນ ບໍ່ຂຶ້ນກັບ pinHash ທີ່ອ່ານມາ: PIN ທີ່ຖືກຕັ້ງລະຫວ່າງອ່ານ ແລະ ບັນທຶກ ກໍ່ບໍ່ລອດ
    const phoneChanged = input.phone !== undefined && input.phone !== existing.phone;
    let row: Customer;
    try {
      row = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(phoneChanged ? { pinHash: null, pinFailedCount: 0, pinLockedUntil: null, pinVersion: { increment: 1 } } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
    } catch (error) {
      // ແຂ່ງກັບຄຳຂໍອື່ນທີ່ເອົາເບີດຽວກັນ ລະຫວ່າງກວດ ແລະ ບັນທຶກ
      if (isUniqueViolation(error)) throw phoneTaken(undefined);
      throw error;
    }
    const pinCleared = phoneChanged && existing.pinHash !== null;
    await this.audit.record({
      userId: actor.id,
      action: "customer.update",
      entity: "Customer",
      entityId: id,
      before: auditOf(existing),
      after: { ...auditOf(row), ...(pinCleared ? { pinCleared: true } : {}) },
      ip,
    });
    return this.get(id);
  }

  /** ລວມ source ເຂົ້າ target: ຍ້າຍບິນ + ແຊັດ + ແຕ້ມ, ເຕີມຊ່ອງທີ່ target ຍັງຫວ່າງ, ລຶບ source (spec 3d §2) */
  async merge(targetId: string, input: MergeCustomerInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    if (input.sourceId === targetId) throw new BadRequestException("Cannot merge a customer into itself");
    const result = await this.prisma.$transaction(async (tx) => {
      // ລັອກທັງສອງແຖວຕາມລຳດັບ id: ການລວມສອງທິດທາງພ້ອມກັນບໍ່ deadlock
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id IN (${targetId}, ${input.sourceId}) ORDER BY id FOR UPDATE`;
      const target = await tx.customer.findUnique({ where: { id: targetId } });
      const source = await tx.customer.findUnique({ where: { id: input.sourceId } });
      if (!target || !source) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");

      const orders = await tx.order.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      const conversations = await tx.conversation.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      await tx.pointEntry.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      // ລຶບ source ກ່ອນ ເພື່ອປ່ອຍ unique (phone, facebookUserId) ໃຫ້ target ຮັບໄດ້. session ສະມາຊິກຂອງ source ຕາຍໄປພ້ອມແຖວ
      await tx.customer.delete({ where: { id: source.id } });
      // PIN ເວັບເປັນຂອງເບີ: PIN ທີ່ເຫຼືອຕ້ອງຖືກຕັ້ງພາຍໃຕ້ເບີທີ່ເຫຼືອ. target ຮັກສາ PIN ຂອງຕົນສະເພາະເມື່ອມີເບີ (ເບີບໍ່ປ່ຽນ);
      // ຮັບ PIN ຂອງ source ສະເພາະເມື່ອ target ບໍ່ມີ PIN ແລະ ບໍ່ມີເບີ (ຮັບເບີຂອງ source ໄປພ້ອມກັນ).
      // target ທີ່ມີ PIN ແຕ່ບໍ່ມີເບີ ເສຍ PIN (ລ້າງ + ເພີ່ມ pinVersion). ນອກນັ້ນ PIN ຂອງ source ຖືກຖິ້ມ
      const adoptPin = target.pinHash === null && source.pinHash !== null && target.phone === null && source.phone !== null;
      const dropTargetPin = target.pinHash !== null && target.phone === null;
      const pinData = adoptPin
        ? { pinHash: source.pinHash, pinFailedCount: 0, pinLockedUntil: null, pinVersion: { increment: 1 } }
        : dropTargetPin
          ? { pinHash: null, pinFailedCount: 0, pinLockedUntil: null, pinVersion: { increment: 1 } }
          : {};
      await tx.customer.update({
        where: { id: target.id },
        data: {
          ...pinData,
          phone: target.phone ?? source.phone,
          email: target.email ?? source.email,
          facebookUserId: target.facebookUserId ?? source.facebookUserId,
          note: target.note ?? source.note,
          pointsBalance: target.pointsBalance + source.pointsBalance,
        },
      });
      // ບິນທີ່ຍ້າຍມາປ່ຽນຍອດຊື້ 12 ເດືອນຂອງ target
      await recomputeTier(tx, target.id, await loadLoyaltyConfig(tx));
      return { source, adoptPin, dropTargetPin, movedOrders: orders.count, movedConversations: conversations.count };
    });
    await this.audit.record({
      userId: actor.id,
      action: "customer.merge",
      entity: "Customer",
      entityId: targetId,
      before: { source: { id: result.source.id, ...auditOf(result.source), facebookUserId: result.source.facebookUserId, hasPin: result.source.pinHash !== null } },
      after: {
        movedOrders: result.movedOrders,
        movedConversations: result.movedConversations,
        movedPoints: result.source.pointsBalance,
        adoptedPin: result.adoptPin,
        ...(result.dropTargetPin ? { pinCleared: true } : {}),
      },
      ip,
    });
    return this.get(targetId);
  }
}

function phoneTaken(customerId: string | undefined) {
  return apiError("CUSTOMER_PHONE_TAKEN", "Phone number belongs to another customer", customerId ? { customerId } : {});
}

function auditOf(row: Customer) {
  return { name: row.name, phone: row.phone, email: row.email, note: row.note };
}

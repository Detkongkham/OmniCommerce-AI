import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import type {
  ReportRange,
  StaffKpiDailyDto,
  StaffKpiFigures,
  StaffKpiRowDto,
  StaffKpiUserDto,
} from "@oca/shared";
import { apiError } from "../../common/api-error";
import { SOLD_STATUSES_SQL, dayList, storeDay } from "../../common/report-days";
import { PRISMA } from "../../prisma/prisma.module";

/** ຕົວເລກດິບຕໍ່ (ພະນັກງານ, ມື້); ເວລາຕອບເກັບເປັນຜົນລວມວິນາທີ ເພື່ອສະເລ່ຍໃໝ່ໄດ້ຖືກເມື່ອລວມຫຼາຍມື້ */
interface Bucket {
  ordersCreated: number;
  salesClosed: number;
  salesAmount: Prisma.Decimal;
  ordersPacked: number;
  ordersShipped: number;
  ordersCancelled: number;
  stockAdjustments: number;
  messagesSent: number;
  responses: number;
  responseSeconds: number;
}

const emptyBucket = (): Bucket => ({
  ordersCreated: 0,
  salesClosed: 0,
  salesAmount: new Prisma.Decimal(0),
  ordersPacked: 0,
  ordersShipped: 0,
  ordersCancelled: 0,
  stockAdjustments: 0,
  messagesSent: 0,
  responses: 0,
  responseSeconds: 0,
});

function addInto(target: Bucket, source: Bucket): void {
  target.ordersCreated += source.ordersCreated;
  target.salesClosed += source.salesClosed;
  target.salesAmount = target.salesAmount.plus(source.salesAmount);
  target.ordersPacked += source.ordersPacked;
  target.ordersShipped += source.ordersShipped;
  target.ordersCancelled += source.ordersCancelled;
  target.stockAdjustments += source.stockAdjustments;
  target.messagesSent += source.messagesSent;
  target.responses += source.responses;
  target.responseSeconds += source.responseSeconds;
}

function toFigures(bucket: Bucket): StaffKpiFigures {
  return {
    ordersCreated: bucket.ordersCreated,
    salesClosed: bucket.salesClosed,
    salesAmount: bucket.salesAmount.toFixed(2),
    ordersPacked: bucket.ordersPacked,
    ordersShipped: bucket.ordersShipped,
    ordersCancelled: bucket.ordersCancelled,
    stockAdjustments: bucket.stockAdjustments,
    messagesSent: bucket.messagesSent,
    responses: bucket.responses,
    avgResponseSeconds: bucket.responses > 0 ? Math.round(bucket.responseSeconds / bucket.responses) : null,
  };
}

type Key = `${string}|${string}`;

@Injectable()
export class StaffKpiService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async summary(range: ReportRange): Promise<{ from: string; to: string; rows: StaffKpiRowDto[] }> {
    const buckets = await this.collect(range);
    const perUser = new Map<string, Bucket>();
    for (const [key, bucket] of buckets) {
      const userId = key.slice(0, key.indexOf("|"));
      const total = perUser.get(userId) ?? emptyBucket();
      addInto(total, bucket);
      perUser.set(userId, total);
    }
    const users = await this.prisma.user.findMany({
      where: { OR: [{ isActive: true }, { id: { in: [...perUser.keys()] } }] },
      include: { role: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const rows = users.map((user) => ({
      user: toUser(user),
      ...toFigures(perUser.get(user.id) ?? emptyBucket()),
    }));
    // ຍອດຂາຍຫຼາຍ→ໜ້ອຍ; ເທົ່າກັນ = ລຳດັບຊື່ (stable sort)
    rows.sort((a, b) => new Prisma.Decimal(b.salesAmount).comparedTo(a.salesAmount));
    return { from: range.from, to: range.to, rows };
  }

  async daily(userId: string, range: ReportRange): Promise<StaffKpiDailyDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { select: { name: true } } },
    });
    if (!user) throw apiError("USER_NOT_FOUND", "Staff not found");
    const buckets = await this.collect(range, userId);
    return {
      user: toUser(user),
      days: dayList(range.from, range.to).map((date) => ({
        date,
        ...toFigures(buckets.get(`${userId}|${date}`) ?? emptyBucket()),
      })),
    };
  }

  /** ຕົວເລກທັງໝົດແຍກຕາມ (userId, ມື້ເວລາຮ້ານ) ໃນ [start, end) */
  private async collect(range: ReportRange, userId?: string): Promise<Map<Key, Bucket>> {
    const { start, end } = range;
    const only = (column: string) =>
      userId === undefined ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(column)} = ${userId}`;

    const [orders, audits, adjustments, messages, responses] = await Promise.all([
      this.prisma.$queryRaw<{ uid: string; day: string; created: bigint; closed: bigint; amount: Prisma.Decimal | null }[]>`
        SELECT "createdById" AS uid, ${storeDay('"createdAt"')} AS day,
               COUNT(*) AS created,
               COUNT(*) FILTER (WHERE "status" IN ${SOLD_STATUSES_SQL}) AS closed,
               SUM("total") FILTER (WHERE "status" IN ${SOLD_STATUSES_SQL}) AS amount
        FROM "Order"
        WHERE "createdById" IS NOT NULL AND "createdAt" >= ${start} AND "createdAt" < ${end} ${only('"createdById"')}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ uid: string; day: string; packed: bigint; shipped: bigint; cancelled: bigint }[]>`
        SELECT "userId" AS uid, ${storeDay('"createdAt"')} AS day,
               COUNT(*) FILTER (WHERE "action" = 'order.pack') AS packed,
               COUNT(*) FILTER (WHERE "action" = 'order.ship') AS shipped,
               COUNT(*) FILTER (WHERE "action" = 'order.cancel') AS cancelled
        FROM "AuditLog"
        WHERE "action" IN ('order.pack', 'order.ship', 'order.cancel') AND "userId" IS NOT NULL
          AND "createdAt" >= ${start} AND "createdAt" < ${end} ${only('"userId"')}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ uid: string; day: string; count: bigint }[]>`
        SELECT "actorId" AS uid, ${storeDay('"createdAt"')} AS day, COUNT(*) AS count
        FROM "StockMovement"
        WHERE "type" = 'ADJUST' AND "actorId" IS NOT NULL
          AND "createdAt" >= ${start} AND "createdAt" < ${end} ${only('"actorId"')}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ uid: string; day: string; count: bigint }[]>`
        SELECT "sentByUserId" AS uid, ${storeDay('"createdAt"')} AS day, COUNT(*) AS count
        FROM "Message"
        WHERE "direction" = 'OUT' AND "status" <> 'FAILED' AND "sentByUserId" IS NOT NULL
          AND "createdAt" >= ${start} AND "createdAt" < ${end} ${only('"sentByUserId"')}
        GROUP BY 1, 2`,
      this.responseTimes(start, end, userId),
    ]);

    const buckets = new Map<Key, Bucket>();
    const at = (uid: string, day: string): Bucket => {
      const key: Key = `${uid}|${day}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = emptyBucket();
        buckets.set(key, bucket);
      }
      return bucket;
    };
    for (const row of orders) {
      const bucket = at(row.uid, row.day);
      bucket.ordersCreated += Number(row.created);
      bucket.salesClosed += Number(row.closed);
      bucket.salesAmount = bucket.salesAmount.plus(row.amount ?? 0);
    }
    for (const row of audits) {
      const bucket = at(row.uid, row.day);
      bucket.ordersPacked += Number(row.packed);
      bucket.ordersShipped += Number(row.shipped);
      bucket.ordersCancelled += Number(row.cancelled);
    }
    for (const row of adjustments) at(row.uid, row.day).stockAdjustments += Number(row.count);
    for (const row of messages) at(row.uid, row.day).messagesSent += Number(row.count);
    for (const row of responses) {
      const bucket = at(row.uid, row.day);
      bucket.responses += Number(row.count);
      bucket.responseSeconds += Number(row.seconds);
    }
    return buckets;
  }

  /**
   * ຮອບຂອງລູກຄ້າ = ຂໍ້ຄວາມ IN ທີ່ຂໍ້ຄວາມກ່ອນໜ້າໃນເຄສບໍ່ແມ່ນ IN; ຄຳຕອບ = OUT (ບໍ່ FAILED) ອັນທຳອິດຫຼັງຈາກນັ້ນ.
   * ນັບໃຫ້ຜູ້ສົ່ງຄຳຕອບ (OUT ຂອງລະບົບທີ່ບໍ່ມີ sentByUserId ບໍ່ນັບ), ມື້ = ມື້ຂອງຂໍ້ຄວາມ IN.
   */
  private responseTimes(start: Date, end: Date, userId?: string) {
    return this.prisma.$queryRaw<{ uid: string; day: string; count: bigint; seconds: number }[]>`
      WITH convs AS (
        SELECT DISTINCT "conversationId" FROM "Message"
        WHERE "direction" = 'IN' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      ),
      ordered AS (
        SELECT m."conversationId", m."direction", m."createdAt",
               LAG(m."direction") OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt", m."id") AS prev
        FROM "Message" m JOIN convs c ON c."conversationId" = m."conversationId"
        WHERE m."status" <> 'FAILED' AND m."createdAt" < ${end}
      ),
      turns AS (
        SELECT "conversationId", "createdAt" FROM ordered
        WHERE "direction" = 'IN' AND (prev IS NULL OR prev <> 'IN')
          AND "createdAt" >= ${start} AND "createdAt" < ${end}
      )
      SELECT r."sentByUserId" AS uid, ${storeDay('t."createdAt"')} AS day, COUNT(*) AS count,
             COALESCE(SUM(EXTRACT(EPOCH FROM (r."createdAt" - t."createdAt"))), 0)::float8 AS seconds
      FROM turns t
      JOIN LATERAL (
        SELECT o."sentByUserId", o."createdAt" FROM "Message" o
        WHERE o."conversationId" = t."conversationId" AND o."direction" = 'OUT' AND o."status" <> 'FAILED'
          AND o."createdAt" >= t."createdAt"
        ORDER BY o."createdAt", o."id"
        LIMIT 1
      ) r ON TRUE
      WHERE r."sentByUserId" IS NOT NULL ${userId === undefined ? Prisma.empty : Prisma.sql`AND r."sentByUserId" = ${userId}`}
      GROUP BY 1, 2`;
  }
}

function toUser(user: { id: string; name: string; email: string; isActive: boolean; role: { name: string } }): StaffKpiUserDto {
  return { id: user.id, name: user.name, email: user.email, isActive: user.isActive, roleName: user.role.name };
}

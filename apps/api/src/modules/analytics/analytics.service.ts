import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import {
  type ChannelReportDto,
  type ChannelSalesDto,
  type DailySalesDto,
  type DeadstockItemDto,
  type DeadstockQuery,
  type OrderSource,
  ORDER_SOURCES,
  type ReportRange,
  SALES_CHANNELS,
  type SalesChannel,
  type SalesSummaryDto,
  type TopProductDto,
  type TopProductsQuery,
} from "@oca/shared";
import { money } from "../../common/money";
import { type Page, toPage } from "../../common/pagination";
import { SOLD_STATUSES_SQL, dayList, storeDay } from "../../common/report-days";
import { PRISMA } from "../../prisma/prisma.module";

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const dec = (value: Decimal | null | undefined): Decimal => value ?? ZERO;

/**
 * ບິນທີ່ນັບເປັນຍອດຂາຍໃນຊ່ວງ (spec §3): ສະຖານະ PAID..COMPLETED ແລະ paidAt ໃນ [start, end).
 * revenue = total − VAT (ລວມຄ່າສົ່ງ); cogs/units ລວມຈາກລາຍການຂອງບິນ (snapshot unitCost ນະ ເວລາສັ່ງ).
 */
function soldOrders(start: Date, end: Date): Prisma.Sql {
  return Prisma.sql`
    sold AS (
      SELECT o."id", o."orderNumber", o."status", o."channel", o."source", o."customerId", o."paidAt",
             o."subtotal", o."discountTotal", o."shippingFee", o."vatAmount", o."total",
             o."total" - o."vatAmount" AS revenue,
             COALESCE(i.cogs, 0) AS cogs, COALESCE(i.units, 0) AS units
      FROM "Order" o
      LEFT JOIN (
        SELECT "orderId", SUM("unitCost" * "quantity") AS cogs, SUM("quantity") AS units
        FROM "OrderItem" GROUP BY "orderId"
      ) i ON i."orderId" = o."id"
      WHERE o."status" IN ${SOLD_STATUSES_SQL} AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
    )`;
}

/** ກຳໄລ % ຂອງ revenue (1 ທົດສະນິຍົມ); null ຖ້າບໍ່ມີລາຍຮັບ */
function margin(profit: Decimal, revenue: Decimal): string | null {
  return revenue.isZero() ? null : profit.div(revenue).mul(100).toFixed(1);
}

export interface CsvExport {
  filename: string;
  body: string;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async summary(range: ReportRange): Promise<SalesSummaryDto> {
    const { start, end } = range;
    const [[totals], [cancelled], [pending]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          orders: bigint;
          customers: bigint;
          units: Decimal | null;
          gross: Decimal | null;
          discounts: Decimal | null;
          shipping: Decimal | null;
          vat: Decimal | null;
          revenue: Decimal | null;
          cogs: Decimal | null;
        }[]
      >`
        WITH ${soldOrders(start, end)}
        SELECT COUNT(*) AS orders, COUNT(DISTINCT "customerId") AS customers, SUM(units) AS units,
               SUM("subtotal" + "discountTotal") AS gross, SUM("discountTotal") AS discounts,
               SUM("shippingFee") AS shipping, SUM("vatAmount") AS vat, SUM(revenue) AS revenue, SUM(cogs) AS cogs
        FROM sold`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "Order"
        WHERE "status" = 'CANCELLED' AND "cancelledAt" >= ${start} AND "cancelledAt" < ${end}`,
      this.prisma.$queryRaw<{ amount: Decimal | null }[]>`
        SELECT SUM("total") AS amount FROM "Order"
        WHERE "status" = 'PENDING_PAYMENT' AND "createdAt" >= ${start} AND "createdAt" < ${end}`,
    ]);
    const orders = Number(totals?.orders ?? 0);
    const revenue = dec(totals?.revenue);
    const cogs = dec(totals?.cogs);
    const grossProfit = revenue.minus(cogs);
    return {
      from: range.from,
      to: range.to,
      orders,
      units: Number(totals?.units ?? 0),
      customers: Number(totals?.customers ?? 0),
      grossSales: money(dec(totals?.gross)),
      discounts: money(dec(totals?.discounts)),
      shippingIncome: money(dec(totals?.shipping)),
      vat: money(dec(totals?.vat)),
      revenue: money(revenue),
      avgOrderValue: money(orders > 0 ? revenue.div(orders) : ZERO),
      cogs: money(cogs),
      grossProfit: money(grossProfit),
      grossMargin: margin(grossProfit, revenue),
      cancelled: Number(cancelled?.count ?? 0),
      pendingAmount: money(dec(pending?.amount)),
    };
  }

  async daily(range: ReportRange): Promise<{ days: DailySalesDto[] }> {
    const rows = await this.prisma.$queryRaw<{ day: string; orders: bigint; revenue: Decimal; cogs: Decimal }[]>`
      WITH ${soldOrders(range.start, range.end)}
      SELECT ${storeDay('"paidAt"')} AS day, COUNT(*) AS orders, SUM(revenue) AS revenue, SUM(cogs) AS cogs
      FROM sold GROUP BY 1`;
    const byDay = new Map(rows.map((row) => [row.day, row]));
    return {
      days: dayList(range.from, range.to).map((date) => {
        const row = byDay.get(date);
        const revenue = dec(row?.revenue);
        const cogs = dec(row?.cogs);
        return {
          date,
          orders: Number(row?.orders ?? 0),
          revenue: money(revenue),
          cogs: money(cogs),
          grossProfit: money(revenue.minus(cogs)),
        };
      }),
    };
  }

  async channels(range: ReportRange): Promise<ChannelReportDto> {
    const [channels, sources] = await Promise.all([
      this.groupSold<SalesChannel>(range, "channel"),
      this.groupSold<OrderSource>(range, "source"),
    ]);
    return {
      channels: this.shares(SALES_CHANNELS, channels),
      sources: this.shares(ORDER_SOURCES, sources),
    };
  }

  private groupSold<K extends string>(range: ReportRange, column: "channel" | "source") {
    return this.prisma.$queryRaw<{ key: K; orders: bigint; revenue: Decimal; cogs: Decimal }[]>`
      WITH ${soldOrders(range.start, range.end)}
      SELECT ${Prisma.raw(`"${column}"`)}::text AS key, COUNT(*) AS orders, SUM(revenue) AS revenue, SUM(cogs) AS cogs
      FROM sold GROUP BY 1`;
  }

  /** ທຸກ key (ລວມທີ່ບໍ່ມີຍອດ) ລຽງ revenue ຫຼາຍ→ໜ້ອຍ; share = % ຂອງ revenue ລວມ */
  private shares<K extends string>(
    keys: readonly K[],
    rows: { key: K; orders: bigint; revenue: Decimal; cogs: Decimal }[],
  ): ChannelSalesDto<K>[] {
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const total = rows.reduce((sum, row) => sum.plus(row.revenue), ZERO);
    return keys
      .map((key) => {
        const row = byKey.get(key);
        const revenue = dec(row?.revenue);
        const cogs = dec(row?.cogs);
        return {
          key,
          orders: Number(row?.orders ?? 0),
          revenue: money(revenue),
          share: total.isZero() ? "0.0" : revenue.div(total).mul(100).toFixed(1),
          cogs: money(cogs),
          grossProfit: money(revenue.minus(cogs)),
        };
      })
      .sort((a, b) => new Prisma.Decimal(b.revenue).comparedTo(a.revenue) || b.orders - a.orders);
  }

  async topProducts(query: TopProductsQuery): Promise<TopProductDto[]> {
    const rows = await this.prisma.$queryRaw<
      {
        variantId: string;
        sku: string;
        productName: string;
        variantName: string | null;
        units: bigint;
        revenue: Decimal;
        cogs: Decimal;
      }[]
    >`
      WITH ${soldOrders(query.start, query.end)}
      SELECT i."variantId", v."sku", p."name" AS "productName", v."name" AS "variantName",
             SUM(i."quantity") AS units, SUM(i."lineTotal") AS revenue, SUM(i."unitCost" * i."quantity") AS cogs
      FROM "OrderItem" i
      JOIN sold s ON s."id" = i."orderId"
      JOIN "ProductVariant" v ON v."id" = i."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      GROUP BY i."variantId", v."sku", p."name", v."name"
      ORDER BY units DESC, revenue DESC, v."sku"
      LIMIT ${query.limit}`;
    return rows.map((row) => ({
      variantId: row.variantId,
      sku: row.sku,
      productName: row.productName,
      variantName: row.variantName,
      units: Number(row.units),
      revenue: money(row.revenue),
      cogs: money(row.cogs),
      grossProfit: money(row.revenue.minus(row.cogs)),
    }));
  }

  /** variant ທີ່ມີສະຕ໋ອກ (ລວມທຸກສາງ) ແຕ່ບໍ່ມີການຂາຍໃນ `days` ມື້ຫຼ້າສຸດ, ລຽງມູນຄ່າສະຕ໋ອກ (ຕົ້ນທຶນ) ຫຼາຍ→ໜ້ອຍ */
  async deadstock(query: DeadstockQuery): Promise<Page<DeadstockItemDto> & { days: number }> {
    const cutoff = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const base = Prisma.sql`
      WITH stock AS (
        SELECT "variantId", SUM("onHand")::int AS "onHand" FROM "StockLevel"
        GROUP BY "variantId" HAVING SUM("onHand") > 0
      ),
      last_sale AS (
        SELECT i."variantId", MAX(o."paidAt") AS at
        FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
        WHERE o."status" IN ${SOLD_STATUSES_SQL}
        GROUP BY i."variantId"
      ),
      dead AS (
        SELECT s."variantId", s."onHand", v."sku", v."name" AS "variantName", p."name" AS "productName",
               s."onHand" * v."costPrice" AS "stockValue", l.at AS "lastSoldAt"
        FROM stock s
        JOIN "ProductVariant" v ON v."id" = s."variantId"
        JOIN "Product" p ON p."id" = v."productId"
        LEFT JOIN last_sale l ON l."variantId" = s."variantId"
        WHERE l.at IS NULL OR l.at < ${cutoff}
      )`;
    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          variantId: string;
          sku: string;
          productName: string;
          variantName: string | null;
          onHand: number;
          stockValue: Decimal;
          lastSoldAt: Date | null;
        }[]
      >`${base}
        SELECT * FROM dead ORDER BY "stockValue" DESC, "onHand" DESC, "sku"
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`${base} SELECT COUNT(*) AS total FROM dead`,
    ]);
    return {
      days: query.days,
      ...toPage(
        rows.map((row) => ({
          variantId: row.variantId,
          sku: row.sku,
          productName: row.productName,
          variantName: row.variantName,
          onHand: row.onHand,
          stockValue: money(row.stockValue),
          lastSoldAt: row.lastSoldAt ? row.lastSoldAt.toISOString() : null,
        })),
        Number(count?.total ?? 0),
        query.page,
        query.pageSize,
      ),
    };
  }

  /** CSV ສຳລັບບັນຊີ: ໜຶ່ງແຖວຕໍ່ບິນທີ່ນັບເປັນຍອດຂາຍ. ຕົ້ນທຶນສະເພາະ includeCost (costs:read) */
  async exportCsv(range: ReportRange, includeCost: boolean): Promise<CsvExport> {
    const rows = await this.prisma.$queryRaw<
      {
        orderNumber: string;
        paidAt: string;
        status: string;
        channel: string;
        source: string;
        customerName: string | null;
        customerPhone: string | null;
        subtotal: Decimal;
        discountTotal: Decimal;
        shippingFee: Decimal;
        vatAmount: Decimal;
        total: Decimal;
        revenue: Decimal;
        cogs: Decimal;
      }[]
    >`
      WITH ${soldOrders(range.start, range.end)}
      SELECT s."orderNumber",
             to_char((s."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Vientiane', 'YYYY-MM-DD HH24:MI') AS "paidAt",
             s."status"::text AS status, s."channel"::text AS channel, s."source"::text AS source,
             c."name" AS "customerName", c."phone" AS "customerPhone",
             s."subtotal", s."discountTotal", s."shippingFee", s."vatAmount", s."total", s.revenue, s.cogs
      FROM sold s LEFT JOIN "Customer" c ON c."id" = s."customerId"
      ORDER BY s."paidAt", s."orderNumber"`;
    const header = [
      "orderNumber",
      "paidAt",
      "status",
      "channel",
      "source",
      "customer",
      "phone",
      "subtotal",
      "discount",
      "shipping",
      "vat",
      "total",
      "revenue",
      ...(includeCost ? ["cogs", "grossProfit"] : []),
    ];
    const lines = rows.map((row) =>
      [
        row.orderNumber,
        row.paidAt,
        row.status,
        row.channel,
        row.source,
        row.customerName ?? "",
        row.customerPhone ?? "",
        money(row.subtotal),
        money(row.discountTotal),
        money(row.shippingFee),
        money(row.vatAmount),
        money(row.total),
        money(row.revenue),
        ...(includeCost ? [money(row.cogs), money(row.revenue.minus(row.cogs))] : []),
      ]
        .map(csvCell)
        .join(","),
    );
    // BOM ໃຫ້ Excel ອ່ານ UTF-8 (ພາສາລາວ) ຖືກ; CRLF ຕາມ RFC 4180
    return {
      filename: `sales-${range.from}-${range.to}.csv`,
      body: `\uFEFF${[header.join(","), ...lines].join("\r\n")}\r\n`,
    };
  }
}

/** ກັນ CSV/formula injection (ຄ່າທີ່ຂຶ້ນຕົ້ນ = + - @ tab CR) ແລະ escape ຕາມ RFC 4180 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

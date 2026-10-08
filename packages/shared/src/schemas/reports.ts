import { z } from "zod";
import { STORE_UTC_OFFSET } from "../constants";
import { type SalesChannel, dateBound } from "./inventory";

// ---------------------------------------------------------------------------
// ໂມດູນ 10 (Analytics) ແລະ ໂມດູນ 12 (Staff KPI, Audit Trail)
// ---------------------------------------------------------------------------

/** ກົງກັບ enum OrderSource ໃນ Prisma schema */
export const ORDER_SOURCES = ["WEB_CHECKOUT", "CHAT", "LIVE_CF", "POST_CF", "MANUAL"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** ສະຖານະບິນທີ່ນັບເປັນຍອດຂາຍ (ຈ່າຍແລ້ວ ແລະ ບໍ່ຖືກຍົກເລີກ) */
export const SOLD_ORDER_STATUSES = ["PAID", "PACKING", "SHIPPED", "COMPLETED"] as const;

export const REPORT_MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseStoreDate(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000${STORE_UTC_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  // 2026-02-30 ບາງ engine ເລື່ອນເປັນມື້ອື່ນ -> ກວດວ່າແປງກັບຄືນໄດ້ຄືເກົ່າ
  return new Date(parsed.getTime() + 7 * 60 * 60 * 1000).toISOString().startsWith(value) ? parsed : null;
}

const dateOnlySchema = z
  .string()
  .trim()
  .refine((value) => parseStoreDate(value) !== null, "ວັນທີຕ້ອງເປັນ YYYY-MM-DD");

/** ຊ່ວງວັນທີຂອງລາຍງານ (ເວລາຮ້ານ). `to` ຮວມມື້ສຸດທ້າຍ; ຜົນ: start (ຮວມ) ແລະ end (ບໍ່ຮວມ = ຕົ້ນມື້ຖັດຈາກ to) */
export const reportRangeShape = {
  from: dateOnlySchema,
  to: dateOnlySchema,
};

export interface ReportRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
  days: number;
}

function toRange<T extends { from: string; to: string }>(value: T, ctx: z.RefinementCtx): T & ReportRange {
  const start = parseStoreDate(value.from) as Date;
  const end = new Date((parseStoreDate(value.to) as Date).getTime() + DAY_MS);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days < 1) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "to ຕ້ອງບໍ່ກ່ອນ from" });
    return z.NEVER;
  }
  if (days > REPORT_MAX_DAYS) {
    ctx.addIssue({ code: "custom", path: ["to"], message: `ຊ່ວງວັນທີສູງສຸດ ${REPORT_MAX_DAYS} ມື້` });
    return z.NEVER;
  }
  return { ...value, start, end, days };
}

export const reportRangeQuerySchema = z.object(reportRangeShape).transform(toRange);
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const topProductsQuerySchema = z
  .object({ ...reportRangeShape, limit: z.coerce.number().int().min(1).max(50).default(10) })
  .transform(toRange);
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

export const deadstockQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(60),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DeadstockQuery = z.infer<typeof deadstockQuerySchema>;

/** `action` ກົງທັງໝົດ ຫຼື ລົງທ້າຍ `.*` = prefix (ເຊັ່ນ `order.*`) */
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  userId: z.string().trim().min(1).optional(),
  action: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_.-]*(\.\*)?$/i, "action ບໍ່ຖືກຕ້ອງ")
    .max(100)
    .optional(),
  entity: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(100).optional(),
  from: dateBound("from"),
  to: dateBound("to"),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// ---------------------------------------------------------------------------
// DTO (ເງິນເປັນ string 2 ທົດສະນິຍົມ; field ຕົ້ນທຶນເປັນ optional ເພາະຖືກຕັດອອກເມື່ອບໍ່ມີ costs:read)
// ---------------------------------------------------------------------------

export interface CostFigures {
  cogs?: string;
  grossProfit?: string;
}

export interface SalesSummaryDto extends CostFigures {
  from: string;
  to: string;
  orders: number;
  units: number;
  customers: number;
  grossSales: string;
  discounts: string;
  shippingIncome: string;
  vat: string;
  revenue: string;
  avgOrderValue: string;
  /** % ຂອງ revenue, null ຖ້າ revenue = 0 */
  grossMargin?: string | null;
  cancelled: number;
  pendingAmount: string;
}

export interface DailySalesDto extends CostFigures {
  date: string;
  orders: number;
  revenue: string;
}

export interface ChannelSalesDto<K extends string> extends CostFigures {
  key: K;
  orders: number;
  revenue: string;
  share: string;
}

export interface ChannelReportDto {
  channels: ChannelSalesDto<SalesChannel>[];
  sources: ChannelSalesDto<OrderSource>[];
}

export interface TopProductDto extends CostFigures {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  units: number;
  revenue: string;
}

export interface DeadstockItemDto {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  onHand: number;
  stockValue?: string;
  lastSoldAt: string | null;
}

export interface StaffKpiFigures {
  ordersCreated: number;
  salesClosed: number;
  salesAmount: string;
  ordersPacked: number;
  ordersShipped: number;
  ordersCancelled: number;
  stockAdjustments: number;
  messagesSent: number;
  responses: number;
  avgResponseSeconds: number | null;
}

export interface StaffKpiUserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleName: string;
}

export interface StaffKpiRowDto extends StaffKpiFigures {
  user: StaffKpiUserDto;
}

export interface StaffKpiDailyDto {
  user: StaffKpiUserDto;
  days: (StaffKpiFigures & { date: string })[];
}

export interface AuditLogDto {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  user: { id: string; name: string; email: string } | null;
  before: unknown;
  after: unknown;
}

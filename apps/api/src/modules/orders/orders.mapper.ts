import { buildTrackingUrl } from "@oca/shared";
import type { Prisma } from "@oca/database";
import { money } from "../../common/money";

export const orderDetailInclude = {
  customer: true,
  items: { orderBy: { id: "asc" } },
  stockMovements: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { warehouse: { select: { code: true } }, variant: { select: { sku: true } } },
  },
  shipment: { include: { courier: true } },
} as const satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export const orderListInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  _count: { select: { items: true } },
} as const satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  source: string;
  /** ບິນທີ່ເປີດຈາກແຊັດ; null = ບໍ່ໄດ້ມາຈາກແຊັດ */
  conversationId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
  reservedUntil: Date | null;
  createdAt: Date;
}

export function toOrderListItem(row: OrderListRow): OrderListItemDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    channel: row.channel,
    source: row.source,
    conversationId: row.conversationId,
    customer: row.customer,
    total: money(row.total),
    itemCount: row._count.items,
    reservedUntil: row.reservedUntil,
    createdAt: row.createdAt,
  };
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  source: string;
  conversationId: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
  exchangeRate: string;
  subtotal: string;
  discountTotal: string;
  shippingFee: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  reservedUntil: Date | null;
  secondsUntilExpiry: number | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  /** ການສົ່ງ (ໜ້າແພັກ/ສົ່ງ); null = ຍັງບໍ່ເລີ່ມແພັກຜ່ານໜ້າ fulfillment */
  shipment: {
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    notifyStatus: string;
    shippedAt: Date | null;
  } | null;
  items: {
    id: string;
    variantId: string;
    warehouseId: string;
    productName: string;
    variantName: string | null;
    sku: string;
    unitPrice: string;
    unitCost: string;
    quantity: number;
    discount: string;
    lineTotal: string;
  }[];
  movements: {
    id: string;
    type: string;
    quantity: number;
    variantId: string;
    sku: string;
    warehouseId: string;
    warehouseCode: string;
    createdAt: Date;
  }[];
}

export function toOrderDetail(row: OrderDetailRow, now: Date = new Date()): OrderDetailDto {
  const pendingWithDeadline = row.status === "PENDING_PAYMENT" && row.reservedUntil !== null;
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    channel: row.channel,
    source: row.source,
    conversationId: row.conversationId,
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone, email: row.customer.email }
      : null,
    currency: row.currency,
    exchangeRate: row.exchangeRate.toFixed(6),
    subtotal: money(row.subtotal),
    discountTotal: money(row.discountTotal),
    shippingFee: money(row.shippingFee),
    vatRate: money(row.vatRate),
    vatAmount: money(row.vatAmount),
    total: money(row.total),
    shippingName: row.shippingName,
    shippingPhone: row.shippingPhone,
    shippingAddress: row.shippingAddress,
    note: row.note,
    reservedUntil: row.reservedUntil,
    secondsUntilExpiry:
      pendingWithDeadline && row.reservedUntil
        ? Math.max(0, Math.floor((row.reservedUntil.getTime() - now.getTime()) / 1000))
        : null,
    paidAt: row.paidAt,
    shippedAt: row.shippedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    shipment: row.shipment
      ? {
          courierName: row.shipment.courier?.name ?? null,
          trackingNumber: row.shipment.trackingNumber,
          trackingUrl: row.shipment.trackingNumber
            ? buildTrackingUrl(row.shipment.courier?.trackingUrlTemplate, row.shipment.trackingNumber)
            : null,
          notifyStatus: row.shipment.notifyStatus,
          shippedAt: row.shipment.shippedAt,
        }
      : null,
    items: row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      warehouseId: item.warehouseId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      unitPrice: money(item.unitPrice),
      unitCost: money(item.unitCost),
      quantity: item.quantity,
      discount: money(item.discount),
      lineTotal: money(item.lineTotal),
    })),
    movements: row.stockMovements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      variantId: movement.variantId,
      sku: movement.variant.sku,
      warehouseId: movement.warehouseId,
      warehouseCode: movement.warehouse.code,
      createdAt: movement.createdAt,
    })),
  };
}

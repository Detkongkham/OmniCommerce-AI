import type { Prisma } from "@oca/database";

export const stockLevelInclude = {
  variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
  warehouse: { select: { code: true } },
} as const satisfies Prisma.StockLevelInclude;

export type StockLevelRow = Prisma.StockLevelGetPayload<{ include: typeof stockLevelInclude }>;

export interface StockLevelDto {
  id: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  isLow: boolean;
}

export function toStockLevelDto(row: StockLevelRow): StockLevelDto {
  const available = row.onHand - row.reserved;
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.variant.sku,
    variantName: row.variant.name,
    productName: row.variant.product.name,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    onHand: row.onHand,
    reserved: row.reserved,
    available,
    lowStockThreshold: row.lowStockThreshold,
    isLow: row.lowStockThreshold !== null && available <= row.lowStockThreshold,
  };
}

export const movementInclude = {
  variant: { select: { sku: true } },
  warehouse: { select: { code: true } },
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.StockMovementInclude;

export type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

export interface StockMovementDto {
  id: string;
  type: string;
  quantity: number;
  variantId: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
}

export function toMovementDto(row: MovementRow, actorNames: Map<string, string>): StockMovementDto {
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    variantId: row.variantId,
    sku: row.variant.sku,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    note: row.note,
    actorId: row.actorId,
    actorName: row.actorId ? (actorNames.get(row.actorId) ?? null) : null,
    createdAt: row.createdAt,
  };
}

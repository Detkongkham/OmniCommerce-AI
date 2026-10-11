import { Prisma } from "@oca/database";
import {
  type OrderStatus,
  type StoreSlipStatus,
  type StoreStock,
  type StoreStockStatus,
  buildTrackingUrl,
  storeStock,
} from "@oca/shared";
import { money } from "../../common/money";

/**
 * DTO ຂອງໜ້າຮ້ານສາທາລະນະ. ແຍກຈາກ mapper ຂອງ admin ໂດຍເຈດຕະນາ: ຫ້າມມີຕົ້ນທຶນ, SKU/ບາໂຄດ,
 * ສະຕ໋ອກດິບ/ລາຍສາງ, id ພາຍໃນຂອງລູກຄ້າ/ພະນັກງານ (route ສາທາລະນະບໍ່ຜ່ານ CostRedactionInterceptor).
 */

/** ສິນຄ້າທີ່ຂາຍໄດ້ໃນເວັບ: ACTIVE ແລະ ມີ variant ເປີດຂາຍຢ່າງໜ້ອຍ 1 */
export const SELLABLE_PRODUCT = {
  status: "ACTIVE",
  variants: { some: { isActive: true } },
} as const satisfies Prisma.ProductWhereInput;

/** ສະຕ໋ອກຂອງສາງ default ເທົ່ານັ້ນ (ສາງດຽວກັບທີ່ການສ້າງບິນຈອງ); ບໍ່ມີສາງ default = ບໍ່ມີແຖວ = OUT */
export function stockLevelsOf(warehouseId: string | null) {
  return { where: { warehouseId: warehouseId ?? "" }, select: { onHand: true, reserved: true } } as const;
}

export function availableOf(levels: readonly { onHand: number; reserved: number }[]): number {
  return levels.reduce((sum, level) => sum + (level.onHand - level.reserved), 0);
}

// ---------------------------------------------------------------------------
// ລາຍການສິນຄ້າ
// ---------------------------------------------------------------------------
export function storeProductListInclude(warehouseId: string | null) {
  return {
    images: { orderBy: { position: "asc" }, take: 1 },
    variants: {
      where: { isActive: true },
      select: { price: true, compareAtPrice: true, stockLevels: stockLevelsOf(warehouseId) },
    },
  } satisfies Prisma.ProductInclude;
}

type StoreProductListRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof storeProductListInclude> }>;

export interface StoreProductListItemDto {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceMin: string;
  priceMax: string;
  /** ລາຄາກ່ອນຫຼຸດຂອງ variant ທີ່ຖືກສຸດ (ຖ້າສູງກວ່າລາຄາຂາຍ) */
  compareAtPrice: string | null;
  stock: StoreStockStatus;
}

export function toStoreProductListItem(row: StoreProductListRow): StoreProductListItemDto {
  const cheapest = row.variants.reduce<(typeof row.variants)[number] | undefined>(
    (best, variant) => (!best || variant.price.lessThan(best.price) ? variant : best),
    undefined,
  );
  const prices = row.variants.map((variant) => variant.price);
  return {
    slug: row.slug,
    name: row.name,
    imageUrl: row.images[0]?.url ?? null,
    priceMin: prices.length > 0 ? money(Prisma.Decimal.min(...prices)) : "0.00",
    priceMax: prices.length > 0 ? money(Prisma.Decimal.max(...prices)) : "0.00",
    compareAtPrice: compareAtOf(cheapest),
    stock: storeStock(row.variants.reduce((sum, variant) => sum + Math.max(availableOf(variant.stockLevels), 0), 0)).status,
  };
}

function compareAtOf(variant: { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null } | undefined): string | null {
  if (!variant?.compareAtPrice || !variant.compareAtPrice.greaterThan(variant.price)) return null;
  return money(variant.compareAtPrice);
}

// ---------------------------------------------------------------------------
// ລາຍລະອຽດສິນຄ້າ
// ---------------------------------------------------------------------------
export function storeProductDetailInclude(warehouseId: string | null) {
  return {
    category: { select: { name: true, slug: true } },
    options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
    variants: {
      where: { isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        optionValues: { include: { option: { select: { name: true } } } },
        stockLevels: stockLevelsOf(warehouseId),
      },
    },
    images: { orderBy: { position: "asc" } },
  } satisfies Prisma.ProductInclude;
}

type StoreProductDetailRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof storeProductDetailInclude> }>;

export interface StoreVariantDto {
  id: string;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  /** ຊື່ຕົວເລືອກ → ຄ່າ ເຊັ່ນ { ສີ: "ດຳ" } */
  optionValues: Record<string, string>;
  stock: StoreStock;
}

export interface StoreProductDetailDto {
  slug: string;
  name: string;
  description: string | null;
  category: { name: string; slug: string } | null;
  options: { name: string; values: string[] }[];
  variants: StoreVariantDto[];
  images: { url: string; alt: string | null; variantId: string | null }[];
}

export function toStoreProductDetail(row: StoreProductDetailRow): StoreProductDetailDto {
  const activeIds = new Set(row.variants.map((variant) => variant.id));
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    options: row.options.map((option) => ({ name: option.name, values: option.values.map((value) => value.value) })),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: money(variant.price),
      compareAtPrice: compareAtOf(variant),
      optionValues: Object.fromEntries(variant.optionValues.map((value) => [value.option.name, value.value])),
      stock: storeStock(availableOf(variant.stockLevels)),
    })),
    images: row.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      // ຮູບຂອງ variant ທີ່ປິດຂາຍ ສະແດງເປັນຮູບຂອງສິນຄ້າລວມ
      variantId: image.variantId && activeIds.has(image.variantId) ? image.variantId : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// ບິນ (ເບິ່ງດ້ວຍ publicToken)
// ---------------------------------------------------------------------------
export const storeOrderInclude = {
  items: { orderBy: { id: "asc" } },
  slips: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { status: true, createdAt: true } },
  shippingCourier: { select: { name: true } },
  shipment: {
    select: { trackingNumber: true, courier: { select: { name: true, trackingUrlTemplate: true } } },
  },
} as const satisfies Prisma.OrderInclude;

export type StoreOrderRow = Prisma.OrderGetPayload<{ include: typeof storeOrderInclude }>;

export interface StoreOrderDto {
  orderNumber: string;
  /** PENDING_PAYMENT ທີ່ເກີນເວລາຈອງ ສະແດງເປັນ EXPIRED ທັນທີ (ບໍ່ລໍ worker) */
  status: OrderStatus;
  createdAt: Date;
  reservedUntil: Date | null;
  paidAt: Date | null;
  currency: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  items: { productName: string; variantName: string | null; quantity: number; unitPrice: string; lineTotal: string }[];
  shipping: {
    name: string | null;
    phone: string | null;
    address: string | null;
    courierName: string | null;
    branch: string | null;
  };
  note: string | null;
  slips: { status: StoreSlipStatus; createdAt: Date }[];
  tracking: { courierName: string | null; trackingNumber: string; url: string | null } | null;
}

export function isReservationExpired(row: { status: string; reservedUntil: Date | null }, now: Date = new Date()): boolean {
  return row.status === "PENDING_PAYMENT" && row.reservedUntil !== null && row.reservedUntil.getTime() <= now.getTime();
}

function storeSlipStatus(status: string): StoreSlipStatus {
  return status === "CONFIRMED" || status === "REJECTED" ? status : "REVIEWING";
}

export function toStoreOrder(row: StoreOrderRow, now: Date = new Date()): StoreOrderDto {
  const trackingNumber = row.shipment?.trackingNumber ?? null;
  return {
    orderNumber: row.orderNumber,
    status: isReservationExpired(row, now) ? "EXPIRED" : row.status,
    createdAt: row.createdAt,
    reservedUntil: row.reservedUntil,
    paidAt: row.paidAt,
    currency: row.currency,
    subtotal: money(row.subtotal),
    vatAmount: money(row.vatAmount),
    total: money(row.total),
    items: row.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
    })),
    shipping: {
      name: row.shippingName,
      phone: row.shippingPhone,
      address: row.shippingAddress,
      courierName: row.shippingCourier?.name ?? null,
      branch: row.shippingBranch,
    },
    note: row.note,
    slips: row.slips.map((slip) => ({ status: storeSlipStatus(slip.status), createdAt: slip.createdAt })),
    tracking: trackingNumber
      ? {
          courierName: row.shipment?.courier?.name ?? null,
          trackingNumber,
          url: buildTrackingUrl(row.shipment?.courier?.trackingUrlTemplate, trackingNumber),
        }
      : null,
  };
}

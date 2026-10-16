import { type ActiveFlashPrice, COUNTED_ORDER_STATUSES, type EffectivePrice, Prisma, effectivePrice } from "@oca/database";
import {
  type OrderStatus,
  type StorePinSetup,
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
      select: { id: true, price: true, compareAtPrice: true, stockLevels: stockLevelsOf(warehouseId) },
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
  /** end of the running flash sale (earliest among this product's variants); null = no flash sale */
  saleEndsAt: Date | null;
  stock: StoreStockStatus;
}

export function toStoreProductListItem(row: StoreProductListRow, flashPrices: FlashPrices): StoreProductListItemDto {
  const variants = row.variants.map((variant) => ({ variant, sale: effectivePrice(variant.price, flashPrices.get(variant.id)) }));
  const cheapest = variants.reduce<(typeof variants)[number] | undefined>(
    (best, entry) => (!best || entry.sale.price.lessThan(best.sale.price) ? entry : best),
    undefined,
  );
  const prices = variants.map((entry) => entry.sale.price);
  const saleEnds = variants.flatMap((entry) => (entry.sale.saleEndsAt ? [entry.sale.saleEndsAt.getTime()] : []));
  return {
    slug: row.slug,
    name: row.name,
    imageUrl: row.images[0]?.url ?? null,
    priceMin: prices.length > 0 ? money(Prisma.Decimal.min(...prices)) : "0.00",
    priceMax: prices.length > 0 ? money(Prisma.Decimal.max(...prices)) : "0.00",
    compareAtPrice: cheapest ? compareAtOf(cheapest.variant, cheapest.sale) : null,
    saleEndsAt: saleEnds.length > 0 ? new Date(Math.min(...saleEnds)) : null,
    stock: storeStock(row.variants.reduce((sum, variant) => sum + Math.max(availableOf(variant.stockLevels), 0), 0)).status,
  };
}

export type FlashPrices = ReadonlyMap<string, ActiveFlashPrice>;

/** crossed-out price: the regular price during a flash sale, otherwise the variant's own compareAtPrice (if higher) */
function compareAtOf(variant: { compareAtPrice: Prisma.Decimal | null }, sale: EffectivePrice): string | null {
  if (sale.flashSaleId) return money(sale.regularPrice);
  if (!variant.compareAtPrice || !variant.compareAtPrice.greaterThan(sale.price)) return null;
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
  /** end of the running flash sale for this variant; null = regular price */
  saleEndsAt: Date | null;
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

export function toStoreProductDetail(row: StoreProductDetailRow, flashPrices: FlashPrices): StoreProductDetailDto {
  const activeIds = new Set(row.variants.map((variant) => variant.id));
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    options: row.options.map((option) => ({ name: option.name, values: option.values.map((value) => value.value) })),
    variants: row.variants.map((variant) => {
      const sale = effectivePrice(variant.price, flashPrices.get(variant.id));
      return {
        id: variant.id,
        name: variant.name,
        price: money(sale.price),
        compareAtPrice: compareAtOf(variant, sale),
        optionValues: Object.fromEntries(variant.optionValues.map((value) => [value.option.name, value.value])),
        saleEndsAt: sale.saleEndsAt,
        stock: storeStock(availableOf(variant.stockLevels)),
      };
    }),
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
  // ໃຊ້ຄິດ pinSetup ເທົ່ານັ້ນ (DTO ບໍ່ມີ pinHash/pinResetAt/id ຂອງລູກຄ້າ)
  customer: { select: { pinHash: true, pinResetAt: true } },
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
  /** subtotal ແລະ total ຫັກສ່ວນຫຼຸດຂອງໂຄດ ແລະ ແຕ້ມແລ້ວ */
  subtotal: string;
  vatAmount: string;
  total: string;
  coupon: { code: string; discount: string } | null;
  /** ແຕ້ມທີ່ໃຊ້ຫັກໃນບິນນີ້; null = ບໍ່ໄດ້ໃຊ້ແຕ້ມ (ແຕ້ມຖືກຄືນເມື່ອບິນໝົດອາຍຸ/ຍົກເລີກ ແຕ່ຄ່ານີ້ຍັງສະແດງ) */
  points: { redeemed: number; discount: string } | null;
  /** ແຕ້ມທີ່ໄດ້ຈາກບິນນີ້ (ໃຫ້ຕອນຈ່າຍ); null = ຍັງບໍ່ຈ່າຍ, ຍົກເລີກ/ໝົດອາຍຸ ຫຼື ບໍ່ໄດ້ແຕ້ມ */
  pointsEarned: number | null;
  /** ຕັ້ງ PIN ສະມາຊິກຈາກບິນນີ້ໄດ້ບໍ (POST /store/orders/:token/pin) */
  pinSetup: StorePinSetup;
  /** variantId: ໃຫ້ເວັບເຕີມກະຕ່າຄືນໄດ້ ("ສັ່ງໃໝ່" ຂອງບິນທີ່ໝົດອາຍຸ) */
  items: { variantId: string; productName: string; variantName: string | null; quantity: number; unitPrice: string; lineTotal: string }[];
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

/** ບິນທີ່ໃຊ້ຕັ້ງ PIN ໄດ້: ບິນຂອງເວັບທີ່ມີລູກຄ້າ */
export function isPinSetupOrder(order: { channel: string; customerId: string | null }): boolean {
  return order.channel === "STOREFRONT" && order.customerId !== null;
}

/** ບິນທີ່ຈ່າຍແລ້ວ (ນັບເປັນການຊື້): ຕັ້ງ PIN ໄດ້ ແລະ ສະແດງແຕ້ມທີ່ໄດ້ */
export function isPaidOrderStatus(status: string): boolean {
  return (COUNTED_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * ຫຼັງພະນັກງານເຮັດໃຫ້ PIN ໃຊ້ບໍ່ໄດ້ (pinResetAt) ຕັ້ງ PIN ໄດ້ສະເພາະຈາກບິນທີ່ຈ່າຍຫຼັງເວລານັ້ນ:
 * ລິ້ງບິນເກົ່າ (ລວມທັງບິນທີ່ຄົນອື່ນຈ່າຍໃສ່ເບີນີ້) ເອົາບັນຊີຄືນບໍ່ໄດ້. paidAt null (ຂໍ້ມູນເກົ່າ) = ບໍ່ຜ່ານ
 */
export function isPaidAfterPinReset(paidAt: Date | null, pinResetAt: Date | null): boolean {
  return pinResetAt === null || (paidAt !== null && paidAt.getTime() > pinResetAt.getTime());
}

/** ເງື່ອນໄຂດຽວກັບ StoreMemberService.setPin: AVAILABLE = ຕັ້ງໄດ້ດຽວນີ້, AFTER_PAYMENT = ຕັ້ງໄດ້ເມື່ອຈ່າຍ */
export function pinSetupOf(
  order: {
    channel: string;
    customerId: string | null;
    status: string;
    reservedUntil: Date | null;
    paidAt: Date | null;
    customer: { pinHash: string | null; pinResetAt: Date | null } | null;
  },
  now: Date = new Date(),
): StorePinSetup {
  if (!isPinSetupOrder(order) || !order.customer || order.customer.pinHash) return "NONE";
  // ຈ່າຍແລ້ວ: ຕ້ອງຈ່າຍຫຼັງ reset. ຍັງລໍຈ່າຍ: ການຈ່າຍຈະເກີດຫຼັງ reset ສະເໝີ
  if (isPaidOrderStatus(order.status)) return isPaidAfterPinReset(order.paidAt, order.customer.pinResetAt) ? "AVAILABLE" : "NONE";
  return order.status === "PENDING_PAYMENT" && !isReservationExpired(order, now) ? "AFTER_PAYMENT" : "NONE";
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
    coupon: row.couponCode ? { code: row.couponCode, discount: money(row.couponDiscount) } : null,
    points: row.pointsRedeemed > 0 ? { redeemed: row.pointsRedeemed, discount: money(row.pointsDiscount) } : null,
    pointsEarned: row.pointsEarned > 0 && isPaidOrderStatus(row.status) ? row.pointsEarned : null,
    pinSetup: pinSetupOf(row, now),
    items: row.items.map((item) => ({
      variantId: item.variantId,
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

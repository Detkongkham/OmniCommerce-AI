import { type ActiveFlashPrice, type EffectivePrice, Prisma, effectivePrice } from "@oca/database";
import {
  type MemberTier,
  type OrderStatus,
  type PointEntryType,
  type SalesChannel,
  type StoreSlipStatus,
  type StoreStock,
  type StoreStockStatus,
  type TierRule,
  buildTrackingUrl,
  nextTier,
  storeStock,
  tierMultiplier,
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
  /** subtotal ແລະ total ຫັກສ່ວນຫຼຸດຂອງໂຄດແລ້ວ */
  subtotal: string;
  vatAmount: string;
  total: string;
  coupon: { code: string; discount: string } | null;
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

// ---------------------------------------------------------------------------
// ສະມາຊິກ (ເບີ + PIN): ບໍ່ມີ id ຂອງລູກຄ້າ, pinHash ຫຼື ບັນທຶກພາຍໃນຂອງແອດມິນ
// ---------------------------------------------------------------------------
export const storeMemberSelect = {
  id: true,
  name: true,
  phone: true,
  pointsBalance: true,
  tier: true,
} as const satisfies Prisma.CustomerSelect;

/** ລູກຄ້າຂອງ session ສະມາຊິກ (ໃຊ້ພາຍໃນ API; `id` ບໍ່ອອກໄປຫາ client) */
export type StoreMemberRow = Prisma.CustomerGetPayload<{ select: typeof storeMemberSelect }>;

export interface StoreMemberDto {
  name: string;
  phone: string | null;
  pointsBalance: number;
  tier: MemberTier;
  /** ຍອດຊື້ 12 ເດືອນຫຼ້າສຸດ (ຕົວກຳນົດລະດັບ) */
  spend12m: string;
  /** ລະດັບຖັດໄປ, ເກນຂອງມັນ ແລະ ຍອດທີ່ຕ້ອງຊື້ຕື່ມ; null = ລະດັບສູງສຸດແລ້ວ */
  nextTier: { tier: MemberTier; minSpend: string; remaining: string } | null;
  /** ຕົວຄູນແຕ້ມຂອງລະດັບປັດຈຸບັນ ເຊັ່ນ "1.25" */
  pointsMultiplier: string;
}

export function toStoreMember(row: StoreMemberRow, spend12m: string, rules: readonly TierRule[]): StoreMemberDto {
  const next = nextTier(rules, spend12m);
  const nextRule = next ? rules.find((rule) => rule.tier === next.tier) : undefined;
  return {
    name: row.name,
    phone: row.phone,
    pointsBalance: row.pointsBalance,
    tier: row.tier,
    spend12m,
    nextTier: next && nextRule ? { tier: next.tier, minSpend: money(new Prisma.Decimal(nextRule.minSpend)), remaining: next.remaining } : null,
    pointsMultiplier: tierMultiplier(rules, row.tier),
  };
}

export const storeMemberOrderSelect = {
  orderNumber: true,
  createdAt: true,
  status: true,
  reservedUntil: true,
  total: true,
  channel: true,
  publicToken: true,
} as const satisfies Prisma.OrderSelect;

type StoreMemberOrderRow = Prisma.OrderGetPayload<{ select: typeof storeMemberOrderSelect }>;

export interface StoreMemberOrderDto {
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  total: string;
  channel: SalesChannel;
  /** ລິ້ງຕິດຕາມບິນ (/orders/:token) ສະເພາະບິນຂອງເວັບ; ຊ່ອງທາງອື່ນ = null */
  token: string | null;
}

export function toStoreMemberOrder(row: StoreMemberOrderRow, now: Date = new Date()): StoreMemberOrderDto {
  return {
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    status: isReservationExpired(row, now) ? "EXPIRED" : row.status,
    total: money(row.total),
    channel: row.channel,
    token: row.channel === "STOREFRONT" ? row.publicToken : null,
  };
}

/** ບໍ່ select `note`/`actorId`: note ຂອງ ADJUST ແມ່ນບັນທຶກຂອງພະນັກງານ (ບໍ່ມີເຫດຜົນແຍກສຳລັບລູກຄ້າ) */
export const storeMemberPointSelect = {
  createdAt: true,
  type: true,
  points: true,
  balanceAfter: true,
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.PointEntrySelect;

type StoreMemberPointRow = Prisma.PointEntryGetPayload<{ select: typeof storeMemberPointSelect }>;

export interface StoreMemberPointDto {
  createdAt: Date;
  type: PointEntryType;
  /** ມີເຄື່ອງໝາຍ: ບວກ = ໄດ້, ລົບ = ໃຊ້ */
  points: number;
  balanceAfter: number;
  orderNumber: string | null;
}

export function toStoreMemberPoint(row: StoreMemberPointRow): StoreMemberPointDto {
  return {
    createdAt: row.createdAt,
    type: row.type,
    points: row.points,
    balanceAfter: row.balanceAfter,
    orderNumber: row.order?.orderNumber ?? null,
  };
}

import { Inject, Injectable } from "@nestjs/common";
import {
  CouponRejectedError,
  type LoyaltyConfig,
  PointsRejectedError,
  Prisma,
  type PrismaClient,
  activeFlashPrices,
  effectivePrice,
  evaluateCoupon,
  evaluateRedemption,
  loyaltyConfigOf,
} from "@oca/database";
import {
  COUPON_CODE_PATTERN,
  type CouponRejectReason,
  type MemberTier,
  type PointsRejectReason,
  type ReceivingAccount,
  STORE_PAGE_SIZE,
  type StoreCartCheckInput,
  type StoreProductListQuery,
  type StoreStock,
  calculateOrderTotals,
  maxRedeemablePoints,
  receivingAccountsSchema,
  storeStock,
} from "@oca/shared";
import { apiError } from "../../common/api-error";
import { money } from "../../common/money";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { ensureStoreSetting } from "../inventory/ensure-store-setting";
import type { StoreMemberRow } from "./store-member.mapper";
import {
  SELLABLE_PRODUCT,
  type StoreProductDetailDto,
  type StoreProductListItemDto,
  availableOf,
  stockLevelsOf,
  storeProductDetailInclude,
  storeProductListInclude,
  toStoreProductDetail,
  toStoreProductListItem,
} from "./storefront.mapper";

export interface StoreConfigDto {
  name: string;
  currency: string;
  reservationMinutes: number;
  paymentInstructions: string | null;
  receivingAccounts: ReceivingAccount[];
  couriers: { id: string; name: string }[];
  loyalty: StoreLoyaltyDto;
}

/** ກົດແຕ້ມສະສົມທີ່ເວັບສະແດງ; ລະບົບແຕ້ມປິດ = { enabled: false } ເທົ່ານັ້ນ (ເວັບບໍ່ສະແດງຫຍັງກ່ຽວກັບແຕ້ມ) */
export type StoreLoyaltyDto =
  | { enabled: false }
  | {
      enabled: true;
      /** ຍອດຊື້ (ກີບ) ຕໍ່ 1 ແຕ້ມ ເຊັ່ນ "10000.00" */
      earnPer: string;
      /** ມູນຄ່າ 1 ແຕ້ມຕອນແລກ (ກີບ) ເຊັ່ນ "100.00" */
      pointValue: string;
      /** ສ່ວນຫຼຸດຈາກແຕ້ມບໍ່ເກີນ % ນີ້ຂອງຍອດສິນຄ້າ (ຫຼັງໂຄດ) */
      maxRedeemPercent: number;
      /** BRONZE → PLATINUM; minSpend = ຍອດຊື້ 12 ເດືອນຂັ້ນຕ່ຳ, multiplier = ຕົວຄູນແຕ້ມ ເຊັ່ນ "1.25" */
      tiers: { tier: MemberTier; minSpend: string; multiplier: string }[];
    };

function toStoreLoyalty(config: LoyaltyConfig): StoreLoyaltyDto {
  if (!config.enabled) return { enabled: false };
  return {
    enabled: true,
    earnPer: config.earnPer,
    pointValue: config.pointValue,
    maxRedeemPercent: config.maxRedeemPercent,
    tiers: config.tierRules.map((rule) => ({ tier: rule.tier, minSpend: money(new Prisma.Decimal(rule.minSpend)), multiplier: rule.multiplier })),
  };
}

export interface StoreCategoryDto {
  name: string;
  slug: string;
  parentSlug: string | null;
}

export type StoreCartLineDto =
  | { variantId: string; quantity: number; unavailable: true }
  | {
      variantId: string;
      quantity: number;
      unavailable: false;
      productName: string;
      productSlug: string;
      variantName: string | null;
      imageUrl: string | null;
      unitPrice: string;
      lineTotal: string;
      stock: StoreStock;
      /** ສະຕ໋ອກທີ່ຂາຍໄດ້ ໜ້ອຍກວ່າຈຳນວນທີ່ຂໍ */
      insufficient: boolean;
    };

export interface StoreCartDto {
  items: StoreCartLineDto[];
  /** ໂຄດທີ່ໃຊ້ໄດ້ ແລະ ຍອດທີ່ຫຼຸດ (ຫັກອອກຈາກ subtotal/total ແລ້ວ); null = ບໍ່ໄດ້ໃສ່ ຫຼື ໃຊ້ບໍ່ໄດ້ */
  coupon: { code: string; discount: string } | null;
  /** ເຫດຜົນທີ່ໂຄດທີ່ໃສ່ມາໃຊ້ບໍ່ໄດ້ (ຍອດບໍ່ຖືກຫຼຸດ) */
  couponError: { reason: CouponRejectReason; minSubtotal?: string } | null;
  /**
   * ແຕ້ມຂອງສະມາຊິກ (ລະບົບແຕ້ມເປີດ ແລະ ສົ່ງ session ມາ); null = guest ຫຼື ລະບົບປິດ.
   * maxPoints = ແຕ້ມສູງສຸດທີ່ໃຊ້ໄດ້ໃນກະຕ່ານີ້ (ຫຼັງໂຄດ); redeemed/discount = ແຕ້ມທີ່ຂໍ ແລະ ສ່ວນຫຼຸດ (ຫັກອອກຈາກ subtotal/total ແລ້ວ)
   */
  points: { balance: number; maxPoints: number; redeemed: number; discount: string } | null;
  /** ເຫດຜົນທີ່ແຕ້ມທີ່ຂໍໃຊ້ບໍ່ໄດ້ (redeemed 0, ຍອດບໍ່ຖືກຫຼຸດດ້ວຍແຕ້ມ) */
  pointsError: { reason: PointsRejectReason; balance?: number; maxPoints?: number } | null;
  subtotal: string;
  vatAmount: string;
  /** ຍອດທີ່ເວັບຕ້ອງສົ່ງຄືນເປັນ expectedTotal ຕອນສັ່ງ (ຄິດສະເພາະລາຍການທີ່ຂາຍໄດ້) */
  total: string;
  orderable: boolean;
}

/** ສ່ວນອ່ານຂອງໜ້າຮ້ານສາທາລະນະ: ຕັ້ງຄ່າ, ໝວດໝູ່, ສິນຄ້າ, ກວດກະຕ່າ */
@Injectable()
export class StoreCatalogService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async config(): Promise<StoreConfigDto> {
    const settings = await ensureStoreSetting(this.prisma);
    const couriers = await this.prisma.courier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const accounts = receivingAccountsSchema.safeParse(settings.receivingAccounts);
    return {
      name: settings.name,
      currency: settings.baseCurrency,
      reservationMinutes: settings.reservationMinutes,
      paymentInstructions: settings.paymentInstructions,
      receivingAccounts: accounts.success ? accounts.data : [],
      couriers,
      loyalty: toStoreLoyalty(loyaltyConfigOf(settings)),
    };
  }

  async categories(): Promise<StoreCategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { products: { some: SELLABLE_PRODUCT } },
      select: { name: true, slug: true, parent: { select: { slug: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    const listed = new Set(rows.map((row) => row.slug));
    return rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      parentSlug: row.parent && listed.has(row.parent.slug) ? row.parent.slug : null,
    }));
  }

  async products(query: StoreProductListQuery): Promise<Page<StoreProductListItemDto>> {
    const warehouseId = await this.defaultWarehouseId();
    const where: Prisma.ProductWhereInput = {
      ...SELLABLE_PRODUCT,
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: storeProductListInclude(warehouseId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, STORE_PAGE_SIZE),
      }),
      this.prisma.product.count({ where }),
    ]);
    const flashPrices = await activeFlashPrices(
      this.prisma,
      rows.flatMap((row) => row.variants.map((variant) => variant.id)),
    );
    return toPage(
      rows.map((row) => toStoreProductListItem(row, flashPrices)),
      total,
      query.page,
      STORE_PAGE_SIZE,
    );
  }

  async product(slug: string): Promise<StoreProductDetailDto> {
    const warehouseId = await this.defaultWarehouseId();
    const row = await this.prisma.product.findFirst({
      where: { slug, ...SELLABLE_PRODUCT },
      include: storeProductDetailInclude(warehouseId),
    });
    if (!row) throw apiError("PRODUCT_NOT_FOUND", "Product not found");
    const flashPrices = await activeFlashPrices(
      this.prisma,
      row.variants.map((variant) => variant.id),
    );
    return toStoreProductDetail(row, flashPrices);
  }

  /**
   * ລາຄາ ແລະ ສະຕ໋ອກປັດຈຸບັນຂອງກະຕ່າ. ຍອດໃຊ້ສູດດຽວກັບການສ້າງບິນ (ໂຄດ ແລ້ວແຕ້ມ, ຄ່າສົ່ງ 0).
   * `member` = ສະມາຊິກຂອງ session (null = guest); ຜູ້ເອີ້ນບັງຄັບ session ເມື່ອມີ pointsToRedeem.
   */
  async cartCheck(input: StoreCartCheckInput, member: StoreMemberRow | null): Promise<StoreCartDto> {
    const warehouseId = await this.defaultWarehouseId();
    const settings = await ensureStoreSetting(this.prisma);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: input.items.map((item) => item.variantId) } },
      include: {
        product: {
          select: {
            name: true,
            slug: true,
            status: true,
            images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
          },
        },
        stockLevels: stockLevelsOf(warehouseId),
      },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const flashPrices = await activeFlashPrices(
      this.prisma,
      variants.map((variant) => variant.id),
    );

    const items = input.items.map((item): StoreCartLineDto => {
      const variant = variantById.get(item.variantId);
      if (!variant || !variant.isActive || variant.product.status !== "ACTIVE") {
        return { variantId: item.variantId, quantity: item.quantity, unavailable: true };
      }
      const available = availableOf(variant.stockLevels);
      const { price } = effectivePrice(variant.price, flashPrices.get(variant.id));
      return {
        variantId: variant.id,
        quantity: item.quantity,
        unavailable: false,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        variantName: variant.name,
        imageUrl: variant.product.images[0]?.url ?? null,
        unitPrice: money(price),
        lineTotal: money(price.mul(item.quantity)),
        stock: storeStock(available),
        insufficient: available < item.quantity,
      };
    });

    const totalsInput = {
      lines: items.flatMap((line) =>
        line.unavailable ? [] : [{ unitPrice: line.unitPrice, quantity: line.quantity, discount: "0" }],
      ),
      shippingFee: "0",
      vatRate: settings.vatRate.toString(),
      pricesIncludeVat: settings.pricesIncludeVat,
    };
    let totals = calculateOrderTotals(totalsInput);
    let coupon: StoreCartDto["coupon"] = null;
    let couponError: StoreCartDto["couponError"] = null;
    if (input.couponCode !== undefined) {
      try {
        // ຍັງບໍ່ຮູ້ເບີລູກຄ້າ: limit ຕໍ່ເບີຖືກກວດຕອນສັ່ງ
        if (!COUPON_CODE_PATTERN.test(input.couponCode)) throw new CouponRejectedError("NOT_FOUND");
        const result = await evaluateCoupon(this.prisma, { code: input.couponCode, merchandiseSubtotal: totals.subtotal });
        coupon = { code: result.code, discount: result.discount };
        totals = calculateOrderTotals({ ...totalsInput, orderDiscount: result.discount });
      } catch (error) {
        if (!(error instanceof CouponRejectedError)) throw error;
        couponError = { reason: error.reason, ...error.detail };
      }
    }

    // ແຕ້ມ: ຊ້ອນຫຼັງໂຄດຄືກັບການສ້າງບິນ (ສ່ວນຫຼຸດລວມ = ໂຄດ + ແຕ້ມ)
    const loyalty = loyaltyConfigOf(settings);
    let points: StoreCartDto["points"] = null;
    let pointsError: StoreCartDto["pointsError"] = null;
    if (!loyalty.enabled) {
      if (input.pointsToRedeem !== undefined) pointsError = { reason: "DISABLED" };
    } else if (member) {
      const merchandise = totals.subtotal;
      const balance = member.pointsBalance;
      const maxPoints = maxRedeemablePoints({ merchandise, balance, pointValue: loyalty.pointValue, maxPercent: loyalty.maxRedeemPercent });
      points = { balance, maxPoints, redeemed: 0, discount: "0.00" };
      const requested = input.pointsToRedeem;
      if (requested !== undefined) {
        try {
          // ກົດດຽວກັບການສ້າງບິນ (ລັອກແຖວລູກຄ້າແປບດຽວ ບໍ່ຫັກແຕ້ມ)
          const redemption = await this.prisma.$transaction((tx) =>
            evaluateRedemption(tx, loyalty, { customerId: member.id, points: requested, merchandise }),
          );
          points = { ...points, redeemed: redemption.points, discount: redemption.discount };
          const orderDiscount = new Prisma.Decimal(coupon?.discount ?? 0).plus(redemption.discount).toFixed(2);
          totals = calculateOrderTotals({ ...totalsInput, orderDiscount });
        } catch (error) {
          if (!(error instanceof PointsRejectedError)) throw error;
          pointsError = { reason: error.reason, ...error.detail };
        }
      }
    }
    return {
      items,
      coupon,
      couponError,
      points,
      pointsError,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
      orderable: items.every((line) => !line.unavailable && !line.insufficient),
    };
  }

  private async defaultWarehouseId(): Promise<string | null> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    return warehouse?.id ?? null;
  }
}

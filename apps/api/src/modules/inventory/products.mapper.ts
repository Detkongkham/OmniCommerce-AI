import { Prisma } from "@oca/database";
import { money, moneyOrNull } from "../../common/money";

export const productDetailInclude = {
  options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
  variants: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { optionValues: true, stockLevels: true } },
  images: { orderBy: { position: "asc" } },
} as const satisfies Prisma.ProductInclude;

export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export const productListInclude = {
  category: { select: { id: true, name: true } },
  images: { orderBy: { position: "asc" }, take: 1 },
  variants: { select: { price: true, stockLevels: { select: { onHand: true, reserved: true } } } },
} as const satisfies Prisma.ProductInclude;

export type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  variantCount: number;
  priceMin: string | null;
  priceMax: string | null;
  availableTotal: number;
}

export function toProductListItem(row: ProductListRow): ProductListItemDto {
  const prices = row.variants.map((variant) => variant.price);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    category: row.category,
    imageUrl: row.images[0]?.url ?? null,
    variantCount: row.variants.length,
    priceMin: prices.length > 0 ? money(Prisma.Decimal.min(...prices)) : null,
    priceMax: prices.length > 0 ? money(Prisma.Decimal.max(...prices)) : null,
    availableTotal: row.variants.reduce(
      (sum, variant) => sum + variant.stockLevels.reduce((inner, level) => inner + (level.onHand - level.reserved), 0),
      0,
    ),
  };
}

export interface VariantDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  costPrice: string;
  weightGrams: number | null;
  isActive: boolean;
  optionValues: Record<string, string>;
  stock: { warehouseId: string; onHand: number; reserved: number; available: number }[];
}

export interface ProductDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  categoryId: string | null;
  options: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[];
  variants: VariantDto[];
  images: { id: string; url: string; alt: string | null; position: number; variantId: string | null }[];
}

export function toProductDetail(row: ProductDetailRow): ProductDetailDto {
  const optionNameById = new Map(row.options.map((option) => [option.id, option.name]));
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    categoryId: row.categoryId,
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({ id: value.id, value: value.value, position: value.position })),
    })),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      name: variant.name,
      price: money(variant.price),
      compareAtPrice: moneyOrNull(variant.compareAtPrice),
      costPrice: money(variant.costPrice),
      weightGrams: variant.weightGrams,
      isActive: variant.isActive,
      optionValues: Object.fromEntries(
        variant.optionValues.map((value) => [optionNameById.get(value.optionId) ?? value.optionId, value.value]),
      ),
      stock: variant.stockLevels.map((level) => ({
        warehouseId: level.warehouseId,
        onHand: level.onHand,
        reserved: level.reserved,
        available: level.onHand - level.reserved,
      })),
    })),
    images: row.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      position: image.position,
      variantId: image.variantId,
    })),
  };
}

/** snapshot ສຳລັບ AuditLog (ບໍ່ມີ Date/Decimal). */
export function productSnapshot(row: ProductDetailRow): Prisma.InputJsonObject {
  return {
    name: row.name,
    slug: row.slug,
    status: row.status,
    categoryId: row.categoryId,
    variantSkus: row.variants.map((variant) => variant.sku),
  };
}

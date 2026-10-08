import { Decimal } from "decimal.js";
import { z } from "zod";
import { STORE_UTC_OFFSET } from "../constants";
import { SLUG_PATTERN } from "../slug";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PACKING",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export const SALES_CHANNELS = ["STOREFRONT", "FACEBOOK", "INSTAGRAM", "TIKTOK", "LINE", "OFFLINE"] as const;
export const STOCK_MOVEMENT_TYPES = [
  "RECEIVE",
  "ADJUST",
  "RESERVE",
  "RELEASE",
  "SHIP",
  "RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const MAX_RESERVATION_MINUTES = 10080;

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);
const text = (max: number) => z.string().trim().min(1).max(max);

/** ຈຳນວນເງິນເປັນ string: ບວກ, ສູງສຸດ 2 ທົດສະນິຍົມ. */
export const moneySchema = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");

export const quantitySchema = z.number().int().min(1).max(1_000_000);

export const deltaSchema = z
  .number()
  .int()
  .min(-1_000_000)
  .max(1_000_000)
  .refine((value) => value !== 0, "delta ຕ້ອງບໍ່ເປັນ 0");

export const slugSchema = z
  .string()
  .trim()
  .max(100)
  .regex(SLUG_PATTERN, "slug ໃຊ້ໄດ້ສະເພາະ a-z 0-9 ແລະ - ຄັ່ນ");

/** ອັດຕາ VAT ເປັນ string ("7" ຫຼື "7.00") ຄືກັບຈຳນວນເງິນ; 0–100, ≤2 ທົດສະນິຍົມ. API ຕອບກັບເປັນ "7.00". */
export const vatRateSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "ອັດຕາ VAT ບໍ່ຖືກຕ້ອງ")
  .refine((value) => Number(value) <= 100, "ອັດຕາ VAT ຕ້ອງບໍ່ເກີນ 100");

const reservationMinutesSchema = z.number().int().min(1).max(MAX_RESERVATION_MINUTES);

const requireNonEmpty = <T extends object>(value: T) => Object.keys(value).length > 0;
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";

// ບໍ່ໃຊ້ `URL` ເພາະ tsconfig ຂອງ package ນີ້ບໍ່ມີ DOM/Node lib
// ປະຕິເສດ control/whitespace/ຕົວອັກສອນເບິ່ງບໍ່ເຫັນ ແລະ ຕ້ອງມີ host ທີ່ຂຶ້ນຕົ້ນດ້ວຍ ຕົວອັກສອນ/ຕົວເລກ
// eslint-disable-next-line no-control-regex
const FORBIDDEN_URL_CHARS = /[\u0000-\u0020\u007f-\u009f\u2028\u2029\u200b-\u200f\ufeff]/;
const isHttpUrl = (value: string): boolean =>
  !FORBIDDEN_URL_CHARS.test(value) && /^https?:\/\/[A-Za-z0-9][^/?#]*(?:[/?#]\S*)?$/i.test(value);
const imageUrlSchema = z.string().trim().max(2048).refine(isHttpUrl, "URL ຕ້ອງເປັນ http ຫຼື https");

// ---------------------------------------------------------------------------
// pagination + query
// ---------------------------------------------------------------------------
const pageShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const boolQuery = z.enum(["true", "false"]).transform((value) => value === "true");

/** ວັນທີ date-only (`2026-10-05`) ຖືເປັນເວລາຂອງຮ້ານ (ລາວ, UTC+7); ມີເວລາມາດ້ວຍກໍໃຊ້ຕາມທີ່ສົ່ງ. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateBound(edge: "from" | "to") {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      const dateOnly = DATE_ONLY.test(value);
      const parsed = new Date(dateOnly ? `${value}T00:00:00.000${STORE_UTC_OFFSET}` : value);
      // ວັນທີທີ່ເປັນໄປບໍ່ໄດ້ (2026-02-30) ບາງ engine ເລື່ອນເປັນມື້ອື່ນ -> ກວດວ່າແປງກັບຄືນໄດ້ຄືເກົ່າ
      const valid =
        !Number.isNaN(parsed.getTime()) &&
        (!dateOnly || new Date(parsed.getTime() + 7 * 60 * 60 * 1000).toISOString().startsWith(value));
      if (!valid) {
        ctx.addIssue({ code: "custom", message: "Invalid date" });
        return z.NEVER;
      }
      // `to` ເປັນຂອບເທິງແບບ exclusive: date-only = ຕົ້ນມື້ຖັດໄປ ເພື່ອໃຫ້ມື້ສຸດທ້າຍຮວມຢູ່ນຳ
      return dateOnly && edge === "to" ? new Date(parsed.getTime() + DAY_MS) : parsed;
    })
    .optional();
}
const optionalText = z.string().trim().max(100).optional();

export const productListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: idSchema.optional(),
});

export const stockListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  warehouseId: idSchema.optional(),
  variantId: idSchema.optional(),
  lowStock: boolQuery.optional(),
});

export const stockMovementQuerySchema = z.object({
  ...pageShape,
  variantId: idSchema.optional(),
  warehouseId: idSchema.optional(),
  orderId: idSchema.optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  from: dateBound("from"),
  to: dateBound("to"),
});

export const orderListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  status: z.enum(ORDER_STATUSES).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
  conversationId: idSchema.optional(),
  from: dateBound("from"),
  to: dateBound("to"),
});

/** ຄົ້ນຫາ variant ສຳລັບ /orders/new ແລະ ຮັບສະຕ໋ອກຄັ້ງທຳອິດ. ຄ່າເລີ່ມຕົ້ນ: ສະເພາະ variant/ສິນຄ້າທີ່ ACTIVE. */
export const variantSearchQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  includeInactive: boolQuery.optional(),
});

export const customerListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
});

export type VariantSearchQuery = z.infer<typeof variantSearchQuerySchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

// ---------------------------------------------------------------------------
// category
// ---------------------------------------------------------------------------
export const createCategorySchema = z.strictObject({
  name: text(100),
  slug: slugSchema.optional(),
  parentId: idSchema.nullable().optional(),
  position: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z
  .strictObject({
    name: text(100).optional(),
    slug: slugSchema.optional(),
    parentId: idSchema.nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ---------------------------------------------------------------------------
// product / variant / images
// ---------------------------------------------------------------------------
const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "SKU ໃຊ້ໄດ້ສະເພາະ A-Z a-z 0-9 . _ -");
const barcodeSchema = z.string().trim().min(1).max(64);
const weightSchema = z.number().int().min(0).max(1_000_000);

const compareAtMessage = { message: "compareAtPrice ຕ້ອງ >= price", path: ["compareAtPrice"] };
// ບໍ່ throw ເມື່ອເງິນຜິດຮູບແບບ (moneySchema ລາຍງານ issue ນັ້ນແລ້ວ)
const compareAtOk = (value: { price: string; compareAtPrice?: string | null }) =>
  value.compareAtPrice == null ||
  !moneySchema.safeParse(value.price).success ||
  !moneySchema.safeParse(value.compareAtPrice).success ||
  new Decimal(value.compareAtPrice).gte(value.price);

export const productOptionInputSchema = z.strictObject({
  name: text(50),
  values: z.array(text(30)).min(1).max(50),
});

export const variantInputSchema = z
  .strictObject({
    sku: skuSchema,
    barcode: barcodeSchema.nullable().optional(),
    price: moneySchema,
    compareAtPrice: moneySchema.nullable().optional(),
    costPrice: moneySchema.default("0"),
    weightGrams: weightSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    /** { [ຊື່ option]: ຄ່າ } */
    optionValues: z.record(z.string(), z.string()).default({}),
  })
  .refine(compareAtOk, compareAtMessage);

// ໝາຍເຫດ: compareAtPrice >= price ທຽບກັບຄ່າທີ່ເກັບໄວ້ ຕ້ອງກວດໃນ service
export const updateVariantSchema = z
  .strictObject({
    sku: skuSchema.optional(),
    barcode: barcodeSchema.nullable().optional(),
    price: moneySchema.optional(),
    compareAtPrice: moneySchema.nullable().optional(),
    costPrice: moneySchema.optional(),
    weightGrams: weightSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const productImageInputSchema = z.strictObject({
  url: imageUrlSchema,
  alt: z.string().trim().max(200).optional(),
  /** ໃຊ້ຕອນສ້າງສິນຄ້າ (ອ້າງ variant ຜ່ານ SKU ເພາະ id ຍັງບໍ່ມີ) */
  variantSku: skuSchema.optional(),
});

export const putProductImagesSchema = z.strictObject({
  images: z
    .array(
      z.strictObject({
        url: imageUrlSchema,
        alt: z.string().trim().max(200).optional(),
        variantId: idSchema.optional(),
      }),
    )
    .max(20),
});

export const createProductSchema = z
  .strictObject({
    name: text(200),
    slug: slugSchema.optional(),
    description: z.string().trim().max(10_000).optional(),
    status: z.enum(PRODUCT_STATUSES).default("DRAFT"),
    categoryId: idSchema.nullable().optional(),
    options: z.array(productOptionInputSchema).max(3).default([]),
    variants: z.array(variantInputSchema).min(1).max(100),
    images: z.array(productImageInputSchema).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const optionNames = value.options.map((option) => option.name);
    if (new Set(optionNames).size !== optionNames.length) issue(["options"], "ຊື່ option ຊ້ຳກັນ");
    value.options.forEach((option, index) => {
      if (new Set(option.values).size !== option.values.length) {
        issue(["options", index, "values"], "ຄ່າຂອງ option ຊ້ຳກັນ");
      }
    });

    if (value.options.length === 0) {
      if (value.variants.length !== 1) issue(["variants"], "ສິນຄ້າທີ່ບໍ່ມີ option ຕ້ອງມີ 1 variant");
      value.variants.forEach((variant, index) => {
        if (Object.keys(variant.optionValues).length > 0) {
          issue(["variants", index, "optionValues"], "ສິນຄ້ານີ້ບໍ່ມີ option");
        }
      });
    } else {
      const seen = new Set<string>();
      value.variants.forEach((variant, index) => {
        const path = ["variants", index, "optionValues"];
        const keys = Object.keys(variant.optionValues);
        const complete = keys.length === optionNames.length && optionNames.every((name) => Object.hasOwn(variant.optionValues, name));
        if (!complete) {
          issue(path, "ຕ້ອງລະບຸຄ່າຂອງທຸກ option");
          return;
        }
        for (const option of value.options) {
          if (!option.values.includes(variant.optionValues[option.name] ?? "")) {
            issue(path, `ຄ່າຂອງ ${option.name} ບໍ່ຢູ່ໃນລາຍການ`);
          }
        }
        const combo = JSON.stringify(value.options.map((option) => variant.optionValues[option.name]));
        if (seen.has(combo)) issue(path, "ຊຸດຄ່າ option ຊ້ຳກັນ");
        seen.add(combo);
      });
    }

    const skus = value.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) issue(["variants"], "SKU ຊ້ຳກັນ");
    const barcodes = value.variants.flatMap((variant) => (variant.barcode ? [variant.barcode] : []));
    if (new Set(barcodes).size !== barcodes.length) issue(["variants"], "barcode ຊ້ຳກັນ");

    value.images.forEach((image, index) => {
      if (image.variantSku !== undefined && !skus.includes(image.variantSku)) {
        issue(["images", index, "variantSku"], "ບໍ່ພົບ SKU ນີ້ໃນ variants");
      }
    });
  });

export const updateProductSchema = z
  .strictObject({
    name: text(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    categoryId: idSchema.nullable().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type PutProductImagesInput = z.infer<typeof putProductImagesSchema>;

/** ຕ້ອງມີຄ່າຂອງທຸກ option (schema ຮັບປະກັນແລ້ວ). ຊື່ variant = ຄ່າຕາມລຳດັບ option ຕໍ່ດ້ວຍ " / "; null ຖ້າບໍ່ມີ option. */
export function variantName(optionNames: readonly string[], optionValues: Record<string, string>): string | null {
  const name = optionNames.map((optionName) => optionValues[optionName] ?? "").join(" / ");
  return name === "" ? null : name;
}

// ---------------------------------------------------------------------------
// warehouse
// ---------------------------------------------------------------------------
const warehouseCodeSchema = z.string().regex(/^[A-Z0-9_-]{1,20}$/, "code ໃຊ້ A-Z 0-9 _ - (ສູງສຸດ 20)");

export const createWarehouseSchema = z.strictObject({
  code: warehouseCodeSchema,
  name: text(100),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().default(true),
});

export const updateWarehouseSchema = z
  .strictObject({
    code: warehouseCodeSchema.optional(),
    name: text(100).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

// ---------------------------------------------------------------------------
// stock operations
// ---------------------------------------------------------------------------
const noteSchema = z.string().trim().min(1).max(200);

export const receiveStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  quantity: quantitySchema,
  note: noteSchema.optional(),
});

export const adjustStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  delta: deltaSchema,
  note: noteSchema,
});

export const transferStockSchema = z
  .strictObject({
    variantId: idSchema,
    fromWarehouseId: idSchema,
    toWarehouseId: idSchema,
    quantity: quantitySchema,
    note: noteSchema.optional(),
  })
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
    message: "ສາງຕົ້ນທາງແລະປາຍທາງຕ້ອງຕ່າງກັນ",
    path: ["toWarehouseId"],
  });

export const returnStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  quantity: quantitySchema,
  orderId: idSchema.optional(),
  note: noteSchema.optional(),
});

export const stockThresholdSchema = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(1_000_000).nullable(),
});

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type ReturnStockInput = z.infer<typeof returnStockSchema>;
export type StockThresholdInput = z.infer<typeof stockThresholdSchema>;

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------
export const orderItemInputSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema.optional(),
  quantity: quantitySchema,
  discount: moneySchema.default("0"),
});

export const orderCustomerInputSchema = z.strictObject({
  name: text(100),
  phone: z.string().regex(/^\+?[0-9]{6,15}$/, "ເບີໂທບໍ່ຖືກຕ້ອງ"),
  email: z.string().trim().email().max(200).optional(),
});

export const createOrderSchema = z
  .strictObject({
    customerId: idSchema.optional(),
    customer: orderCustomerInputSchema.optional(),
    /** ບິນທີ່ເປີດຈາກແຊັດ: server ຕັ້ງ channel ຕາມເຄສ + source=CHAT (ບໍ່ຮັບ channel/source ຈາກ client) */
    conversationId: idSchema.optional(),
    items: z.array(orderItemInputSchema).min(1).max(100),
    shippingFee: moneySchema.default("0"),
    shippingName: z.string().trim().max(100).optional(),
    shippingPhone: z.string().trim().max(30).optional(),
    shippingAddress: z.string().trim().max(300).optional(),
    note: z.string().trim().max(500).optional(),
    reservationMinutes: reservationMinutesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.customerId !== undefined && value.customer !== undefined) {
      ctx.addIssue({ code: "custom", path: ["customer"], message: "ໃຊ້ customerId ຫຼື customer ຢ່າງໃດຢ່າງໜຶ່ງ" });
    }
    const keys = value.items.map((item) => `${item.variantId}|${item.warehouseId ?? ""}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "ມີລາຍການ (variant, ສາງ) ຊ້ຳກັນ" });
    }
  });

export const cancelOrderSchema = z.strictObject({
  reason: z.string().trim().max(200).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// ---------------------------------------------------------------------------
// store settings
// ---------------------------------------------------------------------------
export const updateStoreSettingsSchema = z
  .strictObject({
    name: text(100).optional(),
    vatRate: vatRateSchema.optional(),
    pricesIncludeVat: z.boolean().optional(),
    reservationMinutes: reservationMinutesSchema.optional(),
    // transform ຢູ່ກ່ອນ nullable/optional: ໃຫ້ key ຍັງເປັນ optional ໃນ type ຂາອອກ (ວ່າງ = null)
    paymentInstructions: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

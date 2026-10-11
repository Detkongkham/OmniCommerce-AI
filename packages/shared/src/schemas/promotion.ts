import { Decimal } from "decimal.js";
import { z } from "zod";
import { moneySchema } from "./inventory";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const COUPON_TYPES = ["PERCENT", "FIXED"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** ເຫດຜົນທີ່ໂຄດໃຊ້ບໍ່ໄດ້ (ຢູ່ໃນ body ຂອງ 409 COUPON_INVALID) */
export const COUPON_REJECT_REASONS = [
  "NOT_FOUND",
  "INACTIVE",
  "NOT_STARTED",
  "EXPIRED",
  "MIN_SUBTOTAL",
  "USAGE_LIMIT",
  "PHONE_LIMIT",
  "PHONE_REQUIRED",
] as const;
export type CouponRejectReason = (typeof COUPON_REJECT_REASONS)[number];

const requireNonEmpty = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;

/** ລະຫັດໂຄດ: trim + ຕົວພິມໃຫຍ່ (ລູກຄ້າພິມ new10 = NEW10) */
export const couponCodeSchema = z.string().trim().toUpperCase().regex(COUPON_CODE_PATTERN, "ລະຫັດຕ້ອງເປັນ A-Z 0-9 _ - ຍາວ 3–30 ຕົວ");

const positiveMoney = moneySchema.refine((value) => new Decimal(value).greaterThan(0), "ຕ້ອງຫຼາຍກວ່າ 0");
const limitSchema = z.number().int().min(1).max(1_000_000);
const noteSchema = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : value));

/** ກົດຂ້າມ field ຂອງໂຄດ (ໃຊ້ທັງຕອນສ້າງ ແລະ ຕອນ API ລວມຄ່າເກົ່າ+ໃໝ່ກ່ອນແກ້) */
export function couponRuleIssues(coupon: {
  type: CouponType;
  value: string;
  maxDiscount?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const value = new Decimal(coupon.value);
  if (coupon.type === "PERCENT") {
    if (!value.isInteger() || value.lessThan(1) || value.greaterThan(100)) {
      issues.push({ path: "value", message: "ເປີເຊັນຕ້ອງເປັນຈຳນວນເຕັມ 1–100" });
    }
  } else if (coupon.maxDiscount != null) {
    issues.push({ path: "maxDiscount", message: "ເພດານສ່ວນຫຼຸດໃຊ້ໄດ້ສະເພາະໂຄດແບບເປີເຊັນ" });
  }
  if (coupon.startsAt && coupon.endsAt && coupon.endsAt.getTime() <= coupon.startsAt.getTime()) {
    issues.push({ path: "endsAt", message: "ວັນໝົດອາຍຸຕ້ອງຢູ່ຫຼັງວັນເລີ່ມ" });
  }
  return issues;
}

export const createCouponSchema = z
  .strictObject({
    code: couponCodeSchema,
    type: z.enum(COUPON_TYPES),
    value: positiveMoney,
    maxDiscount: positiveMoney.nullable().optional(),
    minSubtotal: moneySchema.default("0"),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: limitSchema.nullable().optional(),
    perPhoneLimit: limitSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    note: noteSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    for (const issue of couponRuleIssues(value)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  });

/** ກົດຂ້າມ field ກວດໃນ API ຫຼັງລວມກັບຄ່າເດີມ */
export const updateCouponSchema = z
  .strictObject({
    code: couponCodeSchema.optional(),
    type: z.enum(COUPON_TYPES).optional(),
    value: positiveMoney.optional(),
    maxDiscount: positiveMoney.nullable().optional(),
    minSubtotal: moneySchema.optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: limitSchema.nullable().optional(),
    perPhoneLimit: limitSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    note: noteSchema.nullable().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

/** ລອງໂຄດກັບຍອດຄ່າສິນຄ້າ (ຟອມເປີດບິນຂອງ admin) */
export const couponPreviewSchema = z.strictObject({
  code: couponCodeSchema,
  subtotal: moneySchema,
  phone: z.string().regex(/^\+?[0-9]{6,15}$/).optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CouponPreviewInput = z.infer<typeof couponPreviewSchema>;

/**
 * ສ່ວນຫຼຸດຂອງໂຄດຕໍ່ຍອດຄ່າສິນຄ້າ (ຜົນລວມລາຍການຫຼັງສ່ວນຫຼຸດລາຍການ).
 * PERCENT ປັດລົງເປັນໜ່ວຍເຕັມ (ຍອດໂອນບໍ່ມີເສດ) ແລ້ວບີບດ້ວຍ maxDiscount; ບໍ່ເກີນຍອດຄ່າສິນຄ້າສະເໝີ.
 */
export function computeCouponDiscount(
  coupon: { type: CouponType; value: string; maxDiscount: string | null },
  merchandiseSubtotal: string,
): string {
  const subtotal = new Decimal(merchandiseSubtotal);
  let discount = coupon.type === "PERCENT" ? subtotal.mul(coupon.value).div(100).floor() : new Decimal(coupon.value);
  if (coupon.type === "PERCENT" && coupon.maxDiscount !== null) discount = Decimal.min(discount, coupon.maxDiscount);
  return Decimal.min(discount, subtotal).toFixed(2);
}

// ---------------------------------------------------------------------------
// Flash Sale
// ---------------------------------------------------------------------------
export const FLASH_SALE_MAX_ITEMS = 200;

const flashSaleItemSchema = z.strictObject({
  variantId: z.string().min(1).max(64),
  salePrice: positiveMoney,
});

const flashSaleItemsSchema = z
  .array(flashSaleItemSchema)
  .min(1)
  .max(FLASH_SALE_MAX_ITEMS)
  .refine((items) => new Set(items.map((item) => item.variantId)).size === items.length, "ມີສິນຄ້າຊ້ຳກັນ");

const flashSaleNameSchema = z.string().trim().min(1).max(100);

export const createFlashSaleSchema = z
  .strictObject({
    name: flashSaleNameSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().default(true),
    items: flashSaleItemsSchema,
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), { path: ["endsAt"], message: "endsAt must be after startsAt" });

/** `items` (ຖ້າສົ່ງ) ແທນລາຍການທັງໝົດ; ເວລາກວດໃນ API ຫຼັງລວມກັບຄ່າເດີມ */
export const updateFlashSaleSchema = z
  .strictObject({
    name: flashSaleNameSchema.optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
    items: flashSaleItemsSchema.optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateFlashSaleInput = z.infer<typeof createFlashSaleSchema>;
export type UpdateFlashSaleInput = z.infer<typeof updateFlashSaleSchema>;

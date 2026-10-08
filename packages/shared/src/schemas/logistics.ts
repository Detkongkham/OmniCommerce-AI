import { z } from "zod";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const SHIPMENT_NOTIFY_STATUSES = ["NONE", "SENT", "FAILED", "MANUAL"] as const;
export type ShipmentNotifyStatus = (typeof SHIPMENT_NOTIFY_STATUSES)[number];

/** ສະຖານະບິນທີ່ຢູ່ໃນລາຍການລໍແພັກ */
export const FULFILLMENT_STATUSES = ["PAID", "PACKING"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

const idSchema = z.string().min(1);
const requireNonEmpty = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";
/** ຂໍ້ຄວາມ trim; ວ່າງ = null (ລ້າງຄ່າ) */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

// ---------------------------------------------------------------------------
// Courier
// ---------------------------------------------------------------------------
const courierCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,20}$/, "ລະຫັດຕ້ອງເປັນ A-Z 0-9 _ - ບໍ່ເກີນ 20 ຕົວ");

/** https ແລະ ມີ {tracking} (ບ່ອນໃສ່ເລກພັດສະດຸ); ວ່າງ = null */
const trackingUrlTemplateSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || (/^https:\/\/\S+$/.test(value) && value.includes("{tracking}")), "ຕ້ອງເປັນ https ແລະ ມີ {tracking}")
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const createCourierSchema = z.strictObject({
  code: courierCodeSchema,
  name: z.string().trim().min(1).max(100),
  trackingUrlTemplate: trackingUrlTemplateSchema.optional(),
  isActive: z.boolean().default(true),
});

export const updateCourierSchema = z
  .strictObject({
    code: courierCodeSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
    trackingUrlTemplate: trackingUrlTemplateSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------
export const fulfillmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(FULFILLMENT_STATUSES).optional(),
  warehouseId: idSchema.optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

/** ຜົນການຍິງ: code = barcode ຫຼື SKU (ບໍ່ສົນຕົວໃຫຍ່/ນ້ອຍ) */
export const verifyPackSchema = z.strictObject({
  scans: z
    .array(z.strictObject({ code: z.string().trim().min(1).max(100), quantity: z.number().int().min(1).max(10_000) }))
    .min(1)
    .max(500),
});

export const overridePackSchema = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export const updateShippingSchema = z
  .strictObject({
    shippingName: optionalText(100),
    shippingPhone: optionalText(30),
    shippingAddress: optionalText(500),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const shipOrderSchema = z.strictObject({
  courierId: idSchema,
  trackingNumber: z.string().trim().min(1).max(100),
});

/** force = ສົ່ງຊ້ຳເຖິງແມ່ນສົ່ງສຳເລັດແລ້ວ */
export const notifyShipmentSchema = z.strictObject({ force: z.boolean().default(false) });

export type CreateCourierInput = z.infer<typeof createCourierSchema>;
export type UpdateCourierInput = z.infer<typeof updateCourierSchema>;
export type FulfillmentListQuery = z.infer<typeof fulfillmentListQuerySchema>;
export type VerifyPackInput = z.infer<typeof verifyPackSchema>;
export type OverridePackInput = z.infer<typeof overridePackSchema>;
export type UpdateShippingInput = z.infer<typeof updateShippingSchema>;
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
export type NotifyShipmentInput = z.infer<typeof notifyShipmentSchema>;

// ---------------------------------------------------------------------------
// ຂໍ້ຄວາມ/ລິ້ງ tracking (ບໍລິສຸດ; ໃຊ້ທັງ API ແລະ admin)
// ---------------------------------------------------------------------------
export function buildTrackingUrl(template: string | null | undefined, trackingNumber: string): string | null {
  return template ? template.replaceAll("{tracking}", encodeURIComponent(trackingNumber)) : null;
}

export function buildTrackingMessage(input: {
  orderNumber: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string | null;
}): string {
  return [
    `📦 ສົ່ງເຄື່ອງແລ້ວ ບິນ ${input.orderNumber}`,
    `ຂົນສົ່ງ: ${input.courierName}`,
    `ເລກພັດສະດຸ: ${input.trackingNumber}`,
    ...(input.trackingUrl ? [`ຕິດຕາມ: ${input.trackingUrl}`] : []),
    "ຂອບໃຈທີ່ອຸດໜູນ 🙏",
  ].join("\n");
}

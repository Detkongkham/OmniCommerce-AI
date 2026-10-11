import { z } from "zod";
import { SLUG_PATTERN } from "../slug";
import { moneySchema } from "./inventory";

// ---------------------------------------------------------------------------
// ໜ້າຮ້ານສາທາລະນະ (/store/*): ຂອບເຂດທີ່ໃຊ້ຮ່ວມລະຫວ່າງ API ແລະ ເວັບ
// ---------------------------------------------------------------------------
export const STORE_MAX_LINES = 20;
export const STORE_MAX_QUANTITY = 20;
/** ບິນ PENDING_PAYMENT ຈາກເວັບ ຕໍ່ເບີໂທ (ກັນຈອງສະຕ໋ອກຖິ້ມ) */
export const STORE_MAX_OPEN_ORDERS = 2;
/** ສະລິບທີ່ບໍ່ຖືກປະຕິເສດ ຕໍ່ບິນ */
export const STORE_MAX_SLIPS = 3;
/** ສະແດງ "ເຫຼືອ N ອັນ" ເມື່ອຂາຍໄດ້ບໍ່ເກີນຄ່ານີ້ */
export const STORE_LOW_STOCK_THRESHOLD = 5;
export const STORE_PAGE_SIZE = 24;
/** publicToken ຂອງບິນ: base64url ຂອງ 32 byte */
export const STORE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const text = (max: number) => z.string().trim().min(1).max(max);
const idSchema = z.string().min(1).max(64);

const storeItemSchema = z.strictObject({
  variantId: idSchema,
  quantity: z.number().int().min(1).max(STORE_MAX_QUANTITY),
});

const storeItemsSchema = z
  .array(storeItemSchema)
  .min(1)
  .max(STORE_MAX_LINES)
  .refine((items) => new Set(items.map((item) => item.variantId)).size === items.length, "ມີສິນຄ້າຊ້ຳກັນໃນກະຕ່າ");

/** ໂຄດທີ່ລູກຄ້າພິມ: ບໍ່ກວດຮູບແບບທີ່ນີ້ (ຜິດຮູບແບບ = "ບໍ່ພົບໂຄດ" ບໍ່ແມ່ນ 400); ວ່າງ = ບໍ່ໃຊ້ໂຄດ */
const storeCouponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(30)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const storeCartCheckSchema = z.strictObject({ items: storeItemsSchema, couponCode: storeCouponCodeSchema });

/** ລາຄາ/ສ່ວນຫຼຸດ/ຄ່າສົ່ງ ບໍ່ຮັບຈາກ client: server ຄິດເອງ ແລ້ວທຽບກັບ expectedTotal */
export const storeCreateOrderSchema = z.strictObject({
  items: storeItemsSchema,
  name: text(100),
  phone: z.string().regex(/^\+?[0-9]{6,15}$/, "ເບີໂທບໍ່ຖືກຕ້ອງ"),
  address: text(300),
  courierId: idSchema,
  branch: text(200),
  note: z.string().trim().max(500).optional(),
  couponCode: storeCouponCodeSchema,
  expectedTotal: moneySchema,
});

export const storeProductListQuerySchema = z.object({
  category: z.string().trim().max(100).regex(SLUG_PATTERN).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type StoreCartCheckInput = z.infer<typeof storeCartCheckSchema>;
export type StoreCreateOrderInput = z.infer<typeof storeCreateOrderSchema>;
export type StoreProductListQuery = z.infer<typeof storeProductListQuerySchema>;

export type StoreStockStatus = "IN_STOCK" | "LOW" | "OUT";

export interface StoreStock {
  status: StoreStockStatus;
  /** ມີຄ່າສະເພາະ LOW: ບໍ່ເປີດເຜີຍຈຳນວນສະຕ໋ອກເຕັມ */
  remaining: number | null;
}

export function storeStock(available: number): StoreStock {
  if (available <= 0) return { status: "OUT", remaining: null };
  if (available <= STORE_LOW_STOCK_THRESHOLD) return { status: "LOW", remaining: available };
  return { status: "IN_STOCK", remaining: null };
}

/** ສະຖານະສະລິບທີ່ລູກຄ້າເຫັນ (PENDING_READ/READ/READ_FAILED ລວມເປັນ REVIEWING) */
export type StoreSlipStatus = "REVIEWING" | "CONFIRMED" | "REJECTED";

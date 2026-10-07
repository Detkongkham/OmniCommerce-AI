import { z } from "zod";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const SLIP_SOURCES = ["CHAT", "UPLOAD"] as const;
export const SLIP_STATUSES = ["PENDING_READ", "READ", "READ_FAILED", "CONFIRMED", "REJECTED"] as const;
/** flag ທີ່ລະບົບໃສ່ໃຫ້ (ຊ່ວຍຕັດສິນ ບໍ່ບລັອກ). ລຳດັບນີ້ຄືລຳດັບທີ່ເກັບ/ສະແດງ. */
export const SLIP_FLAGS = [
  "AMOUNT_MISMATCH",
  "DUPLICATE_REF",
  "DUPLICATE_IMAGE",
  "DEST_MISMATCH",
  "PAID_BEFORE_ORDER",
  "ORDER_NOT_PAYABLE",
  "UNREADABLE_FIELDS",
] as const;
export const SLIP_CURRENCIES = ["LAK", "THB", "USD"] as const;

export const SLIP_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
/** ຂະໜາດຮູບສູງສຸດ (byte) */
export const SLIP_MAX_BYTES = 8 * 1024 * 1024;

export type SlipSource = (typeof SLIP_SOURCES)[number];
export type SlipStatus = (typeof SLIP_STATUSES)[number];
export type SlipFlag = (typeof SLIP_FLAGS)[number];
export type SlipCurrency = (typeof SLIP_CURRENCIES)[number];

/**
 * ແປງຍອດທີ່ model/ຄົນພິມ ("1,250,000", "₭ 50 000.5") ເປັນ "1250000.00".
 * ຄືນ null ເມື່ອບໍ່ແມ່ນຕົວເລກບວກ ຫຼື ໃຫຍ່ເກີນ Decimal(18,2). ປັດ half-up.
 */
export function normalizeSlipAmount(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.replace(/[\s,₭฿$]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [intPart = "", frac = ""] = cleaned.split(".");
  const intTrimmed = intPart.replace(/^0+(?=\d)/, "");
  if (intTrimmed.length > 16) return null;
  // ປັດ half-up ດ້ວຍ BigInt ເພື່ອບໍ່ເສຍຄວາມແມ່ນຍຳ
  const cents = BigInt(intTrimmed + (frac + "00").slice(0, 2));
  const rounded = (frac[2] ?? "0") >= "5" ? cents + 1n : cents;
  const text = rounded.toString().padStart(3, "0");
  const result = `${text.slice(0, -2)}.${text.slice(-2)}`;
  return text.slice(0, -2).length > 16 ? null : result;
}

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
const trimmed = (max: number) => z.string().trim().min(1).max(max);

const amountField = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizeSlipAmount(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Invalid amount" });
      return z.NEVER;
    }
    return normalized;
  });

/** ບັນຊີຮັບເງິນຂອງຮ້ານ (StoreSetting.receivingAccounts) */
export const receivingAccountSchema = z.object({
  bank: trimmed(50),
  accountNo: trimmed(40).refine((value) => /\d/.test(value), "accountNo must contain digits"),
  accountName: z.string().trim().max(100).optional(),
});
export const receivingAccountsSchema = z.array(receivingAccountSchema).max(20);
export type ReceivingAccount = z.infer<typeof receivingAccountSchema>;

/** ແກ້ຄ່າທີ່ແອດມິນຢືນຢັນ ແລະ/ຫຼື ຜູກສະລິບກັບບິນ. null ລ້າງຄ່າ (ຍົກເວັ້ນ orderId). */
export const patchSlipSchema = z
  .object({
    orderId: z.string().min(1),
    confirmedAmount: amountField.nullable(),
    confirmedCurrency: z.enum(SLIP_CURRENCIES).nullable(),
    confirmedPaidAt: z.coerce.date().nullable(),
    confirmedRefNo: trimmed(100).nullable(),
    confirmedDestAccount: trimmed(100).nullable(),
  })
  .partial()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), "At least one field is required");
export type PatchSlipInput = z.infer<typeof patchSlipSchema>;

export const rejectSlipSchema = z.object({ reason: trimmed(500) });
export type RejectSlipInput = z.infer<typeof rejectSlipSchema>;

/** ຜູກຮູບ attachment ໃນແຊັດກັບບິນ */
export const linkChatSlipSchema = z.object({
  orderId: z.string().min(1),
  attachmentIndex: z.number().int().min(0).max(50),
});
export type LinkChatSlipInput = z.infer<typeof linkChatSlipSchema>;

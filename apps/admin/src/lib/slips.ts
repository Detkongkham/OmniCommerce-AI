import { SLIP_ALLOWED_MIMES, SLIP_FLAGS, SLIP_MAX_BYTES, type SlipFlag, type SlipStatus } from "@oca/shared";
import type { StatusTone } from "@oca/ui";
import type { TranslationKey } from "./i18n/dictionary";
import type { SlipDto } from "./types";

export const SLIP_STATUS_TONE: Record<SlipStatus, StatusTone> = {
  PENDING_READ: "neutral",
  READ: "info",
  READ_FAILED: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
};

/** ຍັງລໍກວດ (ແກ້/ອ່ານໃໝ່/ປະຕິເສດໄດ້) */
export function isOpenSlip(slip: Pick<SlipDto, "status">): boolean {
  return slip.status === "PENDING_READ" || slip.status === "READ" || slip.status === "READ_FAILED";
}

/** ປຸ່ມຢືນຢັນ: ອ່ານແລ້ວ (ຫຼືອ່ານບໍ່ໄດ້ ແຕ່ຕື່ມມື) + ຜູກບິນ + ມີ payments:write */
export function canConfirmSlip(slip: Pick<SlipDto, "status" | "orderId">, canPay: boolean): boolean {
  return canPay && slip.orderId !== null && (slip.status === "READ" || slip.status === "READ_FAILED");
}

/** key ຂໍ້ຄວາມຂອງ flag (ຄົບທຸກ SlipFlag ຕາມ type); flag ໃໝ່ຈາກ API ທີ່ UI ຍັງບໍ່ຮູ້ຈັກ ໃຊ້ຂໍ້ຄວາມທົ່ວໄປ ແທນທີ່ຈະສະແດງ code ດິບ */
const SLIP_FLAG_KEYS = {
  AMOUNT_MISMATCH: "slips.flag.AMOUNT_MISMATCH",
  DUPLICATE_REF: "slips.flag.DUPLICATE_REF",
  DUPLICATE_IMAGE: "slips.flag.DUPLICATE_IMAGE",
  DEST_MISMATCH: "slips.flag.DEST_MISMATCH",
  PAID_BEFORE_ORDER: "slips.flag.PAID_BEFORE_ORDER",
  ORDER_NOT_PAYABLE: "slips.flag.ORDER_NOT_PAYABLE",
  UNREADABLE_FIELDS: "slips.flag.UNREADABLE_FIELDS",
} as const satisfies Record<SlipFlag, TranslationKey>;

export function slipFlagKey(flag: string): TranslationKey {
  return (SLIP_FLAGS as readonly string[]).includes(flag) ? SLIP_FLAG_KEYS[flag as SlipFlag] : "slips.flag.UNKNOWN";
}

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

/** ກວດໄຟລ໌ຝັ່ງ client ກ່ອນສົ່ງ (API ກວດ magic bytes ຊ້ຳ ແລະ ເປັນຜູ້ຕັດສິນ): "type" | "size" | "heic" | null.
 *  gallery ມືຖືບາງເຄື່ອງສົ່ງ type ວ່າງ: ຖ້າ type ວ່າງ ໃຫ້ເດົາຈາກນາມສະກຸນ */
export function validateSlipFile(file: { type: string; size: number; name?: string }): "type" | "size" | "heic" | null {
  const ext = file.name?.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined;
  if (HEIC_TYPES.has(file.type.toLowerCase()) || ext === "heic" || ext === "heif") return "heic";
  const mime = file.type === "" && ext ? EXT_MIME[ext] : file.type;
  if (!mime || !(SLIP_ALLOWED_MIMES as readonly string[]).includes(mime)) return "type";
  if (file.size <= 0 || file.size > SLIP_MAX_BYTES) return "size";
  return null;
}

import { SLIP_ALLOWED_MIMES, SLIP_FLAGS, SLIP_MAX_BYTES, type SlipStatus } from "@oca/shared";
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

/** key ຂໍ້ຄວາມຂອງ flag; flag ໃໝ່ຈາກ API ທີ່ UI ຍັງບໍ່ຮູ້ຈັກ ໃຊ້ຂໍ້ຄວາມທົ່ວໄປ ແທນທີ່ຈະສະແດງ code ດິບ */
export function slipFlagKey(flag: string): TranslationKey {
  return ((SLIP_FLAGS as readonly string[]).includes(flag) ? `slips.flag.${flag}` : "slips.flag.UNKNOWN") as TranslationKey;
}

/** ກວດໄຟລ໌ຝັ່ງ client ກ່ອນສົ່ງ (API ກວດ magic bytes ຊ້ຳ): "type" | "size" | null */
export function validateSlipFile(file: { type: string; size: number }): "type" | "size" | null {
  if (!(SLIP_ALLOWED_MIMES as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0 || file.size > SLIP_MAX_BYTES) return "size";
  return null;
}

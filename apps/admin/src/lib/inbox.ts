import { isMessageSendError } from "@oca/shared";
import type { TranslationKey } from "@/lib/i18n/dictionary";

/** ຮູບ/ໄຟລ໌ແນບເປີດ/ສະແດງໄດ້ສະເພາະ https (CDN ຂອງ Meta); ກັນ javascript:/data:/http */
export function isSafeAttachmentUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** ຂໍ້ຄວາມເຫດຜົນທີ່ສົ່ງບໍ່ໄດ້; errorCode ທີ່ບໍ່ຮູ້ຈັກ (server ເພີ່ມລະຫັດໃໝ່) ໃຊ້ UNKNOWN ແທນທີ່ຈະສະແດງລະຫັດດິບ */
export function sendErrorKey(code: string | null): TranslationKey {
  return isMessageSendError(code) ? (`inbox.sendError.${code}` as const) : "inbox.sendError.UNKNOWN";
}

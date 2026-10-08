import type { TranslationKey } from "@/lib/i18n/dictionary";
import { sendErrorKey } from "./inbox";
import type { LiveSessionDto } from "./types";

/**
 * ເຫດຜົນທີ່ສົ່ງສະຫຼຸບ CF ບໍ່ໄດ້: Private Reply ມີສິດ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ ພາຍໃນ 7 ມື້ ຈຶ່ງ OUTSIDE_WINDOW
 * ມີຄວາມໝາຍຕ່າງຈາກແຊັດ (24 ຊມ); ລະຫັດອື່ນໃຊ້ຂໍ້ຄວາມດຽວກັບ inbox.
 */
export function cfReplyErrorKey(code: string | null): TranslationKey {
  return code === "OUTSIDE_WINDOW" ? "live.replyError.OUTSIDE_WINDOW" : sendErrorKey(code);
}

export type StartBlocker = "noPost" | "noItems";

/** ເຫດຜົນທີ່ຍັງເລີ່ມ session ບໍ່ໄດ້ (ກົງກັບການກວດຂອງ API) ຫຼື null ຖ້າເລີ່ມໄດ້ */
export function startBlocker(session: Pick<LiveSessionDto, "externalPostId" | "itemCount">): StartBlocker | null {
  if (!session.externalPostId) return "noPost";
  if (session.itemCount === 0) return "noItems";
  return null;
}

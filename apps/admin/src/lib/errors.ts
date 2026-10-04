import type { Translate } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";

/** ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້: ໃຊ້ message ຈາກ API ຖ້າມີ, ບໍ່ດັ່ງນັ້ນຂໍ້ຄວາມກາງ. */
export function errorMessage(error: unknown, t: Translate): string {
  return error instanceof ApiError && error.message ? error.message : t("common.error.generic");
}

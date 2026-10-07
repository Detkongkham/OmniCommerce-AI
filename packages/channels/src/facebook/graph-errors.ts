import type { MessageSendError } from "@oca/shared";
import { isRecord } from "../util";

export interface GraphFailure {
  code: MessageSendError;
  detail: string;
}

const OUTSIDE_WINDOW_SUBCODE = 2018278;
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

/** ແປງ error ຂອງ Graph API ເປັນລະຫັດຂອງເຮົາ. detail ຕັດ ≤ 300 ຕົວ ແລະ ມາຈາກ message ຂອງ Meta ເທົ່ານັ້ນ (ບໍ່ມີ token). */
export function mapGraphFailure(status: number, body: unknown): GraphFailure {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const code = typeof error.code === "number" ? error.code : undefined;
  const subcode = typeof error.error_subcode === "number" ? error.error_subcode : undefined;
  const message = typeof error.message === "string" ? error.message : `HTTP ${status}`;
  const detail = message.slice(0, 300);

  if (subcode === OUTSIDE_WINDOW_SUBCODE || /outside of allowed window/i.test(message)) {
    return { code: "OUTSIDE_WINDOW", detail };
  }
  if (code === 190 || code === 102 || status === 401) return { code: "CHANNEL_AUTH", detail };
  if (status >= 500 || status === 429 || (code !== undefined && TRANSIENT_CODES.has(code))) {
    return { code: "CHANNEL_UNAVAILABLE", detail };
  }
  return { code: "SEND_REJECTED", detail };
}

import { type CouponRejectReason, type PointsRejectReason, STORE_MAX_OPEN_ORDERS } from "@oca/shared";
import { formatLak, formatPoints } from "./format";

/** ຂໍ້ຄວາມສຳລັບ error ຂອງ API ທີ່ລູກຄ້າແກ້ໄຂເອງໄດ້; ຢ່າງອື່ນໃຊ້ `fallback` */
const MESSAGES: Record<string, string> = {
  NETWORK: "ເຊື່ອມຕໍ່ບໍ່ໄດ້ ກະລຸນາກວດອິນເຕີເນັດແລ້ວລອງໃໝ່",
  TOO_MANY_ATTEMPTS: "ມີການໃຊ້ງານຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າຈັກໜ້ອຍແລ້ວລອງໃໝ່",
  TOO_MANY_OPEN_ORDERS: `ເບີໂທນີ້ມີບິນທີ່ຍັງບໍ່ໄດ້ຊຳລະຢູ່ແລ້ວ ${STORE_MAX_OPEN_ORDERS} ບິນ ກະລຸນາຊຳລະ ຫຼື ລໍໃຫ້ໝົດເວລາກ່ອນ`,
  COURIER_NOT_FOUND: "ບໍລິສັດຂົນສົ່ງນີ້ບໍ່ມີໃຫ້ເລືອກແລ້ວ ກະລຸນາເລືອກໃໝ່",
  COURIER_INACTIVE: "ບໍລິສັດຂົນສົ່ງນີ້ບໍ່ມີໃຫ້ເລືອກແລ້ວ ກະລຸນາເລືອກໃໝ່",
  NO_DEFAULT_WAREHOUSE: "ຮ້ານຍັງບໍ່ພ້ອມຮັບຄຳສັ່ງຊື້ ກະລຸນາລອງໃໝ່ພາຍຫຼັງ",
  SLIP_FILE_INVALID: "ໄຟລ໌ຕ້ອງເປັນຮູບ JPEG, PNG ຫຼື WebP ແລະ ບໍ່ເກີນ 8 MB",
  SLIP_LIMIT_REACHED: "ບິນນີ້ມີສະລິບຄົບຈຳນວນແລ້ວ ກະລຸນາລໍຖ້າຮ້ານກວດສອບ",
  RESERVATION_EXPIRED: "ບິນນີ້ໝົດເວລາຊຳລະແລ້ວ",
  ORDER_INVALID_STATE: "ບິນນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະລໍຖ້າຊຳລະແລ້ວ",
  MEMBER_LOGIN_FAILED: "ເບີໂທ ຫຼື PIN ບໍ່ຖືກຕ້ອງ",
  MEMBER_LOCKED: "ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລໍຖ້າຈັກໜ້ອຍແລ້ວລອງໃໝ່",
  MEMBER_REQUIRED: "ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່",
  PIN_ALREADY_SET: "ເບີນີ້ມີ PIN ແລ້ວ",
};

export function apiMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}

const COUPON_MESSAGES: Record<CouponRejectReason, string> = {
  NOT_FOUND: "ບໍ່ພົບໂຄດນີ້ ກະລຸນາກວດຕົວສະກົດ",
  INACTIVE: "ໂຄດນີ້ຖືກປິດໃຊ້ແລ້ວ",
  NOT_STARTED: "ໂຄດນີ້ຍັງບໍ່ຮອດເວລາໃຊ້",
  EXPIRED: "ໂຄດນີ້ໝົດອາຍຸແລ້ວ",
  MIN_SUBTOTAL: "ຍອດຊື້ຍັງບໍ່ຮອດຂັ້ນຕ່ຳຂອງໂຄດນີ້",
  USAGE_LIMIT: "ໂຄດນີ້ຖືກໃຊ້ຄົບຈຳນວນແລ້ວ",
  PHONE_LIMIT: "ເບີໂທນີ້ໃຊ້ໂຄດນີ້ຄົບຈຳນວນແລ້ວ",
  PHONE_REQUIRED: "ໂຄດນີ້ໃຊ້ບໍ່ໄດ້ກັບຄຳສັ່ງຊື້ນີ້",
};

/** ເຫດຜົນທີ່ໂຄດໃຊ້ບໍ່ໄດ້ ເປັນຂໍ້ຄວາມສຳລັບລູກຄ້າ */
export function couponMessage(error: { reason?: unknown; minSubtotal?: unknown }): string {
  const reason = typeof error.reason === "string" && error.reason in COUPON_MESSAGES ? (error.reason as CouponRejectReason) : null;
  if (reason === "MIN_SUBTOTAL" && typeof error.minSubtotal === "string") {
    return `ໂຄດນີ້ໃຊ້ໄດ້ເມື່ອຊື້ຄົບ ${formatLak(error.minSubtotal)}`;
  }
  return reason ? COUPON_MESSAGES[reason] : "ໂຄດນີ້ໃຊ້ບໍ່ໄດ້";
}

/** ລັອກການເຂົ້າລະບົບ: ບອກຈຳນວນນາທີທີ່ເຫຼືອຈາກ `retryAfterSeconds` (top-level ໃນ body ຂອງ 429) */
export function memberLockedMessage(retryAfterSeconds: unknown): string {
  if (typeof retryAfterSeconds !== "number" || !(retryAfterSeconds > 0)) return MESSAGES.MEMBER_LOCKED as string;
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລອງໃໝ່ໃນອີກ ${minutes} ນາທີ`;
}

const POINTS_MESSAGES: Record<PointsRejectReason, string> = {
  DISABLED: "ຮ້ານປິດການໃຊ້ແຕ້ມຢູ່ຕອນນີ້",
  NO_CUSTOMER: "ບັນຊີນີ້ໃຊ້ແຕ້ມບໍ່ໄດ້",
  INSUFFICIENT: "ແຕ້ມບໍ່ພໍ",
  OVER_CAP: "ໃຊ້ແຕ້ມເກີນກຳນົດຂອງບິນນີ້",
  PHONE_MISMATCH: "ໃຊ້ແຕ້ມໄດ້ສະເພາະເມື່ອເບີໂທຜູ້ຮັບກົງກັບເບີຂອງບັນຊີ",
};

/** ເຫດຜົນທີ່ໃຊ້ແຕ້ມບໍ່ໄດ້ (`pointsError` ຂອງກະຕ່າ ຫຼື body ຂອງ 409 POINTS_INVALID) */
export function pointsMessage(error: { reason?: unknown; balance?: unknown; maxPoints?: unknown }): string {
  const reason = typeof error.reason === "string" && error.reason in POINTS_MESSAGES ? (error.reason as PointsRejectReason) : null;
  if (reason === "OVER_CAP" && typeof error.maxPoints === "number") return `ບິນນີ້ໃຊ້ໄດ້ສູງສຸດ ${formatPoints(error.maxPoints)}`;
  if (reason === "INSUFFICIENT" && typeof error.balance === "number") return `ແຕ້ມບໍ່ພໍ (ມີ ${formatPoints(error.balance)})`;
  return reason ? POINTS_MESSAGES[reason] : "ໃຊ້ແຕ້ມບໍ່ໄດ້";
}

import { STORE_MAX_OPEN_ORDERS } from "@oca/shared";

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
};

export function apiMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}

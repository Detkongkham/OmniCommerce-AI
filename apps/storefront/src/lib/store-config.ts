import { getStoreConfig } from "./store-api";

const FALLBACK_STORE_NAME = "ຮ້ານຄ້າອອນລາຍ";

/**
 * ຊື່ຮ້ານສຳລັບ layout/metadata. API ລົ້ມ = ໃຊ້ຊື່ສຳຮອງ ເພື່ອໃຫ້ໂຄງເວັບຍັງຂຶ້ນ
 * (ເນື້ອໃນໜ້າຈະສະແດງ error ຂອງຕົນເອງພ້ອມປຸ່ມລອງໃໝ່).
 */
export async function getStoreName(): Promise<string> {
  try {
    return (await getStoreConfig()).name;
  } catch {
    return FALLBACK_STORE_NAME;
  }
}

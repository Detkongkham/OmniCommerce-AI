import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { formatDateTime, formatMoney } from "./format";

/** ສ່ວນຂອງ OrderDetailDto ທີ່ສະຫຼຸບບິນໃຊ້ (ບໍ່ຜູກກັບ DTO ທັງກ້ອນ ເພື່ອ test ງ່າຍ) */
export interface OrderSummarySource {
  orderNumber: string;
  currency: string;
  status: string;
  items: {
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    discount: string;
    lineTotal: string;
  }[];
  shippingFee: string;
  total: string;
  reservedUntil: string | null;
}

const hasAmount = (value: string): boolean => Number(value) > 0;

function itemLine(item: OrderSummarySource["items"][number], index: number): string {
  const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
  const base = `${index + 1}. ${name} ${item.quantity} x ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`;
  return hasAmount(item.discount) ? `${base} (ຫຼັງຫັກສ່ວນຫຼຸດ ${formatMoney(item.discount)})` : base;
}

/**
 * ຂໍ້ຄວາມສະຫຼຸບບິນທີ່ສົ່ງຫາລູກຄ້າໃນແຊັດ (ພາສາລາວຄົງທີ່ ບໍ່ຜ່ານ i18n ຂອງ admin ເພາະເປັນຂໍ້ຄວາມຫາລູກຄ້າ).
 * ເກີນ MAX_MESSAGE_LENGTH (Messenger ຈຳກັດ) → ຕັດລາຍການທ້າຍອອກ ແລ້ວບອກວ່າ "ແລະ ອີກ N ລາຍການ"; ເລກບິນ ແລະ ຍອດຢູ່ຄົບສະເໝີ.
 */
export function buildOrderSummary(order: OrderSummarySource): string {
  const head = ["ສະຫຼຸບບິນຂອງທ່ານ", `ເລກທີ ${order.orderNumber}`].join("\n");
  const totals = [
    ...(hasAmount(order.shippingFee) ? [`ຄ່າສົ່ງ: ${formatMoney(order.shippingFee)}`] : []),
    `ລວມທັງໝົດ: ${formatMoney(order.total)} ${order.currency}`,
    ...(order.status === "PENDING_PAYMENT" && order.reservedUntil
      ? [`ຈອງສິນຄ້າໃຫ້ຮອດ ${formatDateTime(order.reservedUntil)}`]
      : []),
  ].join("\n");
  const thanks = "ຂອບໃຈທີ່ສັ່ງຊື້";

  const lines = order.items.map(itemLine);
  const compose = (shown: number): string => {
    const omitted = lines.length - shown;
    const list = [...lines.slice(0, shown), ...(omitted > 0 ? [`ແລະ ອີກ ${omitted} ລາຍການ`] : [])].join("\n");
    return [head, list, totals, thanks].join("\n\n");
  };

  for (let shown = lines.length; shown >= 0; shown -= 1) {
    const text = compose(shown);
    if (text.length <= MAX_MESSAGE_LENGTH) return text;
  }
  // ບໍ່ເຄີຍເກີດ (ສ່ວນຫົວ + ຍອດສັ້ນກວ່າ 2000 ຫຼາຍ) ແຕ່ຮັບປະກັນຄວາມຍາວ
  return compose(0).slice(0, MAX_MESSAGE_LENGTH);
}

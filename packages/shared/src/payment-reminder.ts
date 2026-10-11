/** ນາທີກ່ອນໝົດເວລາຈອງທີ່ຈະສົ່ງເຕືອນ: 1..1440 */
export const MAX_PAYMENT_REMINDER_MINUTES = 1440;

const grouped = (amount: string): string => {
  const [whole = "0", fraction = ""] = amount.split(".");
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return /^0*$/.test(fraction) ? digits : `${digits}.${fraction.padEnd(2, "0")}`;
};

/** ຂໍ້ຄວາມເຕືອນບິນທີ່ຍັງບໍ່ຊຳລະ (ສົ່ງເຂົ້າແຊັດ ເທື່ອດຽວກ່ອນໝົດເວລາຈອງ) */
export function buildPaymentReminderMessage(input: {
  orderNumber: string;
  /** "180000.00" */
  total: string;
  currency: string;
  minutesLeft: number;
  paymentInstructions: string | null;
}): string {
  return [
    `⏰ ບິນ ${input.orderNumber} ຍັງບໍ່ໄດ້ຊຳລະ`,
    `ຍອດ: ${grouped(input.total)} ${input.currency}`,
    `ສິນຄ້າຈອງໄວ້ໃຫ້ອີກປະມານ ${Math.max(1, input.minutesLeft)} ນາທີ`,
    ...(input.paymentInstructions ? [input.paymentInstructions] : []),
    "ໂອນແລ້ວສົ່ງສະລິບມາໃນແຊັດນີ້ໄດ້ເລີຍ 🙏",
  ].join("\n");
}

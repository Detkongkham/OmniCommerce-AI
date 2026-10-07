const LAO_OFFSET_MS = 7 * 60 * 60 * 1000;

export const PUBLIC_REPLY_ORDERED = "ຮັບ CF ແລ້ວ ກະລຸນາກວດຂໍ້ຄວາມໃນແຊັດ 🙏";
export const PUBLIC_REPLY_REJECTED = "ຂໍໂທດ ຮັບ CF ບໍ່ໄດ້ (ສິນຄ້າໝົດ ຫຼື ຄົບຈຳນວນແລ້ວ) ກະລຸນາກວດຂໍ້ຄວາມໃນແຊັດ";

/** "200000.00" → "200,000"; "1234567.50" → "1,234,567.50" */
export function formatAmount(value: string): string {
  const [integer = "0", fraction = ""] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return /^0*$/.test(fraction) ? grouped : `${grouped}.${fraction}`;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** ເວລາລາວ (UTC+7). ຖ້າບໍ່ແມ່ນມື້ດຽວກັບ `now` ໃສ່ `dd/MM` ນຳໜ້າ */
export function formatClock(date: Date, now: Date = new Date()): string {
  const lao = new Date(date.getTime() + LAO_OFFSET_MS);
  const laoNow = new Date(now.getTime() + LAO_OFFSET_MS);
  const clock = `${pad(lao.getUTCHours())}:${pad(lao.getUTCMinutes())}`;
  const sameDay =
    lao.getUTCFullYear() === laoNow.getUTCFullYear() &&
    lao.getUTCMonth() === laoNow.getUTCMonth() &&
    lao.getUTCDate() === laoNow.getUTCDate();
  return sameDay ? clock : `${pad(lao.getUTCDate())}/${pad(lao.getUTCMonth() + 1)} ${clock}`;
}

export interface OrderedTextInput {
  orderNumber: string;
  lines: { name: string; quantity: number; lineTotal: string }[];
  total: string;
  currency: string;
  reservedUntil: Date | null;
  paymentInstructions: string | null;
  now?: Date;
}

export function buildOrderedText(input: OrderedTextInput): string {
  const rows = input.lines.map((line) => `• ${line.name} x${line.quantity} = ${formatAmount(line.lineTotal)}`);
  const parts = [`✅ ຮັບ CF ແລ້ວ ບິນ ${input.orderNumber}`, ...rows, `ລວມ ${formatAmount(input.total)} ${input.currency}`];
  if (input.reservedUntil) {
    parts.push(`ກະລຸນາໂອນກ່ອນ ${formatClock(input.reservedUntil, input.now)} (ຖ້າບໍ່ໂອນ ລະບົບຈະຄືນສິນຄ້າ)`);
  }
  if (input.paymentInstructions?.trim()) parts.push(input.paymentInstructions.trim());
  return parts.join("\n");
}

export function buildRejectedText(kind: "OUT_OF_STOCK" | "LIMIT_REACHED", codes: string[]): string {
  const list = codes.join(", ");
  return kind === "OUT_OF_STOCK"
    ? `ຂໍໂທດ ລະຫັດ ${list} ໝົດແລ້ວ ຮັບ CF ບໍ່ໄດ້`
    : `ຂໍໂທດ ລະຫັດ ${list} ຄົບຈຳນວນທີ່ເປີດຮັບແລ້ວ`;
}

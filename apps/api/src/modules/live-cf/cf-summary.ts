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

/** ຂີດຈຳກັດຂໍ້ຄວາມ Messenger */
const MAX_TEXT_LENGTH = 2000;

export function buildOrderedText(input: OrderedTextInput): string {
  const rows = input.lines.map((line) => `• ${line.name} x${line.quantity} = ${formatAmount(line.lineTotal)}`);
  const head = `✅ ຮັບ CF ແລ້ວ ບິນ ${input.orderNumber}`;
  const tail = [`ລວມ ${formatAmount(input.total)} ${input.currency}`];
  if (input.reservedUntil) {
    tail.push(`ກະລຸນາໂອນກ່ອນ ${formatClock(input.reservedUntil, input.now)} (ຖ້າບໍ່ໂອນ ລະບົບຈະຄືນສິນຄ້າ)`);
  }
  if (input.paymentInstructions?.trim()) tail.push(input.paymentInstructions.trim());
  const assemble = (shown: string[], hidden: number): string =>
    [head, ...shown, ...(hidden > 0 ? [`…ແລະອີກ ${hidden} ລາຍການ`] : []), ...tail].join("\n");

  // ຕັດລາຍການຈາກທ້າຍຈົນພໍດີ; ຫົວ/ລວມ/ເວລາ/ຂໍ້ມູນໂອນຄົງໄວ້
  let shown = rows.length;
  while (shown > 0 && assemble(rows.slice(0, shown), rows.length - shown).length > MAX_TEXT_LENGTH) shown -= 1;
  return assemble(rows.slice(0, shown), rows.length - shown).slice(0, MAX_TEXT_LENGTH);
}

export function buildRejectedText(kind: "OUT_OF_STOCK" | "LIMIT_REACHED", codes: string[]): string {
  const target = codes.length > 0 ? `ລະຫັດ ${codes.join(", ")}` : "ສິນຄ້າທີ່ສັ່ງ";
  return kind === "OUT_OF_STOCK"
    ? `ຂໍໂທດ ${target} ໝົດແລ້ວ ຮັບ CF ບໍ່ໄດ້`
    : `ຂໍໂທດ ${target} ຄົບຈຳນວນທີ່ເປີດຮັບແລ້ວ`;
}

export interface CfLine {
  /** ລະຫັດທີ່ normalize ແລ້ວ (ຕົງກັບ LiveSessionItem.code) */
  code: string;
  quantity: number;
}

const LAO_DIGIT_ZERO = 0x0ed0;
const MAX_QUANTITY = 99;
const SEPARATOR = /[\s,;+]/;
const QUANTITY = /^\s*[X×*]?\s*(\d{1,2})(?!\d)/;
const MULTIPLY_THEN_DIGIT = /^[X×*]\d/;
const CF_PREFIX = /^CF(?=[\s:,-])[\s:,-]*/;

/** ຕົວອັກສອນໃຫຍ່, NFKC (full-width → ASCII), ເລກລາວ → ASCII, ຍຸບຊ່ອງວ່າງ. ໃຊ້ທັງຕອນບັນທຶກລະຫັດ ແລະ ຕອນ parse ຄອມເມັ້ນ. */
export function normalizeCfText(value: string): string {
  return value
    .normalize("NFKC")
    // NFKC ແຕກ "ຳ" (U+0EB3) ເປັນ "ໍ"+"າ"; ປະກອບຄືນເພື່ອໃຫ້ລະຫັດສະແດງຜົນເປັນຮູບປົກກະຕິ
    .replace(/\u0ECD\u0EB2/g, "\u0EB3")
    .replace(/[໐-໙]/g, (digit) => String(digit.charCodeAt(0) - LAO_DIGIT_ZERO))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCodeAt(text: string, position: number, code: string): boolean {
  if (code.length === 0 || !text.startsWith(code, position)) return false;
  const next = text[position + code.length];
  if (next === undefined || SEPARATOR.test(next)) return true;
  // "A1x2" / "A1*2": ຕົວຄູນຕ້ອງຕາມດ້ວຍເລກ
  return MULTIPLY_THEN_DIGIT.test(text.slice(position + code.length));
}

function parseTokens(text: string, sortedCodes: readonly string[]): CfLine[] | null {
  const totals = new Map<string, number>();
  let position = 0;
  for (;;) {
    while (position < text.length && SEPARATOR.test(text.charAt(position))) position += 1;
    if (position >= text.length) break;
    const code = sortedCodes.find((candidate) => isCodeAt(text, position, candidate));
    if (code === undefined) return null;
    position += code.length;
    let quantity = 1;
    const match = QUANTITY.exec(text.slice(position));
    if (match?.[1] !== undefined) {
      quantity = Number(match[1]);
      position += match[0].length;
    }
    if (quantity < 1) return null;
    const total = (totals.get(code) ?? 0) + quantity;
    if (total > MAX_QUANTITY) return null;
    totals.set(code, total);
  }
  return totals.size > 0 ? [...totals].map(([code, quantity]) => ({ code, quantity })) : null;
}

/**
 * ແປງຂໍ້ຄວາມຄອມເມັ້ນເປັນລາຍການ CF ຕາມລະຫັດຂອງ session. ຄອມເມັ້ນຕ້ອງເປັນ CF ທັງຂໍ້ຄວາມ
 * (ມີ "CF" ນຳໜ້າໄດ້); ມີຄຳອື່ນປົນ ຫຼື ຈຳນວນນອກ 1..99 = null (ບໍ່ຈອງ ເພື່ອບໍ່ໃຫ້ຈອງຜິດ).
 */
export function parseCf(message: string, codes: readonly string[]): CfLine[] | null {
  const text = normalizeCfText(message);
  const sorted = codes
    .map(normalizeCfText)
    .filter((code) => code.length > 0)
    .sort((a, b) => b.length - a.length);
  if (text.length === 0 || sorted.length === 0) return null;
  const prefix = CF_PREFIX.exec(text);
  if (prefix) {
    const stripped = parseTokens(text.slice(prefix[0].length), sorted);
    if (stripped) return stripped;
  }
  return parseTokens(text, sorted);
}

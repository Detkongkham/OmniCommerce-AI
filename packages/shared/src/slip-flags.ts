import { Decimal } from "decimal.js";
import { SLIP_FLAGS, type SlipFlag, normalizeSlipAmount } from "./schemas/slips";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** ອະນຸໂລມເວລາ (ms) ລະຫວ່າງໂມງທະນາຄານ ແລະ ໂມງລະບົບ */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface SlipFlagOrder {
  /** ຍອດບິນ (baseCurrency) ເປັນ string */
  total: string;
  /** ສະກຸນທີ່ລູກຄ້າຈ່າຍ */
  currency: string;
  /** 1 ໜ່ວຍຂອງ currency = ? baseCurrency */
  exchangeRate: string;
  createdAt: Date;
  status: string;
  reservedUntil: Date | null;
}

export interface SlipFlagInput {
  /** ຄ່າທີ່ໃຊ້ຕັດສິນ (confirmed ກ່ອນ ບໍ່ດັ່ງນັ້ນ read) */
  amount: string | null;
  currency: string | null;
  paidAt: Date | null;
  destAccount: string | null;
  refNo: string | null;
  order: SlipFlagOrder | null;
  receivingAccounts: { accountNo: string }[];
  duplicateRef: boolean;
  duplicateImage: boolean;
  now: Date;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** ເລກບັນຊີທີ່ອ່ານໄດ້ ກົງກັບບັນຊີຮ້ານ: ກົງທັງໝົດ ຫຼື (ມີ mask ແລະ ເຫຼືອ ≥4 ຫຼັກ) ກົງທ້າຍ */
export function accountMatches(dest: string, accountNo: string): boolean {
  const d = digitsOf(dest);
  const a = digitsOf(accountNo);
  if (!d || !a) return false;
  if (d === a) return true;
  const masked = /[x*•]/i.test(dest);
  return masked && d.length >= 4 && a.endsWith(d);
}

/** ສອງເລກບັນຊີເປັນບັນຊີດຽວກັນ (ຮູບແບບຕ່າງກັນ/ມີ mask ທັງສອງທິດ ກໍ່ນັບ) */
export function sameAccount(a: string, b: string): boolean {
  if (accountMatches(a, b) || accountMatches(b, a)) return true;
  const da = digitsOf(a);
  return da !== "" && da === digitsOf(b);
}

function amountMismatch(input: SlipFlagInput, order: SlipFlagOrder, amount: string): boolean {
  if (input.currency !== null && input.currency.toUpperCase() !== order.currency.toUpperCase()) return true;
  const normalized = normalizeSlipAmount(amount);
  if (normalized === null) return true;
  // ຂໍ້ມູນບິນເສຍ (ບໍ່ແມ່ນຕົວເລກ / rate 0) → ຖືວ່າບໍ່ຕົງ ແທນທີ່ຈະ throw
  try {
    const expected = new D(order.total).div(order.exchangeRate).toDecimalPlaces(2);
    return !expected.isFinite() || !new D(normalized).eq(expected);
  } catch {
    return true;
  }
}

/** ຄິດ flag ຂອງສະລິບ (pure). ຄືນຕາມລຳດັບ SLIP_FLAGS. */
export function computeSlipFlags(input: SlipFlagInput): SlipFlag[] {
  const found = new Set<SlipFlag>();
  const { order } = input;

  if (order && input.amount !== null && amountMismatch(input, order, input.amount)) {
    found.add("AMOUNT_MISMATCH");
  }
  if (input.duplicateRef) found.add("DUPLICATE_REF");
  if (input.duplicateImage) found.add("DUPLICATE_IMAGE");

  const accountsConfigured = input.receivingAccounts.length > 0;
  if (accountsConfigured && input.destAccount !== null) {
    const dest = input.destAccount;
    if (!input.receivingAccounts.some((account) => accountMatches(dest, account.accountNo))) {
      found.add("DEST_MISMATCH");
    }
  }
  if (order && input.paidAt !== null && input.paidAt.getTime() < order.createdAt.getTime() - CLOCK_SKEW_MS) {
    found.add("PAID_BEFORE_ORDER");
  }
  if (
    order &&
    (order.status !== "PENDING_PAYMENT" ||
      (order.reservedUntil !== null && order.reservedUntil.getTime() <= input.now.getTime()))
  ) {
    found.add("ORDER_NOT_PAYABLE");
  }
  // ຕັ້ງບັນຊີຮ້ານແລ້ວ ແຕ່ອ່ານບັນຊີປາຍທາງບໍ່ໄດ້ ຖືວ່າອ່ານບໍ່ຄົບ
  if (input.amount === null || input.refNo === null || (accountsConfigured && input.destAccount === null)) {
    found.add("UNREADABLE_FIELDS");
  }
  return SLIP_FLAGS.filter((flag) => found.has(flag));
}

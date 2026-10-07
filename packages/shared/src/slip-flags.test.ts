import { describe, expect, it } from "vitest";
import { type SlipFlagInput, accountMatches, computeSlipFlags } from "./slip-flags";

const now = new Date("2026-10-07T10:00:00.000Z");
const order = {
  total: "100000.00",
  currency: "LAK",
  exchangeRate: "1",
  createdAt: new Date("2026-10-07T08:00:00.000Z"),
  status: "PENDING_PAYMENT",
  reservedUntil: new Date("2026-10-07T11:00:00.000Z"),
};
const base: SlipFlagInput = {
  amount: "100000.00",
  currency: "LAK",
  paidAt: new Date("2026-10-07T09:00:00.000Z"),
  destAccount: "010-12-00-0123",
  refNo: "REF1",
  order,
  receivingAccounts: [{ accountNo: "01012000123" }],
  duplicateRef: false,
  duplicateImage: false,
  now,
};
const flags = (patch: Partial<SlipFlagInput> = {}) => computeSlipFlags({ ...base, ...patch });

describe("computeSlipFlags", () => {
  it("ທຸກຢ່າງຖືກ → ບໍ່ມີ flag", () => {
    expect(flags()).toEqual([]);
  });

  it("ຍອດບໍ່ຕົງ → AMOUNT_MISMATCH (ແມ້ແຕ່ 0.01)", () => {
    expect(flags({ amount: "99999.99" })).toEqual(["AMOUNT_MISMATCH"]);
    expect(flags({ amount: "100000.01" })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ຍອດຄາດຫວັງ = total ÷ exchangeRate (ລູກຄ້າຈ່າຍເປັນ THB)", () => {
    const thb = { ...order, currency: "THB", exchangeRate: "500" };
    expect(flags({ order: thb, amount: "200.00", currency: "THB" })).toEqual([]);
    expect(flags({ order: thb, amount: "100000.00", currency: "THB" })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ສະກຸນຕ່າງຈາກບິນ → AMOUNT_MISMATCH; ສະກຸນບໍ່ຮູ້ (null) → ປຽບທຽບແຕ່ຕົວເລກ", () => {
    expect(flags({ currency: "THB" })).toEqual(["AMOUNT_MISMATCH"]);
    expect(flags({ currency: null })).toEqual([]);
  });

  it("ຍອດທີ່ແປງບໍ່ໄດ້ (ສູນ / comma ກຳກວມ / ບໍ່ແມ່ນຕົວເລກ) → ນັບເປັນ AMOUNT_MISMATCH", () => {
    for (const amount of ["0", "0.00", "12,50", "abc"]) {
      expect(flags({ amount })).toEqual(["AMOUNT_MISMATCH"]);
    }
  });

  it("ບໍ່ມີບິນ (ຍັງບໍ່ຜູກ) → ບໍ່ກວດຍອດ/ເວລາ/ສະຖານະ", () => {
    expect(flags({ order: null, amount: "1.00" })).toEqual([]);
  });

  it("ຊ້ຳ → DUPLICATE_REF / DUPLICATE_IMAGE", () => {
    expect(flags({ duplicateRef: true })).toEqual(["DUPLICATE_REF"]);
    expect(flags({ duplicateImage: true })).toEqual(["DUPLICATE_IMAGE"]);
    expect(flags({ duplicateRef: true, duplicateImage: true })).toEqual(["DUPLICATE_REF", "DUPLICATE_IMAGE"]);
  });

  it("ບັນຊີປາຍທາງ: ບໍ່ຢູ່ໃນລາຍການ → DEST_MISMATCH; ລາຍການວ່າງ = ຂ້າມ; masked ຈັບ 4 ໂຕທ້າຍ", () => {
    expect(flags({ destAccount: "999999999999" })).toEqual(["DEST_MISMATCH"]);
    expect(flags({ receivingAccounts: [], destAccount: "999" })).toEqual([]);
    expect(flags({ destAccount: "xxxx-xxxx-0123" })).toEqual([]);
    expect(flags({ destAccount: "xxxx-xxxx-9999" })).toEqual(["DEST_MISMATCH"]);
  });

  it("ຕັ້ງບັນຊີຮ້ານແລ້ວ ແຕ່ອ່ານບັນຊີບໍ່ໄດ້ → UNREADABLE_FIELDS", () => {
    expect(flags({ destAccount: null })).toEqual(["UNREADABLE_FIELDS"]);
    expect(flags({ destAccount: null, receivingAccounts: [] })).toEqual([]);
  });

  it("ໂອນກ່ອນບິນສ້າງ → PAID_BEFORE_ORDER ແຕ່ອະນຸໂລມ 5 ນາທີ", () => {
    expect(flags({ paidAt: new Date("2026-10-07T07:00:00.000Z") })).toEqual(["PAID_BEFORE_ORDER"]);
    expect(flags({ paidAt: new Date("2026-10-07T07:56:00.000Z") })).toEqual([]);
    expect(flags({ paidAt: new Date("2026-10-07T07:54:00.000Z") })).toEqual(["PAID_BEFORE_ORDER"]);
  });

  it("ບິນບໍ່ຢູ່ PENDING_PAYMENT ຫຼື ໝົດເວລາຈອງ → ORDER_NOT_PAYABLE", () => {
    expect(flags({ order: { ...order, status: "EXPIRED" } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, status: "PAID" } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, reservedUntil: new Date("2026-10-07T09:59:59.000Z") } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, reservedUntil: null } })).toEqual([]);
  });

  it("ອ່ານຍອດ ຫຼື ເລກອ້າງອີງບໍ່ໄດ້ → UNREADABLE_FIELDS (ບໍ່ໃສ່ AMOUNT_MISMATCH ເມື່ອບໍ່ມີຍອດ)", () => {
    expect(flags({ amount: null })).toEqual(["UNREADABLE_FIELDS"]);
    expect(flags({ refNo: null })).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ຄືນຕາມລຳດັບຂອງ SLIP_FLAGS ເສມີ", () => {
    const result = flags({
      amount: "1.00",
      duplicateRef: true,
      destAccount: "0",
      paidAt: new Date("2026-01-01T00:00:00.000Z"),
      order: { ...order, status: "EXPIRED" },
      refNo: null,
    });
    expect(result).toEqual([
      "AMOUNT_MISMATCH",
      "DUPLICATE_REF",
      "DEST_MISMATCH",
      "PAID_BEFORE_ORDER",
      "ORDER_NOT_PAYABLE",
      "UNREADABLE_FIELDS",
    ]);
  });
});

describe("accountMatches", () => {
  it.each([
    ["010-12-00-0123", "01012000123", true],
    ["010 12 00 0123", "010120000123", false],
    ["xxx0123", "010120000123", true],
    ["***123", "010120000123", false], // masked ແຕ່ເຫຼືອ <4 ຫຼັກ
    ["", "123", false],
    ["abc", "123", false],
  ])("%s vs %s → %s", (dest, accountNo, expected) => {
    expect(accountMatches(dest, accountNo)).toBe(expected);
  });
});

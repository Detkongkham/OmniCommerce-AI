import { describe, expect, it } from "vitest";
import {
  SLIP_FLAGS,
  SLIP_STATUSES,
  linkChatSlipSchema,
  normalizeSlipAmount,
  patchSlipSchema,
  receivingAccountsSchema,
  rejectSlipSchema,
} from "./slips";

describe("normalizeSlipAmount", () => {
  it.each([
    ["1,250,000", "1250000.00"],
    ["1 250 000.5", "1250000.50"],
    ["₭ 50,000.00", "50000.00"],
    ["12.345", "12.35"],
    ["1,250.5", "1250.50"],
    ["₭ 1,250,000", "1250000.00"],
    ["0.995", "1.00"],
    ["007", "7.00"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeSlipAmount(raw)).toBe(expected);
  });

  it.each([[""], ["abc"], ["-5"], ["1.2.3"], [null], [undefined], ["1e5"], ["0"], ["0.00"], ["0.001"], ["12,50"], ["12,50 ₭"], ["12,50฿"], ["12,50 $"], ["₭ 12,50"], ["1,5"], [".5"], ["5."], ["9".repeat(16) + ".995"]])("%s → null", (raw) => {
    expect(normalizeSlipAmount(raw as string | null | undefined)).toBeNull();
  });

  it("ບໍ່ເກີນ 16 ຫຼັກກ່ອນຈຸດ (Decimal(18,2))", () => {
    expect(normalizeSlipAmount("9".repeat(17))).toBeNull();
    expect(normalizeSlipAmount("9".repeat(16))).toBe(`${"9".repeat(16)}.00`);
  });
});

describe("receivingAccountsSchema", () => {
  it("ຮັບລາຍການທີ່ຖືກ ແລະ ຕັດຍະຫວ່າງ", () => {
    const parsed = receivingAccountsSchema.parse([{ bank: " BCEL ", accountNo: " 010-12-00-0123 ", accountName: "OCA" }]);
    expect(parsed).toEqual([{ bank: "BCEL", accountNo: "010-12-00-0123", accountName: "OCA" }]);
  });
  it("accountName ເປັນ optional; ຫຼາຍສຸດ 20 ບັນຊີ; accountNo ຕ້ອງມີຕົວເລກ", () => {
    expect(receivingAccountsSchema.safeParse([{ bank: "LDB", accountNo: "123456" }]).success).toBe(true);
    expect(receivingAccountsSchema.safeParse(Array.from({ length: 21 }, () => ({ bank: "A", accountNo: "1" }))).success).toBe(false);
    expect(receivingAccountsSchema.safeParse([{ bank: "A", accountNo: "abc" }]).success).toBe(false);
    expect(receivingAccountsSchema.safeParse([{ bank: "", accountNo: "1" }]).success).toBe(false);
  });
});

describe("patchSlipSchema", () => {
  it("ທຸກ field ເປັນ optional ແຕ່ຕ້ອງມີຢ່າງໜ້ອຍ 1", () => {
    expect(patchSlipSchema.safeParse({}).success).toBe(false);
    expect(patchSlipSchema.safeParse({ orderId: "o1" }).success).toBe(true);
  });
  it("ຍອດ normalize ແລ້ວ; paidAt ເປັນ Date; ສະກຸນຕ້ອງຢູ່ໃນ enum", () => {
    const parsed = patchSlipSchema.parse({
      confirmedAmount: "1,000",
      confirmedPaidAt: "2026-10-07T03:00:00.000Z",
      confirmedCurrency: "LAK",
      confirmedRefNo: " ABC123 ",
    });
    expect(parsed.confirmedAmount).toBe("1000.00");
    expect(parsed.confirmedPaidAt).toEqual(new Date("2026-10-07T03:00:00.000Z"));
    expect(parsed.confirmedRefNo).toBe("ABC123");
    expect(patchSlipSchema.safeParse({ confirmedCurrency: "EUR" }).success).toBe(false);
    expect(patchSlipSchema.safeParse({ confirmedAmount: "abc" }).success).toBe(false);
  });
  it("null ລ້າງຄ່າໄດ້ (ຍົກເວັ້ນ orderId ທີ່ບໍ່ອະນຸຍາດ null)", () => {
    expect(patchSlipSchema.parse({ confirmedRefNo: null }).confirmedRefNo).toBeNull();
    expect(patchSlipSchema.safeParse({ orderId: null }).success).toBe(false);
  });
});

describe("rejectSlipSchema / linkChatSlipSchema", () => {
  it("reject ຕ້ອງມີເຫດຜົນ", () => {
    expect(rejectSlipSchema.safeParse({ reason: "  " }).success).toBe(false);
    expect(rejectSlipSchema.parse({ reason: " ຍອດບໍ່ຕົງ " })).toEqual({ reason: "ຍອດບໍ່ຕົງ" });
  });
  it("link: orderId + attachmentIndex (ເລີ່ມຈາກ 0)", () => {
    expect(linkChatSlipSchema.parse({ orderId: "o1", attachmentIndex: 0 })).toEqual({ orderId: "o1", attachmentIndex: 0 });
    expect(linkChatSlipSchema.safeParse({ orderId: "o1", attachmentIndex: -1 }).success).toBe(false);
  });
});

describe("constants", () => {
  it("ຄ່າຄົງທີ່ກົງ spec", () => {
    expect(SLIP_STATUSES).toEqual(["PENDING_READ", "READ", "READ_FAILED", "CONFIRMED", "REJECTED"]);
    expect(SLIP_FLAGS).toEqual([
      "AMOUNT_MISMATCH",
      "DUPLICATE_REF",
      "DUPLICATE_IMAGE",
      "DEST_MISMATCH",
      "PAID_BEFORE_ORDER",
      "ORDER_NOT_PAYABLE",
      "UNREADABLE_FIELDS",
    ]);
  });
});

describe("strict body + edge cases", () => {
  it("ປະຕິເສດ key ທີ່ບໍ່ຮູ້ຈັກ", () => {
    expect(patchSlipSchema.safeParse({ orderId: "o1", confirmedAmmount: "1" }).success).toBe(false);
    expect(rejectSlipSchema.safeParse({ reason: "x", extra: 1 }).success).toBe(false);
    expect(linkChatSlipSchema.safeParse({ orderId: "o1", attachmentIndex: 0, extra: 1 }).success).toBe(false);
    expect(receivingAccountsSchema.safeParse([{ bank: "A", accountNo: "1", extra: 1 }]).success).toBe(false);
  });
  it("accountName ຫວ່າງບໍ່ໄດ້; patch ທີ່ມີແຕ່ undefined ບໍ່ຜ່ານ", () => {
    expect(receivingAccountsSchema.safeParse([{ bank: "A", accountNo: "1", accountName: "" }]).success).toBe(false);
    expect(patchSlipSchema.safeParse({ orderId: undefined }).success).toBe(false);
  });
});

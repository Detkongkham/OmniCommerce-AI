import { describe, expect, it } from "vitest";
import {
  PUBLIC_REPLY_ORDERED,
  PUBLIC_REPLY_REJECTED,
  buildOrderedText,
  buildRejectedText,
  formatAmount,
  formatClock,
} from "./cf-summary";

describe("formatAmount", () => {
  it("ຕັດ .00, ໃສ່ຈຸດຄັ່ນພັນ, ຮັກສາທົດສະນິຍົມຈິງ", () => {
    expect(formatAmount("200000.00")).toBe("200,000");
    expect(formatAmount("1234567.50")).toBe("1,234,567.50");
    expect(formatAmount("0.00")).toBe("0");
    expect(formatAmount("999")).toBe("999");
  });
});

describe("formatClock", () => {
  it("ເວລາລາວ (UTC+7) HH:mm; ມື້ອື່ນໃສ່ວັນທີ dd/MM", () => {
    const now = new Date("2026-10-07T07:00:00Z"); // 14:00 ລາວ
    expect(formatClock(new Date("2026-10-07T07:35:00Z"), now)).toBe("14:35");
    expect(formatClock(new Date("2026-10-07T16:30:00Z"), now)).toBe("23:30");
    expect(formatClock(new Date("2026-10-07T17:30:00Z"), now)).toBe("08/10 00:30");
  });
});

describe("buildOrderedText", () => {
  const base = {
    orderNumber: "SO-000012",
    lines: [
      { name: "ເສື້ອ ດຳ M", quantity: 2, lineTotal: "200000.00" },
      { name: "ໝວກ", quantity: 1, lineTotal: "50000.00" },
    ],
    total: "250000.00",
    currency: "LAK",
    reservedUntil: new Date("2026-10-07T07:35:00Z"),
    paymentInstructions: "BCEL 010-12-00-12345678 ຊື່ ຮ້ານ OCA",
    now: new Date("2026-10-07T07:00:00Z"),
  };
  it("ມີເລກບິນ, ລາຍການ, ຍອດ, ເວລາໂອນ ແລະ ຂໍ້ມູນໂອນ", () => {
    const text = buildOrderedText(base);
    expect(text).toContain("SO-000012");
    expect(text).toContain("ເສື້ອ ດຳ M x2 = 200,000");
    expect(text).toContain("ໝວກ x1 = 50,000");
    expect(text).toContain("250,000 LAK");
    expect(text).toContain("14:35");
    expect(text).toContain("BCEL 010-12-00-12345678 ຊື່ ຮ້ານ OCA");
  });
  it("ບໍ່ມີຂໍ້ມູນໂອນ/ເວລາໝົດ → ບໍ່ຂຽນແຖວນັ້ນ", () => {
    const text = buildOrderedText({ ...base, paymentInstructions: null, reservedUntil: null });
    expect(text).not.toContain("BCEL");
    expect(text).not.toContain("ກະລຸນາໂອນກ່ອນ");
  });
});

describe("buildRejectedText", () => {
  it("ໝົດ / ຄົບຈຳນວນ ລະບຸລະຫັດ", () => {
    expect(buildRejectedText("OUT_OF_STOCK", ["A1", "B02"])).toContain("A1, B02");
    expect(buildRejectedText("OUT_OF_STOCK", ["A1"])).toContain("ໝົດ");
    expect(buildRejectedText("LIMIT_REACHED", ["A1"])).toContain("ຄົບ");
  });
  it("ຂໍ້ຄວາມຄອມເມັ້ນສາທາລະນະເປັນຄ່າຄົງທີ່ທີ່ບໍ່ຮົ່ວຂໍ້ມູນລູກຄ້າ", () => {
    expect(PUBLIC_REPLY_ORDERED).not.toMatch(/SO-|\d{4}/);
    expect(PUBLIC_REPLY_REJECTED.length).toBeGreaterThan(0);
  });
});

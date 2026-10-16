import { describe, expect, it } from "vitest";
import { formatDate, formatPoints } from "./format";
import { isValidPin, pointTypeLabel, pointsValue, tierLabel, tierProgress } from "./member";
import { memberLockedMessage, pointsMessage } from "./messages";

describe("member helpers", () => {
  it("tierProgress: ສັດສ່ວນຍອດຕໍ່ເກນ, ຮອດເກນ = 100, ລະດັບສູງສຸດ = null", () => {
    expect(tierProgress({ spend12m: "500000.00", nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "1500000.00" } })).toBe(25);
    expect(tierProgress({ spend12m: "2500000.00", nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "0.00" } })).toBe(100);
    expect(tierProgress({ spend12m: "0.00", nextTier: null })).toBeNull();
  });

  it("ປ້າຍລະດັບ ແລະ ປະເພດແຕ້ມ ເປັນພາສາລາວ", () => {
    expect(tierLabel("GOLD")).toBe("Gold");
    expect(pointTypeLabel("EARN")).toBe("ໄດ້ຈາກບິນ");
    expect(pointTypeLabel("REDEEM")).toBe("ໃຊ້ໃນບິນ");
    expect(pointTypeLabel("EARN_REVERSAL")).toBe("ດຶງຄືນ (ບິນຖືກຍົກເລີກ)");
  });

  it("pointsValue / formatPoints / formatDate / isValidPin", () => {
    expect(pointsValue(25, "100.00")).toBe("2500.00");
    expect(formatPoints(1234)).toBe("1,234 ແຕ້ມ");
    expect(formatPoints(-50)).toBe("-50 ແຕ້ມ");
    expect(formatDate(new Date(2026, 9, 5, 12).toISOString())).toBe("05/10/2026");
    expect(formatDate("bad")).toBe("bad");
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
  });

  it("memberLockedMessage: ປັດນາທີຂຶ້ນ", () => {
    expect(memberLockedMessage(61)).toBe("ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລອງໃໝ່ໃນອີກ 2 ນາທີ");
    expect(memberLockedMessage(20)).toBe("ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລອງໃໝ່ໃນອີກ 1 ນາທີ");
    expect(memberLockedMessage(undefined)).toBe("ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລໍຖ້າຈັກໜ້ອຍແລ້ວລອງໃໝ່");
  });

  it("pointsMessage: ເຫດຜົນ + ລາຍລະອຽດ", () => {
    expect(pointsMessage({ reason: "OVER_CAP", maxPoints: 1200 })).toBe("ບິນນີ້ໃຊ້ໄດ້ສູງສຸດ 1,200 ແຕ້ມ");
    expect(pointsMessage({ reason: "INSUFFICIENT", balance: 40 })).toBe("ແຕ້ມບໍ່ພໍ (ມີ 40 ແຕ້ມ)");
    expect(pointsMessage({ reason: "PHONE_MISMATCH" })).toBe("ໃຊ້ແຕ້ມໄດ້ສະເພາະເມື່ອເບີໂທຜູ້ຮັບກົງກັບເບີຂອງບັນຊີ");
    expect(pointsMessage({ reason: "WHAT" })).toBe("ໃຊ້ແຕ້ມບໍ່ໄດ້");
  });
});

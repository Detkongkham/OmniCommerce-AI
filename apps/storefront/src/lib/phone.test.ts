import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone } from "./phone";

describe("phone", () => {
  it("normalizePhone ຕັດຍະຫວ່າງ, ຂີດ, ວົງເລັບ ແລະ ຈຸດ; ເກັບ + ນຳໜ້າ", () => {
    expect(normalizePhone(" 020 5555-5555 ")).toBe("02055555555");
    expect(normalizePhone("+856 (20) 55.555.555")).toBe("+8562055555555");
  });

  it("isValidPhone: ຕົວເລກ 6-15 ຫຼັກ (ກົດດຽວກັບ API)", () => {
    expect(isValidPhone("02055555555")).toBe(true);
    expect(isValidPhone("+8562055555555")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("020abc5555")).toBe(false);
    expect(isValidPhone("1".repeat(16))).toBe(false);
  });
});

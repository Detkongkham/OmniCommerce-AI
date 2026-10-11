import { describe, expect, it } from "vitest";
import { formatLak, priceRange } from "./format";

describe("formatLak", () => {
  it("ໃສ່ຈຸດຄັ່ນຫຼັກພັນ ແລະ ຕັດ .00", () => {
    expect(formatLak("12500.00")).toBe("12,500 ກີບ");
    expect(formatLak("1250000")).toBe("1,250,000 ກີບ");
    expect(formatLak("0.00")).toBe("0 ກີບ");
    expect(formatLak("999")).toBe("999 ກີບ");
  });

  it("ເກັບທົດສະນິຍົມທີ່ບໍ່ແມ່ນ 0", () => {
    expect(formatLak("1500.50")).toBe("1,500.50 ກີບ");
    expect(formatLak("1500.5")).toBe("1,500.50 ກີບ");
  });

  it("ຄ່າທີ່ບໍ່ແມ່ນຕົວເລກ ຄືນຄ່າເດີມ (ບໍ່ສະແດງ NaN)", () => {
    expect(formatLak("abc")).toBe("abc");
  });
});

describe("priceRange", () => {
  it("ລາຄາດຽວສະແດງຄ່າດຽວ; ຕ່າງກັນສະແດງເປັນຊ່ວງ", () => {
    expect(priceRange("100.00", "100.00")).toBe("100 ກີບ");
    expect(priceRange("100.00", "150.00")).toBe("100 – 150 ກີບ");
  });
});

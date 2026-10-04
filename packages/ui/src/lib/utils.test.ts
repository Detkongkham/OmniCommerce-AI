import { describe, expect, it } from "vitest";
import { cn, formatDate, formatNumber } from "./utils";

describe("cn", () => {
  it("ລວມ class ແລະ class ຫຼັງຊະນະ class ທີ່ຂັດກັນ", () => {
    const hidden = false as boolean;
    expect(cn("px-2", hidden && "hidden", "px-4")).toBe("px-4");
  });
});

describe("formatNumber", () => {
  it("ໃສ່ comma ຂັ້ນຫຼັກພັນ ແລະ ສະແດງທົດສະນິຍົມສະເພາະເມື່ອມີ", () => {
    expect(formatNumber(15000)).toBe("15,000");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(1234.5678)).toBe("1,234.57");
  });

  it("0 ສະແດງເປັນ 0; ຄ່າຫວ່າງ ຫຼື ບໍ່ແມ່ນຕົວເລກ ໃຊ້ fallback", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber("")).toBe("—");
    expect(formatNumber("abc")).toBe("—");
    expect(formatNumber(null, { fallback: "-" })).toBe("-");
  });

  it("ຮັບ string ທີ່ເປັນຕົວເລກ", () => {
    expect(formatNumber("2400000")).toBe("2,400,000");
  });
});

describe("formatDate", () => {
  it("ສະແດງ dd/MM/yyyy ຕາມເຂດເວລາ Asia/Vientiane", () => {
    expect(formatDate("2026-10-04T18:00:00Z")).toBe("05/10/2026");
    expect(formatDate(new Date("2026-10-04T00:00:00Z"))).toBe("04/10/2026");
  });

  it("ຄ່າຫວ່າງ ຫຼື ວັນທີຜິດ ໃຊ້ fallback", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

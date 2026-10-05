import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney } from "./format";

describe("formatMoney", () => {
  it("ໃສ່ comma ຂັ້ນພັນ ແລະ ຮັກສາ 2 ທົດສະນິຍົມຈາກ string", () => {
    expect(formatMoney("12500.00")).toBe("12,500.00");
    expect(formatMoney("0")).toBe("0.00");
    expect(formatMoney("1234567.5")).toBe("1,234,567.50");
  });
  it("ຄ່າຫວ່າງ/ຜິດ → —", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("abc")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("dd/MM/yyyy HH:mm ເວລາລາວ (UTC+7)", () => {
    expect(formatDateTime("2026-10-05T05:30:00.000Z")).toBe("05/10/2026 12:30");
    expect(formatDateTime("2026-10-04T18:00:00.000Z")).toBe("05/10/2026 01:00");
  });
  it("ຄ່າຫວ່າງ/ຜິດ → —", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });
});

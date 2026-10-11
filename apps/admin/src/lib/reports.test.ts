import { describe, expect, it } from "vitest";
import { formatDuration, isValidRange, matchPreset, presetRange, shortDay, storeToday } from "./reports";

// 2026-10-08 20:00 UTC = 2026-10-09 03:00 ເວລາລາວ
const now = new Date("2026-10-08T20:00:00Z");

describe("report ranges", () => {
  it("ມື້ນີ້ຕາມເວລາຮ້ານ", () => {
    expect(storeToday(now)).toBe("2026-10-09");
  });

  it("presets", () => {
    expect(presetRange("last7", now)).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(presetRange("last30", now)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
    expect(presetRange("thisMonth", now)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
    expect(presetRange("lastMonth", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("lastMonth", new Date("2026-03-10T00:00:00Z"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", new Date("2026-01-05T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("matchPreset", () => {
    expect(matchPreset({ from: "2026-10-03", to: "2026-10-09" }, now)).toBe("last7");
    expect(matchPreset({ from: "2026-10-04", to: "2026-10-09" }, now)).toBeNull();
  });

  it("isValidRange", () => {
    expect(isValidRange({ from: "2026-10-01", to: "2026-10-01" })).toBe(true);
    expect(isValidRange({ from: "2026-10-02", to: "2026-10-01" })).toBe(false);
    expect(isValidRange({ from: "", to: "2026-10-01" })).toBe(false);
    expect(isValidRange({ from: "2025-01-01", to: "2026-01-01" })).toBe(true);
    expect(isValidRange({ from: "2025-01-01", to: "2026-01-02" })).toBe(false);
  });

  it("formatDuration / shortDay", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(shortDay("2026-10-05")).toBe("05/10");
  });
});

import { describe, expect, it } from "vitest";
import { fromDatetimeLocal, toDatetimeLocal } from "./datetime-local";

describe("datetime-local", () => {
  it("ໄປ-ກັບ ໄດ້ຄ່າເດີມ (ຕັດວິນາທີ)", () => {
    const iso = "2026-10-11T03:45:00.000Z";
    expect(fromDatetimeLocal(toDatetimeLocal(iso))).toBe(iso);
    expect(toDatetimeLocal(iso)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("ວ່າງ ຫຼື ຜິດ → '' / null", () => {
    expect(toDatetimeLocal(null)).toBe("");
    expect(toDatetimeLocal("nope")).toBe("");
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("nope")).toBeNull();
  });
});

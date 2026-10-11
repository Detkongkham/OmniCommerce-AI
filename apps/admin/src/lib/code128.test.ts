import { describe, expect, it } from "vitest";
import { code128Bars, code128Modules } from "./code128";

describe("code128 (set B)", () => {
  it("ຂໍ້ມູນທີ່ຮູ້ຄຳຕອບ: 'A' = start B + A + checksum + stop", () => {
    // START B (104) = 11010010000, 'A' (33) = 10100011000, checksum (104+33)%103 = 34 → 10001011000, STOP = 1100011101011
    expect(code128Modules("A")).toBe("11010010000" + "10100011000" + "10001011000" + "1100011101011");
  });

  it("ຄວາມຍາວ = 11 × (ຕົວອັກສອນ + 2) + 13; ແຕ່ລະ module ເປັນ 0/1", () => {
    const modules = code128Modules("SO-000123");
    expect(modules).toHaveLength(11 * (9 + 2) + 13);
    expect(modules).toMatch(/^[01]+$/);
  });

  it("ຕົວອັກສອນນອກ ASCII 32–126 → throw", () => {
    expect(() => code128Modules("ກ")).toThrow();
  });

  it("code128Bars ລວມ module ດຳທີ່ຕິດກັນເປັນແທ່ງ (x, width)", () => {
    expect(code128Bars("A").slice(0, 3)).toEqual([
      { x: 0, width: 2 },
      { x: 3, width: 1 },
      { x: 6, width: 1 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeCfText, parseCf } from "./cf-parser";

describe("normalizeCfText", () => {
  it("ຕົວໃຫຍ່, ຍຸບຊ່ອງວ່າງ, ເລກລາວ → ASCII, full-width → ASCII", () => {
    expect(normalizeCfText("  a1  ")).toBe("A1");
    expect(normalizeCfText("ດຳ   m")).toBe(normalizeCfText("ດຳ M"));
    expect(normalizeCfText("A໑໒")).toBe("A12");
    expect(normalizeCfText("Ａ１")).toBe("A1");
  });

  it("ຕັດຕົວອັກສອນຄວາມກວ້າງສູນ (ZWSP ແລະ ຄ້າຍກັນ) ກ່ອນຍຸບຊ່ອງວ່າງ", () => {
    expect(normalizeCfText("A\u200B1")).toBe("A1");
    expect(normalizeCfText("A\u200B 1")).toBe("A 1");
    expect(normalizeCfText("\uFEFFA\u200C1\u200D\u2060")).toBe("A1");
  });

  it("ປະກອບ ຳ (U+0EB3) ຄືນຫຼັງ NFKC (ຂຽນດ້ວຍ escape ເພື່ອບໍ່ໃຫ້ editor normalize)", () => {
    // input ແຍກສ່ວນ: ດ + ໍ(U+0ECD) + າ(U+0EB2) + " M"
    expect(normalizeCfText("\u0E94\u0ECD\u0EB2 M")).toBe("\u0E94\u0EB3 M");
    // ມີວັນນະຍຸດ: ນ + ້(U+0EC9) + ຳ(U+0EB3)
    expect(normalizeCfText("\u0E99\u0EC9\u0EB3")).toBe("\u0E99\u0EC9\u0EB3");
    expect(normalizeCfText("\u0E99\u0EC9\u0ECD\u0EB2")).toBe("\u0E99\u0EC9\u0EB3");
  });
});

describe("parseCf", () => {
  const codes = ["A1", "B02", "ດຳ M"];
  const one = (code: string, quantity = 1) => [{ code: normalizeCfText(code), quantity }];

  it("ລະຫັດດ່ຽວ (ບໍ່ສົນຕົວໃຫຍ່-ນ້ອຍ), ຈຳນວນຕົກລົງ 1", () => {
    expect(parseCf("A1", codes)).toEqual(one("A1"));
    expect(parseCf("a1", codes)).toEqual(one("A1"));
    expect(parseCf("  b02 ", codes)).toEqual(one("B02"));
  });

  it("ມີ CF ນຳໜ້າ", () => {
    expect(parseCf("CF A1", codes)).toEqual(one("A1"));
    expect(parseCf("cf a1 2", codes)).toEqual(one("A1", 2));
    expect(parseCf("CF:A1", codes)).toEqual(one("A1"));
  });

  it("ຈຳນວນ: ຊ່ອງວ່າງ, x, ×, *", () => {
    expect(parseCf("A1 2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1 x2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1×2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1*3", codes)).toEqual(one("A1", 3));
    expect(parseCf("B02 2", codes)).toEqual(one("B02", 2));
  });

  it("ລະຫັດມີຊ່ອງວ່າງ (ດຳ M) ແລະ ເລກລາວ", () => {
    expect(parseCf("ດຳ M 1", codes)).toEqual(one("ດຳ M"));
    expect(parseCf("ດຳ  m", codes)).toEqual(one("ດຳ M"));
    expect(parseCf("A1 ໒", codes)).toEqual(one("A1", 2));
  });

  it("ຫຼາຍລະຫັດ ແລະ ລະຫັດຊ້ຳລວມຈຳນວນ", () => {
    expect(parseCf("A1 B02 2", codes)).toEqual([...one("A1"), ...one("B02", 2)]);
    expect(parseCf("A1 2 B02", codes)).toEqual([...one("A1", 2), ...one("B02")]);
    expect(parseCf("A1, B02", codes)).toEqual([...one("A1"), ...one("B02")]);
    expect(parseCf("A1 A1", codes)).toEqual(one("A1", 2));
  });

  it("full-width", () => {
    expect(parseCf("Ａ１ ２", codes)).toEqual(one("A1", 2));
  });

  it("ລະຫັດຍາວກ່ອນ: ມີທັງ A ແລະ A1", () => {
    expect(parseCf("A1", ["A", "A1"])).toEqual(one("A1"));
    expect(parseCf("A", ["A", "A1"])).toEqual(one("A"));
  });

  it("ລະຫັດທີ່ຂຶ້ນຕົ້ນດ້ວຍ CF ບໍ່ຖືກຕັດ", () => {
    expect(parseCf("CF1", ["CF1"])).toEqual(one("CF1"));
  });

  it("ZWSP ກາງລະຫັດຖືກຕັດ", () => {
    expect(parseCf("A\u200B1", ["A1"])).toEqual(one("A1"));
  });

  it("ລະຫັດຕົວເລກ: ຈຳນວນຊະນະ (greedy) — ກຳກວມ ຈຶ່ງຖືວ່າເລກທີສອງເປັນຈຳນວນ", () => {
    expect(parseCf("1 2", ["1", "2"])).toEqual(one("1", 2));
  });

  it("ບໍ່ແມ່ນ CF → null", () => {
    expect(parseCf(",", codes)).toBeNull();
    expect(parseCf("CF:", codes)).toBeNull();
    expect(parseCf("A1 ລາຄາເທົ່າໃດ", codes)).toBeNull();
    expect(parseCf("ສະບາຍດີ", codes)).toBeNull();
    expect(parseCf("A12", codes)).toBeNull();
    expect(parseCf("Z9", codes)).toBeNull();
    expect(parseCf("", codes)).toBeNull();
    expect(parseCf("   ", codes)).toBeNull();
    expect(parseCf("CF", codes)).toBeNull();
    expect(parseCf("A1", [])).toBeNull();
  });

  it("ຈຳນວນນອກຊ່ວງ 1..99 → null", () => {
    expect(parseCf("A1 0", codes)).toBeNull();
    expect(parseCf("A1 100", codes)).toBeNull();
    expect(parseCf("A1 99", codes)).toEqual(one("A1", 99));
    expect(parseCf("A1 99 A1", codes)).toBeNull();
  });
});

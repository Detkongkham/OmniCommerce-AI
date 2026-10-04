import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "./slug";

describe("slugify", () => {
  it("ປ່ຽນເປັນຕົວນ້ອຍ ແລະ ໃຊ້ - ຄັ່ນ", () => {
    expect(slugify("  Black T-Shirt (M) ")).toBe("black-t-shirt-m");
  });
  it("ຍຸບ - ຕິດກັນ ແລະ ຕັດ - ທ້າຍ/ໜ້າ", () => {
    expect(slugify("--a__b--")).toBe("a-b");
  });
  it("ຊື່ລາວລ້ວນໄດ້ສະຕຣິງວ່າງ (ຜູ້ເອີ້ນຕ້ອງມີ fallback)", () => {
    expect(slugify("ເສື້ອຍືດ")).toBe("");
  });
  it("ຜົນລັບ non-empty ຜ່ານ SLUG_PATTERN", () => {
    expect(SLUG_PATTERN.test(slugify("Hello World 2"))).toBe(true);
  });
  it("ຕັດຄວາມຍາວບໍ່ເກີນ 100", () => {
    expect(slugify("a".repeat(300)).length).toBe(100);
  });
});

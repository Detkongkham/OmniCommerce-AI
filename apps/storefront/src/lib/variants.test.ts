import { describe, expect, it } from "vitest";
import type { StoreProductDetail, StoreVariant } from "./types";
import { findVariant, initialSelection, isValueSelectable, selectValue, variantChoices } from "./variants";

const variant = (id: string, optionValues: Record<string, string>, status: "IN_STOCK" | "LOW" | "OUT" = "IN_STOCK"): StoreVariant => ({
  id,
  name: Object.values(optionValues).join(" / ") || null,
  price: "100.00",
  compareAtPrice: null,
  optionValues,
  stock: { status, remaining: status === "LOW" ? 2 : null },
});

const product = (patch: Partial<StoreProductDetail>): StoreProductDetail => ({
  slug: "tee",
  name: "ເສື້ອ",
  description: null,
  category: null,
  options: [],
  variants: [],
  images: [],
  ...patch,
});

const tee = product({
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    variant("bm", { ສີ: "ດຳ", ໄຊສ໌: "M" }, "OUT"),
    variant("bl", { ສີ: "ດຳ", ໄຊສ໌: "L" }),
    variant("wm", { ສີ: "ຂາວ", ໄຊສ໌: "M" }),
  ],
});

describe("variantChoices", () => {
  it("ສິນຄ້າມີ options: ໃຊ້ຕາມທີ່ API ໃຫ້", () => {
    const { groups, variants } = variantChoices(tee);
    expect(groups).toEqual(tee.options);
    expect(variants).toBe(tee.variants);
  });

  it("ບໍ່ມີ options ແລະ variant ດຽວ: ບໍ່ມີກຸ່ມໃຫ້ເລືອກ", () => {
    const single = product({ variants: [variant("only", {})] });
    expect(variantChoices(single).groups).toEqual([]);
  });

  it("ບໍ່ມີ options ແຕ່ຫຼາຍ variant: ສ້າງກຸ່ມ 'ແບບ' ຈາກຊື່ variant", () => {
    const multi = product({
      variants: [
        { ...variant("a", {}), name: "ກ່ອງນ້ອຍ" },
        { ...variant("b", {}), name: null },
      ],
    });
    const { groups, variants } = variantChoices(multi);
    expect(groups).toEqual([{ name: "ແບບ", values: ["ກ່ອງນ້ອຍ", "ແບບ 2"] }]);
    expect(variants.map((item) => item.optionValues)).toEqual([{ ແບບ: "ກ່ອງນ້ອຍ" }, { ແບບ: "ແບບ 2" }]);
  });
});

describe("findVariant", () => {
  it("ຄືນ variant ທີ່ກົງທຸກຕົວເລືອກ; ເລືອກບໍ່ຄົບ ຫຼື ບໍ່ມີຄູ່ນີ້ = undefined", () => {
    expect(findVariant(tee.variants, { ສີ: "ດຳ", ໄຊສ໌: "L" })?.id).toBe("bl");
    expect(findVariant(tee.variants, { ສີ: "ຂາວ", ໄຊສ໌: "L" })).toBeUndefined();
    expect(findVariant(tee.variants, { ສີ: "ດຳ" })).toBeUndefined();
  });

  it("variant ທີ່ບໍ່ມີຕົວເລືອກ ກົງກັບ selection ຫວ່າງ", () => {
    expect(findVariant([variant("only", {})], {})?.id).toBe("only");
  });
});

describe("initialSelection", () => {
  it("ເລືອກ variant ທຳອິດທີ່ຍັງມີຂອງ", () => {
    expect(initialSelection(tee.variants)).toEqual({ ສີ: "ດຳ", ໄຊສ໌: "L" });
  });

  it("ໝົດທຸກ variant → ເລືອກໂຕທຳອິດ; ບໍ່ມີ variant → ຫວ່າງ", () => {
    const allOut = [variant("a", { ສີ: "ດຳ" }, "OUT"), variant("b", { ສີ: "ຂາວ" }, "OUT")];
    expect(initialSelection(allOut)).toEqual({ ສີ: "ດຳ" });
    expect(initialSelection([])).toEqual({});
  });
});

describe("isValueSelectable", () => {
  it("ຄ່າທີ່ບໍ່ມີ variant ຮ່ວມກັບຕົວເລືອກອື່ນທີ່ເລືອກຢູ່ = ເລືອກບໍ່ໄດ້", () => {
    const selection = { ສີ: "ຂາວ", ໄຊສ໌: "M" };
    expect(isValueSelectable(tee.variants, selection, "ໄຊສ໌", "L")).toBe(false);
    expect(isValueSelectable(tee.variants, selection, "ໄຊສ໌", "M")).toBe(true);
    // ປ່ຽນສີໄດ້ສະເໝີຖ້າມີ variant ຂອງສີນັ້ນກັບໄຊສ໌ທີ່ເລືອກ
    expect(isValueSelectable(tee.variants, selection, "ສີ", "ດຳ")).toBe(true);
  });
});

describe("selectValue", () => {
  it("ຄູ່ທີ່ມີ variant: ປ່ຽນສະເພາະຕົວເລືອກນັ້ນ", () => {
    expect(selectValue(tee.variants, { ສີ: "ດຳ", ໄຊສ໌: "L" }, "ໄຊສ໌", "M")).toEqual({ ສີ: "ດຳ", ໄຊສ໌: "M" });
  });

  it("ຄູ່ທີ່ບໍ່ມີຂາຍ: ຍ້າຍໄປ variant ທີ່ມີຄ່ານັ້ນ (ເອົາໂຕທີ່ມີຂອງກ່ອນ)", () => {
    // ຂາວ ບໍ່ມີ L → ໄປ ຂາວ/M
    expect(selectValue(tee.variants, { ສີ: "ດຳ", ໄຊສ໌: "L" }, "ສີ", "ຂາວ")).toEqual({ ສີ: "ຂາວ", ໄຊສ໌: "M" });
    // L ບໍ່ມີ ຂາວ → ໄປ ດຳ/L
    expect(selectValue(tee.variants, { ສີ: "ຂາວ", ໄຊສ໌: "M" }, "ໄຊສ໌", "L")).toEqual({ ສີ: "ດຳ", ໄຊສ໌: "L" });
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_VARIANTS,
  type OptionDraft,
  type VariantDraft,
  activeOptions,
  combinations,
  countCombinations,
  renameOptionKeys,
  suggestSku,
  syncVariants,
} from "./variant-matrix";

const color: OptionDraft = { name: "Color", values: ["Red", "Blue"] };
const size: OptionDraft = { name: "Size", values: ["S", "M", "L"] };

describe("activeOptions", () => {
  it("ຕັດ option ທີ່ຊື່ເປົ່າ/ບໍ່ມີຄ່າ, trim ແລະ ລຶບຄ່າຊ້ຳ", () => {
    expect(
      activeOptions([
        { name: " Color ", values: ["Red", " Red ", "", "Blue"] },
        { name: "", values: ["x"] },
        { name: "Size", values: [] },
      ]),
    ).toEqual([{ name: "Color", values: ["Red", "Blue"] }]);
  });
});

describe("combinations / countCombinations", () => {
  it("ບໍ່ມີ option → 1 ແຖວວ່າງ (ສິນຄ້າທີ່ມີ variant ດຽວ)", () => {
    expect(combinations([])).toEqual([{}]);
    expect(countCombinations([])).toBe(1);
  });
  it("cartesian ຕາມລຳດັບ option", () => {
    expect(combinations([color, size])).toHaveLength(6);
    expect(combinations([color, size])[0]).toEqual({ Color: "Red", Size: "S" });
    expect(combinations([color, size])[5]).toEqual({ Color: "Blue", Size: "L" });
    expect(countCombinations([color, size])).toBe(6);
  });
});

describe("suggestSku", () => {
  it("prefix + ຄ່າ ທີ່ເຫຼືອສະເພາະ A-Z a-z 0-9 . _ -", () => {
    expect(suggestSku("TEE", ["Red", "S"], 1)).toBe("TEE-Red-S");
    expect(suggestSku("T shirt", ["Dark Blue", "XL"], 1)).toBe("Tshirt-DarkBlue-XL");
  });
  it("ຄ່າທີ່ເປັນຕົວອັກສອນລາວ (ຖືກລຶບໝົດ) → ໃຊ້ prefix + ເລກລຳດັບ", () => {
    expect(suggestSku("TEE", ["ແດງ", "S"], 3)).toBe("TEE-3");
    expect(suggestSku("", ["ແດງ"], 2)).toBe("2");
  });
  it("ບໍ່ມີຄ່າ (ບໍ່ມີ option) → prefix ເທົ່ານັ້ນ", () => {
    expect(suggestSku("TEE", [], 1)).toBe("TEE");
  });
});

describe("syncVariants", () => {
  it("ສ້າງແຖວຈາກ cartesian ໂດຍເອົາລາຄາ/ຕົ້ນທຶນຈາກແຖວທຳອິດເດີມ", () => {
    const first: VariantDraft = {
      key: "[]",
      sku: "TEE",
      barcode: "",
      price: "100",
      costPrice: "60",
      isActive: true,
      optionValues: {},
    };
    const rows = syncVariants([color], [first], "TEE");
    expect(rows.map((row) => row.optionValues)).toEqual([{ Color: "Red" }, { Color: "Blue" }]);
    expect(rows.map((row) => row.sku)).toEqual(["TEE-Red", "TEE-Blue"]);
    expect(rows.every((row) => row.price === "100" && row.costPrice === "60" && row.isActive)).toBe(true);
  });

  it("ແຖວທີ່ແກ້ແລ້ວ ແລະ ຍັງຢູ່ໃນ cartesian ຖືກຮັກສາໄວ້; ແຖວທີ່ຄ່າຫາຍຖືກລຶບ", () => {
    const rows1 = syncVariants([color], [], "TEE");
    const edited = rows1.map((row) => (row.optionValues.Color === "Red" ? { ...row, sku: "MY-RED", price: "250" } : row));
    const rows2 = syncVariants([{ name: "Color", values: ["Red", "Green"] }], edited, "TEE");
    expect(rows2.map((row) => row.optionValues.Color)).toEqual(["Red", "Green"]);
    expect(rows2[0]).toMatchObject({ sku: "MY-RED", price: "250" });
    expect(rows2[1]?.sku).toBe("TEE-Green");
  });

  it("ເກີນ MAX_VARIANTS: ຄືນລາຍການເດີມ ບໍ່ສ້າງໃໝ່", () => {
    const big: OptionDraft[] = [
      { name: "A", values: Array.from({ length: 10 }, (_, i) => `a${i}`) },
      { name: "B", values: Array.from({ length: 11 }, (_, i) => `b${i}`) },
    ];
    expect(countCombinations(big)).toBe(110);
    expect(MAX_VARIANTS).toBe(100);
    const previous = syncVariants([color], [], "T");
    expect(syncVariants(big, previous, "T")).toBe(previous);
  });
});

describe("activeOptions: ຊື່ຊ້ຳ", () => {
  it("option ຊື່ດຽວກັນ (ຫຼັງ trim) ຖືກຕັດອັນຫຼັງ ເພື່ອບໍ່ໃຫ້ເກີດແຖວຊ້ຳ", () => {
    expect(
      activeOptions([
        { name: "Color", values: ["Red"] },
        { name: " Color ", values: ["Blue"] },
      ]),
    ).toEqual([{ name: "Color", values: ["Red"] }]);
  });
});

describe("syncVariants: edge cases", () => {
  const edit = (rows: VariantDraft[], colorValue: string) =>
    rows.map((row) => (row.optionValues.Color === colorValue ? { ...row, sku: "EDITED", barcode: "123", price: "999" } : row));

  it("ບໍ່ມີ option → 1 ແຖວເລີ່ມຕົ້ນ ໃຊ້ prefix ເປັນ SKU ແລະ key ວ່າງ", () => {
    const rows = syncVariants([], [], "TEE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "[]", sku: "TEE", price: "", costPrice: "", isActive: true, optionValues: {} });
  });

  it("option ວ່າງ/ບໍ່ມີຄ່າ ຖືກຖືວ່າບໍ່ມີ option", () => {
    const rows = syncVariants([{ name: "Color", values: ["", " "] }, { name: "", values: ["x"] }], [], "TEE");
    expect(rows.map((row) => row.optionValues)).toEqual([{}]);
  });

  it("ຄ່າຊ້ຳ ບໍ່ສ້າງແຖວຊ້ຳ", () => {
    const rows = syncVariants([{ name: "Color", values: ["Red", "Red", " Red"] }], [], "TEE");
    expect(rows).toHaveLength(1);
  });

  it("ຮັກສາແຖວທີ່ແກ້ແລ້ວເມື່ອສະຫຼັບລຳດັບ option", () => {
    const rows1 = edit(syncVariants([color, size], [], "TEE"), "Red");
    const edited = rows1.find((row) => row.optionValues.Color === "Red" && row.optionValues.Size === "M");
    const rows2 = syncVariants([size, color], rows1, "TEE");
    expect(rows2).toHaveLength(6);
    const found = rows2.find((row) => row.optionValues.Color === "Red" && row.optionValues.Size === "M");
    expect(found).toMatchObject({ sku: "EDITED", price: "999" });
    expect(found?.optionValues).toEqual(edited?.optionValues);
    // ລຳດັບແຖວຕາມ option ໃໝ່ (Size ກ່ອນ)
    expect(rows2[0]?.optionValues).toEqual({ Size: "S", Color: "Red" });
  });

  it("ຮັກສາແຖວທີ່ແກ້ແລ້ວເມື່ອເພີ່ມຄ່າໃໝ່ເຂົ້າ option ເດີມ", () => {
    const rows1 = edit(syncVariants([color], [], "TEE"), "Blue");
    const rows2 = syncVariants([{ name: "Color", values: ["Red", "Blue", "Green"] }], rows1, "TEE");
    expect(rows2.map((row) => row.optionValues.Color)).toEqual(["Red", "Blue", "Green"]);
    expect(rows2[1]).toMatchObject({ sku: "EDITED", price: "999" });
    // ແຖວໃໝ່ເອົາລາຄາຈາກແຖວທຳອິດ
    expect(rows2[2]?.sku).toBe("TEE-Green");
  });

  it("ເພີ່ມ option ທີສອງ: ແຖວເດີມບໍ່ກົງ key ແລ້ວ (ສ້າງໃໝ່) ແຕ່ລາຄາຖືກສືບທອດຈາກແຖວທຳອິດ", () => {
    const rows1 = syncVariants([], [], "TEE").map((row) => ({ ...row, price: "50", costPrice: "30" }));
    const rows2 = syncVariants([color], rows1, "TEE");
    expect(rows2.map((row) => row.price)).toEqual(["50", "50"]);
    expect(rows2.map((row) => row.costPrice)).toEqual(["30", "30"]);
  });

  it("ລຶບ option ອອກໝົດ → ກັບເປັນ 1 ແຖວ ແລະ ແຖວທຳອິດທີ່ແກ້ແລ້ວຖືກຮັກສາ (ບໍ່ມີ option ຄ້າງ)", () => {
    const rows1 = syncVariants([], [], "TEE").map((row) => ({ ...row, sku: "ONLY", price: "7" }));
    const rows2 = syncVariants([color], rows1, "TEE");
    const back = syncVariants([], rows2, "TEE");
    expect(back).toHaveLength(1);
    expect(back[0]?.optionValues).toEqual({});
    expect(back[0]?.key).toBe("[]");
  });

  it("ລຶບ option ຫຼາຍແຖວຍຸບເປັນ key ດຽວ: ເກັບແຖວທຳອິດ (ບໍ່ແມ່ນແຖວສຸດທ້າຍ)", () => {
    const rows1 = syncVariants([color, size], [], "TEE");
    const tagged = rows1.map((row, index) => ({ ...row, sku: `ROW-${index}` }));
    const rows2 = syncVariants([color], tagged, "TEE");
    expect(rows2.map((row) => row.sku)).toEqual(["ROW-0", "ROW-3"]);
    expect(rows2[0]?.optionValues).toEqual({ Color: "Red" });
  });

  it("ໃຊ້ໄດ້ພໍດີ 100 variant; 101 ຖືກປະຕິເສດ", () => {
    const ten = (name: string) => ({ name, values: Array.from({ length: 10 }, (_, i) => `${name}${i}`) });
    expect(syncVariants([ten("A"), ten("B")], [], "T")).toHaveLength(100);
    const previous: VariantDraft[] = [];
    expect(syncVariants([ten("A"), { ...ten("B"), values: [...ten("B").values, "extra"] }], previous, "T")).toBe(previous);
  });

  it("ແຖວຊ້ຳກັນໃນ previous ບໍ່ເຮັດໃຫ້ຜົນຊ້ຳ", () => {
    const base = syncVariants([color], [], "TEE");
    const doubled = [...base, ...base];
    expect(syncVariants([color], doubled, "TEE")).toHaveLength(2);
  });

  it("isActive=false ຂອງແຖວທີ່ຮັກສາໄວ້ບໍ່ຖືກຣີເຊັດ", () => {
    const base = syncVariants([color], [], "TEE").map((row) => ({ ...row, isActive: false }));
    expect(syncVariants([color], base, "TEE").every((row) => !row.isActive)).toBe(true);
  });
});

describe("renameOptionKeys", () => {
  const color: OptionDraft = { name: "Color", values: ["Red", "Blue"] };
  const size: OptionDraft = { name: "Size", values: ["S"] };
  const rows = syncVariants([color, size], [], "T");

  it("renames the optionValues keys by option index and keeps every edited field", () => {
    const edited = rows.map((row, i) => (i === 1 ? { ...row, sku: "MINE", price: "9" } : row));
    const renamed = renameOptionKeys([color, size], [{ ...color, name: "Colors" }, size], edited);
    expect(renamed?.map((row) => row.optionValues)).toEqual([
      { Colors: "Red", Size: "S" },
      { Colors: "Blue", Size: "S" },
    ]);
    expect(renamed?.[1]).toMatchObject({ sku: "MINE", price: "9" });
  });

  it("returns null when nothing is renamed, values change, or a name becomes blank/duplicate", () => {
    expect(renameOptionKeys([color, size], [color, size], rows)).toBeNull();
    expect(renameOptionKeys([color], [{ name: "Colors", values: ["Red"] }], rows)).toBeNull();
    expect(renameOptionKeys([color, size], [{ ...color, name: "" }, size], rows)).toBeNull();
    expect(renameOptionKeys([color, size], [color, { ...size, name: "Color" }], rows)).toBeNull();
    expect(renameOptionKeys([], [color], rows)).toBeNull();
  });
});

describe("syncVariants: SKU uniqueness across incremental syncs", () => {
  const skus = (rows: VariantDraft[]) => rows.map((row) => row.sku);

  it("replays incremental typing (Lao values) and ends with 4 unique non-empty SKUs", () => {
    const steps: OptionDraft[][] = [
      [{ name: "ສີ", values: ["ແດງ"] }],
      [{ name: "ສີ", values: ["ແດງ", "ຟ້າ"] }],
      [{ name: "ສີ", values: ["ແດງ", "ຟ້າ"] }, { name: "ໄຊສ໌", values: [] }],
      [{ name: "ສີ", values: ["ແດງ", "ຟ້າ"] }, { name: "ໄຊສ໌", values: ["S"] }],
      [{ name: "ສີ", values: ["ແດງ", "ຟ້າ"] }, { name: "ໄຊສ໌", values: ["S", "M"] }],
    ];
    let rows = syncVariants([], [], "SMK");
    for (const step of steps) {
      rows = syncVariants(step, rows, "SMK");
      const all = skus(rows);
      expect(new Set(all).size).toBe(all.length);
      expect(all.every((sku) => sku.trim() !== "")).toBe(true);
    }
    expect(rows).toHaveLength(4);
  });

  it("never gives a new row a SKU the user typed into another row, and keeps preserved SKUs", () => {
    const two = syncVariants([{ name: "C", values: ["ແດງ", "ຟ້າ"] }], [], "T");
    const typed = two.map((row, index) => (index === 0 ? { ...row, sku: "T-3" } : row));
    const kept = typed[1]?.sku;
    const rows = syncVariants([{ name: "C", values: ["ແດງ", "ຟ້າ", "ດຳ"] }], typed, "T");
    expect(rows[0]?.sku).toBe("T-3");
    expect(rows[1]?.sku).toBe(kept);
    const all = skus(rows);
    expect(new Set(all).size).toBe(3);
  });

  it("compares trimmed and case-sensitively", () => {
    const base = syncVariants([{ name: "C", values: ["ແດງ"] }], [], "T");
    const typed = base.map((row) => ({ ...row, sku: " T-2 " }));
    const rows = syncVariants([{ name: "C", values: ["ແດງ", "ຟ້າ"] }], typed, "T");
    expect(rows[1]?.sku.trim()).not.toBe("T-2");
    const lower = base.map((row) => ({ ...row, sku: "t-2" }));
    expect(syncVariants([{ name: "C", values: ["ແດງ", "ຟ້າ"] }], lower, "T")[1]?.sku).toBe("T-2");
  });

  it("all-Latin values still give readable SKUs", () => {
    let rows = syncVariants([], [], "SMK");
    rows = syncVariants([{ name: "Color", values: ["Red", "Blue"] }], rows, "SMK");
    rows = syncVariants(
      [{ name: "Color", values: ["Red", "Blue"] }, { name: "Size", values: ["S", "M"] }],
      rows,
      "SMK",
    );
    expect(skus(rows)).toEqual(["SMK-Red-S", "SMK-Red-M", "SMK-Blue-S", "SMK-Blue-M"]);
  });
});

import { createProductSchema } from "@oca/shared";
import { describe, expect, it } from "vitest";
import {
  type ProductFormState,
  emptyProductForm,
  formatIssues,
  toCreateProductInput,
  validateProductForm,
} from "./product-form";

const base = (patch: Partial<ProductFormState> = {}): ProductFormState => ({
  ...emptyProductForm(),
  name: "Tee",
  variants: [
    { key: "[]", sku: "TEE", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: {} },
  ],
  ...patch,
});

describe("toCreateProductInput", () => {
  it("ສິນຄ້າບໍ່ມີ option: ຂ້າມ field ເປົ່າ (slug, description, categoryId, barcode, ຮູບ)", () => {
    const input = toCreateProductInput(base(), true);
    expect(input).toEqual({
      name: "Tee",
      status: "DRAFT",
      options: [],
      variants: [{ sku: "TEE", price: "100", costPrice: "60", isActive: true, optionValues: {} }],
      images: [],
    });
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });

  it("ບໍ່ມີ costs:write → ບໍ່ສົ່ງ costPrice (API ຕອບ 403 ຖ້າບໍ່ແມ່ນ 0)", () => {
    const input = toCreateProductInput(base(), false) as { variants: Record<string, unknown>[] };
    expect(input.variants[0]).not.toHaveProperty("costPrice");
  });

  it("option + variant + ຮູບທີ່ຜູກກັບ variant ຜ່ານ SKU", () => {
    const state = base({
      slug: "tee",
      description: "Soft",
      categoryId: "c1",
      status: "ACTIVE",
      options: [{ name: "Color", values: ["Red", "Blue"] }],
      variants: [
        { key: '["Red"]', sku: "TEE-R", barcode: "885", price: "100", costPrice: "", isActive: true, optionValues: { Color: "Red" } },
        { key: '["Blue"]', sku: "TEE-B", barcode: "", price: "110", costPrice: "", isActive: false, optionValues: { Color: "Blue" } },
      ],
      images: [
        { url: " https://x/a.png ", alt: "front", variantKey: "" },
        { url: "https://x/b.png", alt: "", variantKey: '["Blue"]' },
        { url: "   ", alt: "", variantKey: "" },
      ],
    });
    const input = toCreateProductInput(state, true);
    expect(input).toMatchObject({
      slug: "tee",
      description: "Soft",
      categoryId: "c1",
      status: "ACTIVE",
      options: [{ name: "Color", values: ["Red", "Blue"] }],
      images: [{ url: "https://x/a.png", alt: "front" }, { url: "https://x/b.png", variantSku: "TEE-B" }],
    });
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });
});

describe("formatIssues", () => {
  it("แปลง path ເປັນຮູບທີ່ອ່ານງ່າຍ", () => {
    const result = createProductSchema.safeParse(
      toCreateProductInput(base({ name: "", variants: [{ ...base().variants[0]!, price: "abc" }] }), true),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const lines = formatIssues(result.error.issues);
      expect(lines.some((line) => line.startsWith("name:"))).toBe(true);
      expect(lines.some((line) => line.startsWith("variants[1].price:"))).toBe(true);
    }
  });
});

const variantRow = (sku: string, optionValues: Record<string, string> = {}, key = JSON.stringify(optionValues)) => ({
  key,
  sku,
  barcode: "",
  price: "10",
  costPrice: "",
  isActive: true,
  optionValues,
});

describe("validateProductForm", () => {
  it("ຜ່ານ: ຄືນ input ທີ່ parse ແລ້ວ", () => {
    const result = validateProductForm(base(), true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.name).toBe("Tee");
  });

  it("SKU ຊ້ຳ (ບໍ່ສົນຕົວພິມ/ຊ່ອງວ່າງ) → ຂໍ້ຄວາມຊີ້ແຖວ ແລະ ບໍ່ມີ 'SKU ຊ້ຳກັນ' ຊ້ຳຊ້ອນ", () => {
    const state = base({
      options: [{ name: "Color", values: ["Red", "Blue", "Green"] }],
      variants: [
        variantRow("TEE-R", { Color: "Red" }),
        variantRow(" tee-r ", { Color: "Blue" }),
        variantRow("TEE-G", { Color: "Green" }),
      ],
    });
    const result = validateProductForm(state, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const dup = result.messages.filter((line) => line.includes("SKU"));
      expect(dup).toHaveLength(1);
      expect(dup[0]).toContain("1, 2");
      expect(result.messages.some((line) => line === "variants: SKU ຊ້ຳກັນ")).toBe(false);
    }
  });

  it("SKU ເປົ່າຫຼາຍແຖວບໍ່ນັບເປັນຊ້ຳ (ໃຫ້ schema ລາຍງານແຖວເປົ່າ)", () => {
    const state = base({
      options: [{ name: "Color", values: ["Red", "Blue"] }],
      variants: [variantRow("", { Color: "Red" }), variantRow("", { Color: "Blue" })],
    });
    const result = validateProductForm(state, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages.some((line) => line.includes("ຊ້ຳກັນໃນແຖວ"))).toBe(false);
      expect(result.messages.some((line) => line.startsWith("variants[1].sku:"))).toBe(true);
    }
  });

  it("ຊື່ option ຊ້ຳກັນຫຼັງ trim → error (activeOptions ຕັດອັນຫຼັງຖິ້ມຢ່າງງຽບໆ)", () => {
    const state = base({
      options: [
        { name: "Color", values: ["Red"] },
        { name: " Color ", values: ["Blue"] },
      ],
      variants: [variantRow("TEE-R", { Color: "Red" })],
    });
    const result = validateProductForm(state, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.messages.some((line) => line.includes("Color") && line.includes("ຊ້ຳ"))).toBe(true);
  });

  it("ຊື່ option ເປົ່າ 2 ອັນບໍ່ນັບເປັນຊ້ຳ", () => {
    const state = base({ options: [{ name: "", values: [] }, { name: "", values: [] }] });
    expect(validateProductForm(state, true).ok).toBe(true);
  });

  it("option ເກີນ 3 → ຂໍ້ຄວາມອ່ານງ່າຍ (ບໍ່ແມ່ນ 'Too big')", () => {
    const options = ["A", "B", "C", "D"].map((name) => ({ name, values: ["x"] }));
    const state = base({
      options,
      variants: [variantRow("S1", { A: "x", B: "x", C: "x", D: "x" })],
    });
    const result = validateProductForm(state, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages).toContain("options: ມີໄດ້ສູງສຸດ 3 ລາຍການ");
      expect(result.messages.some((line) => /too big|too small/i.test(line))).toBe(false);
    }
  });

  it("variant ເກີນ 100 → ຂໍ້ຄວາມອ່ານງ່າຍ", () => {
    const variants = Array.from({ length: 101 }, (_, index) => variantRow(`S${index}`));
    const result = validateProductForm(base({ variants }), true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.messages).toContain("variants: ມີໄດ້ສູງສຸດ 100 ລາຍການ");
  });

  it("ຄວາມຍາວເກີນ: ຊື່ສິນຄ້າ 200, ຊື່ option 50, ຄ່າ option 30", () => {
    const state = base({
      name: "n".repeat(201),
      options: [{ name: "o".repeat(51), values: ["v".repeat(31)] }],
      variants: [variantRow("S1", { ["o".repeat(51)]: "v".repeat(31) })],
    });
    const result = validateProductForm(state, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages).toContain("name: ຍາວເກີນ 200 ຕົວອັກສອນ");
      expect(result.messages).toContain("options[1].name: ຍາວເກີນ 50 ຕົວອັກສອນ");
      expect(result.messages).toContain("options[1].values[1]: ຍາວເກີນ 30 ຕົວອັກສອນ");
    }
  });

  it("ຊື່ສິນຄ້າເປົ່າ → ຂໍ້ຄວາມ 'ຈຳເປັນ'", () => {
    const result = validateProductForm(base({ name: " " }), true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.messages).toContain("name: ຈຳເປັນຕ້ອງໃສ່");
  });
});


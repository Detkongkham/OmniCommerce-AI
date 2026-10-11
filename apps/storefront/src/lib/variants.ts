import type { StoreProductDetail, StoreVariant } from "./types";

/** ຊື່ຕົວເລືອກ → ຄ່າທີ່ເລືອກ ເຊັ່ນ { ສີ: "ດຳ", ໄຊສ໌: "M" } */
export type Selection = Record<string, string>;

export interface OptionGroup {
  name: string;
  values: string[];
}

const FALLBACK_GROUP = "ແບບ";

/**
 * ກຸ່ມຕົວເລືອກທີ່ໃຫ້ລູກຄ້າກົດ + variant ທີ່ມີ optionValues ຕົງກັບກຸ່ມນັ້ນ.
 * ສິນຄ້າທີ່ບໍ່ໄດ້ຕັ້ງ option ແຕ່ມີຫຼາຍ variant ຈະໄດ້ກຸ່ມ "ແບບ" ຈາກຊື່ variant.
 */
export function variantChoices(product: Pick<StoreProductDetail, "options" | "variants">): {
  groups: OptionGroup[];
  variants: StoreVariant[];
} {
  if (product.options.length > 0 || product.variants.length <= 1) {
    return { groups: product.options, variants: product.variants };
  }
  const labels = product.variants.map((variant, index) => variant.name ?? `${FALLBACK_GROUP} ${index + 1}`);
  return {
    groups: [{ name: FALLBACK_GROUP, values: labels }],
    variants: product.variants.map((variant, index) => ({
      ...variant,
      optionValues: { [FALLBACK_GROUP]: labels[index] ?? "" },
    })),
  };
}

function matches(variant: StoreVariant, selection: Selection): boolean {
  return Object.entries(selection).every(([name, value]) => variant.optionValues[name] === value);
}

/** variant ທີ່ກົງທຸກຕົວເລືອກ (ຕ້ອງເລືອກຄົບທຸກຕົວເລືອກຂອງ variant ນັ້ນ) */
export function findVariant(variants: readonly StoreVariant[], selection: Selection): StoreVariant | undefined {
  return variants.find(
    (variant) => Object.keys(variant.optionValues).length === Object.keys(selection).length && matches(variant, selection),
  );
}

/** ເລີ່ມຕົ້ນດ້ວຍ variant ທຳອິດທີ່ຍັງມີຂອງ ເພື່ອໃຫ້ລູກຄ້າເຫັນລາຄາ ແລະ ກົດຊື້ໄດ້ທັນທີ */
export function initialSelection(variants: readonly StoreVariant[]): Selection {
  const first = variants.find((variant) => variant.stock.status !== "OUT") ?? variants[0];
  return first ? { ...first.optionValues } : {};
}

/** ມີ variant ທີ່ໃຊ້ຄ່ານີ້ ຮ່ວມກັບຕົວເລືອກອື່ນທີ່ເລືອກຢູ່ ຫຼື ບໍ່ */
export function isValueSelectable(
  variants: readonly StoreVariant[],
  selection: Selection,
  optionName: string,
  value: string,
): boolean {
  return variants.some((variant) => matches(variant, { ...selection, [optionName]: value }));
}

/**
 * selection ໃໝ່ຫຼັງກົດຄ່າໜຶ່ງ. ຖ້າຄ່ານັ້ນບໍ່ມີ variant ຮ່ວມກັບຕົວເລືອກອື່ນທີ່ເລືອກຢູ່
 * ຈະຍ້າຍໄປ variant ທຳອິດທີ່ມີຄ່ານັ້ນ (ເອົາໂຕທີ່ມີຂອງກ່ອນ) ແທນທີ່ຈະປ່ອຍໃຫ້ເລືອກຄູ່ທີ່ບໍ່ມີຂາຍ.
 */
export function selectValue(
  variants: readonly StoreVariant[],
  selection: Selection,
  optionName: string,
  value: string,
): Selection {
  const next = { ...selection, [optionName]: value };
  if (findVariant(variants, next)) return next;
  const withValue = variants.filter((variant) => variant.optionValues[optionName] === value);
  const fallback = withValue.find((variant) => variant.stock.status !== "OUT") ?? withValue[0];
  return fallback ? { ...fallback.optionValues } : next;
}

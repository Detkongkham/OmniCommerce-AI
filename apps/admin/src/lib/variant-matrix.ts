/** ສູງສຸດຕາມ schema ຂອງ API (spec §5) */
export const MAX_VARIANTS = 100;
export const MAX_OPTIONS = 3;

export interface OptionDraft {
  name: string;
  values: string[];
}

export interface VariantDraft {
  /** ກຸນແຈຂອງຊຸດຄ່າ option (ໃຊ້ຈຳແຖວເມື່ອ option ປ່ຽນ) */
  key: string;
  sku: string;
  barcode: string;
  price: string;
  costPrice: string;
  isActive: boolean;
  optionValues: Record<string, string>;
}

/** option ທີ່ໃຊ້ໄດ້ຈິງ: ຊື່ບໍ່ເປົ່າ ແລະ ມີຄ່າ ≥ 1 (trim + ຕັດຄ່າຊ້ຳ; ຊື່ຊ້ຳເກັບອັນທຳອິດ) */
export function activeOptions(options: readonly OptionDraft[]): OptionDraft[] {
  const seen = new Set<string>();
  return options
    .map((option) => ({
      name: option.name.trim(),
      values: [...new Set(option.values.map((value) => value.trim()).filter((value) => value !== ""))],
    }))
    .filter((option) => {
      if (option.name === "" || option.values.length === 0 || seen.has(option.name)) return false;
      seen.add(option.name);
      return true;
    });
}

export function countCombinations(options: readonly OptionDraft[]): number {
  return activeOptions(options).reduce((total, option) => total * option.values.length, 1);
}

/** cartesian product ຕາມລຳດັບ option; ບໍ່ມີ option = [{}] (1 variant) */
export function combinations(options: readonly OptionDraft[]): Record<string, string>[] {
  return activeOptions(options).reduce<Record<string, string>[]>(
    (rows, option) => rows.flatMap((row) => option.values.map((value) => ({ ...row, [option.name]: value }))),
    [{}],
  );
}

/** ກຸນແຈບໍ່ຂຶ້ນກັບລຳດັບ option (ຮຽງຕາມຊື່) ເພື່ອໃຫ້ການສະຫຼັບລຳດັບ option ຍັງຈຳແຖວທີ່ແກ້ແລ້ວ */
export function comboKey(options: readonly OptionDraft[], optionValues: Record<string, string>): string {
  const pairs = activeOptions(options).map((option) => [option.name, optionValues[option.name] ?? ""] as const);
  return JSON.stringify(pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const cleanSku = (text: string) => text.replace(/[^A-Za-z0-9._-]+/g, "");

/** SKU ແນະນຳ; ຖ້າຄ່າໃດຫາຍໝົດຫຼັງກັ່ນ (ຕົວອັກສອນລາວ) ໃຊ້ prefix + ເລກລຳດັບ ເພື່ອບໍ່ໃຫ້ຊ້ຳ/ເປົ່າ */
export function suggestSku(prefix: string, values: readonly string[], ordinal: number): string {
  const head = cleanSku(prefix);
  if (values.length === 0) return head;
  const parts = values.map(cleanSku);
  if (parts.some((part) => part === "")) return [head, String(ordinal)].filter(Boolean).join("-");
  return [head, ...parts].filter(Boolean).join("-");
}

/**
 * ສ້າງແຖວ variant ຈາກ options ປັດຈຸບັນ: ແຖວທີ່ຊຸດຄ່າຍັງຢູ່ຖືກຮັກສາ (ລວມສິ່ງທີ່ຜູ້ໃຊ້ແກ້); ແຖວໃໝ່ຮັບ
 * ລາຄາ/ຕົ້ນທຶນຈາກແຖວທຳອິດເດີມ. ເກີນ MAX_VARIANTS ຄືນ `previous` ເດີມ (UI ສະແດງຄຳເຕືອນ).
 */
export function syncVariants(
  options: readonly OptionDraft[],
  previous: VariantDraft[],
  skuPrefix: string,
): VariantDraft[] {
  const active = activeOptions(options);
  if (countCombinations(active) > MAX_VARIANTS) return previous;
  // ຫຼາຍແຖວເດີມທີ່ຍຸບເປັນ key ດຽວ (ຫຼັງລຶບ option) ເກັບແຖວທຳອິດ
  const byKey = new Map<string, VariantDraft>();
  for (const variant of previous) {
    const key = comboKey(active, variant.optionValues);
    if (!byKey.has(key)) byKey.set(key, variant);
  }
  const template = previous[0];
  return combinations(active).map((optionValues, index) => {
    const key = comboKey(active, optionValues);
    const existing = byKey.get(key);
    if (existing) return { ...existing, key, optionValues };
    return {
      key,
      sku: suggestSku(skuPrefix, active.map((option) => optionValues[option.name] ?? ""), index + 1),
      barcode: "",
      price: template?.price ?? "",
      costPrice: template?.costPrice ?? "",
      isActive: true,
      optionValues,
    };
  });
}

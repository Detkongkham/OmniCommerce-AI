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

/**
 * Name-only edit of the option set: when the ACTIVE options keep the same count and the same values
 * at every index but some names changed, return the rows with `optionValues` keys renamed by option
 * index (so edited rows survive). Anything else (value/option added or removed, a name that became
 * blank or duplicate) returns `null` and the caller regenerates rows with `syncVariants`.
 */
export function renameOptionKeys(
  previous: readonly OptionDraft[],
  next: readonly OptionDraft[],
  variants: VariantDraft[],
): VariantDraft[] | null {
  const before = activeOptions(previous);
  const after = activeOptions(next);
  if (before.length === 0 || before.length !== after.length) return null;
  const sameValues = before.every(
    (option, i) =>
      option.values.length === after[i]?.values.length && option.values.every((value, j) => value === after[i]?.values[j]),
  );
  if (!sameValues || before.every((option, i) => option.name === after[i]?.name)) return null;
  const names = new Map(before.map((option, i) => [option.name, after[i]?.name ?? option.name]));
  return variants.map((variant) => ({
    ...variant,
    optionValues: Object.fromEntries(
      Object.entries(variant.optionValues).map(([name, value]) => [names.get(name) ?? name, value]),
    ),
  }));
}

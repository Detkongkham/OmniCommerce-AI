import { type CreateProductInput, type ProductStatus, createProductSchema } from "@oca/shared";
import { type OptionDraft, type VariantDraft, activeOptions } from "./variant-matrix";

export interface ImageDraft {
  url: string;
  alt: string;
  /** key ຂອງ variant ທີ່ຮູບນີ້ຜູກ ("" = ຮູບຂອງສິນຄ້າ) */
  variantKey: string;
}

export interface ProductFormState {
  name: string;
  slug: string;
  description: string;
  status: ProductStatus;
  categoryId: string;
  options: OptionDraft[];
  variants: VariantDraft[];
  images: ImageDraft[];
}

export function emptyProductForm(): ProductFormState {
  return {
    name: "",
    slug: "",
    description: "",
    status: "DRAFT",
    categoryId: "",
    options: [],
    variants: [{ key: "[]", sku: "", barcode: "", price: "", costPrice: "", isActive: true, optionValues: {} }],
    images: [],
  };
}

/**
 * ແປງ state ຂອງຟອມເປັນ body ຂອງ POST /products (ຍັງບໍ່ validate: ສົ່ງຕໍ່ໃຫ້ `createProductSchema.safeParse`).
 * field ເປົ່າຖືກຂ້າມ; `costPrice` ຖືກສົ່ງສະເພາະເມື່ອ `canSetCost` (ມີ costs:write).
 */
export function toCreateProductInput(state: ProductFormState, canSetCost: boolean): unknown {
  const skuByKey = new Map(state.variants.map((variant) => [variant.key, variant.sku.trim()]));
  return {
    name: state.name.trim(),
    ...(state.slug.trim() ? { slug: state.slug.trim() } : {}),
    ...(state.description.trim() ? { description: state.description.trim() } : {}),
    status: state.status,
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    options: activeOptions(state.options),
    variants: state.variants.map((variant) => ({
      sku: variant.sku.trim(),
      ...(variant.barcode.trim() ? { barcode: variant.barcode.trim() } : {}),
      price: variant.price.trim(),
      ...(canSetCost && variant.costPrice.trim() ? { costPrice: variant.costPrice.trim() } : {}),
      isActive: variant.isActive,
      optionValues: variant.optionValues,
    })),
    images: state.images
      .filter((image) => image.url.trim() !== "")
      .map((image) => ({
        url: image.url.trim(),
        ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
        ...(image.variantKey && skuByKey.get(image.variantKey) ? { variantSku: skuByKey.get(image.variantKey) } : {}),
      })),
  };
}

export interface FormIssue {
  path: readonly PropertyKey[];
  message: string;
  /** field ຂອງ zod issue (ຖ້າມີ) ໃຊ້ແປຂໍ້ຄວາມມາດຕະຖານພາສາອັງກິດເປັນລາວ */
  code?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

/** ຂໍ້ຄວາມຈາກ zod ທີ່ເປັນພາສາອັງກິດ (too_big/too_small) → ລາວ; ຂໍ້ຄວາມ custom ຂອງ schema ເປັນລາວຢູ່ແລ້ວ */
function issueMessage(issue: FormIssue): string {
  if (issue.code === "too_big" && issue.maximum !== undefined) {
    return issue.origin === "array"
      ? `ມີໄດ້ສູງສຸດ ${issue.maximum} ລາຍການ`
      : `ຍາວເກີນ ${issue.maximum} ຕົວອັກສອນ`;
  }
  if (issue.code === "too_small" && issue.minimum !== undefined) {
    const min = Number(issue.minimum);
    if (issue.origin === "array") return `ຕ້ອງມີຢ່າງໜ້ອຍ ${min} ລາຍການ`;
    return min <= 1 ? "ຈຳເປັນຕ້ອງໃສ່" : `ຕ້ອງມີຢ່າງໜ້ອຍ ${min} ຕົວອັກສອນ`;
  }
  if (issue.code === "invalid_type") return "ຄ່າບໍ່ຖືກຕ້ອງ";
  return issue.message;
}

/** `variants.1.price` → `variants[2].price: <ຂໍ້ຄວາມ>` (ເລກຖືກບວກ 1 ເພື່ອໃຫ້ກົງກັບແຖວທີ່ເຫັນ) */
export function formatIssues(issues: readonly FormIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.reduce<string>((text, part) => {
      if (typeof part === "number") return `${text}[${part + 1}]`;
      return text ? `${text}.${String(part)}` : String(part);
    }, "");
    return `${path || "form"}: ${issueMessage(issue)}`;
  });
}

/**
 * ກວດສິ່ງທີ່ schema ບໍ່ເຫັນ ເພາະ `toCreateProductInput`/`activeOptions` ຕັດ ຫຼື ປັບກ່ອນ:
 * ຊື່ option ຊ້ຳກັນຫຼັງ trim (ຖືກຕັດຖິ້ມຢ່າງງຽບໆ) ແລະ SKU ຊ້ຳແບບບໍ່ສົນຕົວພິມ (schema ກວດແບບແຍກຕົວພິມ).
 */
function precheck(state: ProductFormState): { schemaSkuDuplicate: boolean; issues: FormIssue[] } {
  const issues: FormIssue[] = [];

  const optionRows = new Map<string, number[]>();
  state.options.forEach((option, index) => {
    const name = option.name.trim();
    if (name === "") return;
    optionRows.set(name, [...(optionRows.get(name) ?? []), index + 1]);
  });
  for (const [name, rows] of optionRows) {
    if (rows.length > 1) {
      issues.push({ path: ["options"], message: `ຊື່ option "${name}" ຊ້ຳກັນໃນລາຍການທີ ${rows.join(", ")}` });
    }
  }

  const skuRows = new Map<string, { sku: string; rows: number[] }>();
  state.variants.forEach((variant, index) => {
    const sku = variant.sku.trim();
    if (sku === "") return;
    const entry = skuRows.get(sku.toLowerCase()) ?? { sku, rows: [] };
    entry.rows.push(index + 1);
    skuRows.set(sku.toLowerCase(), entry);
  });
  let schemaSkuDuplicate = false;
  for (const { sku, rows } of skuRows.values()) {
    if (rows.length > 1) {
      schemaSkuDuplicate = true;
      issues.push({ path: ["variants"], message: `SKU "${sku}" ຊ້ຳກັນໃນແຖວທີ ${rows.join(", ")} (ບໍ່ແຍກຕົວພິມໃຫຍ່/ນ້ອຍ)` });
    }
  }
  return { schemaSkuDuplicate, issues };
}

export type ProductFormResult =
  | { ok: true; input: CreateProductInput }
  | { ok: false; messages: string[] };

/**
 * ກວດຟອມກ່ອນສົ່ງ: ກວດເພີ່ມ (ຊື່ option ຊ້ຳ, SKU ຊ້ຳແບບບໍ່ແຍກຕົວພິມ) ແລ້ວ `createProductSchema` (ກົດດຽວກັບ API:
 * ≤ 3 option, ≤ 100 variant, ຄວາມຍາວຊື່/ຄ່າ) ແລະ ແປງ issue ເປັນຂໍ້ຄວາມອ່ານງ່າຍ.
 */
export function validateProductForm(state: ProductFormState, canSetCost: boolean): ProductFormResult {
  const { schemaSkuDuplicate, issues: extra } = precheck(state);
  const parsed = createProductSchema.safeParse(toCreateProductInput(state, canSetCost));
  const schemaIssues = parsed.success
    ? []
    : parsed.error.issues.filter(
        // "SKU ຊ້ຳກັນ" ຂອງ schema ຊ້ຳກັບຂໍ້ຄວາມຊີ້ແຖວຂອງ precheck
        (issue) => !(schemaSkuDuplicate && issue.code === "custom" && issue.message === "SKU ຊ້ຳກັນ"),
      );
  const issues: FormIssue[] = [...extra, ...schemaIssues];
  if (issues.length === 0 && parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, messages: formatIssues(issues) };
}

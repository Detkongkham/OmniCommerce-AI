"use client";

import { PRODUCT_STATUSES } from "@oca/shared";
import { Button, Card, Field, Input, PageHeader, Select, buttonVariants, cn, toast } from "@oca/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type ProductFormState, emptyProductForm, validateProductForm } from "@/lib/product-form";
import { useCategories, useCreateProduct } from "@/lib/queries";
import {
  MAX_VARIANTS,
  type OptionDraft,
  comboKey,
  countCombinations,
  renameOptionKeys,
  syncVariants,
} from "@/lib/variant-matrix";
import { ImageListEditor } from "./image-list-editor";
import { OptionEditor } from "./option-editor";
import { VariantGrid } from "./variant-grid";

type Problem = { kind: "validation"; messages: string[] } | { kind: "api"; message: string };

const sameValues = (a: OptionDraft | undefined, b: OptionDraft) =>
  a !== undefined && a.values.length === b.values.length && a.values.every((value, i) => value === b.values[i]);

/**
 * Re-sync the variant rows with the options and drop image links to rows that no longer exist
 * (otherwise state would keep a stale key that silently re-links if the combination comes back).
 * `synced` is the option set the current rows were built from: a name-only edit renames the rows'
 * optionValues keys (and image links) instead of regenerating, so edited rows survive.
 * More than MAX_VARIANTS combinations: keep the current rows (the grid shows the warning).
 */
function withSyncedVariants(
  form: ProductFormState,
  options: OptionDraft[],
  synced: OptionDraft[],
  skuPrefix: string,
): ProductFormState {
  if (countCombinations(options) > MAX_VARIANTS) return { ...form, options };
  let base = form;
  const renamed = renameOptionKeys(synced, options, form.variants);
  if (renamed) {
    const keyMap = new Map(form.variants.map((variant, i) => [variant.key, comboKey(options, renamed[i]?.optionValues ?? {})]));
    base = {
      ...form,
      variants: renamed,
      images: form.images.map((image) => ({ ...image, variantKey: keyMap.get(image.variantKey) ?? image.variantKey })),
    };
  }
  const variants = syncVariants(options, base.variants, skuPrefix);
  const keys = new Set(variants.map((variant) => variant.key));
  const images = base.images.map((image) =>
    image.variantKey && !keys.has(image.variantKey) ? { ...image, variantKey: "" } : image,
  );
  return { ...base, options, variants, images };
}

export function ProductCreateForm() {
  const { t } = useT();
  const router = useRouter();
  const canSeeCost = useCan("costs:read");
  const canSetCost = useCan("costs:write");
  const categories = useCategories();
  const create = useCreateProduct();

  const [form, setForm] = useState<ProductFormState>(emptyProductForm);
  // the option set the current variant rows were built from
  const [synced, setSynced] = useState<OptionDraft[]>([]);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  // state updates are async, so a ref is what actually blocks a second submit in the same tick
  const submitting = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const tooMany = countCombinations(form.options) > MAX_VARIANTS;

  const patch = (change: Partial<ProductFormState>) => setForm((current) => ({ ...current, ...change }));

  function applySync(options: OptionDraft[]) {
    setForm(withSyncedVariants(form, options, synced, skuPrefix));
    if (countCombinations(options) <= MAX_VARIANTS) setSynced(options);
  }

  // rows are regenerated when the SET of options/values changes, not per keystroke of a name
  function changeOptions(options: OptionDraft[]) {
    const structural =
      options.length !== form.options.length || options.some((option, i) => !sameValues(form.options[i], option));
    if (structural) applySync(options);
    else setForm({ ...form, options });
  }

  // option names are committed on blur (focusout bubbles to the wrapper)
  function syncOnNameBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLInputElement) || !event.target.id.startsWith("option-name-")) return;
    applySync(form.options);
  }

  // focus after the commit that un-hides the region (focus() on a display:none element is a no-op)
  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    // Enter inside an option-name field submits before that field's blur sync: sync here first
    const current = withSyncedVariants(form, form.options, synced, skuPrefix);
    const result = validateProductForm(current, canSetCost);
    if (!result.ok) {
      setProblem({ kind: "validation", messages: result.messages });
      return;
    }
    setProblem(null);
    setForm(current);
    if (countCombinations(current.options) <= MAX_VARIANTS) setSynced(current.options);
    submitting.current = true;
    setSaving(true);
    try {
      // the schema fills costPrice "0" by default; without costs:write the field must not be sent at all
      const input = canSetCost
        ? result.input
        : { ...result.input, variants: result.input.variants.map(({ costPrice: _omit, ...variant }) => variant) };
      const created = await create.mutateAsync(input);
      toast.success(t("products.toast.created"));
      // stay locked: the page is navigating away
      router.push(`/products/${created.id}`);
    } catch (error) {
      submitting.current = false;
      setSaving(false);
      setProblem({ kind: "api", message: errorMessage(error, t) });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title"), t("products.form.createTitle")]}
        title={t("products.form.createTitle")}
        description={t("products.form.createDescription")}
        actions={
          <>
            <Link href="/products" className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
              {t("common.cancel")}
            </Link>
            {tooMany ? (
              <span id="product-save-blocked" className="text-xs text-warning-ink">
                {t("products.variants.tooMany")}
              </span>
            ) : null}
            <Button
              type="submit"
              className="rounded-xl font-bold"
              loading={saving}
              disabled={tooMany}
              aria-describedby={tooMany ? "product-save-blocked" : undefined}
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {/* always rendered so assistive tech announces what is put into it; focused after a failed submit */}
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className={cn(
            "rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
            !problem && "hidden",
          )}
        >
          {problem?.kind === "validation" ? (
            <>
              <p className="font-semibold">{t("products.form.issues")}</p>
              <ul className="mt-1 list-inside list-disc">
                {problem.messages.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </>
          ) : problem?.kind === "api" ? (
            <p>{problem.message}</p>
          ) : null}
        </div>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.general")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("products.field.name")} htmlFor="product-name" required className="sm:col-span-2">
              <Input id="product-name" value={form.name} onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label={t("products.field.category")} htmlFor="product-category">
              <Select id="product-category" value={form.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>
                <option value="">{t("products.field.noCategory")}</option>
                {categoryRows.map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {`${"— ".repeat(depth)}${category.name}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("products.field.status")} htmlFor="product-status">
              <Select
                id="product-status"
                value={form.status}
                onChange={(event) => patch({ status: event.target.value as ProductFormState["status"] })}
              >
                {PRODUCT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`products.status.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("products.field.slug")} htmlFor="product-slug">
              <Input
                id="product-slug"
                aria-describedby="product-slug-hint"
                value={form.slug}
                onChange={(event) => patch({ slug: event.target.value })}
              />
              <p id="product-slug-hint" className="mt-1 text-xs text-ink-muted">
                {t("products.field.slugHint")}
              </p>
            </Field>
            <Field label={t("products.field.skuPrefix")} htmlFor="product-sku-prefix">
              <Input id="product-sku-prefix" value={skuPrefix} onChange={(event) => setSkuPrefix(event.target.value)} />
            </Field>
            <Field label={t("products.field.description")} htmlFor="product-description" className="sm:col-span-2">
              <textarea
                id="product-description"
                rows={3}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </Field>
          </div>
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.options")}</h2>
          <div onBlur={syncOnNameBlur}>
            <OptionEditor options={form.options} onChange={changeOptions} />
          </div>
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">
            {t("products.section.variants")}{" "}
            <span className="text-sm font-normal text-ink-secondary">
              ({t("products.variants.count", { count: form.variants.length })})
            </span>
          </h2>
          <VariantGrid
            variants={form.variants}
            onChange={(variants) => patch({ variants })}
            showCost={canSeeCost}
            costReadOnly={!canSetCost}
            tooMany={tooMany}
          />
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.images")}</h2>
          <ImageListEditor
            images={form.images}
            onChange={(images) => patch({ images })}
            variants={form.variants.map((variant) => ({
              key: variant.key,
              label: Object.values(variant.optionValues).join(" / ") || variant.sku || t("products.variants.single"),
            }))}
          />
        </Card>
      </div>
    </form>
  );
}

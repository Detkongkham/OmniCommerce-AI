"use client";

import {
  PRODUCT_STATUSES,
  type UpdateProductInput,
  type UpdateVariantInput,
  putProductImagesSchema,
  updateProductSchema,
  updateVariantSchema,
} from "@oca/shared";
import { Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, PageHeader, Select, Skeleton, toast } from "@oca/ui";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useMemo, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type ImageDraft, formatIssues } from "@/lib/product-form";
import {
  useCategories,
  useDeleteProduct,
  useProduct,
  usePutImages,
  useUpdateProduct,
  useUpdateVariant,
  useWarehouses,
} from "@/lib/queries";
import type { ProductDetailDto, VariantDto } from "@/lib/types";
import { AddVariantDialog } from "./add-variant-dialog";
import { ImageListEditor } from "./image-list-editor";
import { ProblemAlert } from "./problem-alert";

const isNotFound = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.code === "NOT_FOUND" || error.code === "PRODUCT_NOT_FOUND");

/**
 * A draft that follows the server: whenever the server values change (after a save and its refetch,
 * or an edit elsewhere) the draft is reset to them; until then the user's unsaved edits are kept.
 * Done during render (not in an effect) so there is no frame with stale values and no remount that
 * would drop focus.
 */
function useServerDraft<T>(server: T): [T, Dispatch<SetStateAction<T>>] {
  const signature = JSON.stringify(server);
  const [draft, setDraft] = useState(server);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setDraft(server);
  }
  return [draft, setDraft];
}

export function ProductDetail({ id }: { id: string }) {
  const { t } = useT();
  const query = useProduct(id);

  // a failed background refetch keeps the data on screen (and the user's edits) instead of replacing the page
  if (!query.data) {
    if (query.isError) {
      const notFound = isNotFound(query.error);
      return (
        <div className="p-6">
          <EmptyState
            icon={AlertCircle}
            title={notFound ? t("products.detail.notFound") : t("common.error.load")}
            action={
              notFound ? null : (
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              )
            }
          />
        </div>
      );
    }
    return (
      <div className="space-y-4 p-6" role="status" aria-label={t("common.loading")} aria-busy="true">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <ProductDetailBody product={query.data} />;
}

const variantLabel = (product: ProductDetailDto, variant: VariantDto) =>
  product.options
    .map((option) => variant.optionValues[option.name])
    .filter((value): value is string => Boolean(value))
    .join(" / ");

function ProductDetailBody({ product }: { product: ProductDetailDto }) {
  const { t } = useT();
  const router = useRouter();
  const canWriteInventory = useCan("inventory:write");
  const canReadCost = useCan("costs:read");
  const canWriteCost = useCan("costs:write");
  const remove = useDeleteProduct();
  const warehouses = useWarehouses();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string[]>([]);
  const deleting = useRef(false);
  // once deleted the page is on its way out: nothing on it may be written any more
  const canWrite = canWriteInventory && !deleted;

  const codeOf = (warehouseId: string) => warehouses.data?.find((item) => item.id === warehouseId)?.code ?? warehouseId;

  async function doDelete() {
    if (deleting.current) return;
    deleting.current = true;
    setDeleteProblem([]);
    try {
      const result = await remove.mutateAsync(product.id);
      if (result?.archived) {
        toast.info(t("products.toast.archived"));
      } else {
        setDeleted(true);
        toast.success(t("products.toast.deleted"));
        router.push("/products");
      }
    } catch (error) {
      setDeleteProblem([errorMessage(error, t)]);
    } finally {
      deleting.current = false;
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title"), product.name]}
        title={product.name}
        description={t("products.detail.title")}
        actions={
          canWrite ? (
            <Button type="button" variant="outline" className="rounded-xl" disabled={remove.isPending} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" />
              {t("products.delete")}
            </Button>
          ) : null
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <ProblemAlert messages={deleteProblem} />
        <GeneralSection product={product} canWrite={canWrite} />

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-3 text-base font-bold text-ink">{t("products.section.options")}</h2>
          {product.options.length === 0 ? (
            <p className="text-sm text-ink-secondary">{t("products.variants.single")}</p>
          ) : (
            <div className="space-y-2">
              {product.options.map((option) => (
                <div key={option.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{option.name}</span>
                  {option.values.map((value) => (
                    <span key={value.id} className="rounded-full border border-line bg-subtle px-2.5 py-0.5 text-xs text-ink-secondary">
                      {value.value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">{t("products.option.readonly")}</p>
        </Card>

        <Card className="rounded-[20px] p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">
              {t("products.section.variants")}{" "}
              <span className="text-sm font-normal text-ink-secondary">
                ({t("products.variants.count", { count: product.variants.length })})
              </span>
            </h2>
            {canWrite && product.options.length > 0 ? (
              <Button type="button" variant="outlinePrimary" className="rounded-lg" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden="true" />
                {t("products.variants.add")}
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {product.variants.map((variant) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                label={variantLabel(product, variant) || t("products.variants.single")}
                codeOf={codeOf}
                canWrite={canWrite}
                showCost={canReadCost}
                canEditCost={canWrite && canWriteCost}
              />
            ))}
          </div>
        </Card>

        <ImagesSection product={product} canWrite={canWrite} />
      </div>

      <AddVariantDialog open={addOpen} onOpenChange={setAddOpen} product={product} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("products.deleteTitle")}
        description={t("products.deleteDescription", { name: product.name })}
        confirmLabel={t("products.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={remove.isPending}
        onConfirm={doDelete}
      />
    </div>
  );
}

interface GeneralDraft {
  name: string;
  slug: string;
  description: string;
  status: ProductDetailDto["status"];
  categoryId: string;
}

const generalOf = (product: ProductDetailDto): GeneralDraft => ({
  name: product.name,
  slug: product.slug,
  description: product.description ?? "",
  status: product.status,
  categoryId: product.categoryId ?? "",
});

/** Only the fields that differ from the server (PATCH is partial). */
function generalChanges(draft: GeneralDraft, server: GeneralDraft): UpdateProductInput {
  const input: UpdateProductInput = {};
  if (draft.name.trim() !== server.name) input.name = draft.name.trim();
  if (draft.slug.trim() !== server.slug) input.slug = draft.slug.trim();
  if (draft.description.trim() !== server.description) input.description = draft.description.trim() === "" ? null : draft.description.trim();
  if (draft.status !== server.status) input.status = draft.status;
  if (draft.categoryId !== server.categoryId) input.categoryId = draft.categoryId === "" ? null : draft.categoryId;
  return input;
}

function GeneralSection({ product, canWrite }: { product: ProductDetailDto; canWrite: boolean }) {
  const { t } = useT();
  const update = useUpdateProduct();
  const categories = useCategories();
  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const server = generalOf(product);
  const [draft, setDraft] = useServerDraft(server);
  const [problems, setProblems] = useState<string[]>([]);
  const submitting = useRef(false);
  const patch = (change: Partial<GeneralDraft>) => setDraft((current) => ({ ...current, ...change }));
  const changes = generalChanges(draft, server);
  const dirty = Object.keys(changes).length > 0;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !dirty) return;
    const parsed = updateProductSchema.safeParse(changes);
    if (!parsed.success) {
      setProblems(formatIssues(parsed.error.issues));
      return;
    }
    setProblems([]);
    submitting.current = true;
    try {
      await update.mutateAsync({ id: product.id, input: parsed.data });
      toast.success(t("products.toast.updated"));
    } catch (error) {
      setProblems([errorMessage(error, t)]);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <form onSubmit={save} noValidate>
        <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.general")}</h2>
        <ProblemAlert messages={problems} className="mb-4" />
        <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("products.field.name")} htmlFor="detail-name" required className="sm:col-span-2">
            <Input id="detail-name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
          </Field>
          <Field label={t("products.field.category")} htmlFor="detail-category">
            <Select
              id="detail-category"
              value={draft.categoryId}
              disabled={categories.isPending}
              onChange={(event) => patch({ categoryId: event.target.value })}
            >
              <option value="">{t("products.field.noCategory")}</option>
              {categoryRows.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {`${"— ".repeat(depth)}${category.name}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("products.field.status")} htmlFor="detail-status">
            <Select id="detail-status" value={draft.status} onChange={(event) => patch({ status: event.target.value as GeneralDraft["status"] })}>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`products.status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("products.field.slug")} htmlFor="detail-slug" className="sm:col-span-2">
            <Input id="detail-slug" value={draft.slug} onChange={(event) => patch({ slug: event.target.value })} />
          </Field>
          <Field label={t("products.field.description")} htmlFor="detail-description" className="sm:col-span-2">
            <textarea
              id="detail-description"
              rows={3}
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            />
          </Field>
        </fieldset>
        {canWrite ? (
          <div className="mt-4 flex justify-end">
            <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={update.isPending} disabled={!dirty}>
              {update.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

interface RowDraft {
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  isActive: boolean;
}

const rowOf = (variant: VariantDto): RowDraft => ({
  sku: variant.sku,
  barcode: variant.barcode ?? "",
  price: variant.price,
  cost: variant.costPrice ?? "",
  isActive: variant.isActive,
});

/** Only the changed fields; `costPrice` only for someone who may write costs (never re-added by a default). */
function rowChanges(draft: RowDraft, server: RowDraft, canEditCost: boolean): UpdateVariantInput {
  const input: UpdateVariantInput = {};
  if (draft.sku.trim() !== server.sku) input.sku = draft.sku.trim();
  if (draft.barcode.trim() !== server.barcode) input.barcode = draft.barcode.trim() === "" ? null : draft.barcode.trim();
  if (draft.price.trim() !== server.price) input.price = draft.price.trim();
  if (canEditCost && draft.cost.trim() !== server.cost) input.costPrice = draft.cost.trim();
  if (draft.isActive !== server.isActive) input.isActive = draft.isActive;
  return input;
}

function VariantRow({
  variant,
  label,
  codeOf,
  canWrite,
  showCost,
  canEditCost,
}: {
  variant: VariantDto;
  label: string;
  codeOf: (warehouseId: string) => string;
  canWrite: boolean;
  showCost: boolean;
  canEditCost: boolean;
}) {
  const { t } = useT();
  // each row has its own mutation, so one row saving never disables or overwrites another row
  const update = useUpdateVariant();
  const server = rowOf(variant);
  const [draft, setDraft] = useServerDraft(server);
  const [problems, setProblems] = useState<string[]>([]);
  const submitting = useRef(false);
  const patch = (change: Partial<RowDraft>) => setDraft((current) => ({ ...current, ...change }));
  const changes = rowChanges(draft, server, canEditCost);
  const dirty = Object.keys(changes).length > 0;
  const named = (key: Parameters<typeof t>[0]) => `${t(key)} ${label}`;

  async function save() {
    if (submitting.current || !dirty) return;
    const parsed = updateVariantSchema.safeParse(changes);
    if (!parsed.success) {
      setProblems(formatIssues(parsed.error.issues));
      return;
    }
    setProblems([]);
    submitting.current = true;
    try {
      await update.mutateAsync({ id: variant.id, input: parsed.data });
      toast.success(t("products.toast.variantSaved"));
    } catch (error) {
      setProblems([errorMessage(error, t)]);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div data-testid={`detail-variant-${variant.id}`} className="rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">{label}</span>
        <Link
          href={`/stock?q=${encodeURIComponent(variant.sku)}`}
          aria-label={named("products.variants.stockLink")}
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          {t("products.variants.stockLink")}
        </Link>
      </div>
      <ProblemAlert messages={problems} className="mb-2" />
      <fieldset disabled={!canWrite} className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
        <Field label={t("products.variants.sku")} htmlFor={`sku-${variant.id}`}>
          <Input id={`sku-${variant.id}`} aria-label={named("products.variants.sku")} value={draft.sku} onChange={(event) => patch({ sku: event.target.value })} />
        </Field>
        <Field label={t("products.variants.barcode")} htmlFor={`barcode-${variant.id}`}>
          <Input
            id={`barcode-${variant.id}`}
            aria-label={named("products.variants.barcode")}
            value={draft.barcode}
            onChange={(event) => patch({ barcode: event.target.value })}
          />
        </Field>
        <Field label={t("products.variants.price")} htmlFor={`price-${variant.id}`}>
          <Input
            id={`price-${variant.id}`}
            aria-label={named("products.variants.price")}
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => patch({ price: event.target.value })}
          />
        </Field>
        {showCost ? (
          <Field label={t("products.variants.cost")} htmlFor={`cost-${variant.id}`}>
            <Input
              id={`cost-${variant.id}`}
              aria-label={named("products.variants.cost")}
              inputMode="decimal"
              value={draft.cost}
              disabled={!canEditCost}
              onChange={(event) => patch({ cost: event.target.value })}
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <Checkbox
            aria-label={named("products.variants.active")}
            checked={draft.isActive}
            onCheckedChange={(checked) => patch({ isActive: checked === true })}
          />
          {t("products.variants.active")}
        </label>
        {canWrite ? (
          <Button
            type="button"
            variant="outlinePrimary"
            className="rounded-lg"
            aria-label={named("products.variants.save")}
            loading={update.isPending}
            disabled={!dirty}
            onClick={() => void save()}
          >
            {t("products.variants.save")}
          </Button>
        ) : null}
      </fieldset>
      <div className="mt-2 text-xs text-ink-secondary">
        <span className="font-semibold">{t("products.variants.stock")}: </span>
        {variant.stock.length === 0 ? (
          <span>{t("products.variants.noStock")}</span>
        ) : (
          variant.stock.map((level) => (
            <span key={level.warehouseId} className="mr-3 inline-block">
              {`${codeOf(level.warehouseId)}: ${level.available} / ${level.reserved}`}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function ImagesSection({ product, canWrite }: { product: ProductDetailDto; canWrite: boolean }) {
  const { t } = useT();
  const put = usePutImages();
  const server = useMemo<ImageDraft[]>(
    () => product.images.map((image) => ({ url: image.url, alt: image.alt ?? "", variantKey: image.variantId ?? "" })),
    [product.images],
  );
  const [images, setImages] = useServerDraft(server);
  const [problems, setProblems] = useState<string[]>([]);
  const submitting = useRef(false);
  const dirty = JSON.stringify(images) !== JSON.stringify(server);

  async function save() {
    if (submitting.current || !dirty) return;
    const parsed = putProductImagesSchema.safeParse({
      images: images
        .filter((image) => image.url.trim() !== "")
        .map((image) => ({
          url: image.url.trim(),
          ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
          ...(image.variantKey ? { variantId: image.variantKey } : {}),
        })),
    });
    if (!parsed.success) {
      setProblems(formatIssues(parsed.error.issues));
      return;
    }
    setProblems([]);
    submitting.current = true;
    try {
      await put.mutateAsync({ id: product.id, input: parsed.data });
      toast.success(t("products.toast.imagesSaved"));
    } catch (error) {
      setProblems([errorMessage(error, t)]);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.images")}</h2>
      <ProblemAlert messages={problems} className="mb-3" />
      <fieldset disabled={!canWrite}>
        <ImageListEditor
          images={images}
          onChange={setImages}
          variants={product.variants.map((variant) => ({
            key: variant.id,
            label: variantLabel(product, variant) || variant.sku,
          }))}
        />
      </fieldset>
      {canWrite ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" className="h-10 rounded-xl px-6 font-bold" loading={put.isPending} disabled={!dirty} onClick={() => void save()}>
            {t("products.images.save")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

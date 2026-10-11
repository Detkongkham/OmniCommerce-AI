"use client";

import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Input,
  StatusPill,
  type StatusTone,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { VariantPicker } from "@/components/common/variant-picker";
import { ApiError } from "@/lib/api";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime-local";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useFlashSales, useSaveFlashSale } from "@/lib/queries";
import type { FlashSaleDto } from "@/lib/types";

export type FlashSaleStatus = "running" | "scheduled" | "ended" | "inactive";

export function flashSaleStatus(sale: Pick<FlashSaleDto, "isActive" | "startsAt" | "endsAt">, now: Date = new Date()): FlashSaleStatus {
  if (!sale.isActive) return "inactive";
  if (new Date(sale.endsAt).getTime() <= now.getTime()) return "ended";
  if (new Date(sale.startsAt).getTime() > now.getTime()) return "scheduled";
  return "running";
}

const STATUS_TONE: Record<FlashSaleStatus, StatusTone> = { running: "success", scheduled: "info", ended: "neutral", inactive: "neutral" };

/** ແຄມເປນ Flash Sale: ຕາຕະລາງ + ຟອມສ້າງ/ແກ້ (ປິດດ້ວຍການຕິກ "ເປີດໃຊ້" ອອກ) */
export function FlashSaleList() {
  const { t } = useT();
  const canWrite = useCan("promotion:write");
  const query = useFlashSales();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FlashSaleDto | null>(null);
  const rows = query.data ?? [];

  function open(sale: FlashSaleDto | null) {
    setEditing(sale);
    setFormOpen(true);
  }

  return (
    <div>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <Button className="rounded-xl" onClick={() => open(null)}>
            <Plus aria-hidden="true" />
            {t("flashSales.add")}
          </Button>
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-[20px]">
        {query.isError ? (
          <EmptyState
            icon={AlertCircle}
            title={t("common.error.load")}
            action={
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : (
          <>
            <Table aria-label={t("flashSales.table")} aria-busy={query.isPending}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{t("flashSales.col.name")}</TableHead>
                  <TableHead scope="col">{t("flashSales.col.period")}</TableHead>
                  <TableHead scope="col">{t("flashSales.col.items")}</TableHead>
                  <TableHead scope="col">{t("flashSales.col.status")}</TableHead>
                  {canWrite ? (
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">{t("common.actions")}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isPending ? <TableSkeletonRows columns={canWrite ? 5 : 4} /> : null}
                {rows.map((sale) => {
                  const status = flashSaleStatus(sale);
                  return (
                    <TableRow key={sale.id} data-testid={`row-flash-sale-${sale.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                        {sale.name}
                      </th>
                      <TableCell className="text-xs text-ink-secondary">
                        {t("flashSales.period", { from: formatDateTime(sale.startsAt), to: formatDateTime(sale.endsAt) })}
                      </TableCell>
                      <TableCell className="text-ink-secondary">
                        <p>{t("flashSales.itemCount", { count: sale.items.length })}</p>
                        <p className="max-w-[280px] truncate font-mono text-xs text-ink-muted">{sale.items.map((item) => item.sku).join(", ")}</p>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS_TONE[status]}>{t(`flashSales.status.${status}`)}</StatusPill>
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" aria-label={t("flashSales.edit", { name: sale.name })} onClick={() => open(sale)}>
                            <Pencil aria-hidden="true" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!query.isPending && rows.length === 0 ? (
              <div role="status">
                <EmptyState icon={Zap} title={t("flashSales.empty")} />
              </div>
            ) : null}
          </>
        )}
      </Card>
      {canWrite ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-2xl" closeLabel={t("common.close")}>
            <FlashSaleForm key={editing?.id ?? "new"} sale={editing} onDone={() => setFormOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

interface ItemDraft {
  variantId: string;
  sku: string;
  label: string;
  regularPrice: string;
  salePrice: string;
}

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const validSalePrice = (item: ItemDraft) => {
  const text = item.salePrice.trim();
  return MONEY.test(text) && Number(text) > 0 && Number(text) < Number(item.regularPrice);
};

function FlashSaleForm({ sale, onDone }: { sale: FlashSaleDto | null; onDone: () => void }) {
  const { t } = useT();
  const save = useSaveFlashSale();
  const [name, setName] = useState(sale?.name ?? "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(sale?.startsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(sale?.endsAt));
  const [isActive, setIsActive] = useState(sale?.isActive ?? true);
  const [items, setItems] = useState<ItemDraft[]>(() =>
    (sale?.items ?? []).map((item) => ({
      variantId: item.variantId,
      sku: item.sku,
      label: item.variantName ? `${item.productName} — ${item.variantName}` : item.productName,
      regularPrice: item.regularPrice,
      salePrice: String(Number(item.salePrice)),
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startIso = fromDatetimeLocal(startsAt);
  const endIso = fromDatetimeLocal(endsAt);
  const errors = {
    name: name.trim() === "",
    startsAt: startIso === null,
    endsAt: endIso === null ? "required" : startIso !== null && new Date(endIso).getTime() <= new Date(startIso).getTime() ? "order" : null,
    items: items.length === 0,
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setSubmitted(true);
    setFormError(null);
    if (errors.name || errors.startsAt || errors.endsAt || errors.items || !items.every(validSalePrice) || !startIso || !endIso) return;
    const input = {
      name: name.trim(),
      startsAt: startIso,
      endsAt: endIso,
      isActive,
      items: items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice.trim() })),
    };
    try {
      await save.mutateAsync(sale ? { id: sale.id, input } : { input });
      toast.success(t(sale ? "flashSales.toast.updated" : "flashSales.toast.created"));
      onDone();
    } catch (error) {
      // 409 ຂອງ Flash Sale ບອກ SKU ທີ່ມີບັນຫາ
      const skus = error instanceof ApiError && Array.isArray(error.body?.skus) ? (error.body.skus as string[]).join(", ") : "";
      setFormError(skus ? `${errorMessage(error, t)}. ${t("flashSales.form.skus", { skus })}` : errorMessage(error, t));
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={sale ? t("flashSales.form.editTitle") : t("flashSales.form.createTitle")} description={t("flashSales.form.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("flashSales.form.name")} htmlFor="flash-name" required className="sm:col-span-2" error={submitted && errors.name ? t("validation.required") : undefined}>
            <Input id="flash-name" maxLength={100} value={name} invalid={submitted && errors.name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t("flashSales.form.startsAt")} htmlFor="flash-starts" required error={submitted && errors.startsAt ? t("validation.required") : undefined}>
            <Input id="flash-starts" type="datetime-local" value={startsAt} invalid={submitted && errors.startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </Field>
          <Field
            label={t("flashSales.form.endsAt")}
            htmlFor="flash-ends"
            required
            error={submitted && errors.endsAt ? t(errors.endsAt === "order" ? "flashSales.form.endsBeforeStart" : "validation.required") : undefined}
          >
            <Input id="flash-ends" type="datetime-local" value={endsAt} invalid={submitted && !!errors.endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
        </div>

        <VariantPicker
          id="flash-variant"
          label={t("flashSales.form.addItem")}
          excludeIds={items.map((item) => item.variantId)}
          onSelect={(variant) =>
            setItems((current) => [
              ...current,
              {
                variantId: variant.id,
                sku: variant.sku,
                label: variant.name ? `${variant.productName} — ${variant.name}` : variant.productName,
                // ລາຄາປົກກະຕິ (ບໍ່ແມ່ນລາຄາຂອງ Flash Sale ອື່ນທີ່ກຳລັງດຳເນີນ)
                regularPrice: variant.regularPrice ?? variant.price,
                salePrice: "",
              },
            ])
          }
        />
        {submitted && errors.items ? (
          <p role="alert" className="text-xs text-danger">
            {t("flashSales.form.noItems")}
          </p>
        ) : null}
        {items.length > 0 ? (
          <ul aria-label={t("flashSales.form.items")} className="divide-y divide-line rounded-xl border border-line">
            {items.map((item) => {
              const invalid = submitted && !validSalePrice(item);
              return (
                <li key={item.variantId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{item.label}</p>
                    <p className="text-xs text-ink-muted">
                      <span className="font-mono">{item.sku}</span> · {t("flashSales.form.regular", { price: formatMoney(item.regularPrice) })}
                    </p>
                    {invalid ? <p className="text-xs text-danger">{t("flashSales.form.salePriceInvalid")}</p> : null}
                  </div>
                  <Input
                    aria-label={t("flashSales.form.salePrice", { sku: item.sku })}
                    className="w-32 text-right tabular-nums"
                    inputMode="decimal"
                    value={item.salePrice}
                    invalid={invalid}
                    onChange={(event) =>
                      setItems((current) => current.map((row) => (row.variantId === item.variantId ? { ...row, salePrice: event.target.value } : row)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("flashSales.form.remove", { sku: item.sku })}
                    onClick={() => setItems((current) => current.filter((row) => row.variantId !== item.variantId))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 rounded border-line accent-[var(--color-brand)]" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          {t("flashSales.form.active")}
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={save.isPending}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

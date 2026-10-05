"use client";

import {
  adjustStockSchema,
  receiveStockSchema,
  returnStockSchema,
  transferStockSchema,
} from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage, shortageLines } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { formatIssues } from "@/lib/product-form";
import { type StockOpMode, useStockOperation, useWarehouses } from "@/lib/queries";

/** variant + ສາງ ທີ່ກຳນົດໄວ້ກ່ອນ (ກົດຈາກແຖວຂອງຕາຕະລາງ). null = ໃຫ້ເລືອກ variant ເອງ (ຮັບສະຕ໋ອກຄັ້ງທຳອິດ) */
export interface StockOpTarget {
  variantId: string;
  label: string;
  warehouseId?: string;
}

export interface StockOpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: StockOpMode;
  target: StockOpTarget | null;
}

export function StockOpDialog({ open, onOpenChange, mode, target }: StockOpDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <StockOpForm
          key={`${mode}:${target?.variantId ?? "none"}:${target?.warehouseId ?? ""}`}
          mode={mode}
          target={target}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const SCHEMAS = {
  receive: receiveStockSchema,
  adjust: adjustStockSchema,
  transfer: transferStockSchema,
  return: returnStockSchema,
} as const;

const SUCCESS_KEYS = {
  receive: "stock.toast.received",
  adjust: "stock.toast.adjusted",
  transfer: "stock.toast.transferred",
  return: "stock.toast.returned",
} as const;

function StockOpForm({ mode, target, onDone }: { mode: StockOpMode; target: StockOpTarget | null; onDone: () => void }) {
  const { t } = useT();
  const warehouses = useWarehouses();
  const operate = useStockOperation();
  const active = (warehouses.data ?? []).filter((warehouse) => warehouse.isActive);

  const [picked, setPicked] = useState<{ variantId: string; label: string } | null>(target);
  const [warehouseId, setWarehouseId] = useState(target?.warehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ສາງເລີ່ມຕົ້ນ = ສາງຫຼັກ ເມື່ອບໍ່ໄດ້ກຳນົດມາ
  const defaultWarehouse = active.find((warehouse) => warehouse.isDefault)?.id ?? "";
  const effectiveWarehouse = warehouseId || defaultWarehouse;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const variantId = picked?.variantId ?? "";
    const number = amount.trim() === "" ? Number.NaN : Number(amount);
    const trimmedNote = note.trim();
    const raw =
      mode === "adjust"
        ? { variantId, warehouseId: effectiveWarehouse, delta: number, note: trimmedNote }
        : mode === "transfer"
          ? {
              variantId,
              fromWarehouseId: effectiveWarehouse,
              toWarehouseId,
              quantity: number,
              ...(trimmedNote ? { note: trimmedNote } : {}),
            }
          : { variantId, warehouseId: effectiveWarehouse, quantity: number, ...(trimmedNote ? { note: trimmedNote } : {}) };
    const parsed = SCHEMAS[mode].safeParse(raw);
    if (!parsed.success) {
      setIssues(formatIssues(parsed.error.issues));
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      await operate.mutateAsync({ mode, input: parsed.data });
      toast.success(t(SUCCESS_KEYS[mode]));
      onDone();
    } catch (error) {
      setIssues([errorMessage(error, t), ...shortageLines(error, t)]);
    } finally {
      setSaving(false);
    }
  }

  const warehouseOptions = (
    <>
      <option value="">{t("stock.field.selectWarehouse")}</option>
      {active.map((warehouse) => (
        <option key={warehouse.id} value={warehouse.id}>
          {`${warehouse.code} — ${warehouse.name}`}
        </option>
      ))}
    </>
  );

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t(`stock.op.title.${mode}`)} description={t(`stock.op.desc.${mode}`)} />
      <DialogBody>
        {issues.length > 0 ? (
          <ul role="alert" className="list-inside list-disc rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {issues.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-ink-secondary">{t("stock.field.variant")}</p>
              <p className="text-sm font-medium text-ink">{picked.label}</p>
            </div>
            {target === null ? (
              <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setPicked(null)}>
                {t("stock.picker.change")}
              </Button>
            ) : null}
          </div>
        ) : (
          <VariantPicker
            id="stock-op-variant"
            label={t("stock.field.variant")}
            includeInactive
            onSelect={(variant) =>
              setPicked({
                variantId: variant.id,
                label: `${variant.productName}${variant.name ? ` — ${variant.name}` : ""} (${variant.sku})`,
              })
            }
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t(mode === "transfer" ? "stock.field.fromWarehouse" : "stock.field.warehouse")} htmlFor="stock-op-warehouse">
            <Select id="stock-op-warehouse" value={effectiveWarehouse} onChange={(event) => setWarehouseId(event.target.value)}>
              {warehouseOptions}
            </Select>
          </Field>
          {mode === "transfer" ? (
            <Field label={t("stock.field.toWarehouse")} htmlFor="stock-op-to">
              <Select id="stock-op-to" value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)}>
                {warehouseOptions}
              </Select>
            </Field>
          ) : null}
          <Field label={t(mode === "adjust" ? "stock.field.delta" : "stock.field.quantity")} htmlFor="stock-op-amount" required>
            <Input
              id="stock-op-amount"
              type="number"
              inputMode="numeric"
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field
            label={t(mode === "adjust" ? "stock.field.noteRequired" : "stock.field.note")}
            htmlFor="stock-op-note"
            required={mode === "adjust"}
            className={mode === "transfer" ? "sm:col-span-2" : undefined}
          >
            <Input id="stock-op-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

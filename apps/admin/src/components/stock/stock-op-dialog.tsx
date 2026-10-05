"use client";

import {
  adjustStockSchema,
  receiveStockSchema,
  returnStockSchema,
  transferStockSchema,
} from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useRef, useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage, shortageLines } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
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
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      // ຂະນະບັນທຶກ ຫ້າມປິດ (Escape / overlay / X) ຈົນກວ່າຄຳຂໍຈະຈົບ
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <StockOpForm
          key={`${mode}:${target?.variantId ?? "none"}:${target?.warehouseId ?? ""}`}
          mode={mode}
          target={target}
          saving={saving}
          onSavingChange={setSaving}
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

type FieldKey = "variant" | "warehouse" | "to" | "amount" | "note";

const PATH_FIELD: Record<string, FieldKey> = {
  variantId: "variant",
  warehouseId: "warehouse",
  fromWarehouseId: "warehouse",
  toWarehouseId: "to",
  quantity: "amount",
  delta: "amount",
  note: "note",
};

interface FormIssues {
  messages: string[];
  fields: FieldKey[];
}

const NO_ISSUES: FormIssues = { messages: [], fields: [] };
const ERRORS_ID = "stock-op-errors";
const MAX_AMOUNT = 1_000_000;

function StockOpForm({
  mode,
  target,
  saving,
  onSavingChange,
  onDone,
}: {
  mode: StockOpMode;
  target: StockOpTarget | null;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const warehouses = useWarehouses();
  const operate = useStockOperation();
  const submitting = useRef(false);
  const active = (warehouses.data ?? []).filter((warehouse) => warehouse.isActive);

  const [picked, setPicked] = useState<{ variantId: string; label: string } | null>(target);
  // null = ຍັງບໍ່ໄດ້ເລືອກເອງ (ໃຊ້ຄ່າເລີ່ມຕົ້ນ); "" = ຜູ້ໃຊ້ເລືອກ placeholder ຕັ້ງໃຈ
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<FormIssues>(NO_ISSUES);

  // ສາງເລີ່ມຕົ້ນ = ສາງຂອງ target ຖ້າຍັງເປີດຢູ່, ບໍ່ດັ່ງນັ້ນ = ສາງຫຼັກ
  const targetWarehouse = active.find((warehouse) => warehouse.id === target?.warehouseId)?.id;
  const defaultWarehouse = targetWarehouse ?? active.find((warehouse) => warehouse.isDefault)?.id ?? "";
  const effectiveWarehouse = warehouseId ?? defaultWarehouse;
  const effectiveTo = toWarehouseId === effectiveWarehouse ? "" : toWarehouseId;

  const invalid = (field: FieldKey) => issues.fields.includes(field);
  const describedBy = issues.messages.length > 0 ? ERRORS_ID : undefined;
  const edit = () => setIssues(NO_ISSUES);

  const fieldLabel: Record<FieldKey, string> = {
    variant: t("stock.field.variant"),
    warehouse: t(mode === "transfer" ? "stock.field.fromWarehouse" : "stock.field.warehouse"),
    to: t("stock.field.toWarehouse"),
    amount: t(mode === "adjust" ? "stock.field.delta" : "stock.field.quantity"),
    note: t(mode === "adjust" ? "stock.field.noteRequired" : "stock.field.note"),
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // ການສະຕ໋ອກບໍ່ idempotent: ກັນສົ່ງຊ້ຳ
    if (saving || operate.isPending || submitting.current) return;
    const variantId = picked?.variantId ?? "";
    const number = amount.trim() === "" ? Number.NaN : Number(amount);
    const trimmedNote = note.trim();

    const found: { field: FieldKey; text: string }[] = [];
    if (!variantId) found.push({ field: "variant", text: t("stock.err.variant") });
    if (!effectiveWarehouse) found.push({ field: "warehouse", text: t("stock.err.warehouse") });
    if (mode === "transfer" && !effectiveTo) found.push({ field: "to", text: t("stock.err.toWarehouse") });
    const amountOk =
      Number.isInteger(number) &&
      (mode === "adjust" ? number !== 0 && Math.abs(number) <= MAX_AMOUNT : number >= 1 && number <= MAX_AMOUNT);
    if (!amountOk) found.push({ field: "amount", text: t(mode === "adjust" ? "stock.err.delta" : "stock.err.quantity") });
    if (mode === "adjust" && !trimmedNote) found.push({ field: "note", text: t("stock.err.reason") });
    if (found.length > 0) {
      setIssues({ messages: found.map((item) => item.text), fields: found.map((item) => item.field) });
      return;
    }

    const raw =
      mode === "adjust"
        ? { variantId, warehouseId: effectiveWarehouse, delta: number, note: trimmedNote }
        : mode === "transfer"
          ? {
              variantId,
              fromWarehouseId: effectiveWarehouse,
              toWarehouseId: effectiveTo,
              quantity: number,
              ...(trimmedNote ? { note: trimmedNote } : {}),
            }
          : { variantId, warehouseId: effectiveWarehouse, quantity: number, ...(trimmedNote ? { note: trimmedNote } : {}) };
    const parsed = SCHEMAS[mode].safeParse(raw);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => PATH_FIELD[String(issue.path[0])] ?? "amount");
      setIssues({
        messages: fields.map((field) => t("stock.err.invalid", { field: fieldLabel[field] })),
        fields,
      });
      return;
    }
    setIssues(NO_ISSUES);
    submitting.current = true;
    onSavingChange(true);
    try {
      await operate.mutateAsync({ mode, input: parsed.data });
      toast.success(t(SUCCESS_KEYS[mode]));
      onDone();
    } catch (error) {
      setIssues({ messages: [errorMessage(error, t), ...shortageLines(error, t)], fields: [] });
    } finally {
      submitting.current = false;
      onSavingChange(false);
    }
  }

  const warehouseOptions = (exclude?: string) => (
    <>
      <option value="">{t("stock.field.selectWarehouse")}</option>
      {active
        .filter((warehouse) => warehouse.id !== exclude)
        .map((warehouse) => (
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
        {issues.messages.length > 0 ? (
          <ul
            id={ERRORS_ID}
            role="alert"
            className="list-inside list-disc rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink"
          >
            {issues.messages.map((line) => (
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
            required
            invalid={invalid("variant")}
            aria-describedby={invalid("variant") ? describedBy : undefined}
            onSelect={(variant) => {
              edit();
              setPicked({
                variantId: variant.id,
                label: `${variant.productName}${variant.name ? ` — ${variant.name}` : ""} (${variant.sku})`,
              });
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={fieldLabel.warehouse} htmlFor="stock-op-warehouse" required>
            <Select
              id="stock-op-warehouse"
              value={effectiveWarehouse}
              invalid={invalid("warehouse")}
              aria-describedby={invalid("warehouse") ? describedBy : undefined}
              onChange={(event) => {
                edit();
                setWarehouseId(event.target.value);
              }}
            >
              {warehouseOptions()}
            </Select>
          </Field>
          {mode === "transfer" ? (
            <Field label={fieldLabel.to} htmlFor="stock-op-to" required>
              <Select
                id="stock-op-to"
                value={effectiveTo}
                invalid={invalid("to")}
                aria-describedby={invalid("to") ? describedBy : undefined}
                onChange={(event) => {
                  edit();
                  setToWarehouseId(event.target.value);
                }}
              >
                {warehouseOptions(effectiveWarehouse)}
              </Select>
            </Field>
          ) : null}
          <Field label={fieldLabel.amount} htmlFor="stock-op-amount" required>
            <Input
              id="stock-op-amount"
              type="number"
              // adjust ຮັບຄ່າລົບ: keypad ຕົວເລກຂອງ iOS ພິມ "-" ບໍ່ໄດ້
              inputMode={mode === "adjust" ? undefined : "numeric"}
              step={1}
              value={amount}
              invalid={invalid("amount")}
              aria-describedby={invalid("amount") ? describedBy : undefined}
              onChange={(event) => {
                edit();
                setAmount(event.target.value);
              }}
            />
          </Field>
          <Field
            label={fieldLabel.note}
            htmlFor="stock-op-note"
            required={mode === "adjust"}
            className={mode === "transfer" ? "sm:col-span-2" : undefined}
          >
            <Input
              id="stock-op-note"
              value={note}
              invalid={invalid("note")}
              aria-describedby={invalid("note") ? describedBy : undefined}
              onChange={(event) => {
                edit();
                setNote(event.target.value);
              }}
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

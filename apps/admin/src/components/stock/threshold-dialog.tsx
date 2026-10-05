"use client";

import { stockThresholdSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSetThreshold } from "@/lib/queries";
import type { StockLevelDto } from "@/lib/types";

export interface ThresholdDialogProps {
  /** null = ປິດ dialog */
  level: StockLevelDto | null;
  onOpenChange: (open: boolean) => void;
}

export function ThresholdDialog({ level, onOpenChange }: ThresholdDialogProps) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={level !== null}
      // ຂະນະບັນທຶກ ຫ້າມປິດ (Escape / overlay / X) ຈົນກວ່າຄຳຂໍຈະຈົບ
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {level ? (
          <ThresholdForm
            key={level.id}
            level={level}
            saving={saving}
            onSavingChange={setSaving}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const ERROR_ID = "threshold-error";
const HINT_ID = "threshold-hint";

function ThresholdForm({
  level,
  saving,
  onSavingChange,
  onDone,
}: {
  level: StockLevelDto;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const save = useSetThreshold();
  const submitting = useRef(false);
  const [value, setValue] = useState(level.lowStockThreshold === null ? "" : String(level.lowStockThreshold));
  const [message, setMessage] = useState<string | null>(null);
  const [fieldInvalid, setFieldInvalid] = useState(false);
  // <input type="number"> ລາຍງານ value "" ເມື່ອພິມຂໍ້ຄວາມທີ່ parse ບໍ່ໄດ້ ("e", "-"): ຕ້ອງແຍກຈາກຊ່ອງວ່າງຈິງ
  const [badInput, setBadInput] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || save.isPending || submitting.current) return;
    // ເວັ້ນວ່າງ = null (ບໍ່ເຕືອນ); 0 ເປັນຄ່າຖືກຕ້ອງ ແຕກຕ່າງຈາກ null
    const trimmed = value.trim();
    const parsed = badInput
      ? null
      : stockThresholdSchema.safeParse({ lowStockThreshold: trimmed === "" ? null : Number(trimmed) });
    if (!parsed?.success) {
      setFieldInvalid(true);
      setMessage(t("stock.err.threshold"));
      return;
    }
    setFieldInvalid(false);
    setMessage(null);
    submitting.current = true;
    onSavingChange(true);
    try {
      await save.mutateAsync({ id: level.id, lowStockThreshold: parsed.data.lowStockThreshold });
      toast.success(t("stock.toast.threshold"));
      onDone();
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      submitting.current = false;
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={t("stock.op.threshold")}
        description={`${level.productName}${level.variantName ? ` — ${level.variantName}` : ""} (${level.sku}) · ${level.warehouseCode}`}
      />
      <DialogBody>
        {message ? (
          <p
            id={ERROR_ID}
            role="alert"
            className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink"
          >
            {message}
          </p>
        ) : null}
        <Field label={t("stock.field.threshold")} htmlFor="threshold-value">
          <Input
            id="threshold-value"
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            value={value}
            invalid={fieldInvalid}
            aria-describedby={message ? `${ERROR_ID} ${HINT_ID}` : HINT_ID}
            onChange={(event) => {
              setMessage(null);
              setFieldInvalid(false);
              setBadInput(event.target.validity.badInput);
              setValue(event.target.value);
            }}
          />
          <p id={HINT_ID} className="mt-1 text-xs text-ink-muted">{t("stock.field.thresholdHint")}</p>
        </Field>
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

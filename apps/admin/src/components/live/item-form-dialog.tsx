"use client";

import { cfCodeSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { type FormEvent, useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSaveLiveItem } from "@/lib/queries";
import type { LiveItemDto } from "@/lib/types";

const LIMIT_MAX = 100_000;
const VARIANT_ERROR_ID = "live-item-variant-error";

interface PickedVariant {
  id: string;
  label: string;
}

const variantLabel = (v: { productName: string; variantName?: string | null; name?: string | null; sku: string }) => {
  const name = v.variantName ?? v.name;
  return `${v.productName}${name ? ` — ${name}` : ""} (${v.sku})`;
};

export interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** null = ເພີ່ມລະຫັດໃໝ່ */
  item: LiveItemDto | null;
}

export function ItemFormDialog({ open, onOpenChange, sessionId, item }: ItemFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <ItemForm key={item?.id ?? "new"} sessionId={sessionId} item={item} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type Errors = Partial<Record<"code" | "variant" | "limit", string>>;

function ItemForm({ sessionId, item, onDone }: { sessionId: string; item: LiveItemDto | null; onDone: () => void }) {
  const { t } = useT();
  const save = useSaveLiveItem();
  const [code, setCode] = useState(item?.code ?? "");
  const [picked, setPicked] = useState<PickedVariant | null>(item ? { id: item.variantId, label: variantLabel(item) } : null);
  const [limit, setLimit] = useState(item?.limit === null || item?.limit === undefined ? "" : String(item.limit));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const claimed = item?.claimed ?? 0;
  // API ບໍ່ໃຫ້ປ່ຽນສິນຄ້າຂອງລະຫັດທີ່ມີ CF ຈອງແລ້ວ
  const variantLocked = claimed > 0;

  function validate(): { code: string; variantId: string; limit: number | null } | null {
    const next: Errors = {};
    const parsedCode = cfCodeSchema.safeParse(code);
    if (!item && !parsedCode.success) next.code = t("live.itemForm.codeInvalid");
    if (!picked) next.variant = t("live.itemForm.productRequired");
    const trimmed = limit.trim();
    let parsedLimit: number | null = null;
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!/^\d+$/.test(trimmed) || value < 1 || value > LIMIT_MAX) next.limit = t("live.itemForm.limitInvalid");
      else if (value < claimed) next.limit = t("live.itemForm.limitBelowClaimed", { claimed });
      else parsedLimit = value;
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !picked) return null;
    return { code: parsedCode.success ? parsedCode.data : code, variantId: picked.id, limit: parsedLimit };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    const values = validate();
    if (!values) return;
    try {
      if (item) {
        await save.mutateAsync({
          sessionId,
          itemId: item.id,
          input: { ...(values.variantId !== item.variantId ? { variantId: values.variantId } : {}), limit: values.limit },
        });
        toast.success(t("live.items.toast.updated"));
      } else {
        await save.mutateAsync({ sessionId, input: values });
        toast.success(t("live.items.toast.added"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={item ? t("live.itemForm.editTitle", { code: item.code }) : t("live.itemForm.addTitle")}
        description={t("live.itemForm.description")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <Field label={t("live.itemForm.code")} htmlFor="live-item-code" required={!item} error={errors.code}>
          <Input
            id="live-item-code"
            className="font-mono uppercase"
            autoComplete="off"
            maxLength={60}
            value={code}
            disabled={!!item}
            invalid={!!errors.code}
            aria-describedby="live-item-code-hint"
            onChange={(event) => setCode(event.target.value)}
          />
          <p id="live-item-code-hint" className="mt-1 text-xs text-ink-muted">
            {t("live.itemForm.codeHint")}
          </p>
        </Field>

        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-secondary">{t("live.itemForm.product")}</p>
              <p className="truncate text-sm font-medium text-ink">{picked.label}</p>
              {variantLocked ? <p className="text-xs text-ink-muted">{t("live.itemForm.variantLocked")}</p> : null}
            </div>
            {variantLocked ? null : (
              <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setPicked(null)}>
                {t("live.itemForm.change")}
              </Button>
            )}
          </div>
        ) : (
          <div>
            <VariantPicker
              id="live-item-variant"
              label={t("live.itemForm.product")}
              required
              invalid={!!errors.variant}
              aria-describedby={errors.variant ? VARIANT_ERROR_ID : undefined}
              onSelect={(variant) => {
                setPicked({ id: variant.id, label: variantLabel(variant) });
                setErrors((current) => ({ ...current, variant: undefined }));
              }}
            />
            {errors.variant ? (
              <p id={VARIANT_ERROR_ID} role="alert" className="mt-1 text-xs text-danger">
                {errors.variant}
              </p>
            ) : null}
          </div>
        )}

        <Field label={t("live.itemForm.limit")} htmlFor="live-item-limit" error={errors.limit}>
          <Input
            id="live-item-limit"
            type="number"
            inputMode="numeric"
            min={Math.max(1, claimed)}
            max={LIMIT_MAX}
            step={1}
            value={limit}
            invalid={!!errors.limit}
            aria-describedby="live-item-limit-hint"
            onChange={(event) => setLimit(event.target.value)}
          />
          <p id="live-item-limit-hint" className="mt-1 text-xs text-ink-muted">
            {t("live.itemForm.limitHint")}
          </p>
        </Field>
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

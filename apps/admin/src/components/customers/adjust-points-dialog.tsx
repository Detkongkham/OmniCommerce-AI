"use client";

import { adjustPointsSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useAdjustCrmPoints } from "@/lib/queries";
import type { CrmCustomerDetailDto } from "@/lib/types";

/** ປັບແຕ້ມດ້ວຍມື: ຈຳນວນບວກ = ເພີ່ມ, ລົບ = ຫັກ; ຕ້ອງມີເຫດຜົນ (ບັນທຶກໃນສະໝຸດ ແລະ audit) */
export function AdjustPointsDialog({ customer, open, onOpenChange }: { customer: CrmCustomerDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {open ? <AdjustForm customer={customer} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ customer, onDone }: { customer: CrmCustomerDetailDto; onDone: () => void }) {
  const { t } = useT();
  const adjust = useAdjustCrmPoints();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ points?: string; note?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (adjust.isPending) return;
    setFormError(null);
    const trimmed = points.trim();
    const parsed = adjustPointsSchema.safeParse({ points: /^-?\d{1,8}$/.test(trimmed) ? Number(trimmed) : 0, note });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setErrors({
        points: fields.has("points") ? t("customers.adjust.pointsInvalid") : undefined,
        note: fields.has("note") ? t("customers.adjust.noteRequired") : undefined,
      });
      return;
    }
    setErrors({});
    try {
      await adjust.mutateAsync({ id: customer.id, input: parsed.data });
      toast.success(t("customers.adjust.done"));
      onDone();
    } catch (error) {
      const balance = error instanceof ApiError && error.code === "POINTS_INVALID" ? error.body?.balance : undefined;
      if (typeof balance === "number") setErrors({ points: t("customers.adjust.insufficient", { balance: formatQuantity(balance) }) });
      else setFormError(errorMessage(error, t));
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={t("customers.adjust.title", { name: customer.name })}
        description={t("customers.adjust.description", { balance: formatQuantity(customer.pointsBalance) })}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4">
          <Field label={t("customers.adjust.points")} htmlFor="adjust-points" required error={errors.points}>
            <Input
              id="adjust-points"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              value={points}
              invalid={!!errors.points}
              onChange={(event) => {
                setPoints(event.target.value);
                setErrors((current) => ({ ...current, points: undefined }));
              }}
            />
          </Field>
          <Field label={t("customers.adjust.note")} htmlFor="adjust-note" required error={errors.note}>
            <Input
              id="adjust-note"
              maxLength={200}
              value={note}
              invalid={!!errors.note}
              onChange={(event) => {
                setNote(event.target.value);
                setErrors((current) => ({ ...current, note: undefined }));
              }}
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={adjust.isPending}>
          {adjust.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

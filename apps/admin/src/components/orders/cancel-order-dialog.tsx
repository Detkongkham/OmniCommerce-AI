"use client";

import { cancelOrderSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input } from "@oca/ui";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";

export interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ຕ້ອງ throw ເມື່ອລົ້ມ (dialog ສະແດງຂໍ້ຄວາມ ແລະ ຍັງເປີດ); ສຳເລັດ = dialog ປິດ */
  onConfirm: (reason: string | undefined) => Promise<void>;
}

/** ຢືນຢັນຍົກເລີກບິນ ພ້ອມເຫດຜົນ (ບໍ່ບັງຄັບ, ≤200 ໂຕ ຕາມ cancelOrderSchema) */
export function CancelOrderDialog({ open, onOpenChange, onConfirm }: CancelOrderDialogProps) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  // Radix ຄືນ focus ໃຫ້ DialogTrigger ເທົ່ານັ້ນ; ປຸ່ມເປີດຢູ່ນອກ dialog ຈຶ່ງຈື່ເອງ ແລະ ຄືນໃຫ້ຖ້າຍັງຢູ່ໃນ DOM
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog
      open={open}
      // ຂະນະຍົກເລີກ ຫ້າມປິດ (Escape / overlay / X) ຈົນກວ່າຄຳຂໍຈະຈົບ
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-md"
        closeLabel={t("common.close")}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const element = opener.current;
          opener.current = null;
          if (element?.isConnected && !(element as HTMLButtonElement).disabled) element.focus();
        }}
      >
        {open ? (
          <CancelForm saving={saving} onSavingChange={setSaving} onConfirm={onConfirm} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const ERROR_ID = "cancel-order-error";
const REASON_MAX = 200;

function CancelForm({
  saving,
  onSavingChange,
  onConfirm,
  onDone,
}: {
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onConfirm: CancelOrderDialogProps["onConfirm"];
  onDone: () => void;
}) {
  const { t } = useT();
  const submitting = useRef(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldInvalid, setFieldInvalid] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || submitting.current) return;
    const trimmed = reason.trim();
    const parsed = cancelOrderSchema.safeParse({ reason: trimmed === "" ? undefined : trimmed });
    if (!parsed.success) {
      setFieldInvalid(true);
      setMessage(t("orders.cancel.reasonTooLong", { max: REASON_MAX }));
      return;
    }
    setFieldInvalid(false);
    setMessage(null);
    submitting.current = true;
    onSavingChange(true);
    try {
      await onConfirm(parsed.data.reason);
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
      <DialogHeader title={t("orders.cancel.title")} description={t("orders.cancel.description")} />
      <DialogBody>
        {message ? (
          <p id={ERROR_ID} role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <Field label={t("orders.cancel.reason")} htmlFor="cancel-reason">
          <Input
            id="cancel-reason"
            value={reason}
            invalid={fieldInvalid}
            aria-describedby={message ? ERROR_ID : undefined}
            onChange={(event) => {
              setMessage(null);
              setFieldInvalid(false);
              setReason(event.target.value);
            }}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onDone}>
          {t("orders.cancel.keep")}
        </Button>
        <Button type="submit" variant="destructive" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("orders.cancel.confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

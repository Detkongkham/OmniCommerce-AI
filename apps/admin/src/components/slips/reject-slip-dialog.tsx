"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input } from "@oca/ui";
import { useId, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";

export interface RejectSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ຕ້ອງ throw ເມື່ອລົ້ມ (dialog ສະແດງຂໍ້ຄວາມ ແລະ ຍັງເປີດ); ສຳເລັດ = ປິດ */
  onConfirm: (reason: string) => Promise<void>;
  /** ຄືນ focus ຫຼັງປິດ: ປຸ່ມເປີດຢູ່ນອກ dialog (Radix ຄືນ focus ໃຫ້ DialogTrigger ເທົ່ານັ້ນ) */
  restoreFocus: () => void;
}

const REASON_MAX = 500;

/** ປະຕິເສດສະລິບ: ເຫດຜົນບັງຄັບ (ຕັດຍະຫວ່າງ, ≤500 ໂຕ) */
export function RejectSlipDialog({ open, onOpenChange, onConfirm, restoreFocus }: RejectSlipDialogProps) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      // ຂະນະສົ່ງ ຫ້າມປິດ (Escape / overlay / X) ຈົນກວ່າຄຳຂໍຈະຈົບ
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-md"
        closeLabel={t("common.close")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        {open ? <RejectForm saving={saving} onSavingChange={setSaving} onConfirm={onConfirm} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({
  saving,
  onSavingChange,
  onConfirm,
  onDone,
}: {
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onConfirm: RejectSlipDialogProps["onConfirm"];
  onDone: () => void;
}) {
  const { t } = useT();
  const uid = useId();
  const errorId = `${uid}-error`;
  const reasonId = `${uid}-reason`;
  const submitting = useRef(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // ກັນກົດຊ້ຳ (ref ທັນທີ ກ່ອນ state ອັບເດດ)
    if (saving || submitting.current) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setMessage(t("slips.reject.reasonRequired"));
      return;
    }
    setMessage(null);
    submitting.current = true;
    onSavingChange(true);
    try {
      await onConfirm(trimmed);
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
      <DialogHeader title={t("slips.reject.title")} description={t("slips.reject.description")} />
      <DialogBody>
        {message ? (
          <p id={errorId} role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <Field label={t("slips.reject.reason")} htmlFor={reasonId} required>
          <Input
            id={reasonId}
            value={reason}
            maxLength={REASON_MAX}
            invalid={message !== null && reason.trim() === ""}
            aria-describedby={message ? errorId : undefined}
            onChange={(event) => {
              setMessage(null);
              setReason(event.target.value);
            }}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="destructive" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {t("slips.reject.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input } from "@oca/ui";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";

export interface RejectSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ຕ້ອງ throw ເມື່ອລົ້ມ (dialog ສະແດງຂໍ້ຄວາມ ແລະ ຍັງເປີດ); ສຳເລັດ = ປິດ */
  onConfirm: (reason: string) => Promise<void>;
}

const REASON_MAX = 500;
const ERROR_ID = "reject-slip-error";

/** ປະຕິເສດສະລິບ: ເຫດຜົນບັງຄັບ (ຕັດຍະຫວ່າງ, ≤500 ໂຕ) */
export function RejectSlipDialog({ open, onOpenChange, onConfirm }: RejectSlipDialogProps) {
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
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
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
          <p id={ERROR_ID} role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <Field label={t("slips.reject.reason")} htmlFor="reject-slip-reason" required>
          <Input
            id="reject-slip-reason"
            value={reason}
            maxLength={REASON_MAX}
            invalid={message !== null && reason.trim() === ""}
            aria-describedby={message ? ERROR_ID : undefined}
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

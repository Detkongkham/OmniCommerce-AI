import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** DESIGN.md §9.10: ຂະນະກຳລັງດຳເນີນການ ປິດ dialog ບໍ່ໄດ້ ແລະ ປຸ່ມທັງສອງ disabled. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[400px] p-6" closeLabel={closeLabel} showClose={!busy}>
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="size-5 text-danger" aria-hidden="true" />
          </div>
          <div className="min-w-0 pr-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm">{description}</DialogDescription>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" className="h-10 rounded-xl px-5" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            className="h-10 rounded-xl px-6 font-bold"
            loading={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

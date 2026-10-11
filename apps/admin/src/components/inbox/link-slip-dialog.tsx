"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Skeleton, toast } from "@oca/ui";
import Link from "next/link";
import { useState } from "react";
import { OrderStatusPill } from "@/components/orders/order-status";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useLinkChatSlip, useOrders } from "@/lib/queries";

export interface LinkSlipTarget {
  conversationId: string;
  messageId: string;
  attachmentIndex: number;
}

export interface LinkSlipDialogProps {
  target: LinkSlipTarget | null;
  onClose: () => void;
  /** ຄືນ focus ຫຼັງປິດ: ປຸ່ມເປີດຢູ່ນອກ dialog (Radix ຄືນ focus ໃຫ້ DialogTrigger ເທົ່ານັ້ນ) */
  restoreFocus: () => void;
}

/** ເລືອກບິນຂອງເຄສເພື່ອຜູກຮູບໃນແຊັດເປັນສະລິບ. key ຕາມ target: ເປີດຮູບອື່ນ = remount (ຄ່າທີ່ເລືອກ/error ບໍ່ຮົ່ວຂ້າມຮູບ) */
export function LinkSlipDialog({ target, onClose, restoreFocus }: LinkSlipDialogProps) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={target !== null}
      // ຂະນະຜູກ ຫ້າມປິດ (Escape / overlay / X)
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
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
        {target ? (
          <LinkForm
            key={`${target.messageId}:${target.attachmentIndex}`}
            target={target}
            saving={saving}
            onSavingChange={setSaving}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  target,
  saving,
  onSavingChange,
  onClose,
}: {
  target: LinkSlipTarget;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const orders = useOrders({ conversationId: target.conversationId, page: 1, pageSize: 20 });
  const link = useLinkChatSlip();
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = orders.data?.items ?? [];
  const payable = items.filter((order) => order.status === "PENDING_PAYMENT");
  // ຄ່າທີ່ເລືອກຕ້ອງຍັງຮັບຊຳລະໄດ້ (ລາຍການອາດ refetch ແລ້ວບິນປ່ຽນສະຖານະ); ເລີ່ມຕົ້ນ = ບິນທີ່ຮັບຊຳລະໄດ້ອັນທຳອິດ (API ຮຽງໃໝ່ສຸດກ່ອນ)
  const selected = payable.find((order) => order.id === picked)?.id ?? payable[0]?.id ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !selected) return;
    setMessage(null);
    onSavingChange(true);
    try {
      await link.mutateAsync({
        conversationId: target.conversationId,
        messageId: target.messageId,
        input: { orderId: selected, attachmentIndex: target.attachmentIndex },
      });
      toast.success(t("slips.toast.linked"));
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("slips.link.title")} description={t("slips.link.description")} />
      <DialogBody>
        {message ? (
          <p role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        {orders.isError && !orders.data ? (
          <div role="alert" className="flex items-center gap-2 text-sm text-danger">
            {t("common.error.load")}
            <Button type="button" variant="outline" size="sm" onClick={() => void orders.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : orders.isPending ? (
          <Skeleton role="status" aria-busy="true" aria-label={t("common.loading")} className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            {t("slips.link.noOrders")}{" "}
            <Link
              href={`/orders/new?conversationId=${encodeURIComponent(target.conversationId)}`}
              className="font-semibold text-brand underline"
            >
              {t("inbox.panel.openOrder")}
            </Link>
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("slips.link.title")}</legend>
            {items.map((order) => {
              const ok = order.status === "PENDING_PAYMENT";
              return (
                <label
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm has-[:disabled]:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name="slip-order"
                      value={order.id}
                      checked={selected === order.id}
                      disabled={!ok || saving}
                      onChange={() => setPicked(order.id)}
                    />
                    <span className="font-mono font-semibold">{order.orderNumber}</span>
                    <span className="tabular-nums text-ink-secondary">{formatMoney(order.total)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <OrderStatusPill status={order.status} />
                    {ok ? null : <span className="text-[11px] text-ink-muted">{t("slips.link.notPayable")}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onClose}>
          {t("slips.link.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving} disabled={!selected}>
          {t("slips.link.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

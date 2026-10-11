"use client";

import { SLIP_CURRENCIES, normalizeSlipAmount } from "@oca/shared";
import { Button, Card, ConfirmDialog, Field, Input, Select, StatusPill, toast } from "@oca/ui";
import { AlertTriangle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useConfirmSlip, usePatchSlip, useRejectSlip, useRetrySlip } from "@/lib/queries";
import { SLIP_STATUS_TONE, canConfirmSlip, isOpenSlip, slipFlagKey } from "@/lib/slips";
import type { SlipDto, SlipValuesDto } from "@/lib/types";
import { RejectSlipDialog } from "./reject-slip-dialog";
import { SlipImage } from "./slip-image";

export interface SlipOrderInfo {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
}

const FIELDS = ["amount", "currency", "paidAt", "destAccount", "refNo"] as const;

/** ຄ່າສຸດທ້າຍ = ທີ່ແອດມິນແກ້ ກ່ອນ ບໍ່ດັ່ງນັ້ນທີ່ເຄື່ອງອ່ານ */
function effective(slip: SlipDto): SlipValuesDto {
  return {
    amount: slip.confirmed.amount ?? slip.read.amount,
    currency: slip.confirmed.currency ?? slip.read.currency,
    paidAt: slip.confirmed.paidAt ?? slip.read.paidAt,
    destAccount: slip.confirmed.destAccount ?? slip.read.destAccount,
    refNo: slip.confirmed.refNo ?? slip.read.refNo,
  };
}

function ValuesTable({ title, values }: { title: string; values: SlipValuesDto }) {
  const { t } = useT();
  const display = (field: (typeof FIELDS)[number]): string => {
    const value = values[field];
    if (value === null || value === "") return "—";
    if (field === "amount") return formatMoney(value);
    if (field === "paidAt") return formatDateTime(value);
    return value;
  };
  return (
    <table aria-label={title} className="w-full text-xs">
      <caption className="mb-1 text-left text-xs font-semibold text-ink-secondary">{title}</caption>
      <tbody>
        {FIELDS.map((field) => (
          <tr key={field} className="border-t border-line first:border-t-0">
            <th scope="row" className="py-1 pr-2 text-left font-normal text-ink-muted">
              {t(`slips.field.${field}`)}
            </th>
            <td className="py-1 text-right tabular-nums text-ink">{display(field)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SlipCard({ slip, order, canReview }: { slip: SlipDto; order: SlipOrderInfo; canReview: boolean }) {
  const { t } = useT();
  const patch = usePatchSlip();
  const retry = useRetrySlip();
  const confirm = useConfirmSlip();
  const reject = useRejectSlip();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const confirming = useRef(false);
  const open = isOpenSlip(slip);
  const busy = patch.isPending || retry.isPending || confirm.isPending || reject.isPending;
  const final = effective(slip);
  const editable = canReview && open && slip.status !== "PENDING_READ";
  const confirmable = canConfirmSlip(slip, canReview);

  /** ຮັນ action ແລ້ວ toast ຜົນ; ບໍ່ throw (ສົ່ງຄືນ true/false) */
  async function run<T>(action: () => Promise<T>, successKey: TranslationKey): Promise<boolean> {
    try {
      await action();
      toast.success(t(successKey));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t));
      return false;
    }
  }

  /** ຄືນ focus ຫຼັງປິດ dialog ປະຕິເສດ: ປຸ່ມ Reject ຖ້າຍັງຢູ່ ແລະ ກົດໄດ້; ບໍ່ດັ່ງນັ້ນຕົວ card */
  function restoreFocus() {
    const opener = rejectButtonRef.current;
    if (opener?.isConnected && !opener.disabled) opener.focus();
    else rootRef.current?.focus();
  }

  async function onConfirm() {
    // ກັນກົດຊ້ຳ (ref ທັນທີ ກ່ອນ isPending ອັບເດດ)
    if (confirming.current || final.amount === null) return;
    confirming.current = true;
    try {
      await run(() => confirm.mutateAsync(slip.id), "slips.toast.confirmed");
    } finally {
      confirming.current = false;
      // ປິດ dialog ທັງສຳເລັດແລະລົ້ມ (error ສະແດງຜ່ານ toast)
      setConfirmOpen(false);
    }
  }

  return (
    <Card ref={rootRef} tabIndex={-1} className="rounded-[20px] p-4 outline-none" data-testid={`slip-${slip.id}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SlipImage slipId={slip.id} />
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={SLIP_STATUS_TONE[slip.status]}>{t(`slips.status.${slip.status}`)}</StatusPill>
            <span className="text-xs text-ink-muted">{t(`slips.source.${slip.source}`)}</span>
            <time dateTime={slip.createdAt} className="text-xs text-ink-muted">
              {formatDateTime(slip.createdAt)}
            </time>
          </div>

          {slip.status === "PENDING_READ" ? <p className="text-sm text-ink-secondary">{t("slips.pendingNote")}</p> : null}
          {slip.status === "READ_FAILED" ? <p className="text-sm text-warning-ink">{t("slips.failedNote")}</p> : null}

          {slip.flags.length > 0 ? (
            <ul aria-label={t("slips.flags")} className="space-y-1">
              {slip.flags.map((flag) => (
                <li key={flag} className="flex items-start gap-1.5 text-xs font-medium text-warning-ink">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{t(slipFlagKey(flag))}</span>
                </li>
              ))}
            </ul>
          ) : slip.status === "READ" ? (
            <p className="text-xs text-success-ink">{t("slips.noFlags")}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ValuesTable title={t("slips.read")} values={slip.read} />
            <ValuesTable title={t("slips.confirmed")} values={slip.confirmed} />
          </div>

          {slip.reviewedBy ? <p className="text-xs text-ink-muted">{t("slips.reviewedBy", { name: slip.reviewedBy.name })}</p> : null}
          {slip.status === "REJECTED" && slip.rejectReason ? (
            <p className="text-xs text-ink-secondary">{t("slips.rejectReason", { reason: slip.rejectReason })}</p>
          ) : null}

          {editable ? (
            <SlipEditForm
              // ຄ່າຈາກ server ປ່ຽນ (ຫຼັງບັນທຶກ/ອ່ານໃໝ່) → ຣີເຊັດຟອມໃຫ້ກົງ
              key={JSON.stringify(final)}
              values={final}
              disabled={busy}
              saving={patch.isPending}
              onSave={(input) => run(() => patch.mutateAsync({ id: slip.id, input }), "slips.toast.saved")}
            />
          ) : null}

          {canReview && open ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" disabled={busy} loading={retry.isPending} onClick={() => void run(() => retry.mutateAsync(slip.id), "slips.toast.retried")}>
                {t("slips.action.retry")}
              </Button>
              {slip.status !== "PENDING_READ" ? (
                <>
                  <Button ref={rejectButtonRef} variant="outlineDanger" size="sm" disabled={busy} onClick={() => setRejectOpen(true)}>
                    {t("slips.action.reject")}
                  </Button>
                  <Button size="sm" className="font-bold" disabled={busy || !confirmable} onClick={() => setConfirmOpen(true)}>
                    {t("slips.action.confirm")}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {confirmable ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("slips.confirm.title")}
          description={[
            final.amount === null
              ? t("slips.confirm.noAmount")
              : t("slips.confirm.description", { amount: formatMoney(final.amount), currency: final.currency ?? order.currency, order: order.orderNumber }),
            slip.flags.length > 0 ? t("slips.confirm.flags", { count: slip.flags.length }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel={t("slips.action.confirm")}
          cancelLabel={t("common.cancel")}
          closeLabel={t("common.close")}
          busy={confirm.isPending}
          confirmDisabled={final.amount === null}
          onConfirm={onConfirm}
        />
      ) : null}
      {canReview ? (
        <RejectSlipDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          // reject.mutateAsync throw ເອງເມື່ອລົ້ມ → dialog ສະແດງ error ແລະ ຍັງເປີດ
          onConfirm={async (reason) => {
            await reject.mutateAsync({ id: slip.id, reason });
            toast.success(t("slips.toast.rejected"));
          }}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </Card>
  );
}

function SlipEditForm({
  values,
  disabled,
  saving,
  onSave,
}: {
  values: SlipValuesDto;
  disabled: boolean;
  saving: boolean;
  onSave: (input: Record<string, string | null>) => Promise<boolean>;
}) {
  const { t } = useT();
  const uid = useId();
  const [amount, setAmount] = useState(values.amount ?? "");
  const [currency, setCurrency] = useState(values.currency ?? "");
  const [refNo, setRefNo] = useState(values.refNo ?? "");
  const [destAccount, setDestAccount] = useState(values.destAccount ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: Record<string, string | null> = {};
    const trimmedAmount = amount.trim();
    if (trimmedAmount !== (values.amount ?? "")) {
      if (trimmedAmount !== "" && normalizeSlipAmount(trimmedAmount) === null) {
        setAmountError(t("slips.edit.amountInvalid"));
        return;
      }
      // ຍອດຫວ່າງສົ່ງບໍ່ໄດ້ (API ບໍ່ຮັບ amount ວ່າງ) → ຖືວ່າບໍ່ປ່ຽນ; ສົ່ງ string ດິບ API normalize ເອງ
      if (trimmedAmount !== "") input.confirmedAmount = trimmedAmount;
    }
    setAmountError(null);
    if (currency !== (values.currency ?? "")) input.confirmedCurrency = currency === "" ? null : currency;
    if (refNo.trim() !== (values.refNo ?? "")) input.confirmedRefNo = refNo.trim() === "" ? null : refNo.trim();
    if (destAccount.trim() !== (values.destAccount ?? "")) input.confirmedDestAccount = destAccount.trim() === "" ? null : destAccount.trim();
    if (Object.keys(input).length === 0) {
      toast.info(t("slips.edit.none"));
      return;
    }
    await onSave(input);
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <Field label={t("slips.field.amount")} htmlFor={`${uid}-amount`} error={amountError ?? undefined}>
        <Input id={`${uid}-amount`} inputMode="decimal" value={amount} invalid={amountError !== null} disabled={disabled} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("slips.field.currency")} htmlFor={`${uid}-currency`}>
        <Select id={`${uid}-currency`} value={currency} disabled={disabled} onChange={(e) => setCurrency(e.target.value)}>
          <option value="">—</option>
          {SLIP_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("slips.field.refNo")} htmlFor={`${uid}-refNo`}>
        <Input id={`${uid}-refNo`} value={refNo} disabled={disabled} onChange={(e) => setRefNo(e.target.value)} />
      </Field>
      <Field label={t("slips.field.destAccount")} htmlFor={`${uid}-destAccount`}>
        <Input id={`${uid}-destAccount`} value={destAccount} disabled={disabled} onChange={(e) => setDestAccount(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="outlinePrimary" size="sm" disabled={disabled} loading={saving}>
          {t("slips.edit.save")}
        </Button>
      </div>
    </form>
  );
}

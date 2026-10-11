"use client";

import { SLIP_CURRENCIES, normalizeSlipAmount } from "@oca/shared";
import { Button, Card, ConfirmDialog, Field, Input, Select, StatusPill, toast } from "@oca/ui";
import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
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

/** error ທີ່ແປວ່າ state ຂອງບິນ/ສະລິບປ່ຽນໄປແລ້ວ: refetch ຈະສະແດງຄວາມຈິງ ຈຶ່ງປິດ dialog ຢືນຢັນ; ຢ່າງອື່ນ (ເຄືອຂ່າຍ/5xx) ໃຫ້ລອງໃໝ່ໃນ dialog ເດີມ */
const STATE_CONFLICT_CODES: ReadonlySet<string> = new Set(["ORDER_INVALID_STATE", "RESERVATION_EXPIRED", "SLIP_ALREADY_REVIEWED", "CONFLICT"]);
function isStateConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== undefined && STATE_CONFLICT_CODES.has(error.code);
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
    <table className="w-full min-w-0 text-xs">
      <caption className="mb-1 text-left text-xs font-semibold text-ink-secondary">{title}</caption>
      <tbody>
        {FIELDS.map((field) => (
          <tr key={field} className="border-t border-line first:border-t-0">
            <th scope="row" className="py-1 pr-2 text-left font-normal text-ink-muted">
              {t(`slips.field.${field}`)}
            </th>
            {/* ຄ່າຈາກ OCR ບໍ່ໄວ້ໃຈ: ຍາວ/ບໍ່ມີຍະຫວ່າງຕ້ອງຫໍ່ແຖວ, bdi ກັນທິດຕົວອັກສອນປົນ */}
            <td className="min-w-0 py-1 text-right tabular-nums text-ink [overflow-wrap:anywhere] break-all">
              <bdi>{display(field)}</bdi>
            </td>
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
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const confirming = useRef(false);
  const focusCardAfterConfirm = useRef(false);
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

  // ຫຼັງຢືນຢັນສຳເລັດ ປຸ່ມ Confirm ຫາຍ (ສະຖານະປ່ຽນ) → ຍ້າຍ focus ມາທີ່ card ບໍ່ໃຫ້ຕົກໄປ body
  useEffect(() => {
    if (!focusCardAfterConfirm.current || confirmOpen || confirmable) return;
    focusCardAfterConfirm.current = false;
    const timer = setTimeout(() => rootRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [confirmOpen, confirmable]);

  async function onConfirm() {
    // ກັນກົດຊ້ຳ (ref ທັນທີ ກ່ອນ isPending ອັບເດດ)
    if (confirming.current || final.amount === null) return;
    confirming.current = true;
    try {
      // ສົ່ງຄ່າທີ່ dialog ສະແດງ (ສະກຸນ = ຂອງສະລິບ, null ຖ້າບໍ່ມີ; ຄ່າສຳຮອງຂອງບິນເປັນພຽງຂໍ້ຄວາມສະແດງ)
      await confirm.mutateAsync({
        id: slip.id,
        // ປຸ່ມຢືນຢັນມີແຕ່ເມື່ອຜູກບິນ (canConfirmSlip) ຈຶ່ງ orderId ບໍ່ເປັນ null ຢູ່ບ່ອນນີ້
        expected: { amount: final.amount, currency: final.currency, orderId: slip.orderId ?? undefined },
      });
      toast.success(t("slips.toast.confirmed"));
      focusCardAfterConfirm.current = true;
      setConfirmOpen(false);
    } catch (error) {
      // CONFLICT ຂອງ flow ນີ້ = ສະລິບຖືກແກ້ຫຼັງເປີດ dialog: ໃຊ້ຂໍ້ຄວາມແປ ບໍ່ໃຊ້ message ອັງກິດຂອງ API
      toast.error(error instanceof ApiError && error.code === "CONFLICT" ? t("slips.confirm.changed") : errorMessage(error, t));
      // state conflict → ປິດ (card refetch ສະແດງຄວາມຈິງ); error ຊົ່ວຄາວ → ເປີດຄ້າງໃຫ້ລອງໃໝ່
      if (isStateConflict(error)) setConfirmOpen(false);
    } finally {
      confirming.current = false;
    }
  }

  return (
    <Card ref={rootRef} tabIndex={-1} className="rounded-[20px] p-4 outline-none" data-testid={`slip-${slip.id}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SlipImage slipId={slip.id} />
        <div className="min-w-0 space-y-3">
          {/* live region ມີຕັ້ງແຕ່ mount: PENDING_READ → READ ຖືກອ່ານໃຫ້ screen reader ແບບສຸພາບ */}
          <div role="status" className="space-y-2">
            <div>
              <StatusPill tone={SLIP_STATUS_TONE[slip.status]}>{t(`slips.status.${slip.status}`)}</StatusPill>
            </div>
            {slip.status === "PENDING_READ" ? <p className="text-sm text-ink-secondary">{t("slips.pendingNote")}</p> : null}
            {slip.status === "READ_FAILED" ? <p className="text-sm text-warning-ink">{t("slips.failedNote")}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">{t(`slips.source.${slip.source}`)}</span>
            <time dateTime={slip.createdAt} className="text-xs text-ink-muted">
              {formatDateTime(slip.createdAt)}
            </time>
          </div>

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
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
              confirmed={slip.confirmed}
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
                  <Button ref={confirmButtonRef} size="sm" className="font-bold" disabled={busy || !confirmable} onClick={() => setConfirmOpen(true)}>
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
          tone="primary"
          confirmDisabled={final.amount === null}
          onConfirm={onConfirm}
          onCloseAutoFocus={(event) => {
            // Radix ຄືນ focus ໃຫ້ແຕ່ Trigger: ຢືນຢັນສຳເລັດ → effect ຂ້າງເທິງຍ້າຍໄປ card; ອື່ນໆ → ຄືນປຸ່ມ Confirm
            event.preventDefault();
            if (focusCardAfterConfirm.current) return;
            const opener = confirmButtonRef.current;
            if (opener?.isConnected && !opener.disabled) opener.focus();
            else rootRef.current?.focus();
          }}
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
  confirmed,
  disabled,
  saving,
  onSave,
}: {
  values: SlipValuesDto;
  /** ຄ່າທີ່ແອດມິນຢືນຢັນໄວ້ແລ້ວ: ມີແຕ່ຄ່ານີ້ທີ່ "ລ້າງ" (null) ໄດ້ */
  confirmed: SlipValuesDto;
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
    // ຍອດຫວ່າງ/ຜິດຮູບແບບ = error ໃນຊ່ອງ (API ບໍ່ຮັບ amount ວ່າງ ແລະ ລ້າງບໍ່ໄດ້); ສົ່ງ string ດິບ API normalize ເອງ
    if (trimmedAmount !== (values.amount ?? "")) {
      if (normalizeSlipAmount(trimmedAmount) === null) {
        setAmountError(t("slips.edit.amountInvalid"));
        return;
      }
      input.confirmedAmount = trimmedAmount;
    }
    setAmountError(null);
    // ຄ່າຫວ່າງ: ສົ່ງ null ສະເພາະເມື່ອມີຄ່າຢືນຢັນໃຫ້ລ້າງ; ຄ່າທີ່ເຄື່ອງອ່ານໃສ່ເອງລ້າງບໍ່ໄດ້ = ບໍ່ມີການປ່ຽນ
    const textChange = (next: string, current: string | null, confirmedValue: string | null): string | null | undefined => {
      if (next === (current ?? "")) return undefined;
      if (next === "") return confirmedValue ? null : undefined;
      return next;
    };
    const currencyChange = textChange(currency, values.currency, confirmed.currency);
    if (currencyChange !== undefined) input.confirmedCurrency = currencyChange;
    const refNoChange = textChange(refNo.trim(), values.refNo, confirmed.refNo);
    if (refNoChange !== undefined) input.confirmedRefNo = refNoChange;
    const destChange = textChange(destAccount.trim(), values.destAccount, confirmed.destAccount);
    if (destChange !== undefined) input.confirmedDestAccount = destChange;
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
          {/* ສະກຸນນອກລາຍການ (ເຄື່ອງອ່ານອາດໃຫ້ມາ) ເພີ່ມເປັນຕົວເລືອກ ເພື່ອໃຫ້ select ສະທ້ອນຄ່າຈິງ */}
          {[...(values.currency && !(SLIP_CURRENCIES as readonly string[]).includes(values.currency) ? [values.currency] : []), ...SLIP_CURRENCIES].map((code) => (
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

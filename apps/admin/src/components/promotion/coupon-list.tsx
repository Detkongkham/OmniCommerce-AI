"use client";

import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { type CouponType, createCouponSchema } from "@oca/shared";
import { AlertCircle, Pencil, Plus, TicketPercent } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime-local";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useCoupons, useSaveCoupon } from "@/lib/queries";
import type { CouponDto } from "@/lib/types";
import { COUPON_STATUS_TONE, couponStatus } from "./coupon-status";

/** ໂຄດສ່ວນຫຼຸດ: ຕາຕະລາງ + ຟອມສ້າງ/ແກ້ (ປິດໂຄດດ້ວຍການຕິກ "ເປີດໃຊ້" ອອກ; ບໍ່ມີການລຶບ) */
export function CouponList() {
  const { t } = useT();
  const canWrite = useCan("promotion:write");
  const query = useCoupons();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponDto | null>(null);
  const rows = query.data ?? [];

  function open(coupon: CouponDto | null) {
    setEditing(coupon);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("promotions.title")]}
        title={t("promotions.title")}
        description={t("promotions.description")}
        actions={
          canWrite ? (
            <Button className="rounded-xl" onClick={() => open(null)}>
              <Plus aria-hidden="true" />
              {t("coupons.add")}
            </Button>
          ) : null
        }
      />
      <div className="px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table aria-label={t("coupons.table")} aria-busy={query.isPending}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{t("coupons.col.code")}</TableHead>
                    <TableHead scope="col">{t("coupons.col.discount")}</TableHead>
                    <TableHead scope="col">{t("coupons.col.conditions")}</TableHead>
                    <TableHead scope="col">{t("coupons.col.period")}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("coupons.col.used")}
                    </TableHead>
                    <TableHead scope="col">{t("coupons.col.status")}</TableHead>
                    {canWrite ? (
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{t("common.actions")}</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={canWrite ? 7 : 6} /> : null}
                  {rows.map((coupon) => {
                    const status = couponStatus(coupon);
                    const conditions = [
                      Number(coupon.minSubtotal) > 0 ? t("coupons.minSubtotal", { amount: formatMoney(coupon.minSubtotal) }) : null,
                      coupon.perPhoneLimit !== null ? t("coupons.perPhone", { count: coupon.perPhoneLimit }) : null,
                    ].filter(Boolean);
                    const period = [
                      coupon.startsAt ? t("coupons.period.from", { date: formatDateTime(coupon.startsAt) }) : null,
                      coupon.endsAt ? t("coupons.period.until", { date: formatDateTime(coupon.endsAt) }) : null,
                    ].filter(Boolean);
                    return (
                      <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                        <th scope="row" className="px-4 py-3 text-left font-mono font-semibold text-ink">
                          {coupon.code}
                          {coupon.note ? <p className="font-sans text-xs font-normal text-ink-muted">{coupon.note}</p> : null}
                        </th>
                        <TableCell className="text-ink">
                          {coupon.type === "FIXED"
                            ? t("coupons.discount.fixed", { value: formatMoney(coupon.value) })
                            : coupon.maxDiscount
                              ? t("coupons.discount.percentMax", { value: Number(coupon.value), max: formatMoney(coupon.maxDiscount) })
                              : t("coupons.discount.percent", { value: Number(coupon.value) })}
                        </TableCell>
                        <TableCell className="text-ink-secondary">
                          {conditions.length > 0 ? conditions.join(" · ") : <span className="text-ink-muted">{t("coupons.noConditions")}</span>}
                        </TableCell>
                        <TableCell className="text-xs text-ink-secondary">
                          {period.length > 0 ? period.map((line) => <p key={line}>{line}</p>) : <span className="text-ink-muted">{t("coupons.period.always")}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {coupon.usageLimit !== null ? t("coupons.used.limited", { used: coupon.usedCount, limit: coupon.usageLimit }) : coupon.usedCount}
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={COUPON_STATUS_TONE[status]}>{t(`coupons.status.${status}` as TranslationKey)}</StatusPill>
                        </TableCell>
                        {canWrite ? (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" aria-label={t("coupons.edit", { code: coupon.code })} onClick={() => open(coupon)}>
                              <Pencil aria-hidden="true" />
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <div role="status">
                  <EmptyState icon={TicketPercent} title={t("coupons.empty")} />
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
      {canWrite ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-xl" closeLabel={t("common.close")}>
            <CouponForm key={editing?.id ?? "new"} coupon={editing} onDone={() => setFormOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

interface FormState {
  code: string;
  type: CouponType;
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perPhoneLimit: string;
  note: string;
  isActive: boolean;
}
type FieldName = Exclude<keyof FormState, "isActive" | "note" | "type">;

const plain = (money: string | null) => (money === null ? "" : String(Number(money)));

function initialState(coupon: CouponDto | null): FormState {
  return {
    code: coupon?.code ?? "",
    type: coupon?.type ?? "PERCENT",
    value: coupon ? plain(coupon.value) : "",
    maxDiscount: plain(coupon?.maxDiscount ?? null),
    minSubtotal: coupon && Number(coupon.minSubtotal) > 0 ? plain(coupon.minSubtotal) : "",
    startsAt: toDatetimeLocal(coupon?.startsAt),
    endsAt: toDatetimeLocal(coupon?.endsAt),
    usageLimit: coupon?.usageLimit?.toString() ?? "",
    perPhoneLimit: coupon?.perPhoneLimit?.toString() ?? "",
    note: coupon?.note ?? "",
    isActive: coupon?.isActive ?? true,
  };
}

const limitOf = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return /^\d{1,7}$/.test(trimmed) ? Number(trimmed) : undefined;
};

function CouponForm({ coupon, onDone }: { coupon: CouponDto | null; onDone: () => void }) {
  const { t } = useT();
  const save = useSaveCoupon();
  const [state, setState] = useState<FormState>(() => initialState(coupon));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // ໂຄດທີ່ມີບິນໃຊ້ຢູ່: API ບໍ່ໃຫ້ປ່ຽນ ລະຫັດ/ຊະນິດ/ຄ່າ
  const locked = (coupon?.usedCount ?? 0) > 0;

  const set = <K extends keyof FormState>(name: K, value: FormState[K]) => {
    setState((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    const usageLimit = limitOf(state.usageLimit);
    const perPhoneLimit = limitOf(state.perPhoneLimit);
    const input = {
      code: state.code,
      type: state.type,
      value: state.value.trim(),
      maxDiscount: state.type === "PERCENT" && state.maxDiscount.trim() ? state.maxDiscount.trim() : null,
      minSubtotal: state.minSubtotal.trim() || "0",
      startsAt: fromDatetimeLocal(state.startsAt),
      endsAt: fromDatetimeLocal(state.endsAt),
      usageLimit: usageLimit ?? null,
      perPhoneLimit: perPhoneLimit ?? null,
      isActive: state.isActive,
      note: state.note.trim() || null,
    };
    const parsed = createCouponSchema.safeParse(input);
    const found: Partial<Record<FieldName, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "code") found.code = t("coupons.form.codeInvalid");
        else if (field === "value") found.value = t(state.type === "PERCENT" ? "coupons.form.valuePercentInvalid" : "coupons.form.valueFixedInvalid");
        else if (field === "maxDiscount" || field === "minSubtotal") found[field] = t("coupons.form.moneyInvalid");
        else if (field === "endsAt") found.endsAt = t("coupons.form.endsBeforeStart");
      }
    }
    if (usageLimit === undefined || usageLimit === 0) found.usageLimit = t("coupons.form.limitInvalid");
    if (perPhoneLimit === undefined || perPhoneLimit === 0) found.perPhoneLimit = t("coupons.form.limitInvalid");
    setErrors(found);
    if (!parsed.success || Object.keys(found).length > 0) return;

    // ສົ່ງ ISO string (ບໍ່ແມ່ນ Date ທີ່ schema ແປງແລ້ວ) ແລະ ລະຫັດທີ່ normalize ແລ້ວ
    const body = { ...input, code: parsed.data.code };
    try {
      if (coupon) {
        await save.mutateAsync({ id: coupon.id, input: body });
        toast.success(t("coupons.toast.updated"));
      } else {
        await save.mutateAsync({ input: body });
        toast.success(t("coupons.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={coupon ? t("coupons.form.editTitle") : t("coupons.form.createTitle")} description={t("coupons.form.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        {locked ? <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-xs text-ink-secondary">{t("coupons.form.lockedHint")}</p> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("coupons.form.code")} htmlFor="coupon-code" required error={errors.code}>
            <Input id="coupon-code" className="font-mono uppercase" maxLength={30} disabled={locked} value={state.code} invalid={!!errors.code} onChange={(event) => set("code", event.target.value)} />
          </Field>
          <Field label={t("coupons.form.type")} htmlFor="coupon-type" required>
            <Select id="coupon-type" disabled={locked} value={state.type} onChange={(event) => set("type", event.target.value as CouponType)}>
              <option value="PERCENT">{t("coupons.form.type.PERCENT")}</option>
              <option value="FIXED">{t("coupons.form.type.FIXED")}</option>
            </Select>
          </Field>
          <Field label={`${t("coupons.form.value")} (${state.type === "PERCENT" ? "%" : "LAK"})`} htmlFor="coupon-value" required error={errors.value}>
            <Input id="coupon-value" inputMode="decimal" disabled={locked} value={state.value} invalid={!!errors.value} onChange={(event) => set("value", event.target.value)} />
          </Field>
          {state.type === "PERCENT" ? (
            <Field label={t("coupons.form.maxDiscount")} htmlFor="coupon-max" error={errors.maxDiscount}>
              <Input id="coupon-max" inputMode="decimal" value={state.maxDiscount} invalid={!!errors.maxDiscount} onChange={(event) => set("maxDiscount", event.target.value)} />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label={t("coupons.form.minSubtotal")} htmlFor="coupon-min" error={errors.minSubtotal}>
            <Input id="coupon-min" inputMode="decimal" value={state.minSubtotal} invalid={!!errors.minSubtotal} onChange={(event) => set("minSubtotal", event.target.value)} />
          </Field>
          <div className="hidden sm:block" />
          <Field label={t("coupons.form.startsAt")} htmlFor="coupon-starts">
            <Input id="coupon-starts" type="datetime-local" value={state.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </Field>
          <Field label={t("coupons.form.endsAt")} htmlFor="coupon-ends" error={errors.endsAt}>
            <Input id="coupon-ends" type="datetime-local" value={state.endsAt} invalid={!!errors.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </Field>
          <Field label={t("coupons.form.usageLimit")} htmlFor="coupon-usage" error={errors.usageLimit}>
            <Input id="coupon-usage" inputMode="numeric" value={state.usageLimit} invalid={!!errors.usageLimit} onChange={(event) => set("usageLimit", event.target.value)} />
          </Field>
          <Field label={t("coupons.form.perPhoneLimit")} htmlFor="coupon-phone" error={errors.perPhoneLimit}>
            <Input id="coupon-phone" inputMode="numeric" value={state.perPhoneLimit} invalid={!!errors.perPhoneLimit} onChange={(event) => set("perPhoneLimit", event.target.value)} />
          </Field>
          <p className="text-xs text-ink-muted sm:col-span-2">{t("coupons.form.optionalHint")}</p>
          <Field label={t("coupons.form.note")} htmlFor="coupon-note" className="sm:col-span-2">
            <Input id="coupon-note" maxLength={200} value={state.note} onChange={(event) => setState((current) => ({ ...current, note: event.target.value }))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line accent-[var(--color-brand)]"
            checked={state.isActive}
            onChange={(event) => setState((current) => ({ ...current, isActive: event.target.checked }))}
          />
          {t("coupons.form.active")}
        </label>
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

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MAX_RESERVATION_MINUTES, vatRateSchema } from "@oca/shared";
import { Button, Card, EmptyState, Field, Input, PageHeader, Skeleton, toast } from "@oca/ui";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import type { Translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useStoreSettings, useUpdateStoreSettings } from "@/lib/queries";
import type { StoreSettingsDto } from "@/lib/types";

const PAYMENT_MAX = 500;

const formSchema = z.object({
  name: z.string().trim().min(1).max(100),
  vatRate: vatRateSchema,
  pricesIncludeVat: z.boolean(),
  reservationMinutes: z.coerce.number().int().min(1).max(MAX_RESERVATION_MINUTES),
  paymentInstructions: z.string().max(PAYMENT_MAX),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** ຂໍ້ຄວາມ error ຂອງຊື່ຮ້ານຕາມຊະນິດ issue ຂອງ zod (ວ່າງ = required, ຍາວເກີນ = too long) */
function nameError(error: { type?: string | undefined } | undefined, t: Translate): string | undefined {
  if (!error) return undefined;
  if (error.type === "too_big") return t("validation.tooLong", { max: 100 });
  return t("validation.required");
}

export function StoreSettingsForm() {
  const { t } = useT();
  const query = useStoreSettings();

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("settings.title")]}
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <div className="px-3 pb-10 sm:px-6">
        <Card className="max-w-2xl rounded-[20px] p-6">
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
          ) : query.data ? (
            <SettingsFields settings={query.data} />
          ) : (
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SettingsFields({ settings }: { settings: StoreSettingsDto }) {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const update = useUpdateStoreSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: settings.name,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
      reservationMinutes: settings.reservationMinutes,
      paymentInstructions: settings.paymentInstructions ?? "",
    },
  });

  // ຫຼັງບັນທຶກ/refetch ຄ່າຈາກ server ປ່ຽນ → ຮີເຊັດຟອມໃຫ້ກົງ
  useEffect(() => {
    reset({
      name: settings.name,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
      reservationMinutes: settings.reservationMinutes,
      paymentInstructions: settings.paymentInstructions ?? "",
    });
  }, [settings, reset]);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // ວ່າງ (ຫຼື ມີແຕ່ຊ່ອງວ່າງ) = ລ້າງຂໍ້ມູນໂອນ
      const paymentInstructions = values.paymentInstructions.trim();
      await update.mutateAsync({ ...values, paymentInstructions: paymentInstructions === "" ? null : paymentInstructions });
      toast.success(t("settings.toast.saved"));
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  // getValues ຖືກອ່ານຕອນ render ສະເພາະເມື່ອ errors.vatRate ມີຄ່າ (ຫຼັງ submit ລົ້ມ) ຈຶ່ງບໍ່ເສຍ perf
  const vatError = errors.vatRate
    ? String(getValues("vatRate") ?? "").trim() === ""
      ? t("validation.required")
      : t("settings.validation.vat")
    : undefined;

  const paymentLength = (watch("paymentInstructions") ?? "").length;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}
      <Field label={t("settings.name")} htmlFor="settings-name" required error={nameError(errors.name, t)}>
        <Input id="settings-name" disabled={!canWrite} invalid={!!errors.name} {...register("name")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("settings.currency")} htmlFor="settings-currency">
          <Input
            id="settings-currency"
            value={settings.baseCurrency}
            disabled
            readOnly
            aria-describedby="settings-currency-hint"
          />
          <p id="settings-currency-hint" className="mt-1 text-xs text-ink-muted">
            {t("settings.currencyHint")}
          </p>
        </Field>
        <Field label={t("settings.vatRate")} htmlFor="settings-vat" required error={vatError}>
          <Input
            id="settings-vat"
            inputMode="decimal"
            disabled={!canWrite}
            invalid={!!errors.vatRate}
            aria-describedby="settings-vat-hint"
            {...register("vatRate")}
          />
          <p id="settings-vat-hint" className="mt-1 text-xs text-ink-muted">
            {t("settings.vatHint")}
          </p>
        </Field>
        <Field
          label={t("settings.reservationMinutes")}
          htmlFor="settings-minutes"
          required
          error={errors.reservationMinutes ? t("settings.validation.minutes") : undefined}
        >
          <Input
            id="settings-minutes"
            type="number"
            min={1}
            max={MAX_RESERVATION_MINUTES}
            disabled={!canWrite}
            invalid={!!errors.reservationMinutes}
            aria-describedby="settings-minutes-hint"
            {...register("reservationMinutes")}
          />
          <p id="settings-minutes-hint" className="mt-1 text-xs text-ink-muted">
            {t("settings.reservationHint")}
          </p>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="size-4 rounded border-line accent-[var(--color-brand)]"
          disabled={!canWrite}
          {...register("pricesIncludeVat")}
        />
        {t("settings.pricesIncludeVat")}
      </label>
      <Field
        label={t("settings.paymentInstructions")}
        htmlFor="settings-payment"
        error={errors.paymentInstructions ? t("validation.tooLong", { max: PAYMENT_MAX }) : undefined}
      >
        <textarea
          id="settings-payment"
          rows={4}
          disabled={!canWrite}
          aria-invalid={errors.paymentInstructions ? true : undefined}
          aria-describedby="settings-payment-hint"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50 aria-[invalid=true]:border-danger"
          {...register("paymentInstructions")}
        />
        <div className="mt-1 flex justify-between gap-3 text-xs text-ink-muted">
          <p id="settings-payment-hint">{t("settings.paymentInstructionsHint")}</p>
          <span className="shrink-0 tabular-nums" aria-hidden="true">
            {paymentLength}/{PAYMENT_MAX}
          </span>
        </div>
      </Field>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

"use client";

import { DEFAULT_TIER_RULES, type TierRule, pointsDiscount, pointsForAmount, updateStoreSettingsSchema } from "@oca/shared";
import { Button, Card, Field, Input, toast } from "@oca/ui";
import { type FormEvent, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useUpdateStoreSettings } from "@/lib/queries";
import type { StoreSettingsDto } from "@/lib/types";

const EXAMPLE_ORDER = "100000";
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

interface State {
  enabled: boolean;
  earnPer: string;
  pointValue: string;
  maxPercent: string;
  tiers: TierRule[];
}
type ErrorField = "earnPer" | "pointValue" | "maxPercent" | "tiers";

/** "10000.00" → "10000" (ຊ່ອງພິມບໍ່ຕ້ອງມີ .00) */
const plain = (money: string) => String(Number(money));

function initialState(settings: StoreSettingsDto): State {
  return {
    enabled: settings.loyaltyEnabled ?? false,
    earnPer: plain(settings.pointsEarnPer ?? "10000"),
    pointValue: plain(settings.pointValue ?? "100"),
    maxPercent: String(settings.pointsMaxRedeemPercent ?? 50),
    tiers: (settings.tierRules ?? DEFAULT_TIER_RULES).map((rule) => ({ ...rule })),
  };
}

/**
 * ການຕັ້ງຄ່າແຕ້ມ ແລະ ລະດັບສະມາຊິກ: ບັນທຶກແຍກຈາກຟອມຕັ້ງຄ່າຮ້ານ (PATCH ສະເພາະ field ຂອງແຕ້ມ).
 * ຜູ້ເອີ້ນໃສ່ `key` ຈາກຄ່າຂອງ server ເພື່ອໃຫ້ຟອມເລີ່ມໃໝ່ຫຼັງບັນທຶກ/refetch.
 */
export function LoyaltySettingsCard({ settings }: { settings: StoreSettingsDto }) {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const update = useUpdateStoreSettings();
  const [state, setState] = useState<State>(() => initialState(settings));
  const [errors, setErrors] = useState<Partial<Record<ErrorField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof State>(name: K, value: State[K], field?: ErrorField) => {
    setState((current) => ({ ...current, [name]: value }));
    if (field) setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const setTier = (index: number, change: Partial<TierRule>) =>
    set(
      "tiers",
      state.tiers.map((rule, i) => (i === index ? { ...rule, ...change } : rule)),
      "tiers",
    );

  const earnPer = state.earnPer.trim();
  const pointValue = state.pointValue.trim();
  const examplePoints = AMOUNT.test(earnPer) && AMOUNT.test(pointValue) ? pointsForAmount(EXAMPLE_ORDER, earnPer, "1") : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (update.isPending) return;
    setFormError(null);
    const percent = state.maxPercent.trim();
    const parsed = updateStoreSettingsSchema.safeParse({
      loyaltyEnabled: state.enabled,
      pointsEarnPer: earnPer,
      pointValue,
      pointsMaxRedeemPercent: /^\d{1,3}$/.test(percent) ? Number(percent) : 0,
      tierRules: state.tiers.map((rule) => ({ tier: rule.tier, minSpend: rule.minSpend.trim(), multiplier: rule.multiplier.trim() })),
    });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setErrors({
        earnPer: fields.has("pointsEarnPer") ? t("loyalty.invalid.amount") : undefined,
        pointValue: fields.has("pointValue") ? t("loyalty.invalid.amount") : undefined,
        maxPercent: fields.has("pointsMaxRedeemPercent") ? t("loyalty.invalid.percent") : undefined,
        tiers: fields.has("tierRules") ? t("loyalty.invalid.tiers") : undefined,
      });
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      toast.success(t("loyalty.saved"));
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  }

  return (
    <Card className="mt-6 max-w-2xl rounded-[20px] p-6">
      <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="loyalty-title">
        <div>
          <h2 id="loyalty-title" className="text-base font-bold text-ink">
            {t("loyalty.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">{t("loyalty.description")}</p>
        </div>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        {/* role=switch: ບໍ່ປົນກັບ checkbox ຂອງຟອມຕັ້ງຄ່າຮ້ານ ແລະ ອ່ານເປັນ ເປີດ/ປິດ */}
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            role="switch"
            className="size-4 rounded border-line accent-[var(--color-brand)]"
            disabled={!canWrite}
            checked={state.enabled}
            onChange={(event) => set("enabled", event.target.checked)}
          />
          {t("loyalty.enabled")}
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("loyalty.earnPer")} htmlFor="loyalty-earn-per" error={errors.earnPer}>
            <Input id="loyalty-earn-per" inputMode="decimal" disabled={!canWrite} value={state.earnPer} invalid={!!errors.earnPer} onChange={(event) => set("earnPer", event.target.value, "earnPer")} />
          </Field>
          <Field label={t("loyalty.pointValue")} htmlFor="loyalty-point-value" error={errors.pointValue}>
            <Input id="loyalty-point-value" inputMode="decimal" disabled={!canWrite} value={state.pointValue} invalid={!!errors.pointValue} onChange={(event) => set("pointValue", event.target.value, "pointValue")} />
          </Field>
          <Field label={t("loyalty.maxPercent")} htmlFor="loyalty-max-percent" error={errors.maxPercent}>
            <Input id="loyalty-max-percent" inputMode="numeric" disabled={!canWrite} value={state.maxPercent} invalid={!!errors.maxPercent} onChange={(event) => set("maxPercent", event.target.value, "maxPercent")} />
          </Field>
        </div>
        {examplePoints !== null ? (
          <p className="text-xs text-ink-muted">
            {t("loyalty.example", {
              amount: formatMoney(EXAMPLE_ORDER),
              points: formatQuantity(examplePoints),
              value: formatMoney(pointsDiscount(examplePoints, pointValue)),
            })}
          </p>
        ) : null}

        <div>
          <h3 className="text-sm font-semibold text-ink">{t("loyalty.tiers")}</h3>
          <p id="loyalty-tiers-hint" className="mt-1 text-xs text-ink-muted">
            {t("loyalty.tiersHint")}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm" aria-describedby="loyalty-tiers-hint">
              <thead>
                <tr className="text-left text-xs font-semibold text-ink-secondary">
                  <th scope="col" className="py-2 pr-3">
                    {t("loyalty.col.tier")}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t("loyalty.col.minSpend")}
                  </th>
                  <th scope="col" className="py-2">
                    {t("loyalty.col.multiplier")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.tiers.map((rule, index) => {
                  const name = t(`customers.tier.${rule.tier}`);
                  return (
                    <tr key={rule.tier}>
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                        {name}
                      </th>
                      <td className="py-1.5 pr-3">
                        <Input
                          aria-label={t("loyalty.minSpendOf", { tier: name })}
                          inputMode="decimal"
                          className="tabular-nums"
                          // ລະດັບທຳອິດເລີ່ມທີ່ 0 ສະເໝີ
                          disabled={!canWrite || index === 0}
                          value={rule.minSpend}
                          invalid={!!errors.tiers}
                          onChange={(event) => setTier(index, { minSpend: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5">
                        <Input
                          aria-label={t("loyalty.multiplierOf", { tier: name })}
                          inputMode="decimal"
                          className="tabular-nums"
                          disabled={!canWrite}
                          value={rule.multiplier}
                          invalid={!!errors.tiers}
                          onChange={(event) => setTier(index, { multiplier: event.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.tiers ? (
            <p role="alert" className="mt-2 text-sm font-medium text-danger-ink">
              {errors.tiers}
            </p>
          ) : null}
        </div>
        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={update.isPending}>
              {update.isPending ? t("common.saving") : t("loyalty.save")}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

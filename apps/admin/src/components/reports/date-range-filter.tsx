"use client";

import { REPORT_MAX_DAYS } from "@oca/shared";
import { Input, cn } from "@oca/ui";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { type DateRange, RANGE_PRESETS, type RangePreset, isValidRange, matchPreset, presetRange } from "@/lib/reports";

const PRESET_KEYS = {
  last7: "report.range.last7",
  last30: "report.range.last30",
  thisMonth: "report.range.thisMonth",
  lastMonth: "report.range.lastMonth",
} as const satisfies Record<RangePreset, string>;

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/** ປຸ່ມຊ່ວງວັນທີສຳເລັດຮູບ + ກຳນົດເອງ. ຄ່າໃນ input ຖືກສົ່ງອອກເມື່ອຊ່ວງຖືກຕ້ອງເທົ່ານັ້ນ (API ປະຕິເສດຊ່ວງຜິດ) */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { t } = useT();
  const id = useId();
  const [draft, setDraft] = useState<DateRange>(value);
  const [synced, setSynced] = useState<DateRange>(value);
  // ຄ່າຈາກພາຍນອກປ່ຽນ (ເຊັ່ນ ກົດ preset) → ຕັ້ງ draft ຕາມ
  if (synced.from !== value.from || synced.to !== value.to) {
    setSynced(value);
    setDraft(value);
  }
  const active = matchPreset(value);
  const invalid = !isValidRange(draft);

  function update(next: DateRange) {
    setDraft(next);
    if (isValidRange(next)) onChange(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label={t("report.range.label")}>
      <div className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={active === preset}
            onClick={() => onChange(presetRange(preset))}
            className={cn(
              "h-9 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === preset
                ? "border-brand bg-brand-soft font-semibold text-brand-ink"
                : "border-line bg-surface text-ink-secondary hover:bg-hover",
            )}
          >
            {t(PRESET_KEYS[preset])}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary" htmlFor={`${id}-from`}>
          {t("report.range.from")}
          <Input
            id={`${id}-from`}
            type="date"
            className="w-[150px]"
            value={draft.from}
            invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => update({ ...draft, from: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary" htmlFor={`${id}-to`}>
          {t("report.range.to")}
          <Input
            id={`${id}-to`}
            type="date"
            className="w-[150px]"
            value={draft.to}
            invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => update({ ...draft, to: event.target.value })}
          />
        </label>
      </div>
      {invalid ? (
        <p id={`${id}-error`} role="alert" className="w-full text-xs text-danger">
          {t("report.range.invalid", { max: REPORT_MAX_DAYS })}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { Minus, Plus } from "lucide-react";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** ຊື່ສິນຄ້າ ສຳລັບ aria-label ຂອງປຸ່ມ */
  label: string;
  disabled?: boolean;
}

const BUTTON =
  "flex size-10 items-center justify-center text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent";

export function QuantityStepper({ value, min = 1, max, onChange, label, disabled = false }: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-surface">
      <button type="button" className={BUTTON} aria-label={`ຫຼຸດຈຳນວນ ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <output aria-label={`ຈຳນວນ ${label}`} className="min-w-9 text-center text-sm font-semibold tabular-nums text-ink">
        {value}
      </output>
      <button type="button" className={BUTTON} aria-label={`ເພີ່ມຈຳນວນ ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

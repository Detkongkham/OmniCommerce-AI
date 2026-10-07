import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

const TONES = {
  success: "border-success-line bg-success-soft text-success-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  danger: "border-danger-line bg-danger-soft text-danger-ink",
  info: "border-info-line bg-info-soft text-info-ink",
  brand: "border-brand-soft-line bg-brand-soft text-brand-ink",
  neutral: "border-line bg-subtle text-ink-secondary",
} as const;

export type StatusTone = keyof typeof TONES;

export interface StatusPillProps {
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

/** ສູດ 3 ສີ (DESIGN.md §3.5/§9.2): ພື້ນ tint + ຂອບ + ຕົວໜັງສື; ມີ label ສະເໝີ ບໍ່ອີງສີຢ່າງດຽວ. */
export function StatusPill({ tone = "neutral", icon: Icon, className, children }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

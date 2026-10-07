"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "../lib/utils";
import { type ToastItem, dismissToast, getToasts, subscribe } from "./toast-store";

const VARIANT_STYLES = {
  info: { card: "border-info-line", iconBox: "bg-info-soft text-info", bar: "bg-info", Icon: Info },
  success: { card: "border-success-line", iconBox: "bg-success-soft text-success", bar: "bg-success", Icon: CheckCircle2 },
  warning: { card: "border-warning-line", iconBox: "bg-warning-soft text-warning", bar: "bg-warning", Icon: AlertTriangle },
  error: { card: "border-danger-line", iconBox: "bg-danger-soft text-danger", bar: "bg-danger", Icon: AlertCircle },
} as const;

function ToastCard({ item, dismissLabel }: { item: ToastItem; dismissLabel: string }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);
  const styles = VARIANT_STYLES[item.variant];
  const Icon = styles.Icon;

  // ນັບຖອຍຫຼັງ; hover/focus ຢຸດນັບ ແລະ ຈື່ເວລາທີ່ເຫຼືອ (ກົງກັບ progress bar ທີ່ຖືກ pause).
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, item.id]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface p-4 pr-10 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2",
        styles.card,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", styles.iconBox)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          {item.description ? <p className="text-sm text-ink-secondary">{item.description}</p> : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => dismissToast(item.id)}
        className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-ink-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-hairline" aria-hidden="true">
        <div
          className={cn("h-full origin-left", styles.bar)}
          style={{
            animation: `oca-toast-progress ${item.duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}

export function Toaster({ dismissLabel = "Dismiss" }: { dismissLabel?: string }) {
  const items = useSyncExternalStore(subscribe, getToasts, getToasts);
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-0 right-0 z-[10000] flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-4 sm:right-4 sm:max-w-[400px] sm:p-0"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastCard item={item} dismissLabel={dismissLabel} />
        </div>
      ))}
    </section>
  );
}

"use client";

import { cn } from "@oca/ui";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";

const TEXT = {
  lo: {
    months: ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"],
    weekdays: ["ອາ", "ຈ", "ອຄ", "ພ", "ພຫ", "ສ", "ເສ"],
    placeholder: "ເລືອກວັນທີ",
    today: "ມື້ນີ້",
    clear: "ລ້າງ",
    prev: "ເດືອນກ່ອນ",
    next: "ເດືອນຕໍ່ໄປ",
    month: "ເດືອນ",
    year: "ປີ",
  },
  en: {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    weekdays: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    placeholder: "Select date",
    today: "Today",
    clear: "Clear",
    prev: "Previous month",
    next: "Next month",
    month: "Month",
    year: "Year",
  },
};

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

const NAV_BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const HEADER_SELECT =
  "h-9 cursor-pointer rounded-lg border-0 bg-transparent px-1.5 text-sm font-semibold leading-6 text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";

interface DateFieldProps {
  /** YYYY-MM-DD ຫຼື "" (ຍັງບໍ່ເລືອກ). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  /** ຊື່ຊ່ອງສຳລັບ screen reader / test (ເຊັ່ນ "ຈາກວັນທີ"). */
  label: string;
  className?: string;
}

/**
 * ຊ່ອງເລືອກວັນທີ box ດຽວ + ປະຕິທິນ popup ທີ່ມີຊື່ເດືອນ/ວັນເປັນລາວ.
 * `<input type="date">` ສະແດງຕາມພາສາ browser/OS (ອາດອອກເປັນໄທ) ແລະ ບໍ່ມີ locale ລາວ, ຈຶ່ງບໍ່ໃຊ້.
 */
export function DateField({ value, onChange, invalid, describedBy, label, className }: DateFieldProps) {
  const { language } = useT();
  const text = TEXT[language];
  const selected = parse(value);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: selected?.y ?? today.getFullYear(), m: selected?.m ?? today.getMonth() });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) setView({ y: selected?.y ?? today.getFullYear(), m: selected?.m ?? today.getMonth() });
    setOpen(!open);
  }

  function shiftMonth(delta: number) {
    const date = new Date(view.y, view.m + delta, 1);
    setView({ y: date.getFullYear(), m: date.getMonth() });
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const thisYear = today.getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => thisYear + 1 - i);
  if (!years.includes(view.y)) years.push(view.y);
  years.sort((a, b) => b - a);

  const leading = new Date(view.y, view.m, 1).getDay();
  const dayCount = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div ref={rootRef} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold leading-5 text-ink-secondary">{label}</span>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-value={value}
          onClick={toggle}
          className={cn(
            "flex h-10 min-w-[11.5rem] items-center gap-2 rounded-xl border border-input bg-background pl-3 text-left text-sm leading-6 shadow-sm transition-colors",
            selected ? "pr-9 text-ink" : "pr-3 text-ink-tertiary",
            "hover:border-brand/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger",
          )}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0 text-ink-secondary" />
          <span className="truncate">
            {selected ? `${selected.d} ${text.months[selected.m]} ${selected.y}` : text.placeholder}
          </span>
        </button>
        {selected ? (
          <button
            type="button"
            aria-label={`${text.clear} ${label}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-secondary hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
        {open ? (
          <div
            role="dialog"
            aria-label={label}
            className="absolute left-0 top-full z-50 mt-1 w-[18.5rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-background p-3 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-1">
              <button type="button" aria-label={text.prev} onClick={() => shiftMonth(-1)} className={NAV_BUTTON}>
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <div className="flex items-center">
                <select
                  aria-label={text.month}
                  value={view.m}
                  onChange={(event) => setView({ ...view, m: Number(event.target.value) })}
                  className={HEADER_SELECT}
                >
                  {text.months.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={text.year}
                  value={view.y}
                  onChange={(event) => setView({ ...view, y: Number(event.target.value) })}
                  className={HEADER_SELECT}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" aria-label={text.next} onClick={() => shiftMonth(1)} className={NAV_BUTTON}>
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center">
              {text.weekdays.map((name) => (
                <span key={name} aria-hidden className="pb-1.5 pt-0.5 text-xs font-semibold leading-5 text-ink-tertiary">
                  {name}
                </span>
              ))}
              {cells.map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} />;
                const iso = toIso(view.y, view.m, day);
                const isSelected = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => pick(iso)}
                    className={cn(
                      "mx-auto inline-flex size-9 items-center justify-center rounded-full text-sm leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                      isSelected
                        ? "bg-brand font-semibold text-white"
                        : "text-ink hover:bg-subtle",
                      !isSelected && iso === todayIso && "font-semibold text-brand ring-1 ring-brand/40",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-sm leading-6">
              <button
                type="button"
                onClick={() => pick(todayIso)}
                className="rounded-lg px-2.5 py-1.5 font-semibold text-brand hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                {text.today}
              </button>
              {selected ? (
                <button
                  type="button"
                  onClick={() => pick("")}
                  className="rounded-lg px-2.5 py-1.5 text-ink-secondary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  {text.clear}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

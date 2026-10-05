"use client";

import { Field, Input } from "@oca/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useVariantSearch } from "@/lib/queries";
import type { VariantSearchItemDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

export interface VariantPickerProps {
  id: string;
  label: string;
  onSelect: (variant: VariantSearchItemDto) => void;
  /** ຮວມ variant ທີ່ປິດ/ສິນຄ້າ DRAFT-ARCHIVED (ໃຊ້ຕອນຮັບສະຕ໋ອກ); ຄ່າເລີ່ມຕົ້ນ = ສະເພາະທີ່ຂາຍໄດ້ (ຟອມບິນ) */
  includeInactive?: boolean;
  /** variant ທີ່ເລືອກແລ້ວ (ບໍ່ສະແດງໃນຜົນ) */
  excludeIds?: string[];
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
}

/** autocomplete variant ຜ່ານ GET /variants (SKU / barcode / ຊື່) ພ້ອມລາຄາ ແລະ ສະຕ໋ອກຂາຍໄດ້ */
export function VariantPicker({ id, label, onSelect, includeInactive, excludeIds = [], disabled, required, invalid, "aria-describedby": describedBy }: VariantPickerProps) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const q = useDebounced(text.trim(), 300);
  // ຂໍເພີ່ມຕາມຈຳນວນທີ່ຖືກຕັດ ເພື່ອໃຫ້ຜົນທີ່ຖືກຕັດບໍ່ແຍ່ງບ່ອນ
  const search = useVariantSearch({ q, includeInactive, pageSize: 8 + excludeIds.length });
  const results = (search.data?.items ?? []).filter((item) => !excludeIds.includes(item.id));
  const settled = q !== "" && text.trim() === q && !search.isPending && !dismissed;
  const showList = settled && !search.isError && results.length > 0;
  const listboxId = `${id}-listbox`;
  const optionId = (itemId: string) => `${id}-option-${itemId}`;
  const activeItem = showList ? results[activeIndex] : undefined;

  // Escape ໃນ input ຕອນລາຍການເປີດ ປິດສະເພາະລາຍການ. dialog (Radix) ຟັງ Escape ທີ່ document ໃນ capture phase
  // ຈຶ່ງຕ້ອງຢຸດທີ່ window capture (ມາກ່ອນ) ເທົ່ານັ້ນ; stopPropagation ຂອງ React ຊ້າເກີນໄປ.
  useEffect(() => {
    if (!showList) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== inputRef.current) return;
      event.stopPropagation();
      setDismissed(true);
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [showList]);

  function select(item: VariantSearchItemDto) {
    onSelect(item);
    setText("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Escape ຈັດການທີ່ window capture ຂ້າງເທິງ (ຕອນລາຍການເປີດເທົ່ານັ້ນ)
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      select(activeItem);
    }
  }

  return (
    <div className="relative">
      <Field label={label} htmlFor={id} required={required}>
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          invalid={invalid}
          required={required}
          aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined}
          value={text}
          disabled={disabled}
          autoComplete="off"
          placeholder={t("stock.picker.placeholder")}
          onChange={(event) => {
            setText(event.target.value);
            setActiveIndex(-1);
            setDismissed(false);
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => setDismissed(true)}
          onKeyDown={onKeyDown}
        />
      </Field>
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        >
          {results.map((item, index) => (
            <li
              key={item.id}
              id={optionId(item.id)}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle ${index === activeIndex ? "bg-subtle" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span>
                <span className="font-medium text-ink">{item.productName}</span>
                {item.name ? <span className="text-ink-secondary"> — {item.name}</span> : null}
                <span className="block font-mono text-xs text-ink-muted">{item.sku}</span>
              </span>
              <span className="text-right text-xs text-ink-secondary">
                <span className="block tabular-nums">{formatMoney(item.price)}</span>
                <span className="block">{t("stock.picker.available", { count: formatQuantity(item.availableTotal) })}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {settled && search.isError ? (
        <p role="alert" className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-danger shadow-lg">
          {t("stock.picker.error")}
        </p>
      ) : null}
      {settled && !search.isError && results.length === 0 ? (
        <p role="status" className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-muted shadow-lg">
          {t("stock.picker.none")}
        </p>
      ) : null}
    </div>
  );
}

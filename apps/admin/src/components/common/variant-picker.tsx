"use client";

import { Field, Input } from "@oca/ui";
import { useState } from "react";
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
}

/** autocomplete variant ຜ່ານ GET /variants (SKU / barcode / ຊື່) ພ້ອມລາຄາ ແລະ ສະຕ໋ອກຂາຍໄດ້ */
export function VariantPicker({ id, label, onSelect, includeInactive, excludeIds = [], disabled }: VariantPickerProps) {
  const { t } = useT();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const search = useVariantSearch({ q, includeInactive });
  const results = (search.data?.items ?? []).filter((item) => !excludeIds.includes(item.id));
  const showList = q !== "" && text.trim() === q && !search.isPending;

  return (
    <div className="relative">
      <Field label={label} htmlFor={id}>
        <Input
          id={id}
          value={text}
          disabled={disabled}
          autoComplete="off"
          placeholder={t("stock.picker.placeholder")}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      {showList ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{t("stock.picker.none")}</li>
          ) : (
            results.map((item) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle focus:bg-subtle focus:outline-none"
                  onClick={() => {
                    onSelect(item);
                    setText("");
                  }}
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
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

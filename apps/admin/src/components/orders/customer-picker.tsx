"use client";

import { Button, Field, Input } from "@oca/ui";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { useCustomers } from "@/lib/queries";
import type { CustomerDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

export interface CustomerPickerProps {
  value: CustomerDto | null;
  onSelect: (customer: CustomerDto | null) => void;
  /** id ຂອງ input (ຄ່າເລີ່ມຕົ້ນ: ສ້າງອັດຕະໂນມັດ) */
  id?: string;
  disabled?: boolean;
}

/** ຄົ້ນຫາລູກຄ້າທີ່ມີຢູ່ຕາມຊື່/ໂທລະສັບ/ອີເມວ ຜ່ານ GET /customers (ຕ້ອງ orders:read); ໂຄງສ້າງ combobox ຕາມ VariantPicker */
export function CustomerPicker({ value, onSelect, id, disabled }: CustomerPickerProps) {
  const { t } = useT();
  const autoId = useId();
  const baseId = id ?? `customer-search-${autoId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const q = useDebounced(text.trim(), 300);
  const search = useCustomers({ q });
  const results = search.data?.items ?? [];
  const settled = q !== "" && text.trim() === q && !search.isPending && !dismissed;
  const showList = settled && !search.isError && results.length > 0;
  const listboxId = `${baseId}-listbox`;
  const optionId = (customerId: string) => `${baseId}-option-${customerId}`;
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

  function select(customer: CustomerDto) {
    onSelect(customer);
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

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
        <div>
          <p className="text-sm font-medium text-ink">{value.name}</p>
          {value.phone || value.email ? <p className="text-xs text-ink-secondary">{value.phone ?? value.email}</p> : null}
        </div>
        <Button type="button" variant="ghost" className="rounded-lg" disabled={disabled} onClick={() => onSelect(null)}>
          {t("orders.customer.change")}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Field label={t("orders.customer.search")} htmlFor={baseId}>
        <Input
          ref={inputRef}
          id={baseId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined}
          value={text}
          disabled={disabled}
          autoComplete="off"
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
          aria-label={t("orders.customer.search")}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        >
          {results.map((customer, index) => (
            <li
              key={customer.id}
              id={optionId(customer.id)}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle ${index === activeIndex ? "bg-subtle" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                select(customer);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-medium text-ink">{customer.name}</span>
              <span className="text-xs text-ink-secondary">{customer.phone ?? customer.email ?? ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {settled && search.isError ? (
        <p role="alert" className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-danger shadow-lg">
          {t("orders.customer.error")}
        </p>
      ) : null}
      {settled && !search.isError && results.length === 0 ? (
        <p role="status" className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-muted shadow-lg">
          {t("orders.customer.none.found")}
        </p>
      ) : null}
    </div>
  );
}

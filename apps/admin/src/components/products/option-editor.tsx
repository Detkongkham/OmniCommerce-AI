"use client";

import { Button, Field, Input } from "@oca/ui";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { MAX_OPTIONS, type OptionDraft } from "@/lib/variant-matrix";

/**
 * Controlled editor for product options.
 *
 * Values are committed as chips (Enter / add button / blur), never per keystroke. The option NAME
 * does change per keystroke, so a parent that re-syncs variant rows (`syncVariants`) should NOT do
 * it on every `onChange`: call it when the set of values changes (chip added/removed), when an
 * option is removed/added, and on name blur, otherwise typing a name would reset edited rows.
 * Options with an empty name, no values or a repeated name are silently dropped by
 * `activeOptions`; this editor shows a warning for each case.
 */
export interface OptionEditorProps {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
}

function warningFor(options: OptionDraft[], index: number): TranslationKey | null {
  const option = options[index];
  if (!option) return null;
  const name = option.name.trim();
  const hasValues = option.values.some((value) => value.trim() !== "");
  if (name !== "" && options.slice(0, index).some((other) => other.name.trim() === name)) {
    return "products.option.duplicateName";
  }
  if (name !== "" && !hasValues) return "products.option.needsValues";
  if (name === "" && hasValues) return "products.option.needsName";
  return null;
}

export function OptionEditor({ options, onChange }: OptionEditorProps) {
  const { t } = useT();
  const atLimit = options.length >= MAX_OPTIONS;

  const patch = (index: number, next: OptionDraft) => onChange(options.map((option, i) => (i === index ? next : option)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-secondary">{t("products.option.help")}</p>
      {options.map((option, index) => (
        <OptionRow
          // position is the key because the name is editable at any time
          key={index}
          index={index}
          option={option}
          warning={warningFor(options, index)}
          onChange={(next) => patch(index, next)}
          onRemove={() => onChange(options.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outlinePrimary"
          className="rounded-lg"
          disabled={atLimit}
          onClick={() => onChange([...options, { name: "", values: [] }])}
        >
          <Plus aria-hidden="true" />
          {t("products.option.add")}
        </Button>
        {atLimit ? <span className="text-xs text-ink-muted">{t("products.option.limit")}</span> : null}
      </div>
    </div>
  );
}

function OptionRow({
  index,
  option,
  warning,
  onChange,
  onRemove,
}: {
  index: number;
  option: OptionDraft;
  warning: TranslationKey | null;
  onChange: (option: OptionDraft) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    setDraft("");
    if (value === "" || option.values.includes(value)) return;
    onChange({ ...option, values: [...option.values, value] });
  }

  return (
    <div data-testid={`option-${index}`} className="rounded-xl border border-line p-3">
      <div className="flex items-end gap-3">
        <Field label={t("products.option.name")} htmlFor={`option-name-${index}`} className="flex-1">
          <Input
            id={`option-name-${index}`}
            value={option.name}
            placeholder={t("products.option.namePlaceholder")}
            onChange={(event) => onChange({ ...option, name: event.target.value })}
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg"
          aria-label={t("products.option.remove")}
          title={t("products.option.remove")}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {option.values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-brand-soft-line bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink"
          >
            {value}
            <button
              type="button"
              aria-label={`${t("products.option.removeValue")} ${value}`}
              className="rounded-full hover:bg-brand/10"
              onClick={() => onChange({ ...option, values: option.values.filter((item) => item !== value) })}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          aria-label={t("products.option.values")}
          placeholder={t("products.option.valuesPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          className="h-8 min-w-[200px] flex-1 rounded-lg border border-line bg-subtle px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg"
          aria-label={t("products.option.addValue")}
          title={t("products.option.addValue")}
          onClick={commit}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {warning ? (
        <p role="status" className="mt-2 text-xs text-warning-ink">
          {t(warning)}
        </p>
      ) : null}
    </div>
  );
}

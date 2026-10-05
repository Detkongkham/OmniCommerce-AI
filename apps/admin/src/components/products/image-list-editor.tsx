"use client";

import { Button, Field, Input, Select } from "@oca/ui";
import { ArrowDown, ArrowUp, ImageOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/language-provider";
import type { ImageDraft } from "@/lib/product-form";

export interface ImageListEditorProps {
  images: ImageDraft[];
  onChange: (images: ImageDraft[]) => void;
  /** Variants an image can be linked to (key = the value stored in ImageDraft.variantKey). */
  variants: { key: string; label: string }[];
}

const MAX_IMAGES = 20;
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export function ImageListEditor({ images, onChange, variants }: ImageListEditorProps) {
  const { t } = useT();
  const addRef = useRef<HTMLButtonElement>(null);
  // focus target requested by an action; applied after the re-render that makes it focusable
  const pendingFocus = useRef<"add" | number | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "add") addRef.current?.focus();
    else document.getElementById(`image-url-${target}`)?.focus();
  });

  const patch = (index: number, change: Partial<ImageDraft>) =>
    onChange(images.map((image, i) => (i === index ? { ...image, ...change } : image)));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ImageOff className="size-4" aria-hidden="true" />
          {t("products.images.empty")}
        </p>
      ) : null}
      {images.map((image, index) => {
        const n = index + 1;
        return (
          // position is the key because the URL is editable at any time
          <div key={index} data-testid={`image-row-${index}`} className="flex flex-wrap items-start gap-3 rounded-xl border border-line p-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
              {isHttpUrl(image.url) ? (
                <img src={image.url.trim()} alt={image.alt} className="size-full object-cover" />
              ) : (
                <ImageOff className="size-5 text-ink-muted" aria-hidden="true" />
              )}
            </div>
            <div className="grid min-w-[240px] flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={`${t("products.images.url")} ${n}`} htmlFor={`image-url-${index}`} className="sm:col-span-3">
                <Input
                  id={`image-url-${index}`}
                  value={image.url}
                  placeholder="https://"
                  onChange={(event) => patch(index, { url: event.target.value })}
                />
              </Field>
              <Field label={`${t("products.images.alt")} ${n}`} htmlFor={`image-alt-${index}`} className="sm:col-span-2">
                <Input id={`image-alt-${index}`} value={image.alt} onChange={(event) => patch(index, { alt: event.target.value })} />
              </Field>
              <Field label={`${t("products.images.variant")} ${n}`} htmlFor={`image-variant-${index}`}>
                <Select
                  id={`image-variant-${index}`}
                  value={image.variantKey}
                  onChange={(event) => patch(index, { variantKey: event.target.value })}
                >
                  <option value="">{t("products.images.productLevel")}</option>
                  {variants.map((variant) => (
                    <option key={variant.key} value={variant.key}>
                      {variant.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                aria-label={`${t("products.images.up")} ${n}`}
                title={t("products.images.up")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                aria-label={`${t("products.images.down")} ${n}`}
                title={t("products.images.down")}
                disabled={index === images.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                aria-label={`${t("products.images.remove")} ${n}`}
                title={t("products.images.remove")}
                onClick={() => {
                  pendingFocus.current = "add";
                  onChange(images.filter((_, i) => i !== index));
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
      {images.length < MAX_IMAGES ? (
        <Button
          ref={addRef}
          type="button"
          variant="outlinePrimary"
          className="rounded-lg"
          onClick={() => {
            pendingFocus.current = images.length;
            onChange([...images, { url: "", alt: "", variantKey: "" }]);
          }}
        >
          <Plus aria-hidden="true" />
          {t("products.images.add")}
        </Button>
      ) : null}
    </div>
  );
}

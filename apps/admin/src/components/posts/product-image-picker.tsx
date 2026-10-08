"use client";

import { Button, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Input, Skeleton } from "@oca/ui";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { useProduct, useProducts } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const isHttps = (url: string) => /^https:\/\/\S+$/.test(url) && url.length <= 2000;

export interface ProductImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ຈຳນວນທີ່ເພີ່ມໄດ້ອີກ */
  remaining: number;
  onPick: (urls: string[]) => void;
}

/** ເລືອກສິນຄ້າ → ຕິກຮູບ (URL ຂອງຮູບສິນຄ້າ, ສະເພາະ https ທີ່ Facebook ດຶງໄດ້) */
export function ProductImagePicker({ open, onOpenChange, remaining, onPick }: ProductImagePickerProps) {
  const { t } = useT();
  const [productId, setProductId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setProductId(null);
      setSelected([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl" closeLabel={t("common.close")}>
        <DialogHeader title={t("posts.picker.title")} description={t("posts.picker.description")} />
        <DialogBody>
          {productId ? (
            <ProductImages
              productId={productId}
              selected={selected}
              remaining={remaining}
              onToggle={(url) =>
                setSelected((current) =>
                  current.includes(url) ? current.filter((value) => value !== url) : current.length < remaining ? [...current, url] : current,
                )
              }
              onBack={() => {
                setProductId(null);
                setSelected([]);
              }}
            />
          ) : (
            <ProductSearch onChoose={setProductId} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" className="rounded-lg" onClick={() => close(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            className="rounded-lg"
            disabled={selected.length === 0}
            onClick={() => {
              onPick(selected);
              close(false);
            }}
          >
            {t("posts.picker.add", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductSearch({ onChoose }: { onChoose: (id: string) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim());
  const query = useProducts({ q: debounced || undefined, page: 1, pageSize: 20 });
  const rows = query.data?.items ?? [];
  return (
    <div className="space-y-3">
      <Input aria-label={t("posts.picker.search")} placeholder={t("posts.picker.search")} value={q} onChange={(event) => setQ(event.target.value)} />
      {query.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {!query.isPending && rows.length === 0 ? <p className="text-sm text-ink-muted">{t("posts.picker.empty")}</p> : null}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-line p-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChoose(product.id)}
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-4 text-ink-muted" aria-hidden="true" />
                )}
              </span>
              <span className="truncate text-sm font-semibold text-ink">{product.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductImages(props: { productId: string; selected: string[]; remaining: number; onToggle: (url: string) => void; onBack: () => void }) {
  const { t } = useT();
  const query = useProduct(props.productId);
  const images = (query.data?.images ?? []).filter((image) => isHttps(image.url));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="rounded-lg" onClick={props.onBack}>
          <ArrowLeft aria-hidden="true" />
          {t("posts.picker.back")}
        </Button>
        <p className="text-xs text-ink-muted">{t("posts.picker.limit", { count: props.remaining - props.selected.length })}</p>
      </div>
      {query.data ? <p className="text-sm font-semibold text-ink">{query.data.name}</p> : null}
      {query.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {query.data && images.length === 0 ? <p className="text-sm text-ink-muted">{t("posts.picker.noImages")}</p> : null}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image, index) => {
          const checked = props.selected.includes(image.url);
          const id = `pick-${image.id}`;
          return (
            <li key={image.id}>
              <label htmlFor={id} className="relative block cursor-pointer overflow-hidden rounded-xl border border-line has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-brand">
                <img src={image.url} alt={image.alt ?? ""} className="aspect-square w-full object-cover" />
                <span className="absolute left-2 top-2 rounded bg-surface/90 p-0.5">
                  <Checkbox
                    id={id}
                    aria-label={t("posts.picker.select", { n: index + 1 })}
                    checked={checked}
                    disabled={!checked && props.selected.length >= props.remaining}
                    onCheckedChange={() => props.onToggle(image.url)}
                  />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

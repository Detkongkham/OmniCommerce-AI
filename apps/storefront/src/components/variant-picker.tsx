"use client";

import { StatusPill, cn } from "@oca/ui";
import { Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatLak } from "@/lib/format";
import type { StoreProductDetail } from "@/lib/types";
import { findVariant, initialSelection, isValueSelectable, selectValue, variantChoices } from "@/lib/variants";
import { AddToCart } from "./add-to-cart";
import { Countdown } from "./countdown";
import { Price } from "./price";
import { StockBadge } from "./stock-badge";

const FLASH_ENDS_IN = "ຈົບໃນ";

/** ເລືອກ variant ຂອງສິນຄ້າ: ປຸ່ມຕໍ່ຕົວເລືອກ, ລາຄາ, ສະຖານະສະຕ໋ອກ ແລະ ປຸ່ມໃສ່ກະຕ່າ ຂອງ variant ທີ່ເລືອກ */
export function VariantPicker({ product }: { product: Pick<StoreProductDetail, "name" | "options" | "variants"> }) {
  const { groups, variants } = useMemo(() => variantChoices(product), [product]);
  const [selection, setSelection] = useState(() => initialSelection(variants));
  const selected = findVariant(variants, selection);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="flex flex-col gap-2">
        {selected ? (
          <>
            <Price label={formatLak(selected.price)} compareAtPrice={selected.compareAtPrice} size="lg" />
            {selected.saleEndsAt ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-brand-ink">
                <StatusPill tone="brand" icon={Zap}>
                  Flash Sale
                </StatusPill>
                <span>
                  {FLASH_ENDS_IN}{" "}
                  <Countdown until={selected.saleEndsAt} onExpire={() => router.refresh()} className="font-bold tabular-nums" />
                </span>
              </p>
            ) : null}
            <div>
              <StockBadge stock={selected.stock} />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-secondary">ກະລຸນາເລືອກຕົວເລືອກ</p>
        )}
      </div>

      {groups.map((group) => (
        <fieldset key={group.name} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-ink">{group.name}</legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const pressed = selection[group.name] === value;
              // ຄ່າທີ່ບໍ່ເຂົ້າກັບຕົວເລືອກອື່ນທີ່ເລືອກຢູ່ ຍັງກົດໄດ້ (ຈະຍ້າຍໄປຄູ່ທີ່ມີຂາຍ) ແຕ່ສະແດງເປັນເສັ້ນປະ
              const compatible = pressed || isValueSelectable(variants, selection, group.name, value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setSelection((current) => selectValue(variants, current, group.name, value))}
                  className={cn(
                    "min-h-10 rounded-xl border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    pressed
                      ? "border-brand bg-brand-soft font-semibold text-brand-ink"
                      : compatible
                        ? "border-line bg-surface text-ink hover:border-brand-soft-line"
                        : "border-dashed border-line bg-surface text-ink-muted hover:border-brand-soft-line",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <AddToCart variant={selected} productName={product.name} />
    </div>
  );
}

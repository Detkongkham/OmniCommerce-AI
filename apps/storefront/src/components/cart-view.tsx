"use client";

import { STORE_MAX_QUANTITY } from "@oca/shared";
import { Button, EmptyState, Skeleton, buttonVariants } from "@oca/ui";
import { ImageOff, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { removeFromCart, setCartQuantity } from "@/lib/cart";
import { formatLak } from "@/lib/format";
import { apiMessage } from "@/lib/messages";
import type { StoreCartLine } from "@/lib/types";
import { useCartCheck } from "@/lib/use-cart-check";
import { QuantityStepper } from "./quantity-stepper";

function RemoveButton({ variantId, label }: { variantId: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`ລຶບ ${label} ອອກຈາກກະຕ່າ`}
      onClick={() => removeFromCart(variantId)}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition-colors hover:bg-danger-soft hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  );
}

function CartRow({ line }: { line: StoreCartLine }) {
  if (line.unavailable) {
    return (
      <li aria-label="ສິນຄ້າທີ່ບໍ່ມີຂາຍແລ້ວ" className="flex items-center gap-3 rounded-2xl border border-danger-line bg-danger-soft p-3">
        <p className="flex-1 text-sm text-danger-ink">ສິນຄ້ານີ້ບໍ່ມີຂາຍແລ້ວ</p>
        <RemoveButton variantId={line.variantId} label="ສິນຄ້າທີ່ບໍ່ມີຂາຍແລ້ວ" />
      </li>
    );
  }
  const problem = !line.insufficient
    ? null
    : line.stock.status === "OUT"
      ? "ສິນຄ້າໝົດ"
      : line.stock.remaining !== null
        ? `ສະຕ໋ອກບໍ່ພໍ: ເຫຼືອ ${line.stock.remaining} ອັນ`
        : "ສະຕ໋ອກບໍ່ພໍສຳລັບຈຳນວນນີ້";
  return (
    <li aria-label={line.productName} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-subtle">
        {line.imageUrl ? (
          <img src={line.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-muted" aria-hidden="true">
            <ImageOff className="size-6" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/products/${line.productSlug}`} className="line-clamp-2 text-sm font-medium text-ink hover:text-brand-ink hover:underline">
              {line.productName}
            </Link>
            {line.variantName ? <p className="text-xs text-ink-secondary">{line.variantName}</p> : null}
            <p className="text-xs text-ink-secondary">{formatLak(line.unitPrice)}</p>
          </div>
          <RemoveButton variantId={line.variantId} label={line.productName} />
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper
            value={line.quantity}
            max={STORE_MAX_QUANTITY}
            onChange={(quantity) => setCartQuantity(line.variantId, quantity)}
            label={line.productName}
          />
          <p className="text-sm font-bold text-brand-ink">{formatLak(line.lineTotal)}</p>
        </div>
        {problem ? <p className="text-xs font-semibold text-danger-ink">{problem}</p> : null}
      </div>
    </li>
  );
}

/** ໜ້າກະຕ່າ: ລາຍການ + ຍອດຈາກ server, ແກ້ຈຳນວນ/ລຶບ, ໄປ checkout ເມື່ອທຸກລາຍການສັ່ງໄດ້ */
export function CartView() {
  const { state, reload } = useCartCheck();

  if (state.status === "loading") {
    return (
      <div role="status" aria-label="ກຳລັງໂຫຼດກະຕ່າ" className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="ກະຕ່າຂອງທ່ານຍັງຫວ່າງ"
        action={
          <Link href="/products" className={buttonVariants({ variant: "outlinePrimary" })}>
            ເລືອກຊື້ສິນຄ້າ
          </Link>
        }
      />
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger-line bg-danger-soft p-6 text-center">
        <p className="text-sm font-semibold text-danger-ink">ໂຫຼດກະຕ່າບໍ່ສຳເລັດ</p>
        <p className="text-sm text-danger-ink">{apiMessage(state.code, "ກະລຸນາລອງໃໝ່ອີກຄັ້ງ")}</p>
        <Button variant="outlineDanger" onClick={reload}>
          ລອງໃໝ່
        </Button>
      </div>
    );
  }

  const { cart, refreshing } = state;
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_320px] md:items-start">
      <ul className="flex flex-col gap-3" aria-busy={refreshing}>
        {cart.items.map((line) => (
          <CartRow key={line.variantId} line={line} />
        ))}
      </ul>
      <section aria-label="ສະຫຼຸບຄຳສັ່ງຊື້" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:sticky md:top-20">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-secondary">ຍອດລວມ</span>
          <span className="text-xl font-bold text-ink">{formatLak(cart.total)}</span>
        </div>
        <p className="text-xs text-ink-secondary">ຄ່າຂົນສົ່ງຊຳລະຕອນຮັບສິນຄ້າ</p>
        {cart.orderable && !refreshing ? (
          <Link href="/checkout" className={buttonVariants({ size: "lg", className: "h-11 rounded-xl" })}>
            ດຳເນີນການສັ່ງຊື້
          </Link>
        ) : (
          <Button size="lg" className="h-11 rounded-xl" disabled>
            ດຳເນີນການສັ່ງຊື້
          </Button>
        )}
        {!cart.orderable ? <p className="text-xs font-semibold text-danger-ink">ກະລຸນາແກ້ໄຂລາຍການທີ່ມີບັນຫາກ່ອນສັ່ງຊື້</p> : null}
      </section>
    </div>
  );
}

"use client";

import { STORE_MAX_LINES, STORE_MAX_QUANTITY } from "@oca/shared";
import { Button } from "@oca/ui";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { addToCart } from "@/lib/cart";
import type { StoreVariant } from "@/lib/types";
import { QuantityStepper } from "./quantity-stepper";

type Feedback = { kind: "added"; quantity: number } | { kind: "full" } | null;

interface AddToCartProps {
  /** variant ທີ່ເລືອກ; undefined = ຍັງເລືອກບໍ່ຄົບ */
  variant: StoreVariant | undefined;
  productName: string;
}

/** ຕົວເລືອກຈຳນວນ + ປຸ່ມໃສ່ກະຕ່າ ຂອງ variant ທີ່ເລືອກ */
export function AddToCart({ variant, productName }: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // ປ່ຽນ variant = ເລີ່ມໃໝ່ (ຈຳນວນ ແລະ ຂໍ້ຄວາມເປັນຂອງ variant ເກົ່າ)
  const [variantId, setVariantId] = useState(variant?.id);
  if (variantId !== variant?.id) {
    setVariantId(variant?.id);
    setQuantity(1);
    setFeedback(null);
  }

  const out = variant?.stock.status === "OUT";
  const max = Math.min(STORE_MAX_QUANTITY, variant?.stock.remaining ?? STORE_MAX_QUANTITY);

  const add = () => {
    if (!variant) return;
    setFeedback(addToCart(variant.id, quantity) ? { kind: "added", quantity } : { kind: "full" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} label={productName} disabled={!variant || out} />
        <Button size="lg" className="h-11 flex-1 rounded-xl" disabled={!variant || out} onClick={add}>
          <ShoppingCart aria-hidden="true" />
          {out ? "ສິນຄ້າໝົດ" : "ໃສ່ກະຕ່າ"}
        </Button>
      </div>
      {feedback?.kind === "added" ? (
        <p role="status" className="flex flex-wrap items-center gap-x-3 rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success-ink">
          <span>{`ເພີ່ມ ${feedback.quantity} ອັນ ລົງກະຕ່າແລ້ວ`}</span>
          <Link href="/cart" className="font-semibold underline underline-offset-4">
            ເບິ່ງກະຕ່າ
          </Link>
        </p>
      ) : null}
      {feedback?.kind === "full" ? (
        <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
          {`ສັ່ງໄດ້ສູງສຸດ ${STORE_MAX_QUANTITY} ອັນຕໍ່ສິນຄ້າ ແລະ ${STORE_MAX_LINES} ລາຍການຕໍ່ບິນ`}
        </p>
      ) : null}
    </div>
  );
}

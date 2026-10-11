"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { cartCount, useCart } from "@/lib/cart";

/** ໄອຄອນກະຕ່າໃນຫົວເວັບ ພ້ອມຈຳນວນຊິ້ນ */
export function CartLink() {
  const count = cartCount(useCart());
  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `ກະຕ່າ (${count} ອັນ)` : "ກະຕ່າ"}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      {count > 0 ? (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-5 text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

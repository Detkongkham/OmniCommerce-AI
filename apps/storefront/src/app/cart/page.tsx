import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = { title: "ກະຕ່າສິນຄ້າ", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">ກະຕ່າສິນຄ້າ</h1>
      <CartView />
    </div>
  );
}

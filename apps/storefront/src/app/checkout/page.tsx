import type { Metadata } from "next";
import { connection } from "next/server";
import { CheckoutForm } from "@/components/checkout-form";
import { getStoreConfig } from "@/lib/store-api";

export const metadata: Metadata = { title: "ສັ່ງຊື້", robots: { index: false } };

export default async function CheckoutPage() {
  await connection();
  const config = await getStoreConfig();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">ສັ່ງຊື້</h1>
      <CheckoutForm couriers={config.couriers} loyalty={config.loyalty} />
    </div>
  );
}

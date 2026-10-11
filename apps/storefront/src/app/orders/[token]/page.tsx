import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/order-view";
import { getOrder, getStoreConfig } from "@/lib/store-api";

// ໜ້ານີ້ມີຂໍ້ມູນສ່ວນຕົວ ແລະ token ຢູ່ໃນ URL: ຫ້າມ index ແລະ ຫ້າມສົ່ງ URL ອອກເປັນ referrer
export const metadata: Metadata = {
  title: "ບິນຂອງທ່ານ",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [order, config] = await Promise.all([getOrder(token), getStoreConfig()]);
  if (!order) notFound();
  return (
    <OrderView
      token={token}
      initialOrder={order}
      payment={{ receivingAccounts: config.receivingAccounts, paymentInstructions: config.paymentInstructions }}
    />
  );
}

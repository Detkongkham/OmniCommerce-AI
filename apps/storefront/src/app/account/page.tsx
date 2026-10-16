import type { Metadata } from "next";
import { connection } from "next/server";
import { AccountView } from "@/components/account-view";
import { getStoreConfig } from "@/lib/store-api";

// ຂໍ້ມູນສ່ວນຕົວ: ຫ້າມ index
export const metadata: Metadata = { title: "ບັນຊີຂອງຂ້ອຍ", robots: { index: false, follow: false } };

export default async function AccountPage() {
  await connection();
  const config = await getStoreConfig();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">ບັນຊີຂອງຂ້ອຍ</h1>
      <AccountView loyalty={config.loyalty} />
    </div>
  );
}

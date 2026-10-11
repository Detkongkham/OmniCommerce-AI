import { EmptyState, buttonVariants } from "@oca/ui";
import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="ບໍ່ພົບໜ້ານີ້"
      description="ສິນຄ້າອາດຖືກປິດການຂາຍ ຫຼື ລິ້ງບໍ່ຖືກຕ້ອງ"
      action={
        <Link href="/products" className={buttonVariants({ variant: "outlinePrimary" })}>
          ເບິ່ງສິນຄ້າທັງໝົດ
        </Link>
      }
    />
  );
}

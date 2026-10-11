import { cn } from "@oca/ui";
import { formatLak } from "@/lib/format";

interface PriceProps {
  /** ຂໍ້ຄວາມລາຄາທີ່ຈັດຮູບແບບແລ້ວ (ຄ່າດຽວ ຫຼື ຊ່ວງ) */
  label: string;
  compareAtPrice: string | null;
  size?: "sm" | "lg";
}

/** ລາຄາຂາຍ + ລາຄາກ່ອນຫຼຸດ (ຂີດຂ້າ, ມີຄຳອະທິບາຍໃຫ້ screen reader) */
export function Price({ label, compareAtPrice, size = "sm" }: PriceProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={cn("font-bold text-brand-ink", size === "lg" ? "text-2xl" : "text-sm")}>{label}</span>
      {compareAtPrice ? (
        <>
          <span className="sr-only">ລາຄາເດີມ</span>
          <s className={cn("text-ink-muted", size === "lg" ? "text-base" : "text-xs")}>{formatLak(compareAtPrice)}</s>
        </>
      ) : null}
    </p>
  );
}

import { StatusPill } from "@oca/ui";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { priceRange } from "@/lib/format";
import type { StoreProductListItem } from "@/lib/types";
import { Price } from "./price";

/** ບັດສິນຄ້າໃນ grid: ທັງບັດເປັນລິ້ງດຽວໄປໜ້າລາຍລະອຽດ */
export function ProductCard({ product }: { product: StoreProductListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-brand-soft-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square bg-subtle">
        {product.imageUrl ? (
          // <img> ທຳມະດາ: ຮູບມາຈາກ API/URL ພາຍນອກ ທີ່ບໍ່ຮູ້ຂະໜາດ ແລະ host ລ່ວງໜ້າ (next/image ຕ້ອງຕັ້ງ remotePatterns)
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className={`size-full object-cover transition-transform group-hover:scale-[1.03] ${product.stock === "OUT" ? "opacity-60" : ""}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-muted" aria-hidden="true">
            <ImageOff className="size-8" />
          </div>
        )}
        {product.stock === "OUT" ? (
          <StatusPill tone="danger" className="absolute left-2 top-2">
            ສິນຄ້າໝົດ
          </StatusPill>
        ) : product.stock === "LOW" ? (
          <StatusPill tone="warning" className="absolute left-2 top-2">
            ໃກ້ໝົດ
          </StatusPill>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-ink">{product.name}</h3>
        <div className="mt-auto">
          <Price label={priceRange(product.priceMin, product.priceMax)} compareAtPrice={product.compareAtPrice} />
        </div>
      </div>
    </Link>
  );
}

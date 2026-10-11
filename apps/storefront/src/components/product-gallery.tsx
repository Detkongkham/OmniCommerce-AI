"use client";

import { cn } from "@oca/ui";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { StoreProductImage } from "@/lib/types";

/** ຮູບຫຼັກ + ຮູບຍ່ອຍໃຫ້ກົດປ່ຽນ. ບໍ່ມີຮູບ = placeholder */
export function ProductGallery({ images, productName }: { images: StoreProductImage[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];

  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-line bg-subtle text-ink-muted" aria-hidden="true">
        <ImageOff className="size-10" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-subtle">
        {/* <img> ທຳມະດາ: ຮູບມາຈາກ API/URL ພາຍນອກ ທີ່ບໍ່ຮູ້ຂະໜາດ ແລະ host ລ່ວງໜ້າ */}
        <img src={current.url} alt={current.alt ?? productName} className="size-full object-cover" />
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((image, position) => (
            <li key={`${image.url}-${position}`}>
              <button
                type="button"
                aria-label={`ຮູບທີ ${position + 1}`}
                aria-pressed={position === index}
                onClick={() => setIndex(position)}
                className={cn(
                  "size-16 shrink-0 overflow-hidden rounded-xl border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  position === index ? "border-brand" : "border-transparent",
                )}
              >
                <img src={image.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { Button, Skeleton, cn } from "@oca/ui";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { useSlipImage } from "@/lib/queries";

/** ຮູບສະລິບ: ໂຫຼດດ້ວຍ Bearer ເປັນ Blob (API ບໍ່ເປີດຮູບ public) ແລ້ວສະແດງຜ່ານ object URL */
export function SlipImage({ slipId, className }: { slipId: string; className?: string }) {
  const { t } = useT();
  const query = useSlipImage(slipId);
  const [url, setUrl] = useState<string | null>(null);

  // ສ້າງ object URL ຕໍ່ blob ແລະ ຄືນຕອນ blob ປ່ຽນ/unmount (ບໍ່ໃຫ້ຮົ່ວ memory)
  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-xs text-danger">
        <span>{t("slips.image.error")}</span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!url) {
    // Skeleton ຕັ້ງ aria-hidden ເອງ ຈຶ່ງຫໍ່ດ້ວຍ div ທີ່ເປັນ status ເພື່ອໃຫ້ screen reader ຮູ້ວ່າກຳລັງໂຫຼດ
    return (
      <div role="status" aria-busy="true" aria-label={t("common.loading")}>
        <Skeleton className={cn("h-40 w-full rounded-xl", className)} />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={t("slips.image.open")} aria-label={t("slips.image.open")} className="block">
      {/* ຮູບຈາກ blob (ບໍ່ຜ່ານ next/image) */}
      <img src={url} alt={t("slips.image.alt")} className={cn("max-h-72 w-full rounded-xl border border-line object-contain", className)} />
    </a>
  );
}

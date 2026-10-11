"use client";

import { Button } from "@oca/ui";
import { useQueries } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { queryKeys } from "@/lib/queries";
import type { FulfillmentDetailDto } from "@/lib/types";
import { Barcode } from "./barcode";
import { MAX_LABELS } from "./fulfillment-queue";

/**
 * ໃບປະໜ້າ 100×150 mm (ເຄື່ອງພິມ thermal): ໜຶ່ງໃບຕໍ່ໜ້າ, ພື້ນຂາວ-ໂຕດຳສະເໝີ (ບໍ່ຕາມ dark mode).
 * ໂຫຼດຄົບທຸກບິນແລ້ວ ເປີດໜ້າຕ່າງພິມອັດຕະໂນມັດຄັ້ງດຽວ.
 */
export function ShippingLabels({ ids }: { ids: string[] }) {
  const { t } = useT();
  const tooMany = ids.length > MAX_LABELS;
  const results = useQueries({
    queries: (tooMany ? [] : ids).map((id) => ({
      queryKey: [...queryKeys.fulfillment, "detail", id],
      queryFn: () => apiFetch<FulfillmentDetailDto>(`/fulfillment/${encodeURIComponent(id)}`),
    })),
  });
  const loading = results.some((result) => result.isPending);
  const failed = results.some((result) => result.isError);
  const labels = results.flatMap((result) => (result.data ? [result.data] : []));
  const printed = useRef(false);

  useEffect(() => {
    if (loading || failed || labels.length === 0 || printed.current) return;
    printed.current = true;
    window.print();
  }, [loading, failed, labels.length]);

  if (ids.length === 0) return <p className="p-6 text-ink">{t("label.none")}</p>;
  if (tooMany) return <p className="p-6 text-ink">{t("label.tooMany", { max: MAX_LABELS })}</p>;

  return (
    <div className="min-h-screen bg-subtle print:bg-white">
      <style>{`@page { size: 100mm 150mm; margin: 0; } @media print { body { background: #fff; } }`}</style>
      <div className="flex items-center justify-between gap-3 p-4 print:hidden">
        <h1 className="text-lg font-bold text-ink">
          {t("label.title")} ({labels.length})
        </h1>
        <Button className="rounded-xl" disabled={loading || labels.length === 0} onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          {t("label.print")}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="mx-4 mb-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink print:hidden">
          {t("label.loadError")}
        </p>
      ) : null}
      <div className="flex flex-col items-center gap-4 pb-8 print:block print:gap-0 print:pb-0">
        {labels.map((label) => (
          <Label key={label.id} label={label} />
        ))}
      </div>
    </div>
  );
}

function Label({ label }: { label: FulfillmentDetailDto }) {
  const { t } = useT();
  const count = label.items.reduce((sum, item) => sum + item.quantity, 0);
  const shipment = label.shipment;
  return (
    <section
      data-testid={`label-${label.id}`}
      aria-label={label.orderNumber}
      className="flex h-[150mm] w-[100mm] flex-col overflow-hidden bg-white p-[4mm] text-black shadow print:break-after-page print:shadow-none"
      style={{ fontFamily: "var(--font-noto-sans-lao), var(--font-inter), sans-serif" }}
    >
      <div className="border-b-2 border-black pb-[2mm] text-[9pt]">
        <span className="font-semibold">{t("label.from")}:</span> {label.storeName}
      </div>
      <div className="flex-1 border-b-2 border-black py-[3mm]">
        <p className="text-[9pt] font-semibold">{t("label.to")}</p>
        <p className="text-[16pt] font-bold leading-tight">{label.shippingName ?? "—"}</p>
        <p className="text-[14pt] font-semibold tabular-nums">{label.shippingPhone ?? "—"}</p>
        <p className="mt-[1mm] whitespace-pre-line text-[11pt] leading-snug">{label.shippingAddress ?? ""}</p>
      </div>
      <div className="border-b-2 border-black py-[2mm] text-center">
        <Barcode value={label.orderNumber} height={56} className="h-[16mm] w-full" />
        <p className="font-mono text-[12pt] font-bold">{label.orderNumber}</p>
        <p className="text-[9pt]">
          {t("label.items", { count })} · {formatDateTime(new Date())}
        </p>
      </div>
      {shipment?.courier && shipment.trackingNumber ? (
        <div className="pt-[2mm] text-center">
          <p className="text-[10pt] font-semibold">{shipment.courier.name}</p>
          <Barcode value={shipment.trackingNumber} height={44} className="h-[12mm] w-full" />
          <p className="font-mono text-[11pt] font-bold">{shipment.trackingNumber}</p>
        </div>
      ) : null}
    </section>
  );
}

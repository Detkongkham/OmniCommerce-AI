"use client";

import { SLIP_MAX_BYTES } from "@oca/shared";
import { Button, Card, Skeleton, toast } from "@oca/ui";
import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useOrderSlips, useUploadSlip } from "@/lib/queries";
import { validateSlipFile } from "@/lib/slips";
import { SlipCard, type SlipOrderInfo } from "./slip-card";

const MAX_MB = SLIP_MAX_BYTES / (1024 * 1024);

/** panel ສະລິບໃນໜ້າບິນ. ຜູ້ເອີ້ນບໍ່ຕ້ອງກວດສິດ: ບໍ່ມີ orders:read = ບໍ່ render ຫຍັງ */
export function OrderSlipsCard({ order }: { order: SlipOrderInfo }) {
  const canRead = useCan("orders:read");
  if (!canRead) return null;
  return <OrderSlipsInner order={order} />;
}

function OrderSlipsInner({ order }: { order: SlipOrderInfo }) {
  const { t } = useT();
  const uid = useId();
  const canUpload = useCan("orders:write");
  const canReview = useCan("payments:write");
  const slips = useOrderSlips(order.id);
  const upload = useUploadSlip();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateSlipFile(file);
    if (problem) {
      setFileError(problem === "type" ? t("slips.file.type") : problem === "heic" ? t("slips.file.heic") : t("slips.file.size", { max: MAX_MB }));
      return;
    }
    setFileError(null);
    try {
      await upload.mutateAsync({ orderId: order.id, file });
      toast.success(t("slips.toast.uploaded"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  const headingId = `${uid}-title`;
  return (
    <Card className="rounded-[20px] p-6" aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-bold text-ink">
          {t("slips.title")}
        </h2>
        {canUpload ? (
          <div>
            <input
              ref={inputRef}
              id={`${uid}-file`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => void onPick(event)}
            />
            <Button variant="outlinePrimary" size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" />
              {t("slips.upload")}
            </Button>
            <p className="mt-1 text-[11px] text-ink-muted">{t("slips.upload.hint")}</p>
          </div>
        ) : null}
      </div>
      {fileError ? (
        <p role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {fileError}
        </p>
      ) : null}
      {slips.isError && !slips.data ? (
        <div role="alert" className="flex items-center gap-2 text-sm text-danger">
          {t("common.error.load")}
          <Button variant="outline" size="sm" onClick={() => void slips.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : slips.isPending ? (
        <Skeleton role="status" aria-busy="true" aria-label={t("common.loading")} className="h-24 w-full" />
      ) : Array.isArray(slips.data) && slips.data.length > 0 ? (
        <div className="space-y-4">
          {slips.data.map((slip) => (
            <SlipCard key={slip.id} slip={slip} order={order} canReview={canReview} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">{t("slips.empty")}</p>
      )}
    </Card>
  );
}

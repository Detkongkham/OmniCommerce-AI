"use client";

import { Button, cn } from "@oca/ui";
import { AlertCircle, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { safeAttachmentUrl, sendErrorKey } from "@/lib/inbox";
import type { MessageDto } from "@/lib/types";

export interface MessageBubbleProps {
  message: MessageDto;
  /** ມີ = ສະແດງປຸ່ມ "ໃຊ້ເປັນສະລິບ" ຂອງຮູບຂາເຂົ້າ (ຜູ້ເອີ້ນກວດສິດແລ້ວ) */
  onUseAsSlip?: (attachmentIndex: number) => void;
  /** index ຂອງ attachment ໃນຂໍ້ຄວາມນີ້ທີ່ຜູກເປັນສະລິບແລ້ວ */
  linkedIndexes?: ReadonlySet<number>;
}

export function MessageBubble({ message, onUseAsSlip, linkedIndexes }: MessageBubbleProps) {
  const { t } = useT();
  const out = message.direction === "OUT";
  const failed = message.status === "FAILED";
  return (
    <li className={cn("flex", out ? "justify-end" : "justify-start")} data-testid={`message-${message.id}`}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[75%]",
          failed
            ? "border border-danger-line bg-danger-soft text-danger-ink"
            : out
              ? "bg-brand text-white"
              : "border border-line bg-surface text-ink",
        )}
      >
        <span className="sr-only">{t(`inbox.message.from.${message.direction}`)}:</span>
        {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
        {message.attachments.map((attachment, index) => {
          const url = attachment.type === "image" ? safeAttachmentUrl(attachment.url) : null;
          return url ? (
            <div key={index} className="mt-1">
              <a href={url} target="_blank" rel="noopener noreferrer" title={t("inbox.attachment.open")} className="block">
                {/* ຮູບຈາກ CDN ຂອງ Meta (ບໍ່ຜ່ານ next/image: URL ໝົດອາຍຸ ແລະ ບໍ່ຢູ່ໃນ remotePatterns) */}
                <img
                  src={url}
                  alt={t("inbox.attachment.image")}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="max-h-60 rounded-lg"
                />
              </a>
              {/* ສະເພາະຮູບຂາເຂົ້າ: ຜູກເປັນສະລິບໄດ້ ຫຼື ສະແດງວ່າຜູກແລ້ວ */}
              {!out && onUseAsSlip ? (
                linkedIndexes?.has(index) ? (
                  <p className="mt-1 text-xs font-semibold text-success-ink">{t("slips.link.linked")}</p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    data-slip-opener={`${message.id}:${index}`}
                    onClick={() => onUseAsSlip(index)}
                  >
                    {t("slips.link.action")}
                  </Button>
                )
              ) : null}
            </div>
          ) : (
            <p key={index} className="mt-1 text-xs opacity-80">
              {t("inbox.attachment.file", { type: attachment.type })}
            </p>
          );
        })}
        <p className={cn("mt-1 flex flex-wrap items-center gap-x-2 text-[11px]", !failed && (out ? "text-white/80" : "text-ink-muted"))}>
          <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          {out && message.sentBy ? <span>{t("inbox.message.by", { name: message.sentBy.name })}</span> : null}
          {message.status === "PENDING" ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {t("inbox.message.pending")}
            </span>
          ) : null}
        </p>
        {failed ? (
          <p className="mt-1 flex items-start gap-1 text-xs font-semibold">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{`${t("inbox.message.failed")}: ${t(sendErrorKey(message.errorCode))}`}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

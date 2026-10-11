"use client";

import { type SocialPostStatus, isPostPublishError } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import type { Translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";

export const POST_STATUS_TONES: Record<SocialPostStatus, StatusTone> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  PUBLISHING: "warning",
  PUBLISHED: "success",
  FAILED: "danger",
};

export function PostStatusPill({ status }: { status: SocialPostStatus }) {
  const { t } = useT();
  return <StatusPill tone={POST_STATUS_TONES[status]}>{t(`posts.status.${status}`)}</StatusPill>;
}

/** ຂໍ້ຄວາມຂອງ errorCode ທີ່ຕົວໂພສບັນທຶກ */
export function publishErrorText(code: string | null, t: Translate): string {
  return isPostPublishError(code) ? t(`posts.publishError.${code}`) : t("posts.publishError.unknown");
}

"use client";

import type { CfOutcome, CfReplyStatus, LiveSessionStatus } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

const STATUS_TONES: Record<LiveSessionStatus, StatusTone> = {
  DRAFT: "neutral",
  LIVE: "danger",
  ENDED: "info",
};

const OUTCOME_TONES: Record<CfOutcome, StatusTone> = {
  ORDERED: "success",
  NO_MATCH: "neutral",
  OUT_OF_STOCK: "warning",
  LIMIT_REACHED: "warning",
  ERROR: "danger",
};

const REPLY_TONES: Record<CfReplyStatus, StatusTone> = {
  NONE: "neutral",
  SENDING: "info",
  SENT: "success",
  FAILED: "danger",
};

/** LIVE ເປັນສີແດງ ຄືປ້າຍ "ກຳລັງໄລຟ໌" ທົ່ວໄປ */
export function LiveStatusPill({ status }: { status: LiveSessionStatus }) {
  const { t } = useT();
  return <StatusPill tone={STATUS_TONES[status]}>{t(`live.status.${status}`)}</StatusPill>;
}

export function CfOutcomePill({ outcome }: { outcome: CfOutcome }) {
  const { t } = useT();
  return <StatusPill tone={OUTCOME_TONES[outcome]}>{t(`live.outcome.${outcome}`)}</StatusPill>;
}

export function CfReplyStatusPill({ status }: { status: CfReplyStatus }) {
  const { t } = useT();
  return <StatusPill tone={REPLY_TONES[status]}>{t(`live.reply.${status}`)}</StatusPill>;
}

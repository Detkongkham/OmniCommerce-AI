"use client";

import type { ProductStatus } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

const TONES: Record<ProductStatus, StatusTone> = { DRAFT: "neutral", ACTIVE: "success", ARCHIVED: "warning" };

export function ProductStatusPill({ status }: { status: ProductStatus }) {
  const { t } = useT();
  return <StatusPill tone={TONES[status]}>{t(`products.status.${status}`)}</StatusPill>;
}

import type { MemberTier } from "@oca/shared";
import type { StatusTone } from "@oca/ui";

export const TIER_TONE: Record<MemberTier, StatusTone> = {
  BRONZE: "neutral",
  SILVER: "info",
  GOLD: "warning",
  PLATINUM: "success",
};

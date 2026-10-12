import type { RfmSegment } from "@oca/shared";
import type { StatusTone } from "@oca/ui";

export const SEGMENT_TONE: Record<RfmSegment, StatusTone> = {
  CHAMPION: "success",
  LOYAL: "info",
  NEW: "info",
  AT_RISK: "warning",
  LOST: "neutral",
  REGULAR: "neutral",
};

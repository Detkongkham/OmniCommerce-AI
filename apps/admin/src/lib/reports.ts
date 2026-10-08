import { REPORT_MAX_DAYS } from "@oca/shared";

/** ຊ່ວງວັນທີຂອງລາຍງານ (YYYY-MM-DD ເວລາຮ້ານ, to ຮວມມື້ສຸດທ້າຍ) ຄືກັບ API */
export interface DateRange {
  from: string;
  to: string;
}

export const RANGE_PRESETS = ["last7", "last30", "thisMonth", "lastMonth"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const STORE_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ວັນທີປັດຈຸບັນຕາມເວລາຮ້ານ (ລາວ UTC+7) */
export function storeToday(now: Date = new Date()): string {
  return new Date(now.getTime() + STORE_OFFSET_MS).toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = storeToday(now);
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "last7":
      return { from: shift(today, -6), to: today };
    case "last30":
      return { from: shift(today, -29), to: today };
    case "thisMonth":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastDay = shift(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
  }
}

/** preset ທີ່ກົງກັບຊ່ວງ (ສຳລັບ aria-pressed); null = ກຳນົດເອງ */
export function matchPreset(range: DateRange, now: Date = new Date()): RangePreset | null {
  return RANGE_PRESETS.find((preset) => {
    const candidate = presetRange(preset, now);
    return candidate.from === range.from && candidate.to === range.to;
  }) ?? null;
}

/** ຊ່ວງທີ່ API ຍອມ: ຮູບແບບຖືກ, from ≤ to, ບໍ່ເກີນ REPORT_MAX_DAYS ມື້ */
export function isValidRange(range: DateRange): boolean {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(range.from) || !pattern.test(range.to)) return false;
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return false;
  return (end - start) / DAY_MS + 1 <= REPORT_MAX_DAYS;
}

/** ວິນາທີ → "m:ss" ຫຼື "h:mm:ss"; null → "—" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "2026-10-05" → "05/10" (ແກນກາຟ) */
export function shortDay(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

import type { LiveSessionStatus, SocialPostStatus } from "@oca/shared";
import { API_BASE } from "./api";

// ---------------------------------------------------------------------------
// DTO ຂອງ Social Posting (ຕົງກັບ apps/api/src/modules/posting/posting.mapper.ts)
// ---------------------------------------------------------------------------
export interface MediaFileDto {
  id: string;
  path: string;
  mimeType: string;
  size: number;
  originalName: string;
}

export interface SocialPostMediaDto {
  id: string;
  position: number;
  mediaFileId: string | null;
  url: string;
}

export interface SocialPostDto {
  id: string;
  message: string;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  permalinkUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  cfLinkError: string | null;
  liveSession: { id: string; title: string; status: LiveSessionStatus } | null;
  media: SocialPostMediaDto[];
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** path ຂອງໄຟລ໌ທີ່ອັບໂຫຼດ (/media/files/…) ໄປຜ່ານ proxy /api; URL ພາຍນອກໃຊ້ຕາມເດີມ */
export function mediaSrc(url: string): string {
  return url.startsWith("/media/") ? `${API_BASE}${url}` : url;
}

// ---------------------------------------------------------------------------
// ເວລາລາວ (Asia/Vientiane = UTC+7 ຕະຫຼອດປີ, ບໍ່ມີ DST)
// ---------------------------------------------------------------------------
const LAOS_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

/** ຄ່າຂອງ `<input type="datetime-local">` (YYYY-MM-DDTHH:mm ເວລາລາວ) → ISO; ຮູບແບບຜິດ = null */
export function laosLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi) - LAOS_OFFSET_MS;
  const check = new Date(utc + LAOS_OFFSET_MS);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc).toISOString();
}

/** ISO/Date → ຄ່າຂອງ datetime-local ເວລາລາວ */
export function toLaosLocal(value: string | Date): string {
  const date = new Date(new Date(value).getTime() + LAOS_OFFSET_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** ວັນທີ (YYYY-MM-DD) ຕາມເວລາລາວ */
export function laosDateKey(value: string | Date): string {
  return toLaosLocal(value).slice(0, 10);
}

/** HH:mm ເວລາລາວ */
export function laosTime(value: string | Date): string {
  return toLaosLocal(value).slice(11);
}

export interface MonthRef {
  year: number;
  /** 0–11 */
  month: number;
}

export function currentLaosMonth(now: Date = new Date()): MonthRef {
  const [year, month] = laosDateKey(now).split("-").map(Number) as [number, number];
  return { year, month: month - 1 };
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + ref.month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** ຊ່ວງ [from, to) ຂອງເດືອນ (ເວລາລາວ) ເປັນ ISO ສຳລັບ GET /posts */
export function monthRange(ref: MonthRef): { from: string; to: string } {
  const next = shiftMonth(ref, 1);
  return {
    from: new Date(Date.UTC(ref.year, ref.month, 1) - LAOS_OFFSET_MS).toISOString(),
    to: new Date(Date.UTC(next.year, next.month, 1) - LAOS_OFFSET_MS).toISOString(),
  };
}

export interface CalendarDay {
  key: string;
  day: number;
  inMonth: boolean;
}

/** ຕາຕະລາງ 6 ອາທິດ (ເລີ່ມວັນຈັນ) ຂອງເດືອນ */
export function monthGrid(ref: MonthRef): CalendarDay[] {
  const first = new Date(Date.UTC(ref.year, ref.month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // ວັນຈັນ = 0
  const start = first.getTime() - lead * 86_400_000;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return {
      key: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === ref.month,
    };
  });
}

/** ເວລາທີ່ໂພສຢູ່ໃນປະຕິທິນ: ເວລາທີ່ຂຶ້ນເພຈ ຫຼື ເວລາທີ່ຕັ້ງ; ຮ່າງ = null */
export function postCalendarTime(post: Pick<SocialPostDto, "publishedAt" | "scheduledAt">): string | null {
  return post.publishedAt ?? post.scheduledAt;
}

/** ຈັດກຸ່ມໂພສຕາມວັນ (ເວລາລາວ) ລຽງຕາມເວລາ */
export function groupPostsByDay<T extends Pick<SocialPostDto, "publishedAt" | "scheduledAt">>(posts: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  const timed = posts
    .map((post) => ({ post, time: postCalendarTime(post) }))
    .filter((entry): entry is { post: T; time: string } => entry.time !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
  for (const { post, time } of timed) {
    const key = laosDateKey(time);
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return groups;
}

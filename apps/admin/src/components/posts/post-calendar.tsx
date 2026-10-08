"use client";

import { Button, Card, EmptyState, Skeleton, cn } from "@oca/ui";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { type MonthRef, currentLaosMonth, groupPostsByDay, laosDateKey, laosTime, monthGrid, monthRange, postCalendarTime, shiftMonth } from "@/lib/posts";
import { usePosts } from "@/lib/queries-posts";
import { POST_STATUS_TONES } from "./post-status";

/** ສະແດງໃນແຕ່ລະວັນ; ເກີນ = "+N" */
const MAX_PER_DAY = 3;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const TONE_CLASSES = {
  neutral: "border-line bg-subtle text-ink-secondary",
  info: "border-info-line bg-info-soft text-info-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  success: "border-success-line bg-success-soft text-success-ink",
  danger: "border-danger-line bg-danger-soft text-danger-ink",
  brand: "border-brand-soft-line bg-brand-soft text-brand-ink",
} as const;

/** ປະຕິທິນເດືອນ (ເວລາລາວ): ໂພສທີ່ຕັ້ງເວລາ/ໂພສແລ້ວ ວາງຕາມວັນ; ຄລິກເປີດໂພສ */
export function PostCalendar() {
  const { t } = useT();
  const [month, setMonth] = useState<MonthRef>(() => currentLaosMonth());
  const range = monthRange(month);
  // ປະຕິທິນບໍ່ແບ່ງໜ້າ: 100 ໂພສຕໍ່ເດືອນພໍສຳລັບຮ້ານດຽວ (ຂີດສູງສຸດຂອງ API)
  const query = usePosts({ from: range.from, to: range.to, page: 1, pageSize: 100 });
  const byDay = useMemo(() => groupPostsByDay(query.data?.items ?? []), [query.data]);
  const days = monthGrid(month);
  const today = laosDateKey(new Date());
  const monthLabel = `${t(`posts.month.${month.month}` as TranslationKey)} ${month.year}`;

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-6">
        <h2 className="text-base font-bold text-ink" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-9 rounded-lg" aria-label={t("posts.calendar.prev")} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" className="h-9 rounded-lg" onClick={() => setMonth(currentLaosMonth())}>
            {t("posts.calendar.today")}
          </Button>
          <Button variant="ghost" size="icon" className="size-9 rounded-lg" aria-label={t("posts.calendar.next")} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {query.isError ? (
        <EmptyState
          icon={AlertCircle}
          title={t("common.error.load")}
          action={
            <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto px-3 pb-4 sm:px-6">
          <div role="grid" aria-label={t("posts.calendar.label", { month: monthLabel })} aria-busy={query.isPending} className="min-w-[640px]">
            <div role="row" className="grid grid-cols-7 border-b border-line">
              {WEEKDAYS.map((day) => (
                <div key={day} role="columnheader" className="py-2 text-center text-xs font-semibold text-ink-secondary">
                  {t(`posts.calendar.weekday.${day}`)}
                </div>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((week) => (
              <div key={week} role="row" className="grid grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const posts = byDay.get(day.key) ?? [];
                  return (
                    <div
                      key={day.key}
                      role="gridcell"
                      data-testid={`day-${day.key}`}
                      aria-label={posts.length > 0 ? t("posts.calendar.dayPosts", { date: day.key, count: posts.length }) : undefined}
                      className={cn("min-h-24 border-b border-r border-line p-1.5 first:border-l", !day.inMonth && "bg-subtle/60")}
                    >
                      <p
                        className={cn(
                          "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                          day.inMonth ? "text-ink" : "text-ink-muted",
                          day.key === today && "bg-brand font-bold text-white",
                        )}
                      >
                        {day.day}
                      </p>
                      {query.isPending && day.inMonth ? <Skeleton className="h-4 w-full rounded" /> : null}
                      <ul className="space-y-1">
                        {posts.slice(0, MAX_PER_DAY).map((post) => {
                          const time = postCalendarTime(post);
                          return (
                            <li key={post.id}>
                              <Link
                                href={`/posts/${post.id}`}
                                title={post.message}
                                className={cn(
                                  "block truncate rounded-md border px-1.5 py-0.5 text-[11px] leading-4 hover:underline",
                                  TONE_CLASSES[POST_STATUS_TONES[post.status]],
                                )}
                              >
                                <span className="tabular-nums">{time ? laosTime(time) : ""}</span>{" "}
                                <span className="sr-only">{t(`posts.status.${post.status}`)} </span>
                                {post.message || t("posts.noText")}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                      {posts.length > MAX_PER_DAY ? (
                        <p className="mt-1 text-[11px] text-ink-muted">{t("posts.calendar.more", { count: posts.length - MAX_PER_DAY })}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

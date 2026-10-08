"use client";

import { Button, EmptyState, Skeleton, buttonVariants, cn, toast } from "@oca/ui";
import { AlertCircle, ImageOff, LogOut, Radio, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useLiveHost, useSetFeatured } from "@/lib/queries";
import type { HostItemDto, HostItemLevel, HostSnapshotDto } from "@/lib/types";
import { useLiveRealtime } from "@/lib/use-live-realtime";
import type { StreamStatus } from "@/lib/event-stream";

const LEVEL_CLASS: Record<HostItemLevel, string> = {
  OK: "border-line",
  LOW: "border-warning bg-warning-soft",
  SOLD_OUT: "border-danger bg-danger-soft opacity-80",
};

const OUTCOME_CLASS: Record<string, string> = {
  ORDERED: "text-success-ink",
  OUT_OF_STOCK: "text-danger-ink",
  LIMIT_REACHED: "text-warning-ink",
  ERROR: "text-danger-ink",
  NO_MATCH: "text-ink-muted",
};

/** ເວລາທີ່ຜ່ານໄປ h:mm:ss ຫຼື mm:ss */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

function ExitLink({ id }: { id: string }) {
  const { t } = useT();
  return (
    <Link href={`/live/${id}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-1.5 rounded-xl px-4")}>
      <LogOut className="size-4" aria-hidden="true" />
      {t("host.exit")}
    </Link>
  );
}

/** ໜ້າຈໍເຕັມສຳລັບຄົນທີ່ກຳລັງ Live (ພື້ນມືດສະເໝີ, ຕົວໜັງສືໃຫຍ່ ອ່ານໄກ 2–3 ແມັດ). SSE ຕອນ LIVE + poll ສຳຮອງ */
export function HostScreen({ id }: { id: string }) {
  const { t } = useT();
  const [live, setLive] = useState(false);
  const realtime = useLiveRealtime(id, live);
  const query = useLiveHost(id, { poll: realtime !== "connected" });
  const isLive = query.data?.session.status === "LIVE";
  if (isLive !== live) setLive(isLive);

  let content;
  if (!query.data) {
    if (query.isError) {
      const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.code === "LIVE_SESSION_NOT_FOUND");
      content = (
        <EmptyState
          icon={AlertCircle}
          title={notFound ? t("live.detail.notFound") : t("common.error.load")}
          description={notFound ? undefined : errorMessage(query.error, t)}
          action={
            notFound ? (
              <Link href="/live" className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
                {t("live.detail.back")}
              </Link>
            ) : (
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            )
          }
        />
      );
    } else {
      content = (
        <div role="status" aria-busy="true" aria-label={t("host.loading")} className="space-y-4 p-6">
          <Skeleton className="h-16 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
  } else {
    content = <HostBody snapshot={query.data} realtime={realtime} stale={query.isRefetchError} />;
  }

  return <div className="dark min-h-screen bg-app text-ink">{content}</div>;
}

function HostBody({ snapshot, realtime, stale }: { snapshot: HostSnapshotDto; realtime: StreamStatus; stale: boolean }) {
  const { t } = useT();
  const canWrite = useCan("live-cf:write");
  const feature = useSetFeatured();
  const { session, items, totals, recent } = snapshot;
  const live = session.status === "LIVE";
  const now = useNow(live);
  const featured = items.find((item) => item.id === session.featuredItemId) ?? null;
  const canFeature = canWrite && session.status !== "ENDED";

  async function choose(item: HostItemDto) {
    if (feature.isPending || item.id === session.featuredItemId) return;
    try {
      await feature.mutateAsync({ sessionId: session.id, itemId: item.id });
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-danger px-3 py-1 text-sm font-bold text-white">
              <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
              LIVE
            </span>
          ) : null}
          <h1 className="truncate text-2xl font-bold lg:text-3xl">{session.title}</h1>
          {live && session.startedAt ? (
            <span className="text-lg tabular-nums text-ink-secondary">
              {t("host.elapsed", { time: formatElapsed(now - new Date(session.startedAt).getTime()) })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {live ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
              {realtime === "connected" ? (
                <Radio className="size-4 text-success" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              {realtime === "connected" ? t("live.realtime.connected") : t("live.realtime.reconnecting")}
            </span>
          ) : null}
          <ExitLink id={session.id} />
        </div>
      </header>

      {session.status === "DRAFT" ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-lg text-warning-ink">{t("host.notStarted")}</p>
      ) : null}
      {session.status === "ENDED" ? (
        <p className="rounded-xl border border-info-line bg-info-soft px-4 py-3 text-lg text-info-ink">{t("host.ended")}</p>
      ) : null}
      {stale ? (
        <p role="status" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
          {t("live.detail.stale")}
        </p>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <FeaturedPanel item={featured} canFeature={canFeature} />
          <section aria-label={t("host.totals")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("host.totals.buyers")} value={formatQuantity(totals.buyers)} />
            <Stat label={t("host.totals.orders")} value={formatQuantity(totals.orders)} />
            <Stat label={t("host.totals.reserved")} value={formatMoney(totals.reservedAmount)} />
            <Stat label={t("host.totals.paid")} value={formatMoney(totals.paidAmount)} />
          </section>
        </div>
        <Feed recent={recent} />
      </div>

      <section aria-label={t("host.codes")}>
        <h2 className="mb-2 text-lg font-bold text-ink-secondary">{t("host.codes")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((item) => {
            const selected = item.id === session.featuredItemId;
            const body = <CodeCardBody item={item} />;
            const className = cn(
              "rounded-2xl border-2 bg-surface p-4 text-left",
              LEVEL_CLASS[item.level],
              selected && "ring-4 ring-brand",
            );
            return canFeature ? (
              <button
                key={item.id}
                type="button"
                className={cn(className, "transition hover:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand")}
                aria-label={`${t("host.feature", { code: item.code })}: ${item.productName}`}
                aria-pressed={selected}
                disabled={feature.isPending}
                onClick={() => void choose(item)}
              >
                {body}
              </button>
            ) : (
              <div key={item.id} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function remainingText(item: HostItemDto, t: ReturnType<typeof useT>["t"]): string {
  return item.remaining === null ? t("host.unlimited") : t("host.remaining", { count: formatQuantity(item.remaining) });
}

function LevelBadge({ level, large = false }: { level: HostItemLevel; large?: boolean }) {
  const { t } = useT();
  if (level === "OK") return null;
  return (
    <span
      className={cn(
        "rounded-full font-bold",
        large ? "px-4 py-1 text-xl" : "px-2 py-0.5 text-xs",
        level === "SOLD_OUT" ? "bg-danger text-white" : "bg-warning text-black",
      )}
    >
      {t(`host.level.${level}`)}
    </span>
  );
}

function FeaturedPanel({ item, canFeature }: { item: HostItemDto | null; canFeature: boolean }) {
  const { t } = useT();
  return (
    <section aria-label={t("host.featured.label")} className="rounded-3xl border border-line bg-surface p-5 lg:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t("host.featured.label")}</p>
      {item ? (
        <div className="mt-3 flex flex-col gap-5 sm:flex-row">
          <div className="flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-subtle sm:w-56 lg:w-72">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.productName} className="size-full object-cover" />
            ) : (
              <ImageOff className="size-12 text-ink-muted" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <p className="font-mono text-6xl font-black leading-none text-brand-ink lg:text-8xl">{item.code}</p>
            <p className="text-3xl font-bold lg:text-4xl">{item.productName}</p>
            {item.variantName ? <p className="text-xl text-ink-secondary">{item.variantName}</p> : null}
            <p className="text-4xl font-bold tabular-nums lg:text-5xl">{formatMoney(item.price)}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-2xl font-semibold tabular-nums">{remainingText(item, t)}</span>
              <LevelBadge level={item.level} large />
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-2xl text-ink-secondary">{canFeature ? t("host.featured.none") : t("host.featured.noneReadOnly")}</p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CodeCardBody({ item }: { item: HostItemDto }) {
  const { t } = useT();
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-mono text-3xl font-black">{item.code}</span>
        <LevelBadge level={item.level} />
      </span>
      <span className="mt-1 block truncate text-base font-medium">{item.productName}</span>
      <span className="mt-2 block text-lg font-semibold tabular-nums">{remainingText(item, t)}</span>
      <span className="block text-xs text-ink-secondary">
        {t("host.claimed", { count: formatQuantity(item.claimed) })}
        {item.limit !== null ? ` · ${t("host.limit", { count: formatQuantity(item.limit) })}` : ""}
        {item.stockAvailable !== null ? ` · ${t("host.stock", { count: formatQuantity(item.stockAvailable) })}` : ""}
      </span>
    </>
  );
}

function Feed({ recent }: { recent: HostSnapshotDto["recent"] }) {
  const { t } = useT();
  const latest = recent[0];
  return (
    <section aria-label={t("host.feed.title")} className="flex min-h-0 flex-col rounded-3xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink-secondary">{t("host.feed.title")}</h2>
      {/* ປະກາດສະເພາະອັນໃໝ່ສຸດ (ບໍ່ອ່ານທັງລາຍການທຸກຄັ້ງທີ່ refetch) */}
      <p aria-live="polite" className="sr-only">
        {latest ? t("host.feed.latest", { name: latest.authorName, message: latest.message }) : ""}
      </p>
      {recent.length === 0 ? (
        <p className="mt-4 text-xl text-ink-muted">{t("host.feed.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2 overflow-y-auto">
          {recent.map((row) => (
            <li key={row.id} className="rounded-xl bg-subtle px-3 py-2">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xl font-bold">{row.authorName}</span>
                <span className={cn("shrink-0 text-sm font-semibold", OUTCOME_CLASS[row.outcome])}>{t(`live.outcome.${row.outcome}`)}</span>
              </span>
              <span className="block truncate text-base text-ink-secondary">{row.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

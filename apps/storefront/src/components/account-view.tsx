"use client";

import { Button, Skeleton, StatusPill, cn } from "@oca/ui";
import { Award, LogOut } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ClientApiError, fetchMember, fetchMemberOrders, fetchMemberPoints, isMemberRequired, memberLogout } from "@/lib/client-api";
import { formatDate, formatLak, formatPoints } from "@/lib/format";
import { pointTypeLabel, pointsValue, tierLabel, tierProgress } from "@/lib/member";
import { apiMessage } from "@/lib/messages";
import { orderStatusLabel } from "@/lib/order-status";
import type { Page, StoreLoyalty, StoreMember, StoreMemberOrder, StoreMemberPoint } from "@/lib/types";
import { MemberLoginForm } from "./member-login-form";

type AccountState =
  | { status: "loading" }
  | { status: "guest"; expired?: boolean }
  | { status: "member"; member: StoreMember }
  | { status: "error"; code: string | undefined };

function Panel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4", className)}>
      <h2 className="text-base font-semibold text-ink">{label}</h2>
      {children}
    </section>
  );
}

/** ໜ້າບັນຊີ: ເຂົ້າສູ່ລະບົບ (guest) ຫຼື ແຕ້ມ/ລະດັບ/ປະຫວັດ (ສະມາຊິກ). ຂໍ້ມູນທັງໝົດຖາມຈາກ browser ຜ່ານ proxy */
export function AccountView({ loyalty }: { loyalty: StoreLoyalty }) {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMember().then(
      (member) => {
        if (!cancelled) setState({ status: "member", member });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (isMemberRequired(error)) setState({ status: "guest" });
        else setState({ status: "error", code: error instanceof ClientApiError ? error.code : undefined });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const expire = useCallback(() => setState({ status: "guest", expired: true }), []);

  if (state.status === "loading") {
    return (
      <div role="status" aria-label="ກຳລັງໂຫຼດ" className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger-line bg-danger-soft p-6 text-center">
        <p className="text-sm text-danger-ink">{apiMessage(state.code, "ໂຫຼດຂໍ້ມູນບັນຊີບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່")}</p>
        <Button
          variant="outlineDanger"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          ລອງໃໝ່
        </Button>
      </div>
    );
  }
  if (state.status === "guest") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {state.expired ? (
          <p role="status" className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່
          </p>
        ) : null}
        <MemberLoginForm onSignedIn={(member) => setState({ status: "member", member })} />
      </div>
    );
  }
  return <MemberDashboard member={state.member} loyalty={loyalty} onSignedOut={() => setState({ status: "guest" })} onExpired={expire} />;
}

// ຢູ່ນອກ component: HistoryList ໃຊ້ເປັນ dependency ຂອງການໂຫຼດ (ຕ້ອງຄົງທີ່)
const orderKey = (order: StoreMemberOrder) => order.orderNumber;
const pointKey = (entry: StoreMemberPoint) => `${entry.createdAt}|${entry.type}|${entry.points}|${entry.balanceAfter}|${entry.orderNumber ?? ""}`;

function MemberDashboard({
  member,
  loyalty,
  onSignedOut,
  onExpired,
}: {
  member: StoreMember;
  loyalty: StoreLoyalty;
  onSignedOut: () => void;
  onExpired: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const signOut = async () => {
    setSigningOut(true);
    setLogoutError(null);
    try {
      await memberLogout();
      onSignedOut();
    } catch (error) {
      setLogoutError(apiMessage(error instanceof ClientApiError ? error.code : undefined, "ອອກຈາກລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{member.name}</p>
          {member.phone ? <p className="text-sm text-ink-secondary">{member.phone}</p> : null}
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => void signOut()} loading={signingOut}>
          <LogOut aria-hidden="true" />
          ອອກຈາກລະບົບ
        </Button>
      </div>
      {logoutError ? (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {logoutError}
        </p>
      ) : null}

      {loyalty.enabled ? <LoyaltySummary member={member} pointValue={loyalty.pointValue} /> : null}

      <HistoryList<StoreMemberOrder>
        label="ປະຫວັດການສັ່ງຊື້"
        empty="ຍັງບໍ່ມີການສັ່ງຊື້"
        load={fetchMemberOrders}
        onExpired={onExpired}
        itemKey={orderKey}
        renderItem={(order) => <OrderRow order={order} />}
      />
      {loyalty.enabled ? (
        <HistoryList<StoreMemberPoint>
          label="ປະຫວັດແຕ້ມ"
          empty="ຍັງບໍ່ມີລາຍການແຕ້ມ"
          load={fetchMemberPoints}
          onExpired={onExpired}
          itemKey={pointKey}
          renderItem={(entry) => <PointRow entry={entry} />}
        />
      ) : null}
    </div>
  );
}

function LoyaltySummary({ member, pointValue }: { member: StoreMember; pointValue: string }) {
  const progress = tierProgress(member);
  const next = member.nextTier;
  const qualified = next !== null && Number(next.remaining) <= 0;
  const progressText = !next
    ? ""
    : qualified
      ? `ຈະຂຶ້ນເປັນ ${tierLabel(next.tier)} ໃນການຄຳນວນຮອບຕໍ່ໄປ`
      : `ຊື້ອີກ ${formatLak(next.remaining)} ເພື່ອຂຶ້ນເປັນ ${tierLabel(next.tier)}`;
  return (
    <Panel label="ແຕ້ມສະສົມ">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-brand-ink">{formatPoints(member.pointsBalance)}</p>
          <p className="text-sm text-ink-secondary">{`ມູນຄ່າ ${formatLak(pointsValue(member.pointsBalance, pointValue))}`}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-ink">
          <Award className="size-4" aria-hidden="true" />
          {`ລະດັບ ${tierLabel(member.tier)}`}
          <span className="font-normal text-ink-secondary">{`· ແຕ້ມ ×${member.pointsMultiplier}`}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-sm text-ink-secondary">{`ຍອດຊື້ 12 ເດືອນ ${formatLak(member.spend12m)}`}</p>
        {next && progress !== null ? (
          <>
            <div
              role="progressbar"
              aria-label={`ຄວາມຄືບໜ້າສູ່ລະດັບ ${tierLabel(next.tier)}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={`${progress}% — ${progressText}`}
              className="h-2 w-full overflow-hidden rounded-full bg-subtle"
            >
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-ink">{progressText}</p>
          </>
        ) : (
          <p className="text-sm text-ink">ທ່ານຢູ່ລະດັບສູງສຸດແລ້ວ</p>
        )}
      </div>
    </Panel>
  );
}

function OrderRow({ order }: { order: StoreMemberOrder }) {
  const status = orderStatusLabel(order.status);
  const body = (
    <>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{order.orderNumber}</p>
        <p className="text-xs text-ink-secondary">{formatDate(order.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-ink">{formatLak(order.total)}</span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
    </>
  );
  const row = "flex items-start justify-between gap-3 rounded-xl px-2 py-2 text-sm";
  return order.token ? (
    <Link
      href={`/orders/${order.token}`}
      className={cn(row, "transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}

function PointRow({ entry }: { entry: StoreMemberPoint }) {
  return (
    <div className="flex items-start justify-between gap-3 px-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-ink">{pointTypeLabel(entry.type)}</p>
        <p className="text-xs text-ink-secondary">{[formatDate(entry.createdAt), entry.orderNumber].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className={cn("font-semibold", entry.points >= 0 ? "text-success-ink" : "text-danger-ink")}>
          {entry.points > 0 ? `+${formatPoints(entry.points)}` : formatPoints(entry.points)}
        </span>
        <span className="text-xs text-ink-secondary">{`ຄົງເຫຼືອ ${formatPoints(entry.balanceAfter)}`}</span>
      </div>
    </div>
  );
}

export function appendUnique<T>(current: T[], next: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key));
  return [...current, ...next.filter((item) => !seen.has(key(item)))];
}

type ListState<T> = { items: T[]; page: number; total: number; loading: boolean; error: string | null };

/** ລາຍການແບບແບ່ງໜ້າ: ໂຫຼດໜ້າ 1 ຕອນເປີດ ແລ້ວ "ໂຫຼດເພີ່ມ" ຕໍ່ທ້າຍ. session ໝົດອາຍຸ → `onExpired` */
function HistoryList<T>({
  label,
  empty,
  load,
  onExpired,
  itemKey,
  renderItem,
}: {
  label: string;
  empty: string;
  load: (page: number) => Promise<Page<T>>;
  onExpired: () => void;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const [list, setList] = useState<ListState<T>>({ items: [], page: 0, total: 0, loading: true, error: null });

  const fetchPage = useCallback(
    (page: number) => {
      load(page).then(
        (result) =>
          setList((current) => ({
            // ລາຍການໃໝ່ທີ່ເກີດລະຫວ່າງໂຫຼດ ເລື່ອນແຖວເກົ່າໄປໜ້າຖັດໄປ → ຕັດແຖວຊ້ຳ
            items: page === 1 ? result.items : appendUnique(current.items, result.items, itemKey),
            page: result.page,
            total: result.total,
            loading: false,
            error: null,
          })),
        (error: unknown) => {
          if (isMemberRequired(error)) {
            onExpired();
            return;
          }
          const message = apiMessage(error instanceof ClientApiError ? error.code : undefined, "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່");
          setList((current) => ({ ...current, loading: false, error: message }));
        },
      );
    },
    [load, onExpired, itemKey],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // page 0 = ໜ້າທຳອິດຍັງໂຫຼດບໍ່ສຳເລັດ → ລອງໜ້າ 1 ໃໝ່
  const more = () => {
    setList((current) => ({ ...current, loading: true, error: null }));
    fetchPage(list.page + 1);
  };

  return (
    <Panel label={label}>
      {list.items.length > 0 ? (
        <ul className="-mx-2 flex flex-col divide-y divide-line">
          {list.items.map((item) => (
            <li key={itemKey(item)}>{renderItem(item)}</li>
          ))}
        </ul>
      ) : !list.loading && !list.error ? (
        <p className="text-sm text-ink-secondary">{empty}</p>
      ) : null}
      {list.loading && list.items.length === 0 ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
      {list.error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          <span>{list.error}</span>
          <Button variant="outlineDanger" size="sm" onClick={more}>
            ລອງໃໝ່
          </Button>
        </div>
      ) : null}
      {!list.error && list.items.length < list.total ? (
        <Button variant="outlinePrimary" className="self-center rounded-xl" loading={list.loading} onClick={more}>
          ໂຫຼດເພີ່ມ
        </Button>
      ) : null}
    </Panel>
  );
}

"use client";

import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  cn,
} from "@oca/ui";
import { AlertCircle, ArrowLeft, Combine, MessageSquare, Pencil } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { OrderStatusPill } from "@/components/orders/order-status";
import { ApiError } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomer, useCrmCustomerConversations, useCrmCustomerOrders } from "@/lib/queries";
import type { CrmCustomerDetailDto } from "@/lib/types";
import { CustomerEditDialog } from "./customer-edit-dialog";
import { MergeCustomerDialog } from "./merge-customer-dialog";
import { SEGMENT_TONE } from "./segment";

const TAB_IDS = ["orders", "conversations"] as const;
type TabId = (typeof TAB_IDS)[number];

/** Customer 360: ຂໍ້ມູນ, ສະຖິຕິ, RFM, ບິນ ແລະ ແຊັດ ຂອງລູກຄ້າຄົນດຽວ */
export function CustomerDetail({ id }: { id: string }) {
  const { t } = useT();
  const canWrite = useCan("crm:write");
  const query = useCrmCustomer(id);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const back = (
    <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("customers.detail.back")}
    </Link>
  );

  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="px-3 py-10 sm:px-6">
        <EmptyState
          icon={AlertCircle}
          title={missing ? t("customers.detail.notFound") : t("common.error.load")}
          action={
            missing ? (
              back
            ) : (
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <p role="status" className="px-3 py-10 text-sm text-ink-secondary sm:px-6">
        {t("common.loading")}
      </p>
    );
  }
  const customer = query.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("customers.title"), customer.name]}
        title={customer.name}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMergeOpen(true)}>
                <Combine aria-hidden="true" />
                {t("customers.merge")}
              </Button>
              <Button className="rounded-xl" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" />
                {t("customers.edit")}
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {back}
          {customer.segment ? (
            <StatusPill tone={SEGMENT_TONE[customer.segment]}>{t(`customers.segment.${customer.segment}`)}</StatusPill>
          ) : (
            <StatusPill>{t("customers.never")}</StatusPill>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Section id="customer-profile" title={t("customers.detail.profile")}>
            <dl className="space-y-2 text-sm">
              <Row label={t("customers.detail.phone")} value={customer.phone} />
              <Row label={t("customers.detail.email")} value={customer.email} />
              <Row label={t("customers.detail.since")} value={formatDateTime(customer.createdAt)} />
              <Row label={t("customers.detail.note")} value={customer.note} />
            </dl>
            {customer.facebookLinked ? <p className="mt-3 text-xs font-medium text-ink-secondary">{t("customers.detail.facebook")}</p> : null}
          </Section>
          <Section id="customer-stats" title={t("customers.detail.stats")}>
            <dl className="space-y-2 text-sm">
              <Row label={t("customers.detail.totalSpent")} value={formatMoney(customer.totalSpent)} strong />
              <Row label={t("customers.detail.orderCount")} value={String(customer.orderCount)} />
              <Row label={t("customers.detail.averageOrder")} value={formatMoney(customer.averageOrder)} />
              <Row label={t("customers.detail.lastPaid")} value={customer.lastPaidAt ? formatDateTime(customer.lastPaidAt) : null} />
              <Row label={t("customers.detail.firstPaid")} value={customer.firstPaidAt ? formatDateTime(customer.firstPaidAt) : null} />
              <Row label={t("customers.detail.openOrders")} value={String(customer.openOrderCount)} />
            </dl>
          </Section>
          <Section id="customer-rfm" title={t("customers.detail.rfm")}>
            {customer.rfm ? (
              <>
                <dl className="space-y-2 text-sm">
                  <Row label={t("customers.detail.rfm.recency")} value={String(customer.rfm.recency)} strong />
                  <Row label={t("customers.detail.rfm.frequency")} value={String(customer.rfm.frequency)} strong />
                  <Row label={t("customers.detail.rfm.monetary")} value={String(customer.rfm.monetary)} strong />
                </dl>
                <p className="mt-3 text-xs text-ink-muted">{t("customers.detail.rfmHint")}</p>
              </>
            ) : (
              <p className="text-sm text-ink-secondary">{t("customers.never")}</p>
            )}
          </Section>
        </div>

        <HistoryTabs customer={customer} />
      </div>
      {canWrite ? (
        <>
          <CustomerEditDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
          <MergeCustomerDialog target={customer} open={mergeOpen} onOpenChange={setMergeOpen} />
        </>
      ) : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card className="rounded-[20px] p-6">
      <section aria-labelledby={id}>
        <h2 id={id} className="mb-3 text-base font-bold text-ink">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ink-secondary">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right tabular-nums text-ink", strong && "font-semibold")}>{value ?? t("customers.detail.none")}</dd>
    </div>
  );
}

function HistoryTabs({ customer }: { customer: CrmCustomerDetailDto }) {
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("orders");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  // ຈຳນວນບິນທັງໝົດ (ທຸກສະຖານະ) ມາຈາກ response ຂອງແຖບບິນ; ກ່ອນໂຫຼດແລ້ວໃຊ້ຈຳນວນທີ່ຮູ້
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const counts: Record<TabId, number> = { orders: orderTotal ?? customer.orderCount + customer.openOrderCount, conversations: customer.conversationCount };

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TAB_IDS[(index + step + TAB_IDS.length) % TAB_IDS.length] ?? "orders";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div role="tablist" aria-label={t("customers.detail.tabs")} className="flex gap-1 border-b border-line px-3 sm:px-6">
        {TAB_IDS.map((id, index) => (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            type="button"
            role="tab"
            id={`customer-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`customer-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === id ? "border-brand text-brand-ink" : "border-transparent text-ink-secondary hover:text-ink",
            )}
          >
            {t(`customers.detail.tab.${id}`, { count: counts[id] })}
          </button>
        ))}
      </div>
      {TAB_IDS.map((id) => (
        <div key={id} role="tabpanel" id={`customer-panel-${id}`} aria-labelledby={`customer-tab-${id}`} hidden={tab !== id}>
          {tab === id ? id === "orders" ? <OrdersPanel customerId={customer.id} onTotal={setOrderTotal} /> : <ConversationsPanel customerId={customer.id} /> : null}
        </div>
      ))}
    </Card>
  );
}

function OrdersPanel({ customerId, onTotal }: { customerId: string; onTotal: (total: number) => void }) {
  const { t } = useT();
  const canOpenOrder = useCan("orders:read");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useCrmCustomerOrders(customerId, { page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  // ບອກຈຳນວນບິນຈິງໃຫ້ປ້າຍແຖບ (state ຂອງ component ແມ່: ຕ້ອງຢູ່ໃນ effect ບໍ່ແມ່ນລະຫວ່າງ render)
  const loadedTotal = query.data?.total;
  useEffect(() => {
    if (loadedTotal !== undefined) onTotal(loadedTotal);
  }, [loadedTotal, onTotal]);

  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("common.error.load")}
        action={
          <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  return (
    <>
      <Table aria-label={t("customers.detail.orders.table")} aria-busy={query.isPending}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">{t("orders.col.number")}</TableHead>
            <TableHead scope="col">{t("orders.col.channel")}</TableHead>
            <TableHead scope="col">{t("orders.col.status")}</TableHead>
            <TableHead scope="col" className="text-right">
              {t("orders.col.total")}
            </TableHead>
            <TableHead scope="col">{t("orders.col.created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isPending ? <TableSkeletonRows columns={5} /> : null}
          {rows.map((order) => (
            <TableRow key={order.id} data-testid={`row-customer-order-${order.id}`}>
              <th scope="row" className="px-4 py-3 text-left font-mono font-semibold">
                {canOpenOrder ? (
                  <Link href={`/orders/${order.id}`} className="text-brand-ink hover:underline">
                    {order.orderNumber}
                  </Link>
                ) : (
                  <span className="text-ink">{order.orderNumber}</span>
                )}
              </th>
              <TableCell className="text-ink-secondary">{t(`orders.channel.${order.channel}`)}</TableCell>
              <TableCell>
                <OrderStatusPill status={order.status} />
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(order.total)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(order.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!query.isPending && rows.length === 0 ? (
        <div role="status">
          <EmptyState icon={AlertCircle} title={t("customers.detail.orders.empty")} />
        </div>
      ) : null}
      <ServerPager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </>
  );
}

function ConversationsPanel({ customerId }: { customerId: string }) {
  const { t } = useT();
  const canOpenChat = useCan("inbox:read");
  const query = useCrmCustomerConversations(customerId);
  const rows = query.data ?? [];
  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("common.error.load")}
        action={
          <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (query.isPending) {
    return (
      <p role="status" className="px-6 py-6 text-sm text-ink-secondary">
        {t("common.loading")}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div role="status">
        <EmptyState icon={MessageSquare} title={t("customers.detail.conversations.empty")} />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((conversation) => (
        <li key={conversation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="font-medium text-ink">{conversation.displayName}</p>
            <p className="truncate text-sm text-ink-secondary">{conversation.lastMessagePreview ?? t("customers.detail.none")}</p>
            <p className="text-xs tabular-nums text-ink-muted">
              {t(`orders.channel.${conversation.channel}`)} · {formatDateTime(conversation.lastMessageAt)}
            </p>
          </div>
          {canOpenChat ? (
            <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`} className="text-sm font-medium text-brand-ink hover:underline">
              {t("customers.detail.conversations.open")}
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

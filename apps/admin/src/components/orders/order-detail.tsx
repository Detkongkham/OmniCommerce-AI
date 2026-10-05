"use client";

import { Button, Card, EmptyState, PageHeader, Skeleton, buttonVariants, cn, toast } from "@oca/ui";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { ActionBusyError, errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type OrderAction, useOrder, useOrderAction, useOrderSnapshot } from "@/lib/queries";
import type { OrderDetailDto } from "@/lib/types";
import { formatCountdown, useCountdown } from "@/lib/use-countdown";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { OrderItemsCard } from "./order-items-card";
import { OrderMovementsCard } from "./order-movements-card";
import { OrderStatusPill } from "./order-status";
import { OrderTimeline } from "./order-timeline";

const NEXT_STEP: Partial<Record<OrderDetailDto["status"], { action: OrderAction; permission: "payments:write" | "logistics:write" }>> = {
  PENDING_PAYMENT: { action: "pay", permission: "payments:write" },
  PAID: { action: "pack", permission: "logistics:write" },
  PACKING: { action: "ship", permission: "logistics:write" },
  SHIPPED: { action: "complete", permission: "logistics:write" },
};
const CANCELLABLE = new Set<OrderDetailDto["status"]>(["PENDING_PAYMENT", "PAID", "PACKING"]);
const EXPIRED_NOTE_ID = "order-expired-note";

function BackLink() {
  const { t } = useT();
  return (
    <Link href="/orders" className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-xl px-3")}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("orders.detail.back")}
    </Link>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { t } = useT();
  // client ນັບຮອດ 0 ແລ້ວ (latch): ໃຫ້ useOrder poll ທຸກ 5 ວິ ຈົນ server ປ່ຽນສະຖານະ
  const [clientExpired, setClientExpired] = useState(false);
  const query = useOrder(id, { clientExpired });

  if (!query.data) {
    if (query.isError) {
      const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.code === "ORDER_NOT_FOUND");
      return (
        <div className="p-6">
          <EmptyState
            icon={AlertCircle}
            title={notFound ? t("orders.detail.notFound") : t("common.error.load")}
            description={notFound ? undefined : errorMessage(query.error, t)}
            action={
              notFound ? (
                <BackLink />
              ) : (
                <div className="flex gap-2">
                  <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                    {t("common.retry")}
                  </Button>
                  <BackLink />
                </div>
              )
            }
          />
        </div>
      );
    }
    return (
      <div role="status" aria-busy="true" aria-label={t("common.loading")} className="space-y-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return (
    <OrderDetailBody
      order={query.data}
      fetchedAt={query.dataUpdatedAt}
      // refetch ລ່າສຸດລົ້ມ ແຕ່ຍັງມີຂໍ້ມູນເກົ່າ: ສະແດງໄດ້ ແຕ່ຖືວ່າອາດເກົ່າ
      stale={query.isRefetchError}
      refreshing={query.isRefetching}
      onRetry={() => void query.refetch()}
      onClientExpired={() => setClientExpired(true)}
    />
  );
}

interface BodyProps {
  order: OrderDetailDto;
  fetchedAt: number;
  stale: boolean;
  refreshing: boolean;
  onRetry: () => void;
  onClientExpired: () => void;
}

function OrderDetailBody({ order, fetchedAt, stale, refreshing, onRetry, onClientExpired }: BodyProps) {
  const { t } = useT();
  const canPay = useCan("payments:write");
  const canLogistics = useCan("logistics:write");
  const canCancel = useCan("orders:write");
  const canCosts = useCan("costs:read");
  const act = useOrderAction();
  const snapshot = useOrderSnapshot(order.id);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // ສະຖານະທີ່ການປະກາດຂອງ action ເຮົາເອງອ້າງເຖິງ: ການປ່ຽນໄປຫາສະຖານະນີ້ບໍ່ແມ່ນການປ່ຽນຈາກພາຍນອກ
  const announcedStatus = useRef<OrderDetailDto["status"] | null>(null);
  const prevStatus = useRef(order.status);
  const announceRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusTick, setFocusTick] = useState(0);
  // ຜູກກັບສະຖານະທີ່ເຫັນຕອນເກີດ: ຖ້າ refetch ສະແດງສະຖານະໃໝ່ ຂໍ້ຄວາມເກົ່າບໍ່ຄ້າງຂ້າງສະຖານະໃໝ່
  const [error, setError] = useState<{ message: string; status: OrderDetailDto["status"] } | null>(null);
  const pending = order.status === "PENDING_PAYMENT";
  const remaining = useCountdown(pending ? order.secondsUntilExpiry : null, fetchedAt);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // client ນັບຮອດ 0 ໃນຂະນະ API ຍັງບອກວ່າເຫຼືອເວລາ: ໃຫ້ useOrder poll (ລອງໃໝ່ເອງເມື່ອລົ້ມ)
  useEffect(() => {
    if (pending && remaining === 0) onClientExpired();
  }, [pending, remaining, onClientExpired]);

  const step = NEXT_STEP[order.status];
  const stepAllowed = step ? (step.permission === "payments:write" ? canPay : canLogistics) : false;
  const expired = pending && remaining === 0;
  const showCancel = CANCELLABLE.has(order.status) && canCancel;
  // ປຸ່ມ action ທັງໝົດເປັນການປ່ຽນສະຖານະ (ບໍ່ idempotent): ຂະນະມີອັນໃດກຳລັງສົ່ງ ຫຼື ຂໍ້ມູນອາດເກົ່າ ຫ້າມກົດອັນໃດ
  const busy = act.isPending;
  const locked = busy || stale;
  const dialogLost = cancelOpen && !showCancel;

  // ສະຖານະປ່ຽນຈາກພາຍນອກ: ລ້າງປະກາດເກົ່າ; ຖ້າ dialog ຍົກເລີກເປີດຢູ່ ແລະ ຍົກເລີກບໍ່ໄດ້ແລ້ວ ໃຫ້ປິດ ແລະ ບອກ
  useEffect(() => {
    const changed = prevStatus.current !== order.status;
    prevStatus.current = order.status;
    // action ຂອງເຮົາເອງ (ກຳລັງສົ່ງ ຫຼື ປະກາດຜົນແລ້ວ) ບໍ່ແມ່ນການປ່ຽນຈາກພາຍນອກ
    const own = inFlight.current || announcedStatus.current === order.status;
    if (!own && (changed || dialogLost)) {
      announcedStatus.current = null;
      setAnnouncement(dialogLost ? t("orders.detail.statusChanged", { status: t(`orders.status.${order.status}`) }) : "");
      if (dialogLost) setFocusTick((n) => n + 1);
    }
    if (dialogLost) setCancelOpen(false);
  }, [order.status, dialogLost, t]);

  // ຍ້າຍ focus ໄປ status region ຫຼັງ render ຂໍ້ຄວາມໃໝ່ (ປຸ່ມທີ່ກົດ/dialog ອາດຫາຍໄປ)
  useEffect(() => {
    if (focusTick > 0) announceRef.current?.focus();
  }, [focusTick]);

  function announce(message: string, status: OrderDetailDto["status"] | null) {
    announcedStatus.current = status;
    setAnnouncement(message);
    setFocusTick((n) => n + 1);
  }

  /** ເຮັດ action; ລົ້ມ = toast ແລ້ວ throw ຕໍ່; ມີອັນອື່ນກຳລັງສົ່ງ = ActionBusyError (ບໍ່ໄດ້ສົ່ງຫຍັງ) */
  async function perform(action: OrderAction, reason?: string) {
    if (inFlight.current) throw new ActionBusyError();
    inFlight.current = true;
    setError(null);
    setAnnouncement("");
    announcedStatus.current = null;
    try {
      // mutation ຄ້າງຈົນ hook refetch ບິນສຳເລັດ (invalidate ຖືກ await) ຈຶ່ງເຫັນສະຖານະໃໝ່ແລ້ວ
      const updated = await act.mutateAsync({ id: order.id, action, reason });
      const message = t(`orders.toast.${action}`);
      toast.success(message);
      if (mounted.current) announce(message, updated?.status ?? null);
    } catch (caught) {
      toast.error(errorMessage(caught, t));
      throw caught;
    } finally {
      inFlight.current = false;
    }
  }

  /** ສະຖານະປ່ຽນໄປແລ້ວຕອນລົ້ມ (ປຸ່ມທີ່ກົດຫາຍ): ປະກາດຂໍ້ຄວາມ; ບໍ່ປ່ຽນ: ໃຫ້ຜູ້ເອີ້ນສະແດງຂໍ້ຄວາມຢູ່ບ່ອນຂອງມັນ */
  function reportFailure(caught: unknown, startStatus: OrderDetailDto["status"], inline: boolean) {
    if (!mounted.current) return;
    const message = errorMessage(caught, t);
    const latest = snapshot()?.status;
    if (latest && latest !== startStatus) announce(message, latest);
    else if (inline) setError({ message, status: startStatus });
  }

  async function runStep(action: OrderAction) {
    const startStatus = order.status;
    try {
      await perform(action);
    } catch (caught) {
      // ກົດຊ້ຳຂະນະອັນເກົ່າກຳລັງສົ່ງ: ຄຳຂໍທຳອິດຈັດການຢູ່ ບໍ່ຕ້ອງບອກຜິດ
      if (!(caught instanceof ActionBusyError)) reportFailure(caught, startStatus, true);
    }
  }

  async function confirmCancel(reason: string | undefined) {
    const startStatus = order.status;
    try {
      await perform("cancel", reason);
    } catch (caught) {
      // dialog ສະແດງຂໍ້ຄວາມເອງ; ຖ້າບິນຖືກປ່ຽນແລ້ວ dialog ຫາຍ ຈຶ່ງປະກາດທີ່ໜ້າ
      if (!(caught instanceof ActionBusyError)) reportFailure(caught, startStatus, false);
      throw caught;
    }
  }

  function restoreFocus() {
    const opener = cancelButtonRef.current;
    if (opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus();
    else announceRef.current?.focus();
  }

  const showCost = canCosts && order.items.some((item) => item.unitCost !== undefined);
  const hasShipping = Boolean(order.shippingName || order.shippingPhone || order.shippingAddress);

  return (
    <div>
      <div className="px-3 pt-4 sm:px-6">
        <BackLink />
      </div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title"), order.orderNumber]}
        title={order.orderNumber}
        actions={
          <>
            {step && stepAllowed ? (
              <Button
                className="rounded-xl font-bold"
                loading={busy && act.variables?.action === step.action}
                disabled={locked || (step.action === "pay" && expired)}
                aria-describedby={step.action === "pay" && expired ? EXPIRED_NOTE_ID : undefined}
                onClick={() => void runStep(step.action)}
              >
                {t(`orders.action.${step.action}`)}
              </Button>
            ) : null}
            {showCancel ? (
              <Button
                variant="outlineDanger"
                className="rounded-xl"
                disabled={locked}
                onClick={(event) => {
                  // Safari/Firefox macOS ບໍ່ focus ປຸ່ມຕອນກົດ: ຈື່ປຸ່ມເອງ ເພື່ອຄືນ focus
                  cancelButtonRef.current = event.currentTarget;
                  setCancelOpen(true);
                }}
              >
                {t("orders.action.cancel")}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {/* ຜົນຂອງ action ຖືກອ່ານ ແລະ ເປັນເປົ້າ focus ເມື່ອປຸ່ມທີ່ກົດຫາຍໄປ */}
        <div ref={announceRef} role="status" tabIndex={-1} data-testid="order-announce" className="sr-only">
          {announcement}
        </div>
        {stale ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            <p>{t("orders.detail.refreshFailed")}</p>
            <Button variant="outlinePrimary" className="rounded-lg" loading={refreshing} onClick={onRetry}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {error && error.status === order.status ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label={t("orders.detail.status")}>
          <OrderStatusPill status={order.status} />
          {pending && remaining !== null && remaining > 0 ? (
            // role=timer ບໍ່ປະກາດທຸກວິນາທີ (aria-live ປິດ) ຜູ້ໃຊ້ອ່ານໄດ້ເມື່ອໄປຫາ
            <p role="timer" aria-label={t("orders.detail.countdownLabel")} className="text-sm font-medium tabular-nums text-warning-ink">
              {t("orders.detail.expiresIn", { time: formatCountdown(remaining) })}
            </p>
          ) : null}
          {expired ? (
            <div id={EXPIRED_NOTE_ID} role="status" className="text-sm">
              <p className="font-medium text-danger-ink">{t("orders.detail.expired")}</p>
              <p className="text-ink-secondary">{t("orders.detail.expiredWaiting")}</p>
            </div>
          ) : null}
        </div>

        <OrderItemsCard order={order} showCost={showCost} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="rounded-[20px] p-6">
            <h2 className="mb-3 text-base font-bold text-ink">{t("orders.detail.customer")}</h2>
            {order.customer ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-ink">{order.customer.name}</p>
                {order.customer.phone ? <p className="text-ink-secondary">{order.customer.phone}</p> : null}
                {order.customer.email ? <p className="text-ink-secondary">{order.customer.email}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-ink-secondary">{t("orders.walkIn")}</p>
            )}
          </Card>
          <Card className="rounded-[20px] p-6">
            <h2 className="mb-3 text-base font-bold text-ink">{t("orders.detail.shipping")}</h2>
            <div className="space-y-1 text-sm text-ink-secondary">
              {order.shippingName ? <p className="font-medium text-ink">{order.shippingName}</p> : null}
              {order.shippingPhone ? <p>{order.shippingPhone}</p> : null}
              {order.shippingAddress ? <p>{order.shippingAddress}</p> : null}
              {hasShipping ? null : <p>{t("orders.detail.noShipping")}</p>}
              <p className="mt-2 whitespace-pre-line border-t border-line pt-2">{order.note ? order.note : t("orders.detail.noNote")}</p>
            </div>
          </Card>
          <OrderTimeline order={order} />
        </div>

        <OrderMovementsCard movements={order.movements} />
      </div>

      {showCancel ? (
        <CancelOrderDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onConfirm={confirmCancel}
          disabled={locked}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </div>
  );
}

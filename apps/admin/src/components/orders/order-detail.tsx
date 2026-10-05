"use client";

import { Button, Card, EmptyState, PageHeader, Skeleton, buttonVariants, cn, toast } from "@oca/ui";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type OrderAction, useOrder, useOrderAction } from "@/lib/queries";
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
/** code ທີ່ບອກວ່າສະຖານະບິນບໍ່ຕົງກັບທີ່ເຫັນ (useOrderAction refetch ໃຫ້ແລ້ວ) */
const STALE_CODES = new Set(["ORDER_INVALID_STATE", "RESERVATION_EXPIRED"]);
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
  const query = useOrder(id);

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
  return <OrderDetailBody order={query.data} fetchedAt={query.dataUpdatedAt} refetch={query.refetch} />;
}

function OrderDetailBody({ order, fetchedAt, refetch }: { order: OrderDetailDto; fetchedAt: number; refetch: () => unknown }) {
  const { t } = useT();
  const canPay = useCan("payments:write");
  const canLogistics = useCan("logistics:write");
  const canCancel = useCan("orders:write");
  const canCosts = useCan("costs:read");
  const act = useOrderAction();
  const inFlight = useRef(false);
  const announceRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = order.status === "PENDING_PAYMENT";
  const remaining = useCountdown(pending ? order.secondsUntilExpiry : null, fetchedAt);

  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // ນັບຮອດ 0 ທີ່ client ໃນຂະນະ API ຍັງບອກວ່າເຫຼືອເວລາ: ໂຫຼດໃໝ່ເທື່ອດຽວ (ຫຼັງຈາກນັ້ນ useOrder poll ເອງເມື່ອ API ບອກ 0)
  useEffect(() => {
    if (pending && remaining === 0 && order.secondsUntilExpiry !== 0) void refetch();
  }, [pending, remaining, order.secondsUntilExpiry, refetch]);

  const step = NEXT_STEP[order.status];
  const stepAllowed = step ? (step.permission === "payments:write" ? canPay : canLogistics) : false;
  const expired = pending && remaining === 0;
  const showCancel = CANCELLABLE.has(order.status) && canCancel;
  // ປຸ່ມ action ທັງໝົດເປັນການປ່ຽນສະຖານະ (ບໍ່ idempotent): ຂະນະມີອັນໃດອັນໜຶ່ງກຳລັງສົ່ງ ຫ້າມກົດອັນໃດ
  const busy = act.isPending;

  /** ເຮັດ action; ລົ້ມ = toast ແລ້ວ throw ຕໍ່ (ຜູ້ເອີ້ນຕັດສິນວ່າຈະສະແດງຂໍ້ຄວາມຢູ່ໃສ) */
  async function perform(action: OrderAction, reason?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await act.mutateAsync({ id: order.id, action, reason });
      const message = t(`orders.toast.${action}`);
      toast.success(message);
      setAnnouncement(message);
      // ປຸ່ມທີ່ກົດອາດຫາຍ (ສະຖານະປ່ຽນ): ຍ້າຍ focus ໄປ status region (ຫຼັງ Radix ຄືນ focus ຂອງ dialog ແລ້ວ)
      clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => announceRef.current?.focus(), 50);
    } catch (caught) {
      toast.error(errorMessage(caught, t));
      throw caught;
    } finally {
      inFlight.current = false;
    }
  }

  async function runStep(action: OrderAction) {
    try {
      await perform(action);
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  }

  async function confirmCancel(reason: string | undefined) {
    try {
      await perform("cancel", reason);
    } catch (caught) {
      // dialog ສະແດງຂໍ້ຄວາມເອງ; ຖ້າບິນຖືກປ່ຽນໄປແລ້ວ dialog ອາດຫາຍ ຈຶ່ງໃຫ້ໜ້າສະແດງຂໍ້ຄວາມນຳ
      if (caught instanceof ApiError && caught.code && STALE_CODES.has(caught.code)) setError(errorMessage(caught, t));
      throw caught;
    }
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
                disabled={busy || (step.action === "pay" && expired)}
                aria-describedby={step.action === "pay" && expired ? EXPIRED_NOTE_ID : undefined}
                onClick={() => void runStep(step.action)}
              >
                {t(`orders.action.${step.action}`)}
              </Button>
            ) : null}
            {showCancel ? (
              <Button variant="outlineDanger" className="rounded-xl" disabled={busy} onClick={() => setCancelOpen(true)}>
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
        {error ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label={t("orders.detail.status")}>
          <OrderStatusPill status={order.status} />
          {pending && remaining !== null && remaining > 0 ? (
            // role=timer ບໍ່ປະກາດທຸກວິນາທີ (aria-live ປິດ) ຜູ້ໃຊ້ອ່ານໄດ້ເມື່ອໄປຫາ
            <p role="timer" className="text-sm font-medium tabular-nums text-warning-ink">
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

      {showCancel ? <CancelOrderDialog open={cancelOpen} onOpenChange={setCancelOpen} onConfirm={confirmCancel} /> : null}
    </div>
  );
}

"use client";

import { type ReceivingAccount, STORE_MAX_SLIPS } from "@oca/shared";
import { Button, StatusPill, buttonVariants, cn } from "@oca/ui";
import { Check, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { replaceCart } from "@/lib/cart";
import { fetchOrder } from "@/lib/client-api";
import { formatLak, formatPoints } from "@/lib/format";
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from "@/lib/order-status";
import type { StoreOrder } from "@/lib/types";
import { Countdown } from "./countdown";
import { OrderPinCard } from "./order-pin-card";
import { SlipUpload } from "./slip-upload";

const POLL_MS = 15_000;

interface OrderViewProps {
  token: string;
  initialOrder: StoreOrder;
  payment: { receivingAccounts: ReceivingAccount[]; paymentInstructions: string | null };
}

function Panel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4", className)}>
      <h2 className="text-base font-semibold text-ink">{label}</h2>
      {children}
    </section>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol aria-label="ຂັ້ນຕອນຂອງບິນ" className="grid grid-cols-4 gap-1">
      {ORDER_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.status} aria-current={active ? "step" : undefined} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-bold",
                done && "border-brand bg-brand text-white",
                active && "border-brand bg-brand-soft text-brand-ink",
                !done && !active && "border-line bg-subtle text-ink-muted",
              )}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn("text-[11px] leading-tight", active ? "font-semibold text-ink" : "text-ink-secondary")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** ໜ້າບິນຂອງລູກຄ້າ: ສະຖານະ, ການຊຳລະ + ສະລິບ, ຕິດຕາມພັດສະດຸ, ລາຍການ. ຖາມສະຖານະຊ້ຳຕອນລໍຖ້າຊຳລະ */
export function OrderView({ token, initialOrder, payment }: OrderViewProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);

  const refresh = useCallback(async () => {
    try {
      setOrder(await fetchOrder(token));
    } catch {
      // ຖາມບໍ່ໄດ້ຊົ່ວຄາວ: ສະແດງຂໍ້ມູນເດີມຕໍ່ ແລະ ລອງໃໝ່ຮອບຖັດໄປ
    }
  }, [token]);

  const pending = order.status === "PENDING_PAYMENT";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  const status = orderStatusLabel(order.status);
  const step = orderStepIndex(order.status);
  const activeSlips = order.slips.filter((slip) => slip.status !== "REJECTED").length;
  const reviewing = order.slips.some((slip) => slip.status === "REVIEWING");
  const rejected = order.slips.some((slip) => slip.status === "REJECTED");

  const reorder = () => {
    replaceCart(order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })));
    router.push("/cart");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">{`ບິນ ${order.orderNumber}`}</h1>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      {step >= 0 ? <Steps current={step} /> : null}

      {order.status === "EXPIRED" ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-subtle p-4">
          <p className="text-sm text-ink">ບິນນີ້ໝົດເວລາຊຳລະແລ້ວ ສິນຄ້າທີ່ຈອງໄວ້ຖືກປ່ອຍຄືນ</p>
          <Button onClick={reorder}>ສັ່ງໃໝ່</Button>
        </div>
      ) : null}
      {order.status === "CANCELLED" ? (
        <p className="rounded-2xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">ບິນນີ້ຖືກຍົກເລີກແລ້ວ</p>
      ) : null}
      {order.status === "PAID" || order.status === "PACKING" ? (
        <p className="rounded-2xl border border-success-line bg-success-soft p-4 text-sm text-success-ink">
          ຮ້ານໄດ້ຮັບການຊຳລະແລ້ວ ກຳລັງກຽມສິນຄ້າໃຫ້ທ່ານ
        </p>
      ) : null}

      {pending ? (
        <Panel label="ການຊຳລະເງິນ">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-ink-secondary">ຍອດທີ່ຕ້ອງໂອນ</span>
            <span className="text-2xl font-bold text-brand-ink">{formatLak(order.total)}</span>
          </div>
          {order.reservedUntil ? (
            <p className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
              ກະລຸນາໂອນ ແລະ ສົ່ງສະລິບພາຍໃນ{" "}
              <Countdown until={order.reservedUntil} onExpire={() => void refresh()} className="font-bold tabular-nums" />
            </p>
          ) : null}
          {payment.receivingAccounts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {payment.receivingAccounts.map((account) => (
                <li key={`${account.bank}-${account.accountNo}`} className="rounded-xl border border-line bg-subtle px-3 py-2">
                  <p className="text-xs font-semibold text-ink-secondary">{account.bank}</p>
                  <p className="select-all text-lg font-bold tracking-wide text-ink">{account.accountNo}</p>
                  {account.accountName ? <p className="text-sm text-ink-secondary">{account.accountName}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-secondary">ກະລຸນາຕິດຕໍ່ຮ້ານເພື່ອຂໍເລກບັນຊີສຳລັບໂອນເງິນ</p>
          )}
          {payment.paymentInstructions ? <p className="whitespace-pre-line text-sm text-ink-secondary">{payment.paymentInstructions}</p> : null}

          {reviewing ? (
            <p role="status" className="rounded-xl border border-info-line bg-info-soft px-3 py-2 text-sm text-info-ink">
              ໄດ້ຮັບສະລິບແລ້ວ ຮ້ານກຳລັງກວດສອບ
            </p>
          ) : rejected ? (
            <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              ສະລິບທີ່ສົ່ງມາບໍ່ຖືກຕ້ອງ ກະລຸນາອັບໂຫຼດສະລິບໃໝ່
            </p>
          ) : null}
          {activeSlips < STORE_MAX_SLIPS ? (
            <SlipUpload
              token={token}
              onUploaded={() => void refresh()}
              label={reviewing ? "ອັບໂຫຼດສະລິບເພີ່ມ" : rejected ? "ອັບໂຫຼດສະລິບໃໝ່" : "ອັບໂຫຼດສະລິບ"}
            />
          ) : (
            <p className="text-sm text-ink-secondary">ສົ່ງສະລິບຄົບຈຳນວນແລ້ວ ກະລຸນາລໍຖ້າຮ້ານກວດສອບ</p>
          )}
        </Panel>
      ) : null}

      {order.tracking ? (
        <Panel label="ຕິດຕາມພັດສະດຸ">
          <div>
            {order.tracking.courierName ? <p className="text-sm text-ink-secondary">{order.tracking.courierName}</p> : null}
            <p className="select-all text-lg font-bold tracking-wide text-ink">{order.tracking.trackingNumber}</p>
          </div>
          {order.tracking.url ? (
            <a href={order.tracking.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outlinePrimary" })}>
              <ExternalLink aria-hidden="true" />
              ຕິດຕາມພັດສະດຸ
            </a>
          ) : null}
        </Panel>
      ) : null}

      <OrderPinCard token={token} pinSetup={order.pinSetup ?? "NONE"} />

      <Panel label="ລາຍການສິນຄ້າ">
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.variantId} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-ink">{item.productName}</p>
                <p className="text-xs text-ink-secondary">{item.variantName ? `${item.variantName} × ${item.quantity}` : `× ${item.quantity}`}</p>
              </div>
              <p className="shrink-0 text-ink">{formatLak(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        {order.coupon || order.points ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3 text-sm text-success-ink">
            {order.coupon ? (
              <div className="flex items-baseline justify-between gap-3">
                <span>{`ສ່ວນຫຼຸດ (${order.coupon.code})`}</span>
                <span>{`−${formatLak(order.coupon.discount)}`}</span>
              </div>
            ) : null}
            {order.points ? (
              <div className="flex items-baseline justify-between gap-3">
                <span>{`ໃຊ້ແຕ້ມ (${formatPoints(order.points.redeemed)})`}</span>
                <span>{`−${formatLak(order.points.discount)}`}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("flex items-baseline justify-between gap-3", order.coupon || order.points ? "" : "border-t border-line pt-3")}>
          <span className="text-sm text-ink-secondary">ຍອດລວມ</span>
          <span className="text-lg font-bold text-ink">{formatLak(order.total)}</span>
        </div>
        {order.pointsEarned ? (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-secondary">ແຕ້ມທີ່ໄດ້ຮັບຈາກບິນນີ້</span>
            <span className="font-semibold text-brand-ink">{`+${formatPoints(order.pointsEarned)}`}</span>
          </div>
        ) : null}
      </Panel>

      <Panel label="ການຈັດສົ່ງ">
        <div className="flex flex-col gap-1 text-sm text-ink">
          <p>{order.shipping.name}</p>
          <p>{order.shipping.phone}</p>
          <p className="whitespace-pre-line">{order.shipping.address}</p>
          <p>{[order.shipping.courierName, order.shipping.branch].filter(Boolean).join(" · ")}</p>
          {order.note ? <p className="text-ink-secondary">{order.note}</p> : null}
        </div>
        <p className="text-xs text-ink-secondary">ຄ່າຂົນສົ່ງຊຳລະໃຫ້ບໍລິສັດຂົນສົ່ງຕອນຮັບສິນຄ້າ</p>
      </Panel>

      <p className="text-center text-xs text-ink-secondary">ເກັບລິ້ງຂອງໜ້ານີ້ໄວ້ ເພື່ອກັບມາເບິ່ງສະຖານະບິນ. ຢ່າສົ່ງລິ້ງນີ້ໃຫ້ຜູ້ອື່ນ.</p>
    </div>
  );
}

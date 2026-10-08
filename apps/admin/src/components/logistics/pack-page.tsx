"use client";

import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatusPill,
  buttonVariants,
  cn,
  toast,
} from "@oca/ui";
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, Copy, Printer, RotateCcw, Send, Truck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { OrderStatusPill } from "@/components/orders/order-status";
import { ApiError } from "@/lib/api";
import { beep } from "@/lib/beep";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { sendErrorKey } from "@/lib/inbox";
import { type PackLine, applyScan, isPackComplete, packLinesOf, packScans } from "@/lib/pack-scan";
import { useCouriers, useFulfillment, useFulfillmentAction, useUpdateShipping } from "@/lib/queries";
import type { FulfillmentDetailDto } from "@/lib/types";
import { CameraScanner } from "./camera-scanner";

const SHIP_HINT_ID = "pack-ship-hint";
const PACKABLE = new Set(["PAID", "PACKING", "SHIPPED", "COMPLETED"]);
const filled = (value: string | null | undefined) => Boolean(value && value.trim() !== "");
const productLabel = (line: { productName: string; variantName: string | null }) =>
  `${line.productName}${line.variantName ? ` — ${line.variantName}` : ""}`;

function BackLink() {
  const { t } = useT();
  return (
    <Link href="/fulfillment" className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-xl px-3")}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("pack.back")}
    </Link>
  );
}

export function PackPage({ orderId }: { orderId: string }) {
  const { t } = useT();
  const query = useFulfillment(orderId);
  if (!query.data) {
    if (query.isError) {
      const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.code === "ORDER_NOT_FOUND");
      return (
        <div className="p-6">
          <EmptyState
            icon={AlertCircle}
            title={notFound ? t("pack.notFound") : t("common.error.load")}
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
  return <PackBody detail={query.data} />;
}

function PackBody({ detail }: { detail: FulfillmentDetailDto }) {
  const { t } = useT();
  const canWrite = useCan("logistics:write");
  const canWriteOrders = useCan("orders:write");
  // override ຕ້ອງມີທັງສອງສິດ (API ບັງຄັບຄືກັນ)
  const canOverride = canWrite && canWriteOrders;
  const act = useFulfillmentAction(detail.id);
  const [shipOpen, setShipOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const verified = detail.shipment?.verifiedAt != null;
  const packing = detail.status === "PACKING";
  const shipped = detail.status === "SHIPPED" || detail.status === "COMPLETED";
  const recipientOk = filled(detail.shippingName) && filled(detail.shippingPhone);
  const canShip = canWrite && packing && verified && recipientOk;

  async function startPacking() {
    try {
      await act.mutateAsync({ action: "start" });
      toast.success(t("pack.toast.started"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  return (
    <div>
      <div className="px-3 pt-4 sm:px-6">
        <BackLink />
      </div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("fulfillment.title"), detail.orderNumber]}
        title={detail.orderNumber}
        actions={
          <>
            <a
              href={`/fulfillment/labels?ids=${detail.id}`}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-xl px-3")}
            >
              <Printer className="size-4" aria-hidden="true" />
              {t("pack.printLabel")}
            </a>
            {canWrite && detail.status === "PAID" ? (
              <Button className="rounded-xl font-bold" loading={act.isPending} onClick={() => void startPacking()}>
                {t("pack.start")}
              </Button>
            ) : null}
            {canWrite && packing ? (
              <Button
                className="rounded-xl font-bold"
                disabled={!canShip}
                aria-describedby={canShip ? undefined : SHIP_HINT_ID}
                onClick={() => setShipOpen(true)}
              >
                <Truck aria-hidden="true" />
                {t("pack.ship")}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusPill status={detail.status} />
          {canWrite && packing && !canShip ? (
            <p id={SHIP_HINT_ID} className="text-sm text-ink-secondary">
              {t("pack.shipHint")}
            </p>
          ) : null}
        </div>
        {PACKABLE.has(detail.status) ? null : (
          <p role="alert" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            {t("pack.notPackable", { status: t(`orders.status.${detail.status}`) })}
          </p>
        )}
        {canWrite && detail.status === "PAID" ? <p className="text-sm text-ink-secondary">{t("pack.startHint")}</p> : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {packing && !verified && canWrite ? (
              <ScanCard key={detail.id} detail={detail} canOverride={canOverride} onOverride={() => setOverrideOpen(true)} />
            ) : (
              <ItemsCard detail={detail} />
            )}
            {verified && packing ? <VerifiedNote detail={detail} /> : null}
            {shipped ? <ShipmentCard detail={detail} canWrite={canWrite} /> : null}
          </div>
          <RecipientCard key={`${detail.id}-${detail.shippingName}-${detail.shippingPhone}-${detail.shippingAddress}`} detail={detail} editable={canWrite && (detail.status === "PAID" || packing)} />
        </div>
      </div>
      {canWrite && packing ? (
        <>
          <ShipDialog open={shipOpen} onOpenChange={setShipOpen} detail={detail} />
          {canOverride ? <OverrideDialog open={overrideOpen} onOpenChange={setOverrideOpen} orderId={detail.id} /> : null}
        </>
      ) : null}
    </div>
  );
}

function VerifiedNote({ detail }: { detail: FulfillmentDetailDto }) {
  const { t } = useT();
  const shipment = detail.shipment;
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-3 py-2 text-sm text-success-ink">
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      {shipment?.verifyOverrideReason
        ? t("pack.verifiedOverride", { name: shipment.verifiedBy?.name ?? "—", reason: shipment.verifyOverrideReason })
        : t("pack.verified")}
    </p>
  );
}

function ItemsTable({ lines, showScanned }: { lines: PackLine[]; showScanned: boolean }) {
  const { t } = useT();
  return (
    <table className="w-full text-sm" aria-label={t("pack.itemsTable")}>
      <thead>
        <tr className="border-b border-line text-left text-xs text-ink-secondary">
          <th scope="col" className="px-4 py-2 font-semibold">
            {t("pack.col.product")}
          </th>
          <th scope="col" className="px-4 py-2 font-semibold">
            {t("pack.col.code")}
          </th>
          <th scope="col" className="px-4 py-2 text-right font-semibold">
            {showScanned ? t("pack.col.scanned") : t("fulfillment.col.items")}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const done = line.scanned === line.expected;
          return (
            <tr key={line.variantId} data-testid={`pack-line-${line.variantId}`} className={cn("border-b border-line last:border-0", showScanned && done && "bg-success-soft")}>
              <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                {productLabel(line)}
              </th>
              <td className="px-4 py-3 font-mono text-xs text-ink-secondary">
                {line.sku}
                {line.barcode ? <span className="block">{line.barcode}</span> : null}
              </td>
              <td className={cn("px-4 py-3 text-right text-base font-bold tabular-nums", showScanned && done ? "text-success-ink" : "text-ink")}>
                {showScanned ? `${line.scanned}/${line.expected}` : line.expected}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ItemsCard({ detail }: { detail: FulfillmentDetailDto }) {
  const { t } = useT();
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <h2 className="px-4 pt-4 text-base font-bold text-ink sm:px-6">{t("pack.items")}</h2>
      <ItemsTable lines={packLinesOf(detail.items)} showScanned={false} />
    </Card>
  );
}

type Feedback = { tone: "ok" | "error"; text: string } | null;

/** ຍິງກວດ: ເຄື່ອງຍິງ (ພິມ + Enter) ຫຼື ກ້ອງ; ຄົບທຸກແຖວ → ສົ່ງ verify ໃຫ້ server ກວດຊ້ຳ */
function ScanCard({ detail, canOverride, onOverride }: { detail: FulfillmentDetailDto; canOverride: boolean; onOverride: () => void }) {
  const { t } = useT();
  const act = useFulfillmentAction(detail.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<PackLine[]>(() => packLinesOf(detail.items));
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const submitted = useRef(false);
  const complete = isPackComplete(lines);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ຄົບແລ້ວ: ສົ່ງ verify ຄັ້ງດຽວ (ຍິງໃໝ່ຈຶ່ງສົ່ງອີກ)
  useEffect(() => {
    if (!complete || submitted.current) return;
    submitted.current = true;
    void act.mutateAsync({ action: "verify", scans: packScans(lines) }).then(
      () => toast.success(t("pack.toast.verified")),
      (error: unknown) => {
        submitted.current = false;
        setFeedback({ tone: "error", text: errorMessage(error, t) });
      },
    );
  }, [complete, lines, act, t]);

  function handle(code: string) {
    const result = applyScan(lines, code);
    const outcome = result.outcome;
    if (outcome.kind === "empty") return;
    if (outcome.kind === "ok") {
      const line = result.lines.find((candidate) => candidate.variantId === outcome.variantId) as PackLine;
      setLines(result.lines);
      setFeedback({ tone: "ok", text: t("pack.scan.ok", { name: productLabel(line), scanned: line.scanned, expected: line.expected }) });
      beep("ok");
    } else if (outcome.kind === "over") {
      const line = lines.find((candidate) => candidate.variantId === outcome.variantId) as PackLine;
      setFeedback({ tone: "error", text: t("pack.scan.over", { name: productLabel(line) }) });
      beep("error");
    } else {
      setFeedback({ tone: "error", text: t("pack.scan.unknown", { code: outcome.code }) });
      beep("error");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    handle(text);
    setText("");
  }

  const scannedTotal = lines.reduce((sum, line) => sum + line.scanned, 0);
  const expectedTotal = lines.reduce((sum, line) => sum + line.expected, 0);

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("pack.scanLabel")} htmlFor="pack-scan" className="min-w-[240px] flex-1">
            <Input
              ref={inputRef}
              id="pack-scan"
              className="h-12 font-mono text-lg"
              autoComplete="off"
              placeholder={t("pack.scanPlaceholder")}
              value={text}
              disabled={act.isPending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </Field>
          <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => setCameraOpen((open) => !open)}>
            <Camera aria-hidden="true" />
            {t("pack.camera")}
          </Button>
        </div>
        {cameraOpen ? (
          <CameraScanner
            onDetected={handle}
            onClose={() => {
              setCameraOpen(false);
              inputRef.current?.focus();
            }}
          />
        ) : null}
        <div
          data-testid="pack-feedback"
          role="status"
          aria-live="assertive"
          className={cn(
            "min-h-10 rounded-lg px-3 py-2 text-base font-semibold",
            feedback?.tone === "ok" && "bg-success-soft text-success-ink",
            feedback?.tone === "error" && "bg-danger-soft text-danger-ink",
          )}
        >
          {act.isPending ? t("pack.verifying") : (feedback?.text ?? "")}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tabular-nums text-ink-secondary">{t("pack.progress", { scanned: scannedTotal, expected: expectedTotal })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setLines(packLinesOf(detail.items));
                setFeedback(null);
                submitted.current = false;
                inputRef.current?.focus();
              }}
            >
              <RotateCcw aria-hidden="true" />
              {t("pack.reset")}
            </Button>
            {canOverride ? (
              <Button type="button" variant="outlineDanger" size="sm" className="rounded-lg" onClick={onOverride}>
                {t("pack.override")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <ItemsTable lines={lines} showScanned />
    </Card>
  );
}

function RecipientCard({ detail, editable }: { detail: FulfillmentDetailDto; editable: boolean }) {
  const { t } = useT();
  const update = useUpdateShipping(detail.id);
  const [name, setName] = useState(detail.shippingName ?? "");
  const [phone, setPhone] = useState(detail.shippingPhone ?? "");
  const [address, setAddress] = useState(detail.shippingAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const missing = !filled(detail.shippingName) || !filled(detail.shippingPhone);
  const shipped = detail.status === "SHIPPED" || detail.status === "COMPLETED";

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = (input: string) => (input.trim() === "" ? null : input.trim());
    try {
      await update.mutateAsync({ shippingName: value(name), shippingPhone: value(phone), shippingAddress: value(address) });
      toast.success(t("pack.recipientSaved"));
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  }

  return (
    <Card className="h-fit rounded-[20px] p-6">
      <h2 className="mb-3 text-base font-bold text-ink">{t("pack.recipient")}</h2>
      {missing && !shipped ? (
        <p className="mb-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">{t("pack.recipientMissing")}</p>
      ) : null}
      {editable ? (
        <form onSubmit={save} className="space-y-3" noValidate>
          {error ? (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Field label={t("pack.recipientName")} htmlFor="pack-recipient-name">
            <Input id="pack-recipient-name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t("pack.recipientPhone")} htmlFor="pack-recipient-phone">
            <Input id="pack-recipient-phone" inputMode="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label={t("pack.recipientAddress")} htmlFor="pack-recipient-address">
            <textarea
              id="pack-recipient-address"
              rows={3}
              maxLength={500}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="outlinePrimary" className="rounded-xl" loading={update.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1 text-sm text-ink-secondary">
          {detail.shippingName ? <p className="font-medium text-ink">{detail.shippingName}</p> : null}
          {detail.shippingPhone ? <p>{detail.shippingPhone}</p> : null}
          {detail.shippingAddress ? <p className="whitespace-pre-line">{detail.shippingAddress}</p> : null}
          {filled(detail.shippingName) || filled(detail.shippingAddress) ? null : <p>{t("orders.detail.noShipping")}</p>}
        </div>
      )}
    </Card>
  );
}

function ShipmentCard({ detail, canWrite }: { detail: FulfillmentDetailDto; canWrite: boolean }) {
  const { t } = useT();
  const act = useFulfillmentAction(detail.id);
  const shipment = detail.shipment;
  if (!shipment) return null;
  const status = shipment.notifyStatus;
  const tone = status === "SENT" ? "success" : status === "FAILED" ? "danger" : status === "MANUAL" ? "warning" : "neutral";

  async function resend() {
    try {
      const result = await act.mutateAsync({ action: "notify" });
      const after = result.shipment;
      if (after?.notifyStatus === "SENT") toast.success(t("pack.notify.toast.sent"));
      else toast.error(t("pack.notify.toast.failed", { reason: t(sendErrorKey(after?.notifyErrorCode ?? null)) }));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  async function copy() {
    if (!detail.notifyText) return;
    try {
      await navigator.clipboard.writeText(detail.notifyText);
      toast.success(t("pack.notify.copied"));
    } catch {
      toast.error(t("common.error.generic"));
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <h2 className="mb-3 text-base font-bold text-ink">{t("pack.shipment")}</h2>
      <div className="space-y-2 text-sm">
        <p className="text-ink">
          <span className="font-medium">{shipment.courier?.name ?? "—"}</span>
          {" · "}
          {shipment.trackingUrl ? (
            <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-brand-ink hover:underline">
              {shipment.trackingNumber}
            </a>
          ) : (
            <span className="font-mono font-semibold">{shipment.trackingNumber}</span>
          )}
        </p>
        {shipment.shippedAt ? (
          <p className="text-ink-secondary">{t("pack.shippedBy", { name: shipment.shippedBy?.name ?? "—", time: formatDateTime(shipment.shippedAt) })}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusPill tone={tone}>
            {status === "FAILED"
              ? t("pack.notify.FAILED", { reason: t(sendErrorKey(shipment.notifyErrorCode)) })
              : t(`pack.notify.${status}`)}
          </StatusPill>
          {detail.notifyText ? (
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              {t("pack.notify.copy")}
            </Button>
          ) : null}
          {canWrite && (status === "FAILED" || status === "NONE") ? (
            <Button type="button" variant="outline" size="sm" className="rounded-lg" loading={act.isPending} onClick={() => void resend()}>
              <Send aria-hidden="true" />
              {t("pack.notify.resend")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function OverrideDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (open: boolean) => void; orderId: string }) {
  const { t } = useT();
  const act = useFulfillmentAction(orderId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 300) {
      setError(t("pack.overrideReasonInvalid"));
      return;
    }
    setError(null);
    try {
      await act.mutateAsync({ action: "override", input: { reason: trimmed } });
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        <form onSubmit={submit} noValidate>
          <DialogHeader title={t("pack.overrideTitle")} description={t("pack.overrideDescription")} />
          <DialogBody>
            <Field label={t("pack.overrideReason")} htmlFor="pack-override-reason" required error={error ?? undefined}>
              <Input id="pack-override-reason" maxLength={300} invalid={!!error} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" className="h-10 rounded-xl px-6 font-bold" loading={act.isPending}>
              {t("pack.overrideConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShipDialog({ open, onOpenChange, detail }: { open: boolean; onOpenChange: (open: boolean) => void; detail: FulfillmentDetailDto }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {open ? <ShipForm detail={detail} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ShipForm({ detail, onDone }: { detail: FulfillmentDetailDto; onDone: () => void }) {
  const { t } = useT();
  const couriers = useCouriers();
  const act = useFulfillmentAction(detail.id);
  const active = (couriers.data ?? []).filter((courier) => courier.isActive);
  const [courierId, setCourierId] = useState("");
  const [tracking, setTracking] = useState("");
  const [errors, setErrors] = useState<{ courier?: string; tracking?: string; form?: string }>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...(courierId ? {} : { courier: t("pack.courierRequired") }),
      ...(tracking.trim() ? {} : { tracking: t("pack.trackingRequired") }),
    };
    setErrors(next);
    if (next.courier || next.tracking) return;
    try {
      await act.mutateAsync({ action: "ship", input: { courierId, trackingNumber: tracking.trim() } });
      toast.success(t("pack.toast.shipped"));
      onDone();
    } catch (caught) {
      setErrors({ form: errorMessage(caught, t) });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("pack.shipTitle", { number: detail.orderNumber })} description={t("pack.shipDescription")} />
      <DialogBody>
        {errors.form ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {errors.form}
          </p>
        ) : null}
        {couriers.data && active.length === 0 ? <p className="text-sm text-warning-ink">{t("pack.noCouriers")}</p> : null}
        <Field label={t("pack.courier")} htmlFor="ship-courier" required error={errors.courier}>
          <Select id="ship-courier" value={courierId} invalid={!!errors.courier} onChange={(event) => setCourierId(event.target.value)}>
            <option value="">—</option>
            {active.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("pack.tracking")} htmlFor="ship-tracking" required error={errors.tracking}>
          <Input
            id="ship-tracking"
            className="font-mono"
            autoComplete="off"
            maxLength={100}
            invalid={!!errors.tracking}
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={act.isPending}>
          {t("pack.ship")}
        </Button>
      </DialogFooter>
    </form>
  );
}

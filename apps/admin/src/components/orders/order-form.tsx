"use client";

import { createOrderSchema } from "@oca/shared";
import { Button, Card, Field, Input, PageHeader, Select, toast } from "@oca/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage, extractShortages, shortageLines } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import {
  type CustomerMode,
  type OrderFormState,
  type OrderLineDraft,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  newIdempotencyKey,
  shortageKeys,
  toCreateOrderInput,
} from "@/lib/order-form";
import { useCreateOrder, useStoreSettings, useWarehouses } from "@/lib/queries";
import type { Shortage, VariantSearchItemDto } from "@/lib/types";
import { CustomerPicker } from "./customer-picker";

const ERRORS_ID = "order-form-errors";
const EMPTY_ID = "order-items-empty";
const PICKER_ID = "order-variant";

/** ລະຫັດຊ່ອງທີ່ຜິດ: ຊ່ອງຕໍ່ແຖວໃຊ້ `qty:<variantId>` ແລະ ຄ້າຍກັນ; ຊ່ອງອື່ນໃຊ້ຊື່ຄົງທີ່ */
interface FormIssues {
  messages: string[];
  fields: string[];
}
const NO_ISSUES: FormIssues = { messages: [], fields: [] };

const qtyId = (variantId: string) => `line-qty-${variantId}`;
const lineMessageId = (variantId: string) => `line-msg-${variantId}`;

/** ລວມ id ສຳລັບ aria-describedby (ຕັດຄ່າວ່າງ); ບໍ່ມີ = undefined */
function describe(ids: (string | false | null | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

export function OrderForm() {
  const { t } = useT();
  const router = useRouter();
  const create = useCreateOrder();
  const warehouses = useWarehouses();
  const settings = useStoreSettings();

  const [form, setForm] = useState<OrderFormState>(emptyOrderForm);
  const [issues, setIssues] = useState<FormIssues>(NO_ISSUES);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  // key ຂອງຊຸດການລອງສົ່ງ: ໃຊ້ key ເດີມຕາບໃດ payload ບໍ່ປ່ຽນ (ລອງໃໝ່ຫຼັງ network ລົ້ມ ບໍ່ສ້າງບິນຊ້ຳ)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  // ແຖວທີ່ຕ້ອງ focus ຊ່ອງຈຳນວນຫຼັງ render (ຫຼັງເພີ່ມສິນຄ້າ)
  const focusQty = useRef<string | null>(null);

  const activeWarehouses = (warehouses.data ?? []).filter((warehouse) => warehouse.isActive);
  const defaultWarehouse = activeWarehouses.find((warehouse) => warehouse.isDefault) ?? null;
  const noDefault = warehouses.data !== undefined && !defaultWarehouse;
  const shortageByLine = useMemo(() => shortageKeys(shortages), [shortages]);
  const totals = settings.data ? computeTotals(form, settings.data) : null;
  const empty = form.lines.length === 0;

  const invalid = (field: string) => issues.fields.includes(field);
  const errorsRef = (field: string) => (invalid(field) ? ERRORS_ID : undefined);

  useEffect(() => {
    if (!focusQty.current) return;
    document.getElementById(qtyId(focusQty.current))?.focus();
    focusQty.current = null;
  }, [form.lines]);

  // ແກ້ຂໍ້ມູນ = ຂໍ້ຄວາມຜິດ/ສະຕ໋ອກບໍ່ພໍ ທີ່ສະແດງຢູ່ ເກົ່າແລ້ວ
  const edit = () => {
    setIssues(NO_ISSUES);
    setShortages([]);
  };
  const patch = (change: Partial<OrderFormState>) => {
    edit();
    setForm((current) => ({ ...current, ...change }));
  };
  const patchLine = (variantId: string, change: Partial<OrderLineDraft>) => {
    edit();
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.variant.id === variantId ? { ...line, ...change } : line)),
    }));
  };

  function addVariant(variant: VariantSearchItemDto) {
    edit();
    focusQty.current = variant.id;
    setForm((current) => ({
      ...current,
      lines: [...current.lines, { variant, warehouseId: "", quantity: "1", discount: "" }],
    }));
  }

  function removeLine(variantId: string) {
    edit();
    setForm((current) => ({ ...current, lines: current.lines.filter((line) => line.variant.id !== variantId) }));
    // ແຖວທີ່ກົດຫາຍໄປ: ສົ່ງ focus ກັບຊ່ອງຄົ້ນຫາສິນຄ້າ (ບໍ່ໃຫ້ຕົກໄປ body)
    document.getElementById(PICKER_ID)?.focus();
  }

  /** ກວດຂໍ້ມູນ ແລະ ແປເປັນຂໍ້ຄວາມຂອງລະບົບເອງ (ບໍ່ສະແດງ path/ຂໍ້ຄວາມດິບຈາກ zod) */
  function validate() {
    const found = new Map<string, string>(); // ຂໍ້ຄວາມ → ຊ່ອງ (ຂໍ້ຄວາມຊ້ຳບໍ່ຊ້ອນ)
    const flag = (field: string, text: string) => {
      if (!found.has(text)) found.set(text, field);
    };
    const flagged = new Set<string>();
    const mark = (field: string, text: string) => {
      flagged.add(field);
      flag(field, text);
    };
    const invalidText = (label: string) => t("orders.err.invalid", { field: label });

    if (form.customerMode === "existing" && !form.customer) mark("customer", t("orders.err.customer"));

    const parsed = createOrderSchema.safeParse(toCreateOrderInput(form));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [head, index, leaf] = issue.path;
        if (head === "items" && typeof index === "number") {
          const line = form.lines[index];
          const id = line?.variant.id ?? "";
          const sku = line?.variant.sku ?? "";
          if (leaf === "quantity") mark(`qty:${id}`, t("orders.err.quantity", { sku }));
          else if (leaf === "discount") mark(`discount:${id}`, t("orders.err.discount", { sku }));
          else mark(`warehouse:${id}`, invalidText(`${t("orders.items.warehouse")} ${sku}`.trim()));
        } else if (head === "items") mark("items", t("orders.err.items"));
        else if (head === "shippingFee") mark("fee", invalidText(t("orders.shipping.fee")));
        else if (head === "reservationMinutes") mark("reservation", invalidText(t("orders.reservation")));
        else if (head === "customerId") mark("customer", t("orders.err.customer"));
        else if (head === "customer") {
          if (index === "name") mark("newName", invalidText(t("orders.customer.name")));
          else if (index === "phone") mark("newPhone", invalidText(t("orders.customer.phone")));
          else if (index === "email") mark("newEmail", invalidText(t("orders.customer.email")));
          else mark("newName", invalidText(t("orders.section.customer")));
        } else mark("form", t("common.error.generic"));
      }
    }

    for (const line of form.lines) {
      const id = line.variant.id;
      const sku = line.variant.sku;
      if (!line.warehouseId && noDefault) mark(`warehouse:${id}`, t("orders.err.warehouse", { sku }));
      // ສ່ວນຫຼຸດເກີນຍອດແຖວ schema ຈັບບໍ່ໄດ້: ໃຊ້ສູດດຽວກັບສະຫຼຸບເງິນ (decimal string) ກັບແຖວນີ້ແຖວດຽວ
      if (settings.data && !flagged.has(`qty:${id}`) && !flagged.has(`discount:${id}`)) {
        if (computeTotals({ ...form, lines: [line], shippingFee: "" }, settings.data) === null) {
          mark(`discount:${id}`, t("orders.err.discount", { sku }));
        }
      }
    }
    if (found.size > 0) {
      return { ok: false as const, issues: { messages: [...found.keys()], fields: [...found.values()] } };
    }
    if (!parsed.success) return { ok: false as const, issues: NO_ISSUES };
    return { ok: true as const, data: parsed.data };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // ສ້າງບິນຈອງສະຕ໋ອກ: ກັນສົ່ງຊ້ຳ (ຕໍ່ໃຫ້ມີ Idempotency-Key ກໍ່ບໍ່ຍິງຂະນະຄຳຂໍເດີມຍັງແລ່ນ)
    if (saving || create.isPending || submitting.current) return;
    setShortages([]);
    const result = validate();
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues(NO_ISSUES);
    const fingerprint = JSON.stringify(result.data);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
    submitting.current = true;
    setSaving(true);
    try {
      const order = await create.mutateAsync({ input: result.data, idempotencyKey: attempt.current.key });
      attempt.current = null; // ສຳເລັດແນ່ນອນ: ການສົ່ງຄັ້ງຕໍ່ໄປເປັນບິນໃໝ່
      toast.success(t("orders.toast.created", { number: order.orderNumber }));
      router.push(`/orders/${order.id}`);
    } catch (error) {
      setShortages(extractShortages(error));
      setIssues({ messages: [errorMessage(error, t), ...shortageLines(error, t)], fields: [] });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const modeOptions: { value: CustomerMode; label: string }[] = [
    { value: "none", label: t("orders.customer.none") },
    { value: "existing", label: t("orders.customer.existing") },
    { value: "new", label: t("orders.customer.new") },
  ];

  return (
    <form
      onSubmit={submit}
      noValidate
      // Enter ໃນ <input> ໃດໆ ບໍ່ໃຫ້ກາຍເປັນ implicit submit (ບິນຈອງສະຕ໋ອກຈິງ; ເຄື່ອງສະແກນບາໂຄດສົ່ງ Enter).
      // ປຸ່ມ (submit/button) ແລະ <select>/<textarea> ຍັງໃຊ້ Enter ຕາມປົກກະຕິ
      onKeyDown={(event) => {
        const target = event.target;
        if (event.key !== "Enter" || !(target instanceof HTMLInputElement)) return;
        if (target.type === "submit" || target.type === "button") return;
        event.preventDefault();
      }}
    >
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title"), t("orders.form.title")]}
        title={t("orders.form.title")}
        description={t("orders.form.description")}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => router.push("/orders")}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="rounded-xl font-bold"
              loading={saving}
              disabled={empty}
              // ກະຕ່າເປົ່າ: ປຸ່ມຖືກປິດ ແລະ ເຫດຜົນ (ຂໍ້ຄວາມ "ຍັງບໍ່ໄດ້ເພີ່ມສິນຄ້າ") ຖືກອ່ານຜ່ານ aria-describedby
              aria-describedby={empty ? EMPTY_ID : undefined}
            >
              {t("orders.submit")}
            </Button>
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {issues.messages.length > 0 ? (
          <div
            id={ERRORS_ID}
            role="alert"
            className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink"
          >
            <p className="font-semibold">{t("orders.form.issues")}</p>
            <ul className="mt-1 list-inside list-disc">
              {issues.messages.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.items")}</h2>
          {noDefault ? (
            <p className="mb-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
              {t("orders.items.noDefaultWarehouse")}
            </p>
          ) : null}
          <div className="max-w-xl">
            {/* variant ໜຶ່ງຕົວມີໄດ້ແຖວດຽວ: ຕັດອອກຈາກຜົນຄົ້ນຫາ ຈຶ່ງບໍ່ເກີດ (variant, ສາງ) ຊ້ຳ ແມ່ນແຕ່ ສາງ "" ກັບສາງຫຼັກຕົງໆ */}
            <VariantPicker
              id={PICKER_ID}
              label={t("orders.items.add")}
              excludeIds={form.lines.map((line) => line.variant.id)}
              invalid={invalid("items")}
              aria-describedby={errorsRef("items")}
              onSelect={addVariant}
            />
          </div>
          {empty ? (
            <p id={EMPTY_ID} className="mt-4 text-sm text-ink-muted">
              {t("orders.items.empty")}
            </p>
          ) : (
            <div className="mt-4 w-full overflow-x-auto">
              <table aria-label={t("orders.items.table")} className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-ink-secondary">
                    <th scope="col" className="px-2 py-2">{t("orders.items.product")}</th>
                    <th scope="col" className="px-2 py-2">{t("orders.items.warehouse")}</th>
                    <th scope="col" className="px-2 py-2">{t("orders.items.quantity")}</th>
                    <th scope="col" className="px-2 py-2">{t("orders.items.discount")}</th>
                    <th scope="col" className="px-2 py-2">{t("orders.items.availableHeader")}</th>
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">{t("common.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => {
                    const id = line.variant.id;
                    const sku = line.variant.sku;
                    const available = lineAvailable(line, defaultWarehouse?.id ?? null);
                    const effectiveWarehouse = line.warehouseId || defaultWarehouse?.id || "";
                    const shortage = shortageByLine.get(`${id}|${effectiveWarehouse}`);
                    const quantity = /^\d{1,9}$/.test(line.quantity.trim()) ? Number(line.quantity.trim()) : null;
                    const exceeds = quantity !== null && quantity > available;
                    const message = shortage
                      ? t("orders.items.shortage", { requested: shortage.requested, available: shortage.available })
                      : exceeds
                        ? t("orders.items.exceeds", { count: available })
                        : null;
                    return (
                      <tr key={id} data-testid={`order-line-${index}`} className="border-t border-line align-top">
                        <th scope="row" className="px-2 py-2 text-left font-normal">
                          <p className="font-medium text-ink">
                            {line.variant.productName}
                            {line.variant.name ? ` — ${line.variant.name}` : ""}
                          </p>
                          <p className="font-mono text-xs text-ink-muted">{sku}</p>
                          <p className="text-xs text-ink-muted tabular-nums">{formatMoney(line.variant.price)}</p>
                        </th>
                        <td className="px-2 py-2">
                          <Select
                            aria-label={`${t("orders.items.warehouse")} ${sku}`}
                            value={line.warehouseId}
                            invalid={invalid(`warehouse:${id}`)}
                            aria-describedby={errorsRef(`warehouse:${id}`)}
                            onChange={(event) => patchLine(id, { warehouseId: event.target.value })}
                          >
                            <option value="">
                              {t("orders.items.defaultWarehouse", { code: defaultWarehouse?.code ?? "—" })}
                            </option>
                            {activeWarehouses
                              .filter((warehouse) => warehouse.id !== defaultWarehouse?.id)
                              .map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                  {`${warehouse.code} — ${warehouse.name}`}
                                </option>
                              ))}
                          </Select>
                        </td>
                        <td className="w-28 px-2 py-2">
                          <Input
                            id={qtyId(id)}
                            aria-label={`${t("orders.items.quantity")} ${sku}`}
                            inputMode="numeric"
                            autoComplete="off"
                            value={line.quantity}
                            invalid={invalid(`qty:${id}`)}
                            aria-describedby={describe([message && lineMessageId(id), invalid(`qty:${id}`) && ERRORS_ID])}
                            onChange={(event) => patchLine(id, { quantity: event.target.value })}
                          />
                        </td>
                        <td className="w-32 px-2 py-2">
                          <Input
                            aria-label={`${t("orders.items.discount")} ${sku}`}
                            inputMode="decimal"
                            autoComplete="off"
                            value={line.discount}
                            invalid={invalid(`discount:${id}`)}
                            aria-describedby={errorsRef(`discount:${id}`)}
                            onChange={(event) => patchLine(id, { discount: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <p className="pt-2 text-ink-secondary">{t("orders.items.available", { count: available })}</p>
                          {message ? (
                            <p
                              id={lineMessageId(id)}
                              className={`mt-1 text-xs ${shortage ? "font-semibold text-danger" : "text-warning-ink"}`}
                            >
                              {message}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            aria-label={`${t("orders.items.remove")} ${sku}`}
                            title={t("orders.items.remove")}
                            onClick={() => removeLine(id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="rounded-[20px] p-6">
          {/* fieldset + legend: input ຂອງ picker ຫາຍໄປຕອນເລືອກລູກຄ້າແລ້ວ ຈຶ່ງໃຊ້ label htmlFor ຊີ້ມັນບໍ່ໄດ້ */}
          <fieldset className="min-w-0" aria-describedby={errorsRef("customer")}>
            <legend className="mb-4 text-base font-bold text-ink">{t("orders.section.customer")}</legend>
            <div className="mb-4 flex flex-wrap gap-4">
              {modeOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="customer-mode"
                    className="accent-[var(--color-brand)]"
                    checked={form.customerMode === option.value}
                    onChange={() => patch({ customerMode: option.value })}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {form.customerMode === "existing" ? (
              <div className="max-w-md">
                <CustomerPicker value={form.customer} onSelect={(customer) => patch({ customer })} />
              </div>
            ) : null}
            {form.customerMode === "new" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={t("orders.customer.name")} htmlFor="new-customer-name" required>
                  <Input
                    id="new-customer-name"
                    value={form.newCustomer.name}
                    invalid={invalid("newName")}
                    aria-describedby={errorsRef("newName")}
                    onChange={(event) => patch({ newCustomer: { ...form.newCustomer, name: event.target.value } })}
                  />
                </Field>
                <Field label={t("orders.customer.phone")} htmlFor="new-customer-phone" required>
                  <Input
                    id="new-customer-phone"
                    inputMode="tel"
                    value={form.newCustomer.phone}
                    invalid={invalid("newPhone")}
                    aria-describedby={errorsRef("newPhone")}
                    onChange={(event) => patch({ newCustomer: { ...form.newCustomer, phone: event.target.value } })}
                  />
                </Field>
                <Field label={t("orders.customer.email")} htmlFor="new-customer-email">
                  <Input
                    id="new-customer-email"
                    inputMode="email"
                    value={form.newCustomer.email}
                    invalid={invalid("newEmail")}
                    aria-describedby={errorsRef("newEmail")}
                    onChange={(event) => patch({ newCustomer: { ...form.newCustomer, email: event.target.value } })}
                  />
                </Field>
              </div>
            ) : null}
          </fieldset>
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.shipping")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("orders.shipping.fee")} htmlFor="order-shipping-fee">
              <Input
                id="order-shipping-fee"
                inputMode="decimal"
                autoComplete="off"
                value={form.shippingFee}
                invalid={invalid("fee")}
                aria-describedby={errorsRef("fee")}
                onChange={(event) => patch({ shippingFee: event.target.value })}
              />
            </Field>
            <Field label={t("orders.reservation")} htmlFor="order-reservation">
              <Input
                id="order-reservation"
                inputMode="numeric"
                autoComplete="off"
                value={form.reservationMinutes}
                invalid={invalid("reservation")}
                aria-describedby={describe([settings.data && "order-reservation-hint", invalid("reservation") && ERRORS_ID])}
                onChange={(event) => patch({ reservationMinutes: event.target.value })}
              />
              {settings.data ? (
                <p id="order-reservation-hint" className="mt-1 text-xs text-ink-muted">
                  {t("orders.reservationHint", { minutes: settings.data.reservationMinutes })}
                </p>
              ) : null}
            </Field>
            <Field label={t("orders.shipping.name")} htmlFor="order-shipping-name">
              <Input id="order-shipping-name" value={form.shippingName} onChange={(event) => patch({ shippingName: event.target.value })} />
            </Field>
            <Field label={t("orders.shipping.phone")} htmlFor="order-shipping-phone">
              <Input id="order-shipping-phone" inputMode="tel" value={form.shippingPhone} onChange={(event) => patch({ shippingPhone: event.target.value })} />
            </Field>
            <Field label={t("orders.shipping.address")} htmlFor="order-shipping-address" className="sm:col-span-2">
              <Input id="order-shipping-address" value={form.shippingAddress} onChange={(event) => patch({ shippingAddress: event.target.value })} />
            </Field>
            <Field label={t("orders.note")} htmlFor="order-note" className="sm:col-span-2">
              <Input id="order-note" value={form.note} onChange={(event) => patch({ note: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="max-w-md rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.summary")}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.subtotal")}</dt>
              <dd className="tabular-nums">{totals ? formatMoney(totals.subtotal) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.discount")}</dt>
              <dd className="tabular-nums">{totals ? formatMoney(totals.discountTotal) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.shipping")}</dt>
              <dd className="tabular-nums">{totals ? formatMoney(form.shippingFee.trim() || "0") : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">
                {t("orders.summary.vat", { rate: settings.data ? formatMoney(settings.data.vatRate) : "—" })}{" "}
                {settings.data?.pricesIncludeVat ? t("orders.summary.vatIncluded") : null}
              </dt>
              <dd className="tabular-nums" data-testid="summary-vat">
                {totals ? formatMoney(totals.vatAmount) : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
              <dt>{t("orders.summary.total")}</dt>
              <dd className="tabular-nums" data-testid="summary-total">
                {totals ? formatMoney(totals.total) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">{t("orders.summary.estimate")}</p>
        </Card>
      </div>
    </form>
  );
}

"use client";

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
  type FormIssues,
  type OrderFormState,
  type OrderLineDraft,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  lineQuantity,
  newIdempotencyKey,
  orderFormForConversation,
  shortageKeys,
  validateOrderForm,
} from "@/lib/order-form";
import { useCreateOrder, useStoreSettings, useWarehouses } from "@/lib/queries";
import type { ConversationDto, OrderDetailDto, Shortage, VariantSearchItemDto } from "@/lib/types";
import { CustomerPicker } from "./customer-picker";

const ERRORS_ID = "order-form-errors";
const EMPTY_ID = "order-items-empty";
const PICKER_ID = "order-variant";

const NO_ISSUES: FormIssues = { messages: [], fields: [] };

const qtyId = (variantId: string) => `line-qty-${variantId}`;
const lineMessageId = (variantId: string) => `line-msg-${variantId}`;

/** ລວມ id ສຳລັບ aria-describedby (ຕັດຄ່າວ່າງ); ບໍ່ມີ = undefined */
function describe(ids: (string | false | null | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

export interface OrderFormChat {
  /** ເຄສທີ່ເປີດບິນຈາກ: prefill ລູກຄ້າ, ຕິດ conversationId ໃສ່ payload, ຫົວຂໍ້ ແລະ ປຸ່ມຍົກເລີກຕາມແຊັດ */
  conversation: ConversationDto;
  /**
   * ເອີ້ນຫຼັງບິນຖືກສ້າງສຳເລັດແລ້ວ (ຢູ່ນອກ try ຂອງການສ້າງບິນ: ເຖິງ handler throw ກໍ່ບໍ່ຖືກລາຍງານວ່າສ້າງບິນບໍ່ສຳເລັດ).
   * ຜູ້ເອີ້ນຮັບຜິດຊອບການສົ່ງສະຫຼຸບ/ພາໄປໜ້າອື່ນ (ຟອມບໍ່ push ໄປ /orders/[id] ໃນໂໝດນີ້)
   */
  onCreated: (order: OrderDetailDto, options: { sendSummary: boolean }) => void;
}

export function OrderForm({ chat }: { chat?: OrderFormChat } = {}) {
  const { t } = useT();
  const router = useRouter();
  const create = useCreateOrder();
  const warehouses = useWarehouses();
  const settings = useStoreSettings();

  const [form, setForm] = useState<OrderFormState>(() =>
    chat ? orderFormForConversation(chat.conversation.customer) : emptyOrderForm(),
  );
  // ໂໝດແຊັດ: ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດຫຼັງສ້າງ (ເລີ່ມຕົ້ນເປີດ)
  const [sendSummary, setSendSummary] = useState(true);
  const [issues, setIssues] = useState<FormIssues>(NO_ISSUES);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  // ປ້າຍບອກວ່າ component ຍັງຢູ່: ຄຳຂໍທີ່ຈົບຫຼັງຜູ້ໃຊ້ອອກຈາກໜ້າ ບໍ່ຕັ້ງ state / ບໍ່ພາໄປໜ້າບິນ
  const mounted = useRef(true);
  // ຂໍ້ຄວາມສຳລັບ screen reader ເມື່ອເພີ່ມ/ລຶບແຖວ (role=status ທີ່ເບິ່ງບໍ່ເຫັນ)
  const [announcement, setAnnouncement] = useState("");
  // ເພີ່ມຄ່າທຸກຄັ້ງທີ່ສົ່ງບໍ່ຜ່ານ ເພື່ອ focus ກັບ alert ແມ່ນແຕ່ຂໍ້ຄວາມຄືເກົ່າ
  const [alertTick, setAlertTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  // key ຂອງຊຸດການລອງສົ່ງ: ໃຊ້ key ເດີມຕາບໃດ payload ບໍ່ປ່ຽນ (ລອງໃໝ່ຫຼັງ network ລົ້ມ ບໍ່ສ້າງບິນຊ້ຳ).
  // ຂໍ້ຈຳກັດທີ່ຍອມຮັບ: key ຢູ່ໃນ ref ເທົ່ານັ້ນ ຖ້າ remount/reload ຫຼັງການລອງທີ່ໝົດເວລາ key ຫາຍ
  // ແລະ ການສ້າງບິນດຽວກັນຊ້ຳອາດໄດ້ບິນຊ້ຳ
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
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ສົ່ງບໍ່ຜ່ານ: ເອົາ focus ໄປທີ່ alert (ຂໍ້ຄວາມຖືກອ່ານ ແລະ ຜູ້ໃຊ້ເຫັນວ່າຜິດຫຍັງ)
  useEffect(() => {
    if (alertTick > 0) alertRef.current?.focus();
  }, [alertTick]);

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
    setAnnouncement(t("orders.items.added", { sku: variant.sku, count: form.lines.length + 1 }));
    setForm((current) => ({
      ...current,
      lines: [...current.lines, { variant, warehouseId: "", quantity: "1", discount: "" }],
    }));
  }

  function removeLine(variantId: string) {
    const removed = form.lines.find((line) => line.variant.id === variantId);
    if (removed) setAnnouncement(t("orders.items.removed", { sku: removed.variant.sku, count: form.lines.length - 1 }));
    edit();
    setForm((current) => ({ ...current, lines: current.lines.filter((line) => line.variant.id !== variantId) }));
    // ແຖວທີ່ກົດຫາຍໄປ: ສົ່ງ focus ກັບຊ່ອງຄົ້ນຫາສິນຄ້າ (ບໍ່ໃຫ້ຕົກໄປ body)
    document.getElementById(PICKER_ID)?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // ສ້າງບິນຈອງສະຕ໋ອກ: ກັນສົ່ງຊ້ຳ (ຕໍ່ໃຫ້ມີ Idempotency-Key ກໍ່ບໍ່ຍິງຂະນະຄຳຂໍເດີມຍັງແລ່ນ)
    if (saving || create.isPending || submitting.current) return;
    setShortages([]);
    const result = validateOrderForm(form, { noDefaultWarehouse: noDefault, settings: settings.data }, t);
    if (!result.ok) {
      setIssues(result.issues);
      setAlertTick((tick) => tick + 1);
      return;
    }
    setIssues(NO_ISSUES);
    // ບິນຈາກແຊັດ: ຕິດ conversationId (server ກຳນົດ channel/source ຈາກເຄສ). ຢູ່ໃນ fingerprint ຈຶ່ງ key ປ່ຽນເມື່ອເຄສປ່ຽນ
    const payload = chat ? { ...result.data, conversationId: chat.conversation.id } : result.data;
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
    submitting.current = true;
    setSaving(true);
    let created: OrderDetailDto | null = null;
    try {
      const order = await create.mutateAsync({ input: payload, idempotencyKey: attempt.current.key });
      created = order;
      attempt.current = null; // ສຳເລັດແນ່ນອນ: ການສົ່ງຄັ້ງຕໍ່ໄປເປັນບິນໃໝ່
      // toast ສະແດງສະເໝີ (ບິນຖືກສ້າງ ແລະ ຈອງສະຕ໋ອກແລ້ວ ແມ່ນແຕ່ຜູ້ໃຊ້ອອກຈາກໜ້າ); ການພາໄປໜ້າບິນສະເພາະຕອນຍັງຢູ່
      toast.success(t("orders.toast.created", { number: order.orderNumber }));
      if (!chat && mounted.current) router.push(`/orders/${order.id}`);
    } catch (error) {
      if (mounted.current) {
        setShortages(extractShortages(error));
        setIssues({ messages: [errorMessage(error, t), ...shortageLines(error, t)], fields: [] });
        setAlertTick((tick) => tick + 1);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
    // ນອກ try: ຄວາມຜິດພາດຂອງ handler (ເຊັ່ນ ສົ່ງສະຫຼຸບ) ຕ້ອງບໍ່ຖືກສະແດງເປັນ "ສ້າງບິນບໍ່ສຳເລັດ"
    if (created && chat && mounted.current) chat.onCreated(created, { sendSummary });
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
        // Enter ທີ່ຢືນຢັນ composition ຂອງ IME ປ່ອຍໃຫ້ IME ຈັດການ (ບໍ່ preventDefault)
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key !== "Enter" || !(target instanceof HTMLInputElement)) return;
        if (target.type === "submit" || target.type === "button") return;
        event.preventDefault();
      }}
    >
      <PageHeader
        breadcrumbs={
          chat
            ? [t("nav.home"), t("inbox.title"), t("orders.chat.title")]
            : [t("nav.home"), t("orders.title"), t("orders.form.title")]
        }
        title={chat ? t("orders.chat.title") : t("orders.form.title")}
        description={chat ? t("orders.chat.description", { name: chat.conversation.displayName }) : t("orders.form.description")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving}
              onClick={() => router.push(chat ? `/inbox?c=${encodeURIComponent(chat.conversation.id)}` : "/orders")}
            >
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
      {/* ຂະນະບັນທຶກລັອກທຸກຊ່ອງ: ແກ້ຂໍ້ມູນກາງຄັນບໍ່ໄດ້ ຈຶ່ງບໍ່ຕ່າງຈາກ payload ທີ່ສົ່ງໄປແລ້ວ */}
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-6 border-0 px-3 pb-10 sm:px-6">
        <div role="status" className="sr-only" data-testid="order-announce">
          {announcement}
        </div>
        {issues.messages.length > 0 ? (
          <div
            id={ERRORS_ID}
            ref={alertRef}
            tabIndex={-1}
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
                    const quantity = lineQuantity(line.quantity);
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
            {chat && !chat.conversation.customer ? (
              <p className="mb-4 text-sm text-ink-secondary">{t("orders.chat.unlinkedHint")}</p>
            ) : null}
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

        {chat ? (
          <Card className="max-w-md rounded-[20px] p-6">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--color-brand)]"
                checked={sendSummary}
                onChange={(event) => setSendSummary(event.target.checked)}
              />
              <span>{t("orders.chat.sendSummary")}</span>
            </label>
          </Card>
        ) : null}
      </fieldset>
    </form>
  );
}

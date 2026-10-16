"use client";

import type { StoreCreateOrderInput } from "@oca/shared";
import { Button, EmptyState, Field, Input, Select, Skeleton, buttonVariants, cn } from "@oca/ui";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { clearCart, useCart } from "@/lib/cart";
import { ClientApiError, createOrder, fetchMember } from "@/lib/client-api";
import { formatLak } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { apiMessage, couponMessage, pointsMessage } from "@/lib/messages";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import type { StoreCart, StoreLoyalty, StoreMember } from "@/lib/types";
import { useCartCheck } from "@/lib/use-cart-check";
import { type PointsNotice, PointsControl, clampNotice, parsePoints } from "./points-control";

const FIELDS = ["name", "phone", "address", "courierId", "branch"] as const;
type FieldName = (typeof FIELDS)[number];
type Values = Record<FieldName | "note", string>;
type Problem = { message: string; cartLink?: boolean };

const EMPTY_VALUES: Values = { name: "", phone: "", address: "", courierId: "", branch: "", note: "" };
/** code ທີ່ໝາຍຄວາມວ່າກະຕ່າບໍ່ກົງກັບສິ່ງທີ່ຂາຍໄດ້ແລ້ວ */
const CART_PROBLEM_CODES = new Set(["INSUFFICIENT_STOCK", "VARIANT_NOT_AVAILABLE", "VARIANT_NOT_FOUND"]);
const TEXTAREA =
  "w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";

function validate(values: Values): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!values.name.trim()) errors.name = "ກະລຸນາໃສ່ຊື່ຜູ້ຮັບ";
  if (!isValidPhone(normalizePhone(values.phone))) errors.phone = "ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–15 ຫຼັກ)";
  if (!values.address.trim()) errors.address = "ກະລຸນາໃສ່ທີ່ຢູ່ຈັດສົ່ງ";
  if (!values.courierId) errors.courierId = "ກະລຸນາເລືອກບໍລິສັດຂົນສົ່ງ";
  if (!values.branch.trim()) errors.branch = "ກະລຸນາໃສ່ສາຂາປາຍທາງ";
  return errors;
}

const NO_LOYALTY: StoreLoyalty = { enabled: false };

/**
 * ຟອມສັ່ງຊື້ + ສະຫຼຸບກະຕ່າ. ສຳເລັດ → ລ້າງກະຕ່າ ແລ້ວໄປໜ້າບິນ.
 * ສະມາຊິກທີ່ເຂົ້າລະບົບແລ້ວ: ຕື່ມຊື່/ເບີໃຫ້ ແລະ ໃຊ້ແຕ້ມໄດ້ (ສະເພາະເມື່ອເບີຜູ້ຮັບກົງກັບເບີຂອງບັນຊີ)
 */
export function CheckoutForm({ couriers, loyalty = NO_LOYALTY }: { couriers: { id: string; name: string }[]; loyalty?: StoreLoyalty }) {
  const router = useRouter();
  const items = useCart();
  // ໂຄດທີ່ລູກຄ້າກົດ "ໃຊ້" (server ເປັນຜູ້ຕັດສິນວ່າໃຊ້ໄດ້ ຫຼື ບໍ່)
  const [couponInput, setCouponInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  // undefined = ກຳລັງຖາມ, null = guest
  const [member, setMember] = useState<StoreMember | null | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [appliedPoints, setAppliedPoints] = useState(0);
  const phoneMatches = Boolean(member?.phone) && normalizePhone(values.phone) === member?.phone;
  const [pointsNotice, setPointsNotice] = useState<PointsNotice | null>(null);
  const dropMember = useCallback(() => {
    setMember(null);
    setAppliedPoints(0);
    setPointsInput("");
    setPointsNotice(null);
    setSessionExpired(true);
  }, []);
  // phoneMatches ມີ member ແລ້ວໃນຕົວ
  const requestedPoints = phoneMatches ? appliedPoints : 0;
  const { state, reload } = useCartCheck(appliedCode, requestedPoints, dropMember);

  // ຜົນກວດກະຕ່າໃໝ່ທີ່ປະຕິເສດແຕ້ມ: OVER_CAP → ປັບລົງເປັນເກນ; ອື່ນໆ → ກັບໄປຄ່າທີ່ server ຢືນຢັນ.
  // ຄ່າໃໝ່ຕ່ຳກວ່າທີ່ຂໍສະເໝີ ຈຶ່ງບໍ່ວົນ. ປັບ state ລະຫວ່າງ render (ບໍ່ແມ່ນ effect) ເພື່ອບໍ່ໃຫ້ກະພິບ
  const [handledCart, setHandledCart] = useState<StoreCart | null>(null);
  if (state.status === "ready" && !state.refreshing && state.cart !== handledCart) {
    setHandledCart(state.cart);
    const { pointsError } = state.cart;
    if (requestedPoints > 0 && pointsError) {
      const cap = pointsError.reason === "OVER_CAP" && typeof pointsError.maxPoints === "number" ? Math.max(0, pointsError.maxPoints) : null;
      // ຖືກປະຕິເສດ = ບໍ່ມີແຕ້ມທີ່ຢືນຢັນ (redeemed 0)
      const next = cap !== null && cap < requestedPoints ? cap : 0;
      setPointsNotice(next > 0 ? clampNotice(next) : { tone: "error", text: pointsMessage(pointsError) });
      setAppliedPoints(next);
      setPointsInput(next > 0 ? String(next) : "");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchMember().then(
      (found) => {
        if (cancelled) return;
        setMember(found);
        // ຕື່ມສະເພາະຊ່ອງທີ່ຍັງວ່າງ (ລູກຄ້າແກ້ໄຂໄດ້)
        setValues((current) => ({ ...current, name: current.name || found.name, phone: current.phone || (found.phone ?? "") }));
      },
      () => {
        if (!cancelled) setMember(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // key ເດີມຖືກໃຊ້ຊ້ຳສະເພາະເມື່ອສົ່ງ body ເດີມຄືນ (key ເດີມ + body ຕ່າງ = 409 ຈາກ API)
  const lastAttempt = useRef<{ body: string; key: string } | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  if (done) {
    return (
      <p role="status" className="rounded-2xl border border-success-line bg-success-soft p-6 text-center text-sm font-semibold text-success-ink">
        ສັ່ງຊື້ສຳເລັດ ກຳລັງໄປໜ້າບິນ…
      </p>
    );
  }
  if (state.status === "loading") {
    return (
      <div role="status" aria-label="ກຳລັງໂຫຼດ" className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="ກະຕ່າຂອງທ່ານຍັງຫວ່າງ"
        action={
          <Link href="/products" className={buttonVariants({ variant: "outlinePrimary" })}>
            ເລືອກຊື້ສິນຄ້າ
          </Link>
        }
      />
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger-line bg-danger-soft p-6 text-center">
        <p className="text-sm text-danger-ink">{apiMessage(state.code, "ໂຫຼດຂໍ້ມູນກະຕ່າບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່")}</p>
        <Button variant="outlineDanger" onClick={reload}>
          ລອງໃໝ່
        </Button>
      </div>
    );
  }

  const { cart, refreshing } = state;
  const noCouriers = couriers.length === 0;
  const points = cart.points;
  const pointsActive = loyalty.enabled && phoneMatches && points !== null && (points.maxPoints > 0 || points.redeemed > 0);
  // ແຕ້ມທີ່ພິມແຕ່ຍັງບໍ່ກົດ "ໃຊ້" ຫຼື ທີ່ server ຍັງບໍ່ຢືນຢັນ: ຫ້າມສັ່ງ (ຍອດອາດບໍ່ກົງກັບທີ່ລູກຄ້າຄາດ)
  const pointsPending =
    pointsActive && (parsePoints(pointsInput) !== appliedPoints || (appliedPoints > 0 && points.redeemed !== appliedPoints));
  const blocked = !cart.orderable || noCouriers || refreshing || pointsPending;
  const applyPoints = (value: number) => {
    const max = points?.maxPoints ?? 0;
    const next = Math.max(0, Math.min(value, max));
    setPointsNotice(value > max ? (next > 0 ? clampNotice(next) : { tone: "error", text: pointsMessage({ reason: "OVER_CAP", maxPoints: max }) }) : null);
    setAppliedPoints(next);
    setPointsInput(next > 0 ? String(next) : "");
  };

  const set = (name: keyof Values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    if (name !== "note" && errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };
  const ref = (name: FieldName) => (element: HTMLElement | null) => {
    fieldRefs.current[name] = element;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || blocked) return;
    const found = validate(values);
    setErrors(found);
    const firstInvalid = FIELDS.find((name) => found[name]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    const note = values.note.trim();
    const body: StoreCreateOrderInput = {
      items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      name: values.name.trim(),
      phone: normalizePhone(values.phone),
      address: values.address.trim(),
      courierId: values.courierId,
      branch: values.branch.trim(),
      ...(note ? { note } : {}),
      // ສົ່ງສະເພາະໂຄດທີ່ server ຢືນຢັນວ່າໃຊ້ໄດ້ (ຍອດທີ່ຄາດລວມສ່ວນຫຼຸດແລ້ວ)
      ...(cart.coupon ? { couponCode: cart.coupon.code } : {}),
      // ແຕ້ມທີ່ server ຢືນຢັນໃນການກວດກະຕ່າຫຼ້າສຸດ (ຍອດທີ່ຄາດລວມສ່ວນຫຼຸດຈາກແຕ້ມແລ້ວ)
      ...(cart.points && cart.points.redeemed > 0 ? { pointsToRedeem: cart.points.redeemed } : {}),
      expectedTotal: cart.total,
    };
    const serialized = JSON.stringify(body);
    if (lastAttempt.current?.body !== serialized) lastAttempt.current = { body: serialized, key: newIdempotencyKey() };

    setSubmitting(true);
    setProblem(null);
    try {
      const created = await createOrder(body, lastAttempt.current.key);
      setDone(true);
      clearCart();
      router.push(`/orders/${created.token}`);
    } catch (error) {
      const code = error instanceof ClientApiError ? error.code : undefined;
      if (code === "PRICE_CHANGED") {
        const total = error instanceof ClientApiError && typeof error.body.total === "string" ? error.body.total : null;
        setProblem({
          message: total
            ? `ລາຄາມີການປ່ຽນແປງ ຍອດໃໝ່ແມ່ນ ${formatLak(total)} ກະລຸນາກວດແລ້ວກົດຢືນຢັນອີກຄັ້ງ`
            : "ລາຄາມີການປ່ຽນແປງ ກະລຸນາກວດຍອດໃໝ່ແລ້ວກົດຢືນຢັນອີກຄັ້ງ",
        });
        reload();
      } else if (code === "COUPON_INVALID" && error instanceof ClientApiError) {
        // ໂຄດຖືກປະຕິເສດຕອນສັ່ງ (ເຊັ່ນ limit ຕໍ່ເບີ): ຖອດອອກ ແລ້ວໃຫ້ລູກຄ້າຕັດສິນໃຈສັ່ງຕໍ່ໃນລາຄາເຕັມ
        setProblem({ message: `${couponMessage(error.body)} ໂຄດຖືກຖອດອອກແລ້ວ ກະລຸນາກວດຍອດໃໝ່` });
        setAppliedCode(undefined);
        setCouponInput("");
      } else if (code === "MEMBER_REQUIRED") {
        // session ໝົດອາຍຸ (proxy ລຶບ cookie ແລ້ວ): ຖອດແຕ້ມ → ກວດຍອດໃໝ່ແບບ guest
        dropMember();
        setProblem({ message: "ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່ — ແຕ້ມຖືກຖອດອອກແລ້ວ ກະລຸນາກວດຍອດໃໝ່" });
      } else if (code === "POINTS_INVALID" && error instanceof ClientApiError) {
        setProblem({ message: `${pointsMessage(error.body)} — ແຕ້ມຖືກຖອດອອກແລ້ວ ກະລຸນາກວດຍອດໃໝ່` });
        setAppliedPoints(0);
        setPointsInput("");
        setPointsNotice(null);
        reload();
      } else if (code && CART_PROBLEM_CODES.has(code)) {
        setProblem({ message: "ສິນຄ້າບາງລາຍການມີບໍ່ພໍ ຫຼື ບໍ່ມີຂາຍແລ້ວ", cartLink: true });
        reload();
      } else {
        setProblem({ message: apiMessage(code, "ສັ່ງຊື້ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່") });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 md:grid-cols-[1fr_340px] md:items-start">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">ຂໍ້ມູນຜູ້ຮັບ</h2>
        <Field label="ຊື່ຜູ້ຮັບ" htmlFor="checkout-name" required error={errors.name}>
          <Input id="checkout-name" ref={ref("name")} className="h-11" autoComplete="name" maxLength={100} value={values.name} onChange={set("name")} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="ເບີໂທ" htmlFor="checkout-phone" required error={errors.phone}>
          <Input id="checkout-phone" ref={ref("phone")} className="h-11" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="020 5555 5555" value={values.phone} onChange={set("phone")} invalid={Boolean(errors.phone)} />
        </Field>
        <Field label="ທີ່ຢູ່ຈັດສົ່ງ" htmlFor="checkout-address" required error={errors.address}>
          <textarea id="checkout-address" ref={ref("address")} rows={3} maxLength={300} autoComplete="street-address" placeholder="ບ້ານ, ເມືອງ, ແຂວງ" value={values.address} onChange={set("address")} aria-invalid={errors.address ? true : undefined} className={TEXTAREA} />
        </Field>

        <h2 className="mt-2 text-base font-semibold text-ink">ການຈັດສົ່ງ</h2>
        {noCouriers ? (
          <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງບໍລິສັດຂົນສົ່ງ ຈຶ່ງຍັງສັ່ງຊື້ທາງເວັບບໍ່ໄດ້
          </p>
        ) : null}
        <Field label="ບໍລິສັດຂົນສົ່ງ" htmlFor="checkout-courier" required error={errors.courierId}>
          <Select id="checkout-courier" ref={ref("courierId")} className="h-11" value={values.courierId} onChange={set("courierId")} invalid={Boolean(errors.courierId)} disabled={noCouriers}>
            <option value="">ເລືອກບໍລິສັດຂົນສົ່ງ</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ສາຂາປາຍທາງ" htmlFor="checkout-branch" required error={errors.branch}>
          <Input id="checkout-branch" ref={ref("branch")} className="h-11" maxLength={200} placeholder="ສາຂາທີ່ຈະໄປຮັບເຄື່ອງ" value={values.branch} onChange={set("branch")} invalid={Boolean(errors.branch)} />
        </Field>
        <p className="text-xs text-ink-secondary">ຄ່າຂົນສົ່ງຊຳລະໃຫ້ບໍລິສັດຂົນສົ່ງຕອນຮັບສິນຄ້າ</p>
        <Field label="ໝາຍເຫດ (ຖ້າມີ)" htmlFor="checkout-note">
          <textarea id="checkout-note" rows={2} maxLength={500} value={values.note} onChange={set("note")} className={TEXTAREA} />
        </Field>
      </div>

      <section aria-label="ສະຫຼຸບຄຳສັ່ງຊື້" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:sticky md:top-20">
        <h2 className="text-base font-semibold text-ink">ສະຫຼຸບຄຳສັ່ງຊື້</h2>
        <ul className={cn("flex flex-col gap-2", refreshing && "opacity-60")}>
          {cart.items.map((line) =>
            line.unavailable ? null : (
              <li key={line.variantId} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink">{line.productName}</p>
                  <p className="text-xs text-ink-secondary">{line.variantName ? `${line.variantName} × ${line.quantity}` : `× ${line.quantity}`}</p>
                </div>
                <p className="shrink-0 text-ink">{formatLak(line.lineTotal)}</p>
              </li>
            ),
          )}
        </ul>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label htmlFor="checkout-coupon" className="text-xs font-semibold text-ink-secondary">
            ໂຄດສ່ວນຫຼຸດ
          </label>
          <div className="flex gap-2">
            <Input
              id="checkout-coupon"
              className="h-10 uppercase"
              maxLength={30}
              autoCapitalize="characters"
              autoComplete="off"
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value)}
              onKeyDown={(event) => {
                // Enter ໃນຊ່ອງໂຄດ = ໃຊ້ໂຄດ ບໍ່ແມ່ນສົ່ງຄຳສັ່ງຊື້
                if (event.key === "Enter") {
                  event.preventDefault();
                  setAppliedCode(couponInput.trim().toUpperCase() || undefined);
                }
              }}
            />
            <Button
              type="button"
              variant="outlinePrimary"
              className="h-10 shrink-0 rounded-xl"
              aria-label="ໃຊ້ໂຄດ"
              disabled={!couponInput.trim()}
              onClick={() => setAppliedCode(couponInput.trim().toUpperCase() || undefined)}
            >
              ໃຊ້
            </Button>
          </div>
          {cart.couponError && !refreshing ? (
            <p role="status" className="text-xs font-semibold text-danger-ink">
              {couponMessage(cart.couponError)}
            </p>
          ) : null}
          {cart.coupon ? (
            <div className="flex items-center justify-between gap-3 text-sm text-success-ink">
              <span>{`ສ່ວນຫຼຸດ (${cart.coupon.code})`}</span>
              <span className="flex items-center gap-2">
                <span>{`−${formatLak(cart.coupon.discount)}`}</span>
                <button
                  type="button"
                  aria-label={`ລຶບໂຄດ ${cart.coupon.code}`}
                  className="rounded-md px-1 text-xs text-ink-secondary underline underline-offset-4 hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setAppliedCode(undefined);
                    setCouponInput("");
                  }}
                >
                  ລຶບ
                </button>
              </span>
            </div>
          ) : null}
        </div>
        <PointsControl
          member={member}
          loyalty={loyalty}
          points={points}
          phoneMatches={phoneMatches}
          sessionExpired={sessionExpired}
          input={pointsInput}
          onInput={setPointsInput}
          onApply={applyPoints}
          notice={pointsNotice}
          appliedPoints={appliedPoints}
          pending={pointsPending && !refreshing}
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-sm text-ink-secondary">ຍອດທີ່ຕ້ອງໂອນ</span>
          <span className="text-xl font-bold text-ink">{formatLak(cart.total)}</span>
        </div>
        {!cart.orderable ? (
          <p className="text-sm font-semibold text-danger-ink">
            ບາງລາຍການໃນກະຕ່າສັ່ງບໍ່ໄດ້{" "}
            <Link href="/cart" className="underline underline-offset-4">
              ກັບໄປແກ້ໄຂກະຕ່າ
            </Link>
          </p>
        ) : null}
        {problem ? (
          <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            <p>{problem.message}</p>
            {problem.cartLink ? (
              <Link href="/cart" className="font-semibold underline underline-offset-4">
                ກັບໄປແກ້ໄຂກະຕ່າ
              </Link>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" size="lg" className="h-11 rounded-xl" loading={submitting} disabled={blocked}>
          ຢືນຢັນສັ່ງຊື້
        </Button>
        <p className="text-xs text-ink-secondary">ຫຼັງສັ່ງຊື້ ທ່ານຈະໄດ້ຮັບເລກບັນຊີສຳລັບໂອນເງິນ ແລະ ອັບໂຫຼດສະລິບ</p>
      </section>
    </form>
  );
}


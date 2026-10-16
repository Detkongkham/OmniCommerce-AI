"use client";

import { Button, Field, Input, buttonVariants } from "@oca/ui";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ClientApiError, setOrderPin } from "@/lib/client-api";
import { isValidPin } from "@/lib/member";
import { apiMessage } from "@/lib/messages";
import type { StorePinSetup } from "@/lib/types";

type Outcome = { kind: "form" } | { kind: "done"; name: string } | { kind: "already" };

const CARD = "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4";
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/**
 * ຕັ້ງ PIN ຈາກໜ້າບິນ: AVAILABLE = ຟອມ, AFTER_PAYMENT = ບອກໃຫ້ຊຳລະກ່ອນ, NONE = ບໍ່ສະແດງ.
 * ສຳເລັດ = ເຂົ້າລະບົບທັນທີ (cookie ຖືກຕັ້ງໂດຍ proxy)
 */
export function OrderPinCard({ token, pinSetup }: { token: string; pinSetup: StorePinSetup }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "form" });
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ pin?: string; confirm?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (outcome.kind === "done") {
    return (
      <section aria-label="ບັນຊີສະມາຊິກ" className={CARD}>
        <p role="status" className="rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success-ink">
          {`ຕັ້ງ PIN ສຳເລັດ — ທ່ານເຂົ້າສູ່ລະບົບແລ້ວ (${outcome.name})`}
        </p>
        <Link href="/account" className={buttonVariants({ variant: "outlinePrimary", className: "self-start rounded-xl" })}>
          ໄປທີ່ບັນຊີຂອງຂ້ອຍ
        </Link>
      </section>
    );
  }
  if (outcome.kind === "already") {
    return (
      <section aria-label="ບັນຊີສະມາຊິກ" className={CARD}>
        <p role="status" className="text-sm text-ink">
          ເບີນີ້ມີ PIN ແລ້ວ —{" "}
          <Link href="/account" className="font-semibold text-brand-ink underline underline-offset-4">
            ເຂົ້າສູ່ລະບົບ
          </Link>
        </p>
      </section>
    );
  }
  if (pinSetup === "NONE") return null;
  if (pinSetup === "AFTER_PAYMENT") {
    return (
      <section aria-label="ບັນຊີສະມາຊິກ" className="flex items-start gap-2 rounded-2xl border border-info-line bg-info-soft p-4 text-sm text-info-ink">
        <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>ຕັ້ງ PIN ໄດ້ຫຼັງຊຳລະເງິນແລ້ວ ເພື່ອເບິ່ງແຕ້ມ ແລະ ປະຫວັດການສັ່ງຊື້</p>
      </section>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const found: { pin?: string; confirm?: string } = {};
    if (!isValidPin(pin)) found.pin = "PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວ";
    else if (confirm !== pin) found.confirm = "PIN ທັງສອງຊ່ອງບໍ່ກົງກັນ";
    setErrors(found);
    if (found.pin || found.confirm) return;

    setSubmitting(true);
    setProblem(null);
    try {
      const { member } = await setOrderPin(token, pin);
      setOutcome({ kind: "done", name: member.name });
    } catch (error) {
      const code = error instanceof ClientApiError ? error.code : undefined;
      if (code === "PIN_ALREADY_SET") setOutcome({ kind: "already" });
      else if (code === "ORDER_INVALID_STATE" || code === "ORDER_NOT_FOUND") setProblem("ບິນນີ້ຍັງຕັ້ງ PIN ບໍ່ໄດ້");
      else setProblem(apiMessage(code, "ຕັ້ງ PIN ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label="ບັນຊີສະມາຊິກ" className={CARD}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <KeyRound className="size-4 text-brand" aria-hidden="true" />
        ຕັ້ງ PIN 6 ຕົວ ເພື່ອເບິ່ງແຕ້ມ ແລະ ປະຫວັດການສັ່ງຊື້
      </h2>
      <p className="text-xs text-ink-secondary">ໃຊ້ເບີໂທຂອງບິນນີ້ ແລະ PIN ເພື່ອເຂົ້າສູ່ລະບົບໃນຄັ້ງຕໍ່ໄປ</p>
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="PIN ໃໝ່" htmlFor="order-pin" required error={errors.pin}>
          <Input
            id="order-pin"
            className="h-11 tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(digits(event.target.value))}
            invalid={Boolean(errors.pin)}
          />
        </Field>
        <Field label="ຢືນຢັນ PIN" htmlFor="order-pin-confirm" required error={errors.confirm}>
          <Input
            id="order-pin-confirm"
            className="h-11 tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={confirm}
            onChange={(event) => setConfirm(digits(event.target.value))}
            invalid={Boolean(errors.confirm)}
          />
        </Field>
        {problem ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink sm:col-span-2">
            {problem}
          </p>
        ) : null}
        <Button type="submit" className="h-11 rounded-xl sm:col-span-2" loading={submitting}>
          ຕັ້ງ PIN
        </Button>
      </form>
    </section>
  );
}

"use client";

import { Button, Field, Input } from "@oca/ui";
import { type FormEvent, useState } from "react";
import { ClientApiError, memberLogin } from "@/lib/client-api";
import { isValidPin } from "@/lib/member";
import { apiMessage, memberLockedMessage } from "@/lib/messages";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import type { StoreMember } from "@/lib/types";

type Errors = { phone?: string; pin?: string };

/** ເຂົ້າສູ່ລະບົບສະມາຊິກດ້ວຍເບີໂທ + PIN 6 ຕົວ (cookie session ຖືກຕັ້ງໂດຍ proxy ຂອງເວັບ) */
export function MemberLoginForm({ onSignedIn }: { onSignedIn: (member: StoreMember) => void }) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    // ເບີຕ້ອງ normalize ຄືກັບຕອນສັ່ງຊື້: server ທຽບ string ຕາມຕົວ
    const normalized = normalizePhone(phone);
    const found: Errors = {};
    if (!isValidPhone(normalized)) found.phone = "ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–15 ຫຼັກ)";
    if (!isValidPin(pin)) found.pin = "PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວ";
    setErrors(found);
    if (found.phone || found.pin) return;

    setSubmitting(true);
    setProblem(null);
    try {
      const { member } = await memberLogin(normalized, pin);
      onSignedIn(member);
    } catch (error) {
      const code = error instanceof ClientApiError ? error.code : undefined;
      setPin("");
      if (code === "MEMBER_LOCKED" && error instanceof ClientApiError) setProblem(memberLockedMessage(error.body.retryAfterSeconds));
      else setProblem(apiMessage(code, "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="ເຂົ້າສູ່ລະບົບ" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold text-ink">ເຂົ້າສູ່ລະບົບ</h2>
      <Field label="ເບີໂທ" htmlFor="member-phone" required error={errors.phone}>
        <Input
          id="member-phone"
          className="h-11"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={24}
          placeholder="020 5555 5555"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          invalid={Boolean(errors.phone)}
        />
      </Field>
      <Field label="PIN 6 ຕົວ" htmlFor="member-pin" required error={errors.pin}>
        <Input
          id="member-pin"
          className="h-11 tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          invalid={Boolean(errors.pin)}
        />
      </Field>
      {problem ? (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-11 rounded-xl" loading={submitting}>
        ເຂົ້າສູ່ລະບົບ
      </Button>
      <p className="text-xs leading-relaxed text-ink-secondary">
        ບັນຊີຈະເປີດໃຊ້ໄດ້ຫຼັງຈາກທ່ານສັ່ງຊື້ ແລະ ຊຳລະເງິນເທິງເວັບແລ້ວ — ຕັ້ງ PIN ໄດ້ທີ່ໜ້າອໍເດີ. ລືມ PIN? ຕິດຕໍ່ຮ້ານເພື່ອ reset.
      </p>
    </form>
  );
}

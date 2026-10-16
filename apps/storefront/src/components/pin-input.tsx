"use client";

import { Input } from "@oca/ui";

/** ເກັບສະເພາະຕົວເລກ ສູງສຸດ 6 ຕົວ */
export function pinDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

interface PinInputProps {
  id: string;
  value: string;
  onChange: (pin: string) => void;
  invalid?: boolean;
  /** ເຂົ້າສູ່ລະບົບ = current-password; ຕັ້ງ PIN ໃໝ່ = new-password (ໃຫ້ password manager ເຂົ້າໃຈຖືກ) */
  autoComplete: "current-password" | "new-password";
}

/** ຊ່ອງ PIN 6 ຕົວ: ແປ້ນຕົວເລກເທິງມືຖື, ບໍ່ສະແດງຕົວເລກ */
export function PinInput({ id, value, onChange, invalid = false, autoComplete }: PinInputProps) {
  return (
    <Input
      id={id}
      className="h-11 tracking-[0.4em]"
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete={autoComplete}
      maxLength={6}
      value={value}
      onChange={(event) => onChange(pinDigits(event.target.value))}
      invalid={invalid}
    />
  );
}

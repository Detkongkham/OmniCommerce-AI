"use client";

import { useEffect, useRef, useState } from "react";

/** ms → "mm:ss" (ຫຼື "h:mm:ss" ເມື່ອເກີນ 1 ຊົ່ວໂມງ) */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

interface CountdownProps {
  /** ເວລາໝົດ (ISO) */
  until: string;
  /** ເອີ້ນຄັ້ງດຽວເມື່ອຮອດ 0 */
  onExpire?: () => void;
  className?: string;
}

/** ໂມງນັບຖອຍຫຼັງຂອງເວລາຈອງ. ອີງໂມງຂອງເຄື່ອງລູກຄ້າ (server ເປັນຜູ້ຕັດສິນວ່າໝົດອາຍຸແທ້) */
export function Countdown({ until, onExpire, className }: CountdownProps) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expired.current = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <span role="timer" aria-live="off" className={className}>
      {formatRemaining(target - now)}
    </span>
  );
}

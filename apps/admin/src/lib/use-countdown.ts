import { useEffect, useState } from "react";

/** mm:ss ເມື່ອ < 1 ຊົ່ວໂມງ, H:MM:SS ເມື່ອເກີນ (ເວລາຈອງສູງສຸດ 7 ວັນ); ຄ່າລົບ/ບໍ່ແມ່ນຕົວເລກ → 00:00 */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

const normalize = (seconds: number | null): number | null =>
  seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.floor(seconds));

interface CountdownState {
  initial: number | null;
  resetKey: unknown;
  remaining: number | null;
}

/** ຖີ່ກວ່າ 1 ວິນາທີ ເພື່ອບໍ່ໃຫ້ jitter ເຮັດໃຫ້ສະແດງຂ້າມ/ຊ້າ; setState ຂ້າມເມື່ອຄ່າບໍ່ປ່ຽນ ຈຶ່ງບໍ່ render ຊ້ຳ */
const TICK_MS = 250;

/**
 * ນັບລົງຈາກ `initialSeconds`; null = ບໍ່ມີການນັບ.
 * `initialSeconds` (ເຊັ່ນ `secondsUntilExpiry` ຂອງ API) ເປັນ snapshot ຕອນ server ຕອບ ບໍ່ແມ່ນຄ່າສົດ:
 * ເມື່ອ refetch ຕ້ອງສົ່ງ `resetKey` ທີ່ປ່ຽນ (ເຊັ່ນ `dataUpdatedAt`) ເພື່ອເລີ່ມນັບໃໝ່ ເຖິງວ່າຄ່າວິນາທີຈະເທົ່າເດີມ.
 * ເລີ່ມໃໝ່ເມື່ອ `initialSeconds` ຫຼື `resetKey` ປ່ຽນ; render ທຳອິດຫຼັງຄ່າປ່ຽນກໍໄດ້ຄ່າໃໝ່ທັນທີ.
 * ຄ່າທີ່ເຫຼືອຄິດຈາກ `Date.now()` ທີ່ຜ່ານໄປນັບແຕ່ເລີ່ມ (ຮວມເວລາທີ່ເຄື່ອງ sleep; `performance.now()` ບໍ່ນັບ) ຈຶ່ງບໍ່ເດີນຜິດເມື່ອ
 * tick ຊ້າ; ເວລາເຄື່ອງຖອຍຫຼັງຖືກຕັດເປັນ 0 ຈຶ່ງບໍ່ເກີນຄ່າເລີ່ມຕົ້ນ.
 */
export function useCountdown(initialSeconds: number | null, resetKey: unknown): number | null {
  const initial = normalize(initialSeconds);
  const [state, setState] = useState<CountdownState>({ initial, resetKey, remaining: initial });

  useEffect(() => {
    const matches = (current: CountdownState) => current.initial === initial && Object.is(current.resetKey, resetKey);
    setState((current) => (matches(current) ? current : { initial, resetKey, remaining: initial }));
    if (initial === null) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsedSeconds = Math.floor(Math.max(0, Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, initial - elapsedSeconds);
      setState((current) =>
        matches(current) && current.remaining !== remaining ? { initial, resetKey, remaining } : current,
      );
      if (remaining === 0) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [initial, resetKey]);

  // state ຍັງບໍ່ຕາມ props ລ່າສຸດ (render ກ່ອນ effect ເຮັດວຽກ) → ໃຊ້ຄ່າໃໝ່ທັນທີ
  return state.initial === initial && Object.is(state.resetKey, resetKey) ? state.remaining : initial;
}

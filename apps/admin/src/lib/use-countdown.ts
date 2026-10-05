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

/**
 * ນັບລົງຈາກ `initialSeconds` (ຄ່າທີ່ API ຄືນ ບໍ່ອີງນາຬິກາຂອງ client); null = ບໍ່ມີການນັບ.
 * ເລີ່ມໃໝ່ເມື່ອ `initialSeconds` ຫຼື `resetKey` ປ່ຽນ (ເຊັ່ນ ຫຼັງ refetch).
 * ຄ່າທີ່ເຫຼືອຄິດຈາກເວລາທີ່ຜ່ານໄປ (monotonic) ນັບແຕ່ເລີ່ມ ດັ່ງນັ້ນ tick ທີ່ຊ້າ (ແທັບ background ຖືກ throttle) ບໍ່ເຮັດໃຫ້ເວລາເດີນຜິດ.
 * render ທຳອິດຫຼັງຄ່າປ່ຽນກໍໄດ້ຄ່າໃໝ່ທັນທີ.
 */
export function useCountdown(initialSeconds: number | null, resetKey: unknown): number | null {
  const initial = normalize(initialSeconds);
  const [state, setState] = useState<CountdownState>({ initial, resetKey, remaining: initial });

  useEffect(() => {
    setState({ initial, resetKey, remaining: initial });
    if (initial === null) return;
    const startedAt = performance.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((performance.now() - startedAt) / 1000);
      const remaining = Math.max(0, initial - elapsed);
      setState((current) =>
        current.initial === initial && Object.is(current.resetKey, resetKey) && current.remaining !== remaining
          ? { initial, resetKey, remaining }
          : current,
      );
      if (remaining === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [initial, resetKey]);

  // state ຍັງບໍ່ຕາມ props ລ່າສຸດ (render ກ່ອນ effect ເຮັດວຽກ) → ໃຊ້ຄ່າໃໝ່ທັນທີ
  return state.initial === initial && Object.is(state.resetKey, resetKey) ? state.remaining : initial;
}

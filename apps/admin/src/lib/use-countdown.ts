import { useEffect, useState } from "react";

/** mm:ss when under an hour, H:MM:SS beyond (reservation can last up to 7 days). Negative / non-finite -> 00:00. */
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
 * Counts down from `initialSeconds` (the value the API returned; the client wall clock is never compared with the
 * server). null = no countdown. Restarts when `initialSeconds` or `resetKey` changes (e.g. after a refetch).
 * The remaining value is derived from the elapsed monotonic time since the (re)start, so late ticks (throttled
 * background tabs) do not make it drift. The first render after a change already returns the new value.
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

  // state not yet synced with the latest props (the render before the effect runs) -> use the fresh value
  return state.initial === initial && Object.is(state.resetKey, resetKey) ? state.remaining : initial;
}

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, useCountdown } from "./use-countdown";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("formatCountdown", () => {
  it("mm:ss when under an hour, H:MM:SS beyond", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(36000 + 61)).toBe("10:01:01");
    expect(formatCountdown(7 * 24 * 3600)).toBe("168:00:00");
  });

  it("clamps negative, fractional and non-finite input", () => {
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(59.9)).toBe("00:59");
    expect(formatCountdown(Number.NaN)).toBe("00:00");
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe("00:00");
  });
});

describe("useCountdown", () => {
  it("null stays null", () => {
    const { result } = renderHook(() => useCountdown(null, "a"));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBeNull();
  });

  it("counts down every second and stops at 0", () => {
    const { result } = renderHook(() => useCountdown(3, "a"));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it("starts at 0 for 0 or negative initial values", () => {
    expect(renderHook(() => useCountdown(0, "a")).result.current).toBe(0);
    expect(renderHook(() => useCountdown(-30, "a")).result.current).toBe(0);
  });

  it("does not drift when ticks are late (uses elapsed time, not tick count)", () => {
    const base = performance.now();
    const now = vi.spyOn(performance, "now").mockReturnValue(base);
    const { result } = renderHook(() => useCountdown(60, "a"));
    // a throttled background tab: one late tick that fires after 10.5 seconds have really passed
    now.mockReturnValue(base + 10_500);
    act(() => vi.advanceTimersByTime(1000));
    now.mockRestore();
    expect(result.current).toBe(50);
  });

  it("resets when the server value or resetKey changes (after refetch), without a stale render", () => {
    const seen: (number | null)[] = [];
    const { result, rerender } = renderHook(
      ({ seconds, key }) => {
        const value = useCountdown(seconds, key);
        seen.push(value);
        return value;
      },
      { initialProps: { seconds: 10, key: "t1" } },
    );
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toBe(6);
    seen.length = 0;
    rerender({ seconds: 10, key: "t2" });
    expect(result.current).toBe(10);
    expect(seen[0]).toBe(10);
    rerender({ seconds: 3, key: "t2" });
    expect(result.current).toBe(3);
    expect(seen).not.toContain(6);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
  });

  it("switching to null stops counting; back to a number restarts", () => {
    const { result, rerender } = renderHook(({ seconds }) => useCountdown(seconds, "a"), {
      initialProps: { seconds: 5 as number | null },
    });
    rerender({ seconds: null });
    expect(result.current).toBeNull();
    rerender({ seconds: 8 });
    expect(result.current).toBe(8);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(6);
  });

  it("clears its interval on unmount and when the value changes", () => {
    const { unmount, rerender } = renderHook(({ seconds }) => useCountdown(seconds, "a"), {
      initialProps: { seconds: 10 },
    });
    expect(vi.getTimerCount()).toBe(1);
    rerender({ seconds: 20 });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, useCountdown } from "./use-countdown";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("formatCountdown", () => {
  it("mm:ss ເມື່ອ < 1 ຊົ່ວໂມງ; H:MM:SS ເມື່ອເກີນ", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(36000 + 61)).toBe("10:01:01");
    expect(formatCountdown(7 * 24 * 3600)).toBe("168:00:00");
  });

  it("ຄ່າລົບ, ທົດສະນິຍົມ ແລະ ບໍ່ແມ່ນຕົວເລກ ຖືກຕັດເປັນຄ່າທີ່ໃຊ້ໄດ້", () => {
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(59.9)).toBe("00:59");
    expect(formatCountdown(Number.NaN)).toBe("00:00");
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe("00:00");
  });
});

describe("useCountdown", () => {
  it("null ຄົງເປັນ null", () => {
    const { result } = renderHook(() => useCountdown(null, "a"));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBeNull();
  });

  it("ນັບລົງທຸກວິນາທີ ແລະ ຢຸດທີ່ 0", () => {
    const { result } = renderHook(() => useCountdown(3, "a"));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it("ຄ່າເລີ່ມຕົ້ນ 0 ຫຼື ລົບ → ເລີ່ມທີ່ 0", () => {
    expect(renderHook(() => useCountdown(0, "a")).result.current).toBe(0);
    expect(renderHook(() => useCountdown(-30, "a")).result.current).toBe(0);
  });

  it("ບໍ່ເດີນຜິດເມື່ອ tick ຊ້າ (ໃຊ້ເວລາທີ່ຜ່ານໄປ ບໍ່ນັບຈຳນວນ tick)", () => {
    const base = performance.now();
    const now = vi.spyOn(performance, "now").mockReturnValue(base);
    const { result } = renderHook(() => useCountdown(60, "a"));
    // ແທັບ background ທີ່ຖືກ throttle: tick ດຽວທີ່ມາຊ້າ ຫຼັງຜ່ານໄປ 10.5 ວິນາທີຈິງ
    now.mockReturnValue(base + 10_500);
    act(() => vi.advanceTimersByTime(1000));
    now.mockRestore();
    expect(result.current).toBe(50);
  });

  it("ຮີເຊັດເມື່ອຄ່າຈາກ server ຫຼື resetKey ປ່ຽນ (ຫຼັງ refetch) ໂດຍບໍ່ມີ render ຄ່າເກົ່າ", () => {
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

  it("ປ່ຽນເປັນ null ຢຸດນັບ; ກັບເປັນຕົວເລກເລີ່ມນັບໃໝ່", () => {
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

  it("ລ້າງ interval ເມື່ອ unmount ແລະ ເມື່ອຄ່າປ່ຽນ", () => {
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

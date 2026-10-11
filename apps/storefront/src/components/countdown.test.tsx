import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown, formatRemaining } from "./countdown";

describe("formatRemaining", () => {
  it("ນາທີ:ວິນາທີ; ເກີນຊົ່ວໂມງມີຊົ່ວໂມງນຳ; ຕິດລົບ = 00:00", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5000)).toBe("00:00");
    expect(formatRemaining(61_000)).toBe("01:01");
    expect(formatRemaining(29 * 60_000 + 59_999)).toBe("29:59");
    expect(formatRemaining(3_600_000 + 5 * 60_000 + 7000)).toBe("1:05:07");
  });
});

describe("Countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("ນັບຖອຍຫຼັງທຸກວິນາທີ ແລະ ເອີ້ນ onExpire ຄັ້ງດຽວເມື່ອຮອດ 0", () => {
    const onExpire = vi.fn();
    render(<Countdown until="2026-10-11T10:00:03Z" onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:03");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:02");
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("ເວລາທີ່ຜ່ານໄປແລ້ວ → 00:00 ແລະ onExpire ທັນທີ", () => {
    const onExpire = vi.fn();
    render(<Countdown until="2026-10-11T09:59:00Z" onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    act(() => vi.advanceTimersByTime(1000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

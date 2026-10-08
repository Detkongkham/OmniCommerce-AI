import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EventStreamOptions, runEventStream } from "./event-stream";
import { useLiveRealtime } from "./use-live-realtime";

vi.mock("./event-stream", () => ({ runEventStream: vi.fn(async () => undefined) }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAccessToken: () => "tok",
  refreshSession: vi.fn(async () => ({ accessToken: "fresh" })),
}));

function setup(sessionId = "s1", enabled = true) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useLiveRealtime(sessionId, enabled), { wrapper });
  const options = () => vi.mocked(runEventStream).mock.calls[0]?.[0] as EventStreamOptions;
  return { ...hook, invalidate, options };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(runEventStream).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveRealtime", () => {
  it("ເຊື່ອມ /api/live-sessions/:id/events ຟັງ live.updated; refresh ຄືນ accessToken ໃໝ່", async () => {
    const { options } = setup("s/1");
    expect(options().url).toBe("/api/live-sessions/s%2F1/events");
    expect(options().events).toEqual(["live.updated"]);
    await expect(options().refresh()).resolves.toBe("fresh");
  });

  it("status ຕາມ onStatus; onChange ຕິດກັນ = invalidate ຂໍ້ມູນຂອງ session ນີ້ຄັ້ງດຽວ (250ms)", () => {
    const { result, options, invalidate } = setup();
    expect(result.current).toBe("connecting");
    act(() => options().onStatus("connected"));
    expect(result.current).toBe("connected");
    act(() => {
      options().onChange();
      options().onChange();
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    const filter = invalidate.mock.calls[0]?.[0] as unknown as { predicate: (query: { queryKey: unknown[] }) => boolean };
    expect(filter.predicate({ queryKey: ["live-sessions", "detail", "s1"] })).toBe(true);
    expect(filter.predicate({ queryKey: ["live-sessions", "host", "s1"] })).toBe(true);
    expect(filter.predicate({ queryKey: ["live-sessions", "comments", "s1", { page: 1 }] })).toBe(true);
    expect(filter.predicate({ queryKey: ["live-sessions", "detail", "s2"] })).toBe(false);
    // ລາຍການ session (ຈຳນວນຄອມເມັ້ນ) ກໍ refetch ນຳ
    expect(filter.predicate({ queryKey: ["live-sessions", "list", { page: 1 }] })).toBe(true);
  });

  it("enabled=false: ບໍ່ເຊື່ອມ ແລະ status = disconnected; unmount → abort", () => {
    const off = setup("s1", false);
    expect(runEventStream).not.toHaveBeenCalled();
    expect(off.result.current).toBe("disconnected");
    off.unmount();
    const on = setup();
    const signal = on.options().signal;
    on.unmount();
    expect(signal.aborted).toBe(true);
  });
});

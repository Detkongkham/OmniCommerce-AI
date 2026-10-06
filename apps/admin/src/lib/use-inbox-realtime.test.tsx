import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type InboxStreamOptions, runInboxStream } from "./inbox-stream";
import { queryKeys } from "./queries";
import { POLL_MS, useInboxRealtime } from "./use-inbox-realtime";

vi.mock("./inbox-stream", () => ({ runInboxStream: vi.fn(async () => undefined) }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAccessToken: () => "tok",
  refreshSession: vi.fn(async () => ({ accessToken: "fresh" })),
}));

function setup(enabled = true) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useInboxRealtime(enabled), { wrapper });
  const options = () => vi.mocked(runInboxStream).mock.calls[0]?.[0] as InboxStreamOptions;
  return { ...hook, invalidate, options };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(runInboxStream).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useInboxRealtime", () => {
  it("ເລີ່ມ stream ທີ່ /api/inbox/events ດ້ວຍ token ປັດຈຸບັນ ແລະ refresh ທີ່ຄືນ accessToken", async () => {
    const { options } = setup();
    expect(runInboxStream).toHaveBeenCalledTimes(1);
    expect(options().url).toBe("/api/inbox/events");
    expect(options().getToken()).toBe("tok");
    await expect(options().refresh()).resolves.toBe("fresh");
  });

  it("status ຕາມ onStatus", () => {
    const { result, options } = setup();
    expect(result.current).toBe("connecting");
    act(() => options().onStatus("connected"));
    expect(result.current).toBe("connected");
  });

  it("onChange ຫຼາຍຄັ້ງຕິດກັນ = invalidate conversations ຄັ້ງດຽວ (ລວມ 250ms)", () => {
    const { options, invalidate } = setup();
    act(() => {
      options().onChange();
      options().onChange();
      options().onChange();
    });
    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("poll ທຸກ 60 ວິ ເມື່ອແທັບເຫັນຢູ່ ແລະ ຂ້າມເມື່ອຖືກຊ່ອນ", () => {
    const { invalidate } = setup();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(invalidate).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("unmount: abort stream, ຍົກເລີກ timer ທີ່ຄ້າງ ແລະ ຢຸດ poll", () => {
    const { options, unmount, invalidate } = setup();
    const signal = options().signal;
    act(() => options().onChange());
    unmount();
    expect(signal.aborted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 2);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("enabled=false ບໍ່ເຊື່ອມ", () => {
    setup(false);
    expect(runInboxStream).not.toHaveBeenCalled();
  });
});

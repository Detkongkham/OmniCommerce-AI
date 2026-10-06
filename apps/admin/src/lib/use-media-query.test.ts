import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./use-media-query";

afterEach(() => {
  // @ts-expect-error cleanup of test stub
  delete window.matchMedia;
});

describe("useMediaQuery", () => {
  it("ບໍ່ມີ matchMedia → false", () => {
    expect(renderHook(() => useMediaQuery("(min-width: 1px)")).result.current).toBe(false);
  });

  it("ອ່ານຄ່າ, ຕິດຕາມ change, ແລະ ຖອດ listener ຕອນ unmount", () => {
    let handler: () => void = () => {};
    const list = {
      matches: true,
      addEventListener: vi.fn((_: string, h: () => void) => {
        handler = h;
      }),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(() => list) as unknown as typeof window.matchMedia;
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 1px)"));
    expect(result.current).toBe(true);
    list.matches = false;
    act(() => handler());
    expect(result.current).toBe(false);
    unmount();
    expect(list.removeEventListener).toHaveBeenCalled();
  });
});

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanOpenOrder } from "./use-can-open-order";

const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => !auth.denied.has(permission) }));

beforeEach(() => auth.denied.clear());

describe("useCanOpenOrder", () => {
  it("ຕ້ອງມີ inbox:write + orders:write + inventory:read ຄົບ", () => {
    expect(renderHook(() => useCanOpenOrder()).result.current).toBe(true);
    for (const permission of ["inbox:write", "orders:write", "inventory:read"]) {
      auth.denied.clear();
      auth.denied.add(permission);
      expect(renderHook(() => useCanOpenOrder()).result.current).toBe(false);
    }
  });
});

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => auth.value }));
vi.mock("@/components/auth/login-form", () => ({ LoginForm: () => null }));
vi.mock("@/components/auth/login-shell", () => ({ LoginShell: ({ children }: { children: unknown }) => children }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => router.replace.mockReset());

describe("LoginPage", () => {
  it("login ແລ້ວ: ໄປໜ້າທຳອິດທີ່ role ເປີດໄດ້ ບໍ່ແມ່ນ /staff ສະເໝີ", () => {
    auth.value = { status: "authenticated", login: vi.fn(), user: { permissions: ["orders:read"] } };
    render(<LoginPage />);
    expect(router.replace).toHaveBeenCalledWith("/orders");
  });

  it("login ແລ້ວແຕ່ບໍ່ມີສິດໃນເມນູເລີຍ: ໄປ / (ສະແດງໜ້າບໍ່ມີສິດ)", () => {
    auth.value = { status: "authenticated", login: vi.fn(), user: { permissions: [] } };
    render(<LoginPage />);
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("ຍັງບໍ່ login: ບໍ່ redirect", () => {
    auth.value = { status: "unauthenticated", login: vi.fn(), user: null };
    render(<LoginPage />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

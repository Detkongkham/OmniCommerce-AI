import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LandingRedirect } from "./landing-redirect";

const auth = vi.hoisted(() => ({
  value: { status: "loading", user: null, logout: vi.fn() } as {
    status: string;
    user: { permissions: string[] } | null;
    logout: () => void;
  },
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => auth.value }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const as = (permissions: string[]) => {
  auth.value = { status: "authenticated", user: { permissions }, logout: vi.fn() };
};

beforeEach(() => {
  router.replace.mockReset();
  auth.value = { status: "loading", user: null, logout: vi.fn() };
});

describe("LandingRedirect (ໜ້າ /)", () => {
  it("ກຳລັງໂຫຼດ auth: ສະແດງ loading ແລະ ບໍ່ redirect (ບໍ່ກະພິບ /staff)", () => {
    renderWithProviders(<LandingRedirect />);
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("ຍັງບໍ່ login: ໄປ /login", () => {
    auth.value = { status: "unauthenticated", user: null, logout: vi.fn() };
    renderWithProviders(<LandingRedirect />);
    expect(router.replace).toHaveBeenCalledWith("/login");
  });

  it("WAREHOUSE (ບໍ່ມີ staff:read): ໄປ /products", () => {
    as(["inventory:read", "inventory:write", "logistics:read", "logistics:write", "orders:read"]);
    renderWithProviders(<LandingRedirect />);
    expect(router.replace).toHaveBeenCalledWith("/products");
  });

  it("ມີແຕ່ orders:read: ໄປ /orders", () => {
    as(["orders:read"]);
    renderWithProviders(<LandingRedirect />);
    expect(router.replace).toHaveBeenCalledWith("/orders");
  });

  it("ບໍ່ມີສິດທີ່ເຫັນໃນເມນູ: ສະແດງໜ້າ 'ບໍ່ມີສິດ' + ປຸ່ມອອກຈາກລະບົບ ແລະ ບໍ່ redirect (ບໍ່ວົນ loop)", async () => {
    as(["crm:read"]);
    const { user } = renderWithProviders(<LandingRedirect />);
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(auth.value.logout).toHaveBeenCalled();
  });
});

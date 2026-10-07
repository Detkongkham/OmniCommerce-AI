import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Sidebar } from "./sidebar";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { permissions: auth.permissions } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/roles" }));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

beforeEach(() => {
  auth.permissions = [];
});

describe("Sidebar", () => {
  it("ສະແດງເມນູທີ່ມີສິດ ແລະ ໝາຍໜ້າປັດຈຸບັນດ້ວຍ aria-current", () => {
    auth.permissions = ["staff:read"];
    renderWithProviders(<Sidebar collapsed={false} mobileOpen={false} onCloseMobile={() => {}} />);

    expect(screen.getByRole("link", { name: "Staff" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Roles & permissions" })).toHaveAttribute("aria-current", "page");
  });

  it("ບໍ່ມີສິດ: ບໍ່ມີລິ້ງເມນູ", () => {
    renderWithProviders(<Sidebar collapsed={false} mobileOpen={false} onCloseMobile={() => {}} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ມືຖື: ກົດ Esc ປິດ sidebar", async () => {
    auth.permissions = ["staff:read"];
    const onCloseMobile = vi.fn();
    const { user } = renderWithProviders(<Sidebar collapsed={false} mobileOpen onCloseMobile={onCloseMobile} />);
    await user.keyboard("{Escape}");
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});

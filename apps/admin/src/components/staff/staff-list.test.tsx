import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto, StaffDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StaffList } from "./staff-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: null, isSystem: true, permissions: [], userCount: 1 },
  { id: "role-2", name: "MANAGER", description: null, isSystem: false, permissions: [], userCount: 1 },
];
const staff: StaffDto[] = [
  { id: "s1", email: "owner@example.com", name: "Owner One", isActive: true, roleId: "role-1", roleName: "OWNER", lastLoginAt: "2026-10-04T18:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "s2", email: "mgr@example.com", name: "Manager Two", isActive: true, roleId: "role-2", roleName: "MANAGER", lastLoginAt: null, createdAt: "2026-10-02T00:00:00.000Z" },
];

function mockApi(staffRows: StaffDto[] = staff) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/staff") return staffRows;
    if (path === "/roles") return roles;
    return undefined;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StaffList", () => {
  it("ສະແດງພະນັກງານ ພ້ອມບົດບາດ, ສະຖານະ ແລະ ວັນທີເຂົ້າລະບົບ (ເຂດເວລາລາວ)", async () => {
    renderWithProviders(<StaffList />);

    expect(await screen.findByText("Owner One")).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
    const row = screen.getByTestId("row-staff-s1");
    expect(within(row).getByText("owner@example.com")).toBeInTheDocument();
    expect(within(row).getByText("OWNER")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByText("05/10/2026")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-staff-s2")).getByText("—")).toBeInTheDocument();
  });

  it("ຄົ້ນຫາກັ່ນຕອງຕາມຊື່/ອີເມວ/ບົດບາດ", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");

    await user.type(screen.getByPlaceholderText("Search name, email or role..."), "manager");
    expect(screen.queryByText("Owner One")).not.toBeInTheDocument();
    expect(screen.getByText("Manager Two")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search name, email or role..."));
    await user.type(screen.getByPlaceholderText("Search name, email or role..."), "zzz");
    expect(await screen.findByText("No staff match your search")).toBeInTheDocument();
  });

  it("ຍັງບໍ່ມີພະນັກງານ: ສະແດງ empty state ພ້ອມປຸ່ມເພີ່ມ", async () => {
    mockApi([]);
    renderWithProviders(<StaffList />);
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດ staff:write: ບໍ່ເຫັນປຸ່ມເພີ່ມ/ແກ້ໄຂ/ປິດໃຊ້ງານ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");

    expect(screen.queryByRole("button", { name: "Add staff" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit staff/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Deactivate account/ })).not.toBeInTheDocument();
  });

  it("ກົດເພີ່ມພະນັກງານ: ເປີດ dialog", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");
    await user.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByRole("dialog", { name: "Add staff" })).toBeInTheDocument();
  });

  it("ປິດໃຊ້ງານ: ຖາມຢືນຢັນກ່ອນ ແລ້ວ PATCH isActive=false", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Manager Two");

    await user.click(screen.getByRole("button", { name: "Deactivate account Manager Two" }));
    const dialog = await screen.findByRole("dialog", { name: "Deactivate this account?" });
    expect(apiFetch).not.toHaveBeenCalledWith("/staff/s2", expect.anything());

    await user.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/staff/s2", { method: "PATCH", body: { isActive: false } }),
    );
  });
});

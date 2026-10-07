import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RolesList } from "./roles-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: "Full access", isSystem: true, permissions: ["staff:read", "staff:write"], userCount: 1 },
  { id: "role-2", name: "Sales", description: null, isSystem: false, permissions: ["inbox:read"], userCount: 0 },
];

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => (path === "/roles" ? roles : undefined)) as typeof apiFetch);
});

describe("RolesList", () => {
  it("ສະແດງ role, ຈຳນວນສິດ/ຜູ້ໃຊ້ ແລະ ປ້າຍ System", async () => {
    renderWithProviders(<RolesList />);
    const owner = await screen.findByTestId("row-role-role-1");
    expect(within(owner).getByText("System")).toBeInTheDocument();
    expect(within(owner).getByText("2/30")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-role-role-2")).getByText("1/30")).toBeInTheDocument();
  });

  it("role ລະບົບ: ເບິ່ງໄດ້ ແຕ່ລຶບບໍ່ໄດ້; role ທົ່ວໄປ: ແກ້ໄຂ ແລະ ລຶບໄດ້", async () => {
    renderWithProviders(<RolesList />);
    await screen.findByText("Sales");
    expect(screen.getByRole("button", { name: "View OWNER" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete OWNER" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Sales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Sales" })).toBeInTheDocument();
  });

  it("ລຶບ: ຖາມຢືນຢັນກ່ອນ ແລ້ວ DELETE /roles/:id", async () => {
    const { user } = renderWithProviders(<RolesList />);
    await screen.findByText("Sales");

    await user.click(screen.getByRole("button", { name: "Delete Sales" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this role?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/roles/role-2", { method: "DELETE" }));
  });

  it("ບໍ່ມີສິດ staff:write: ເຫັນສະເພາະປຸ່ມເບິ່ງ", async () => {
    auth.canWrite = false;
    renderWithProviders(<RolesList />);
    await screen.findByText("Sales");
    expect(screen.queryByRole("button", { name: "Add role" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Sales" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });
});

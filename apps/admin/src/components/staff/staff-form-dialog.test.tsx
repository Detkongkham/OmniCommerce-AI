import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto, StaffDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StaffFormDialog } from "./staff-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: null, isSystem: true, permissions: [], userCount: 1 },
  { id: "role-2", name: "MANAGER", description: null, isSystem: false, permissions: [], userCount: 0 },
];

const existing: StaffDto = {
  id: "s1",
  email: "somsak@example.com",
  name: "Somsak",
  isActive: true,
  roleId: "role-2",
  roleName: "MANAGER",
  lastLoginAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({} as never);
});

describe("StaffFormDialog (create)", () => {
  it("ສົ່ງຟອມຫວ່າງ: ສະແດງ error ຂອງທຸກ field ແລະ ບໍ່ເອີ້ນ API", async () => {
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={() => {}} staff={null} roles={roles} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getAllByText("This field is required")).toHaveLength(2); // name, role
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ສ້າງພະນັກງານ: POST /staff ແລ້ວປິດ dialog", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={onOpenChange} staff={null} roles={roles} />,
    );

    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.selectOptions(screen.getByLabelText("Role"), "role-2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiFetch).toHaveBeenCalledWith("/staff", {
      method: "POST",
      body: { email: "new@example.com", name: "New Person", password: "password123", roleId: "role-2" },
    });
  });
});

describe("StaffFormDialog (edit)", () => {
  it("email ແກ້ບໍ່ໄດ້; ລະຫັດຜ່ານຫວ່າງບໍ່ຖືກສົ່ງ (PATCH ສະເພາະ name/roleId)", async () => {
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={() => {}} staff={existing} roles={roles} />,
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Somsak K");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/staff/s1", {
        method: "PATCH",
        body: { name: "Somsak K", roleId: "role-2" },
      }),
    );
  });

  it("ສະແດງ message ຂອງ API ເມື່ອລົ້ມ ແລະ ບໍ່ປິດ dialog", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "Email already in use"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={onOpenChange} staff={existing} roles={roles} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

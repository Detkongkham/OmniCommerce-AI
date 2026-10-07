import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RoleFormDialog } from "./role-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const systemRole: RoleDto = {
  id: "role-1",
  name: "OWNER",
  description: "Full access",
  isSystem: true,
  permissions: ["staff:read", "staff:write"],
  userCount: 1,
};
const customRole: RoleDto = {
  id: "role-2",
  name: "Sales",
  description: null,
  isSystem: false,
  permissions: ["inbox:read"],
  userCount: 0,
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({} as never);
});

describe("RoleFormDialog", () => {
  it("ສ້າງ: ຊື່ວ່າງຖືກປະຕິເສດ", async () => {
    const { user } = renderWithProviders(<RoleFormDialog open onOpenChange={() => {}} role={null} readOnly={false} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ສ້າງ: POST /roles ພ້ອມສິດທີ່ເລືອກ ແລ້ວປິດ", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RoleFormDialog open onOpenChange={onOpenChange} role={null} readOnly={false} />,
    );
    await user.type(screen.getByLabelText("Role name"), "Support");
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Read" }));
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Write" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiFetch).toHaveBeenCalledWith("/roles", {
      method: "POST",
      body: { name: "Support", permissions: ["inbox:read", "inbox:write"] },
    });
  });

  it("ແກ້ໄຂ: PUT /roles/:id", async () => {
    const { user } = renderWithProviders(
      <RoleFormDialog open onOpenChange={() => {}} role={customRole} readOnly={false} />,
    );
    expect(screen.getByRole("checkbox", { name: "Inbox - Read" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "CRM - Write" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/roles/role-2", {
        method: "PUT",
        body: { name: "Sales", permissions: ["inbox:read", "crm:write"] },
      }),
    );
  });

  it("role ລະບົບ/readOnly: ເບິ່ງໄດ້ຢ່າງດຽວ, ບໍ່ມີປຸ່ມບັນທຶກ", () => {
    renderWithProviders(<RoleFormDialog open onOpenChange={() => {}} role={systemRole} readOnly />);
    expect(screen.getByRole("dialog", { name: "View role" })).toBeInTheDocument();
    expect(screen.getByText("System roles cannot be modified")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Role name")).toHaveAttribute("readonly");
    expect(screen.getByRole("checkbox", { name: "Staff - Write" })).toBeDisabled();
  });
});

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PermissionGate } from "./permission-gate";

const auth = vi.hoisted(() => ({ allowed: true, granted: null as string[] | null }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: () => auth.allowed,
  // granted = null: ທຸກສິດຕາມ allowed; ບໍ່ດັ່ງນັ້ນກວດແຕ່ລະສິດ
  useCanAll: (permissions: string[]) => (auth.granted ? permissions.every((permission) => auth.granted?.includes(permission)) : auth.allowed),
}));

beforeEach(() => {
  auth.allowed = true;
  auth.granted = null;
});

describe("PermissionGate", () => {
  it("ມີສິດ: ສະແດງເນື້ອໃນ", () => {
    renderWithProviders(
      <PermissionGate permission="staff:read">
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດ: ສະແດງໜ້າ 'ບໍ່ມີສິດ' ແທນ", () => {
    auth.allowed = false;
    renderWithProviders(
      <PermissionGate permission="staff:read">
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("ຫຼາຍສິດ (all-of): ມີຄົບທຸກສິດຈຶ່ງສະແດງເນື້ອໃນ", () => {
    auth.granted = ["orders:write", "inventory:read"];
    renderWithProviders(
      <PermissionGate permission={["orders:write", "inventory:read"]}>
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("ຫຼາຍສິດ (all-of): ຂາດສິດໃດໜຶ່ງ ສະແດງໜ້າ 'ບໍ່ມີສິດ'", () => {
    auth.granted = ["orders:write"];
    renderWithProviders(
      <PermissionGate permission={["orders:write", "inventory:read"]}>
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});

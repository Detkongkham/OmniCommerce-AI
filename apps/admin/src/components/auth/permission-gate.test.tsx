import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PermissionGate } from "./permission-gate";

const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.allowed }));

beforeEach(() => {
  auth.allowed = true;
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
});

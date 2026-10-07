import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PermissionMatrix } from "./permission-matrix";

describe("PermissionMatrix", () => {
  it("ເລືອກ write ເພີ່ມເຂົ້າໃນລາຍການ (ລຽງຕາມລຳດັບ module/action)", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={["inbox:read"]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Write" }));
    expect(onChange).toHaveBeenCalledWith(["inbox:read", "inbox:write"]);
  });

  it("ເອົາ read ອອກ", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={["inbox:read"]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Read" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("ຄໍລຳ All ເລືອກທັງ read ແລະ write ຂອງ module", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={[]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Staff - All" }));
    expect(onChange).toHaveBeenCalledWith(["staff:read", "staff:write"]);
  });

  it("ເລືອກບາງສ່ວນ: All ເປັນ indeterminate", () => {
    renderWithProviders(<PermissionMatrix value={["crm:read"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "CRM - All" })).toHaveAttribute("aria-checked", "mixed");
  });

  it("disabled: ທຸກ checkbox ກົດບໍ່ໄດ້", () => {
    renderWithProviders(<PermissionMatrix value={[]} onChange={() => {}} disabled />);
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
  });
});

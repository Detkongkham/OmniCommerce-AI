import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function setup(busy = false) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete role?"
      description="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      busy={busy}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("ສະແດງຫົວຂໍ້ ແລະ ເອີ້ນ onConfirm ເມື່ອກົດຢືນຢັນ", async () => {
    const { onConfirm } = setup();
    expect(screen.getByRole("dialog", { name: "Delete role?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ກົດຍົກເລີກແລ້ວຂໍປິດ dialog", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ຂະນະ busy: ປຸ່ມຖືກປິດ ແລະ Esc ປິດ dialog ບໍ່ໄດ້", async () => {
    const { onOpenChange } = setup(true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

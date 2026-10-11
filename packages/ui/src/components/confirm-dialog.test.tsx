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

  it("confirmDisabled ປິດສະເພາະປຸ່ມຢືນຢັນ ປຸ່ມຍົກເລີກຍັງກົດໄດ້", () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Delete" cancelLabel="Cancel" confirmDisabled onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("tone ເລີ່ມຕົ້ນ = destructive; tone=primary ໃຊ້ປຸ່ມ/ໄອຄອນສີແບຣນ ບໍ່ແດງ", () => {
    const { unmount } = render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Go" cancelLabel="Cancel" onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Go" }).className).toContain("bg-danger");
    unmount();
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Go" cancelLabel="Cancel" tone="primary" onConfirm={vi.fn()} />,
    );
    const go = screen.getByRole("button", { name: "Go" });
    expect(go.className).toContain("bg-brand");
    expect(go.className).not.toContain("bg-danger");
    expect(screen.getByRole("dialog").innerHTML).not.toContain("bg-danger-soft");
  });

  it("ສົ່ງ onCloseAutoFocus ຕໍ່ໃຫ້ dialog ເມື່ອປິດ", async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());
    const { rerender } = render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Go" cancelLabel="Cancel" onConfirm={vi.fn()} onCloseAutoFocus={onCloseAutoFocus} />,
    );
    rerender(
      <ConfirmDialog open={false} onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Go" cancelLabel="Cancel" onConfirm={vi.fn()} onCloseAutoFocus={onCloseAutoFocus} />,
    );
    await vi.waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });
});

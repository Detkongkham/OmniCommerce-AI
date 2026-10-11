import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { RejectSlipDialog } from "./reject-slip-dialog";

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  const restoreFocus = vi.fn();
  const view = renderWithProviders(<RejectSlipDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} restoreFocus={restoreFocus} />);
  return { ...view, onConfirm, onOpenChange, restoreFocus };
}

describe("RejectSlipDialog", () => {
  it("ຕ້ອງມີເຫດຜົນ: ວ່າງ/ແຕ່ຍະຫວ່າງ → ຂໍ້ຄວາມ error ແລະ ບໍ່ເອີ້ນ onConfirm", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");
    await user.type(screen.getByLabelText("Reason"), "   ");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-invalid", "true");
  });

  it("ຈຳກັດເຫດຜົນ 500 ໂຕ", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("Reason");
    expect(input).toHaveAttribute("maxlength", "500");
    await user.click(input);
    await user.paste("a".repeat(501));
    expect((input as HTMLInputElement).value).toHaveLength(500);
  });

  it("Escape (ບໍ່ໄດ້ກຳລັງບັນທຶກ) → ປິດ ແລະ ຄືນ focus", async () => {
    const onOpenChange = vi.fn();
    const restoreFocus = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <RejectSlipDialog
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
          restoreFocus={restoreFocus}
        />
      );
    }
    const { user } = renderWithProviders(<Host />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });

  it("ສຳເລັດ → ປິດ dialog ແລະ ຄືນ focus ຄັ້ງດຽວ", async () => {
    const restoreFocus = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return <RejectSlipDialog open={open} onOpenChange={setOpen} onConfirm={vi.fn().mockResolvedValue(undefined)} restoreFocus={restoreFocus} />;
    }
    const { user } = renderWithProviders(<Host />);
    await user.type(screen.getByLabelText("Reason"), "dup");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });

  it("ສົ່ງເຫດຜົນທີ່ຕັດຍະຫວ່າງແລ້ວ ແລະ ປິດ dialog ເມື່ອສຳເລັດ", async () => {
    const { user, onConfirm, onOpenChange } = setup();
    await user.type(screen.getByLabelText("Reason"), "  Wrong amount  ");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Wrong amount"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onConfirm ລົ້ມ → ສະແດງຂໍ້ຄວາມ error ຂອງ code ແລະ dialog ຍັງເປີດ", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(409, "x", [], "SLIP_ALREADY_REVIEWED"));
    const { user, onOpenChange } = setup(onConfirm);
    await user.type(screen.getByLabelText("Reason"), "dup");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This slip was already confirmed or rejected");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("ຂະນະກຳລັງສົ່ງ: ກົດຊ້ຳບໍ່ສົ່ງຊ້ຳ ແລະ ປິດ dialog ບໍ່ໄດ້", async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const { user, onOpenChange } = setup(onConfirm);
    await user.type(screen.getByLabelText("Reason"), "dup");
    const button = screen.getByRole("button", { name: "Reject slip" });
    await user.click(button);
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

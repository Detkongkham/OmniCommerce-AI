import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { RejectSlipDialog } from "./reject-slip-dialog";

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  const view = renderWithProviders(<RejectSlipDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
  return { ...view, onConfirm, onOpenChange };
}

describe("RejectSlipDialog", () => {
  it("ຕ້ອງມີເຫດຜົນ: ວ່າງ/ແຕ່ຍະຫວ່າງ → ຂໍ້ຄວາມ error ແລະ ບໍ່ເອີ້ນ onConfirm", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");
    await user.type(screen.getByLabelText("Reason"), "   ");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ຈຳກັດເຫດຜົນ 500 ໂຕ", () => {
    setup();
    expect(screen.getByLabelText("Reason")).toHaveAttribute("maxlength", "500");
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
    resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

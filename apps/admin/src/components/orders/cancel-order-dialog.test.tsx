import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { ActionBusyError } from "@/lib/errors";
import { renderWithProviders } from "@/test/render";
import { CancelOrderDialog } from "./cancel-order-dialog";

function Harness({
  onConfirm,
  onOpenChange,
  disabled,
  disabledReason,
}: {
  onConfirm: (reason?: string) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <CancelOrderDialog
        disabled={disabled}
        disabledReason={disabledReason}
        restoreFocus={() => trigger.current?.focus()}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        onConfirm={onConfirm}
      />
    </>
  );
}

const confirmButton = () => screen.getByRole("button", { name: /^(Cancel order|Saving\.\.\.)$/ });

describe("CancelOrderDialog", () => {
  it("ສົ່ງເຫດຜົນທີ່ trim ແລ້ວ; ເຫດຜົນວ່າງ = undefined; ປິດ dialog ແລະ ຄືນ focus ໃຫ້ປຸ່ມເປີດ", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    await user.click(trigger);
    await user.type(await screen.findByLabelText("Reason (optional)"), "  changed mind  ");
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("changed mind"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(undefined));
  });

  it("ເຫດຜົນເກີນ 200 ໂຕ: ສະແດງຂໍ້ຄວາມແປ, aria-invalid, ບໍ່ສົ່ງ; ແກ້ແລ້ວຂໍ້ຄວາມຫາຍ", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    const input = await screen.findByLabelText("Reason (optional)");
    fireEvent.change(input, { target: { value: "x".repeat(201) } });
    await user.click(confirmButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("up to 200 characters");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "x".repeat(200) } });
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("x".repeat(200)));
  });

  it("ຂະນະບັນທຶກ: ກັນສົ່ງຊ້ຳ, Cancel ຖືກ disable, Escape ປິດບໍ່ໄດ້; ຈົບແລ້ວຈຶ່ງປິດ", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    await screen.findByRole("dialog");
    await user.click(confirmButton());
    await user.click(confirmButton());
    await user.keyboard("{Escape}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep order" })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ລົ້ມ: ສະແດງຂໍ້ຄວາມແປໃນ dialog (role=alert), dialog ຍັງເປີດ, ກົດໃໝ່ໄດ້", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(409, "x", [], "ORDER_INVALID_STATE"));
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    await screen.findByRole("dialog");
    await user.click(confirmButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("The order status does not allow this step");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep order" })).toBeEnabled();
  });

  it("Escape ຫຼື 'Keep order' ປິດ dialog (ບໍ່ຂໍ້ມູນຄ້າງ); ເປີດໃໝ່ຊ່ອງເຫດຜົນວ່າງ", async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    await user.click(trigger);
    await user.type(await screen.findByLabelText("Reason (optional)"), "abc");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(await screen.findByLabelText("Reason (optional)")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Keep order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ປຸ່ມເປີດບໍ່ໄດ້ຮັບ focus ຕອນກົດ (Safari/Firefox macOS): ປິດແລ້ວ focus ຍັງຄືນໃຫ້ປຸ່ມເປີດ", async () => {
    const { user } = renderWithProviders(<Harness onConfirm={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    fireEvent.click(trigger); // ບໍ່ຍ້າຍ focus ໄປທີ່ປຸ່ມ ຄືກັບ Safari
    expect(document.activeElement).not.toBe(trigger);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Keep order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("disabled: ປຸ່ມຢືນຢັນຖືກປິດ ບໍ່ສົ່ງ", async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} disabled />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    await screen.findByRole("dialog");
    expect(confirmButton()).toBeDisabled();
    await user.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ActionBusyError: ສະແດງ 'ກຳລັງດຳເນີນການອື່ນຢູ່' ແລະ dialog ຍັງເປີດ", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ActionBusyError());
    const { user } = renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    await user.click(confirmButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Another action is still in progress");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disabled + disabledReason: ສະແດງເຫດຜົນ (role=alert) ໃນ dialog ແລະ ຜູກກັບປຸ່ມຢືນຢັນ; ບໍ່ມີເຫດຜົນ = ບໍ່ມີ alert", async () => {
    const { user } = renderWithProviders(<Harness onConfirm={vi.fn()} disabled disabledReason="data is stale" />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("data is stale");
    expect(confirmButton().getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("disabled ໂດຍບໍ່ມີເຫດຜົນ: ບໍ່ມີ alert", async () => {
    const { user } = renderWithProviders(<Harness onConfirm={vi.fn()} disabled />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

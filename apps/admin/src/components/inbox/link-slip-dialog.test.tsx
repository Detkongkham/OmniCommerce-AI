import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { LinkSlipDialog } from "./link-slip-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));

const order = (id: string, status: OrderListItemDto["status"], total = "100.00"): OrderListItemDto => ({
  id, orderNumber: `SO-${id}`, status, channel: "FACEBOOK", source: "CHAT", conversationId: "c1",
  customer: null, total, itemCount: 1, reservedUntil: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const page = (items: OrderListItemDto[]) => ({ items, total: items.length, page: 1, pageSize: 20 });
const target = { conversationId: "c1", messageId: "m1", attachmentIndex: 1 };
const ordersCalls = () => vi.mocked(apiFetch).mock.calls.filter((call) => String(call[0]).startsWith("/orders"));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("LinkSlipDialog", () => {
  it("ລາຍການບິນຂອງເຄສ: ເລືອກເລີ່ມຕົ້ນເປັນບິນ PENDING_PAYMENT ແລະ ບິນອື່ນຖືກປິດ ພ້ອມເຫດຜົນເປັນ suffix", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([order("A", "PAID"), order("B", "PENDING_PAYMENT", "250.00")]));
    renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} restoreFocus={vi.fn()} />);
    const pending = await screen.findByRole("radio", { name: /SO-B/ });
    expect(pending).toBeChecked();
    const paid = screen.getByRole("radio", { name: /SO-A/ });
    expect(paid).toBeDisabled();
    expect(screen.getByText(/cannot accept payment/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20");
  });

  it("ຜູກ: POST ດ້ວຍ { orderId, attachmentIndex } ແລ້ວປິດ dialog", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} restoreFocus={vi.fn()} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    vi.mocked(apiFetch).mockResolvedValueOnce({ id: "s1" });
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/messages/m1/slips", { method: "POST", body: { orderId: "B", attachmentIndex: 1 } });
  });

  it("ລົ້ມ → ຂໍ້ຄວາມ error ໃນ dialog (role=alert) ແລະ ຍັງເປີດ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} restoreFocus={vi.fn()} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(422, "x", [], "SLIP_FILE_INVALID"));
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid image");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ບໍ່ມີບິນ → ຂໍ້ຄວາມ + ລິ້ງເປີດບິນ ແລະ ປຸ່ມຜູກຖືກປິດ; ບໍ່ມີບິນທີ່ຮັບຊຳລະໄດ້ → ປຸ່ມຜູກຖືກປິດ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([]));
    const { unmount } = renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} restoreFocus={vi.fn()} />);
    expect(await screen.findByText("This conversation has no orders yet; open an order first")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/orders/new?conversationId=c1");
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
    unmount();
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("A", "PAID")]));
    renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} restoreFocus={vi.fn()} />);
    await screen.findByRole("radio", { name: /SO-A/ });
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
  });

  it("target = null → ບໍ່ render dialog ແລະ ບໍ່ຍິງ API", () => {
    renderWithProviders(<LinkSlipDialog target={null} onClose={vi.fn()} restoreFocus={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ຂະນະບັນທຶກ: Escape ບໍ່ປິດ dialog; ຜູກສຳເລັດ → onClose ແລ້ວ dialog ປິດ ແລະ ເອີ້ນ restoreFocus", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    const onClose = vi.fn();
    const restoreFocus = vi.fn();
    function Harness() {
      const [open, setOpen] = useState<typeof target | null>(target);
      return (
        <LinkSlipDialog
          target={open}
          onClose={() => {
            onClose();
            setOpen(null);
          }}
          restoreFocus={restoreFocus}
        />
      );
    }
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("radio", { name: /SO-B/ });
    let release: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release({ id: "s1" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(restoreFocus).toHaveBeenCalled());
  });

  it("ຫຼັງຜູກສຳເລັດ: ລາຍການບິນຂອງ dialog ຖືກ invalidate ແລະ ດຶງໃໝ່", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    // onClose ເປັນ no-op ເພື່ອໃຫ້ query ຍັງ active ແລ້ວນັບການດຶງ
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} restoreFocus={vi.fn()} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    expect(ordersCalls()).toHaveLength(1);
    vi.mocked(apiFetch).mockImplementation((async (url: string) => (url.startsWith("/orders") ? page([order("B", "PAID")]) : { id: "s1" })) as typeof apiFetch);
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await waitFor(() => expect(ordersCalls()).toHaveLength(2));
  });
});

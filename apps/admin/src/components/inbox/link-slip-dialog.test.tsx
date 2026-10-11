import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { LinkSlipDialog } from "./link-slip-dialog";

const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => !auth.denied.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));

const order = (id: string, status: OrderListItemDto["status"], total = "100.00"): OrderListItemDto => ({
  id, orderNumber: `SO-${id}`, status, channel: "FACEBOOK", source: "CHAT", conversationId: "c1",
  customer: null, total, itemCount: 1, reservedUntil: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const page = (items: OrderListItemDto[]) => ({ items, total: items.length, page: 1, pageSize: 20 });
const target = { conversationId: "c1", messageId: "m1", attachmentIndex: 1 };
const LINK_URL = "/conversations/c1/messages/m1/slips";
const ordersCalls = () => vi.mocked(apiFetch).mock.calls.filter((call) => String(call[0]).startsWith("/orders"));

/** mock ຕາມ path (ບໍ່ຂຶ້ນກັບລຳດັບການເອີ້ນ): orders = ຕົວແປ, POST ຜູກ = handler */
function mockApi(opts: { orders: () => OrderListItemDto[]; link?: () => Promise<unknown> }) {
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url.startsWith("/orders")) return page(opts.orders());
    if (url === LINK_URL) return (opts.link ?? (async () => ({ id: "s1" })))();
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
}
const noop = () => {};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  auth.denied.clear();
});

describe("LinkSlipDialog", () => {
  it("ລາຍການບິນຂອງເຄສ: ເລືອກເລີ່ມຕົ້ນເປັນບິນ PENDING_PAYMENT ແລະ ບິນອື່ນຖືກປິດ ພ້ອມເຫດຜົນເປັນ suffix ທີ່ຜູກດ້ວຍ aria-describedby", async () => {
    mockApi({ orders: () => [order("A", "PAID"), order("B", "PENDING_PAYMENT", "250.00")] });
    renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    const pending = await screen.findByRole("radio", { name: /SO-B/ });
    expect(pending).toBeChecked();
    const paid = screen.getByRole("radio", { name: /SO-A/ });
    expect(paid).toBeDisabled();
    expect(screen.getByText(/cannot accept payment/)).toBeInTheDocument();
    expect(paid).toHaveAccessibleDescription("cannot accept payment");
    expect(pending).not.toHaveAttribute("aria-describedby");
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20");
  });

  it("ຜູກ: POST ດ້ວຍ { orderId, attachmentIndex } ແລ້ວປິດ dialog", async () => {
    mockApi({ orders: () => [order("B", "PENDING_PAYMENT")] });
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} restoreFocus={noop} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(LINK_URL, { method: "POST", body: { orderId: "B", attachmentIndex: 1 } });
  });

  it("ລົ້ມ → ຂໍ້ຄວາມ error ໃນ dialog (role=alert) ແລະ ຍັງເປີດ", async () => {
    mockApi({ orders: () => [order("B", "PENDING_PAYMENT")], link: async () => { throw new ApiError(422, "x", [], "SLIP_FILE_INVALID"); } });
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} restoreFocus={noop} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid image");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("409 DUPLICATE_VALUE (ມີຄົນຜູກຮູບນີ້ແລ້ວ): ຂໍ້ຄວາມສະເພາະ ແລະ invalidate slips ຂອງເຄສ (ຟອງຈະກາຍເປັນ Linked)", async () => {
    mockApi({ orders: () => [order("B", "PENDING_PAYMENT")], link: async () => { throw new ApiError(409, "dup", [], "DUPLICATE_VALUE"); } });
    const onClose = vi.fn();
    const { user, queryClient } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} restoreFocus={noop} />);
    queryClient.setQueryData(["slips", "conversation", "c1"], []);
    await screen.findByRole("radio", { name: /SO-B/ });
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This image is already linked to a slip");
    expect(onClose).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(["slips", "conversation", "c1"])?.isInvalidated).toBe(true);
  });

  it("ບໍ່ມີບິນ + ມີສິດເປີດບິນ → ຂໍ້ຄວາມ + ລິ້ງເປີດບິນ; ປຸ່ມຜູກຖືກປິດ", async () => {
    mockApi({ orders: () => [] });
    renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    expect(await screen.findByText(/This conversation has no orders yet; open an order first/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/orders/new?conversationId=c1");
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
  });

  it.each(["inbox:write", "orders:write", "inventory:read"])("ບໍ່ມີບິນ ແລະ ຂາດ %s → ມີແຕ່ຂໍ້ຄວາມ ບໍ່ມີລິ້ງ", async (permission) => {
    auth.denied.add(permission);
    mockApi({ orders: () => [] });
    renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    expect(await screen.findByText("This conversation has no orders yet; open an order first")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ບໍ່ມີບິນທີ່ຮັບຊຳລະໄດ້ → ປຸ່ມຜູກຖືກປິດ", async () => {
    mockApi({ orders: () => [order("A", "PAID")] });
    renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    await screen.findByRole("radio", { name: /SO-A/ });
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
  });

  it("target = null → ບໍ່ render dialog ແລະ ບໍ່ຍິງ API", () => {
    renderWithProviders(<LinkSlipDialog target={null} onClose={noop} restoreFocus={noop} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ຂະນະບັນທຶກ: Escape/overlay/X ບໍ່ປິດ; ຜູກສຳເລັດ → onClose, dialog ປິດ ແລະ ເອີ້ນ restoreFocus", async () => {
    let release: (value: unknown) => void = () => {};
    mockApi({ orders: () => [order("B", "PENDING_PAYMENT")], link: () => new Promise((resolve) => (release = resolve)) });
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
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await user.keyboard("{Escape}");
    // overlay (ຄລິກນອກ dialog) ແລະ ປຸ່ມ X
    const overlay = document.querySelector("[data-state='open'].fixed.inset-0, [data-radix-dialog-overlay]");
    if (overlay) await user.click(overlay as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release({ id: "s1" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(restoreFocus).toHaveBeenCalled());
  });

  it("ຫຼັງຜູກສຳເລັດ: ລາຍການບິນຂອງ dialog ຖືກ invalidate ແລະ ດຶງໃໝ່", async () => {
    mockApi({ orders: () => [order("B", "PENDING_PAYMENT")] });
    // onClose ເປັນ no-op ເພື່ອໃຫ້ query ຍັງ active ແລ້ວນັບການດຶງ
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    expect(ordersCalls()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await waitFor(() => expect(ordersCalls()).toHaveLength(2));
  });

  it("ບິນທີ່ເລືອກເອງ ແຕ່ຫຼັງ refetch ບໍ່ຮັບຊຳລະແລ້ວ → ກັບໄປເລືອກບິນທຳອິດທີ່ຮັບຊຳລະໄດ້", async () => {
    let rows = [order("B", "PENDING_PAYMENT"), order("C", "PENDING_PAYMENT")];
    mockApi({ orders: () => rows });
    const { user, queryClient } = renderWithProviders(<LinkSlipDialog target={target} onClose={noop} restoreFocus={noop} />);
    await user.click(await screen.findByRole("radio", { name: /SO-C/ }));
    expect(screen.getByRole("radio", { name: /SO-C/ })).toBeChecked();
    rows = [order("B", "PENDING_PAYMENT"), order("C", "PAID")];
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    await waitFor(() => expect(screen.getByRole("radio", { name: /SO-C/ })).toBeDisabled());
    expect(screen.getByRole("radio", { name: /SO-B/ })).toBeChecked();
  });
});

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ConversationOrders } from "./conversation-orders";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const row = (patch: Partial<OrderListItemDto> = {}): OrderListItemDto => ({
  id: "o1",
  orderNumber: "SO-000001",
  status: "PENDING_PAYMENT",
  channel: "FACEBOOK",
  source: "CHAT",
  conversationId: "c1",
  customer: null,
  total: "1195.00",
  itemCount: 2,
  reservedUntil: null,
  createdAt: "2026-10-07T05:00:00.000Z",
  ...patch,
});

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ConversationOrders", () => {
  it("ດຶງບິນຂອງເຄສ ແລະ ສະແດງເລກບິນ (ລິ້ງ /orders/[id]), ສະຖານະ, ຍອດ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [row(), row({ id: "o2", orderNumber: "SO-000002", status: "PAID", total: "50.00" })],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    const first = await screen.findByRole("link", { name: "SO-000001" });
    expect(first).toHaveAttribute("href", "/orders/o1");
    expect(screen.getByRole("link", { name: "SO-000002" })).toHaveAttribute("href", "/orders/o2");
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("1,195.00")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20");
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });

  it("ບໍ່ມີບິນ: ສະແດງຄຳບອກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByText("No orders from this conversation yet")).toBeInTheDocument();
  });

  it("ມີຫຼາຍກວ່າທີ່ສະແດງ: ບອກ 'ສະແດງ N ຈາກທັງໝົດ'", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [row()], total: 25, page: 1, pageSize: 20 });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByText("Showing the latest 1 of 25 orders")).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ: ມີຂໍ້ຄວາມ + Retry ທີ່ດຶງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "x"));
    vi.mocked(apiFetch).mockResolvedValue({ items: [row()], total: 1, page: 1, pageSize: 20 });
    const { user } = renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load data");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it("ກຳລັງໂຫຼດ: role=status", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("refetch ລົ້ມຕອນມີຂໍ້ມູນແລ້ວ: ຍັງສະແດງລາຍການ + alert ໃນແຖວ (ບໍ່ blank)", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ items: [row()], total: 1, page: 1, pageSize: 20 });
    const { queryClient } = renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "x"));
    await queryClient.invalidateQueries();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load data");
    expect(screen.getByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

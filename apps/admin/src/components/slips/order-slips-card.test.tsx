import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { SlipDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderSlipsCard } from "./order-slips-card";

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("./slip-image", () => ({ SlipImage: ({ slipId }: { slipId: string }) => <div data-testid={`image-${slipId}`} /> }));

const order = { id: "o1", orderNumber: "SO-000001", total: "100000.00", currency: "LAK" };
const slip = (id: string, status: SlipDto["status"] = "READ"): SlipDto => ({
  id, orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD", status,
  imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100000.00", currency: "LAK", paidAt: null, destAccount: null, refNo: id },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const file = (type = "image/png", size = 10) => {
  const f = new File(["x"], "a.png", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

beforeEach(() => {
  auth.perms = new Set(["orders:read", "orders:write", "payments:write"]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue([]);
});

describe("OrderSlipsCard", () => {
  it("ໂຫຼດສະລິບຂອງບິນ ແລະ ສະແດງແຕ່ລະໃບ; ບໍ່ມີ = ຂໍ້ຄວາມວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([slip("s1"), slip("s2", "CONFIRMED")]);
    renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByTestId("slip-s1")).toBeInTheDocument();
    expect(screen.getByTestId("slip-s2")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/slips");
  });

  it("ວ່າງ → 'No slips for this order yet'", async () => {
    renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByText("No slips for this order yet")).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ → error + Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "x"));
    const { user } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No slips for this order yet")).toBeInTheDocument();
  });

  it("ອັບໂຫຼດ: ເລືອກຮູບ → POST multipart /orders/o1/slips ແລ້ວ refetch", async () => {
    const { user } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    vi.mocked(apiFetch).mockResolvedValueOnce(slip("s9", "PENDING_READ"));
    await user.upload(screen.getByLabelText("Upload slip"), file());
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post?.[0]).toBe("/orders/o1/slips");
      expect((post?.[1] as { body: FormData }).body.get("file")).toBeInstanceOf(File);
    });
  });

  it("ໄຟລ໌ຜິດຊະນິດ/ໃຫຍ່ເກີນ → ບໍ່ຍິງ API ແລະ ບອກເຫດຜົນ", async () => {
    renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    const input = screen.getByLabelText("Upload slip");
    fireEvent.change(input, { target: { files: [file("image/gif")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only JPG, PNG and WebP images are supported");
    fireEvent.change(input, { target: { files: [file("image/png", 9 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 8MB");
    expect(vi.mocked(apiFetch).mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST")).toHaveLength(0);
  });

  it("ບໍ່ມີ orders:write → ບໍ່ມີປຸ່ມອັບໂຫຼດ; ບໍ່ມີ payments:write → ບໍ່ມີປຸ່ມຢືນຢັນ/ປະຕິເສດ", async () => {
    auth.perms = new Set(["orders:read"]);
    vi.mocked(apiFetch).mockResolvedValue([slip("s1")]);
    renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByTestId("slip-s1");
    expect(screen.queryByLabelText("Upload slip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("ບໍ່ມີ orders:read → ບໍ່ render ຫຍັງ ແລະ ບໍ່ຍິງ API", () => {
    auth.perms = new Set();
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(container).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("ຢືນຢັນສະລິບ → invalidate ບິນ ເພື່ອໃຫ້ສະຖານະບິນ refresh", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) =>
      options?.method === "POST" ? slip("s1", "CONFIRMED") : path.endsWith("/slips") ? [slip("s1")] : []) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderSlipsCard order={order} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await screen.findByTestId("slip-s1");
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm payment?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(spy.mock.calls.some((c) => c[0]?.queryKey?.[0] === "orders")).toBe(true));
  });
});

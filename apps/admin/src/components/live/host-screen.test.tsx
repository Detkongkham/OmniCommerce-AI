import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { HostSnapshotDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { HostScreen } from "./host-screen";

const auth = vi.hoisted(() => ({ canWrite: true }));
const realtime = vi.hoisted(() => ({ status: "connected" as string, calls: [] as [string, boolean][] }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/use-live-realtime", () => ({
  useLiveRealtime: (id: string, enabled: boolean) => {
    realtime.calls.push([id, enabled]);
    return enabled ? realtime.status : "disconnected";
  },
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const SNAPSHOT: HostSnapshotDto = {
  session: { id: "s1", title: "Friday live", kind: "LIVE", status: "LIVE", startedAt: new Date(Date.now() - 65_000).toISOString(), endedAt: null, featuredItemId: "i2" },
  items: [
    { id: "i1", code: "A1", productName: "Shirt", variantName: "Black / M", sku: "S-1", price: "120000.00", imageUrl: null, limit: 5, claimed: 5, stockAvailable: 8, remaining: 0, level: "SOLD_OUT" },
    { id: "i2", code: "B2", productName: "Mug", variantName: null, sku: "M-1", price: "45000.00", imageUrl: "https://cdn.example/mug.jpg", limit: null, claimed: 1, stockAvailable: 2, remaining: 2, level: "LOW" },
    { id: "i3", code: "C3", productName: "Hat", variantName: null, sku: "H-1", price: "60000.00", imageUrl: null, limit: null, claimed: 0, stockAvailable: null, remaining: null, level: "OK" },
  ],
  totals: { buyers: 7, orders: 6, reservedAmount: "150000.50", paidAmount: "500000.00", unitsClaimed: 9, comments: 30 },
  recent: [
    { id: "c2", authorName: "Kham", message: "A1", outcome: "OUT_OF_STOCK", lines: [], createdAt: new Date().toISOString() },
    { id: "c1", authorName: "Noy", message: "B2 x2", outcome: "ORDERED", lines: [{ code: "B2", quantity: 2 }], createdAt: new Date().toISOString() },
  ],
};

function mockSnapshot(snapshot: HostSnapshotDto = SNAPSHOT) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string; body?: { itemId: string | null } }) => {
    if (options?.method === "PUT") return {};
    return snapshot;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  realtime.status = "connected";
  realtime.calls = [];
  vi.mocked(apiFetch).mockReset();
  mockSnapshot();
});

describe("HostScreen", () => {
  it("ສິນຄ້ານຳສະເໜີ: ລະຫັດ, ຊື່, ລາຄາ, ເຫຼືອ + ໃກ້ໝົດ, ຮູບ", async () => {
    renderWithProviders(<HostScreen id="s1" />);
    const featured = await screen.findByRole("region", { name: "Now selling" });
    expect(within(featured).getByText("B2")).toBeInTheDocument();
    expect(within(featured).getByText("Mug")).toBeInTheDocument();
    expect(within(featured).getByText("45,000.00")).toBeInTheDocument();
    expect(within(featured).getByText("2 left")).toBeInTheDocument();
    expect(within(featured).getByText("Almost gone")).toBeInTheDocument();
    expect(within(featured).getByRole("img", { name: "Mug" })).toHaveAttribute("src", "https://cdn.example/mug.jpg");
    expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/host");
  });

  it("ຍອດລວມ ແລະ ຟີດ CF ລ່າສຸດ", async () => {
    renderWithProviders(<HostScreen id="s1" />);
    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("People CF'd").nextSibling).toHaveTextContent("7");
    expect(within(totals).getByText("Orders").nextSibling).toHaveTextContent("6");
    expect(within(totals).getByText("Awaiting payment").nextSibling).toHaveTextContent("150,000.50");
    expect(within(totals).getByText("Paid").nextSibling).toHaveTextContent("500,000.00");
    const feed = screen.getByRole("region", { name: "Latest CF" });
    const rows = within(feed).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Kham");
    expect(rows[0]).toHaveTextContent("Out of stock");
    expect(rows[1]).toHaveTextContent("Noy");
    expect(rows[1]).toHaveTextContent("Ordered");
  });

  it("ກຣິດລະຫັດ: ສະຖານະ/ຈຳນວນ; ຜູ້ມີ write ແຕະເພື່ອນຳສະເໜີ (PUT)", async () => {
    const { user } = renderWithProviders(<HostScreen id="s1" />);
    const a1 = await screen.findByRole("button", { name: /Feature A1/ });
    expect(a1).toHaveAttribute("aria-pressed", "false");
    expect(a1).toHaveTextContent("Sold out");
    expect(a1).toHaveTextContent("5 claimed");
    expect(screen.getByRole("button", { name: /Feature B2/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Feature C3/ })).toHaveTextContent("No limit");
    await user.click(screen.getByRole("button", { name: /Feature C3/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/featured", { method: "PUT", body: { itemId: "i3" } }));
  });

  it("ບໍ່ມີ write: ລະຫັດບໍ່ແມ່ນປຸ່ມ; ບໍ່ມີສິນຄ້ານຳສະເໜີ → ຂໍ້ຄວາມຕາມສິດ", async () => {
    auth.canWrite = false;
    mockSnapshot({ ...SNAPSHOT, session: { ...SNAPSHOT.session, featuredItemId: null } });
    const { unmount } = renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText("No product featured yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Feature/ })).toBeNull();
    unmount();
    auth.canWrite = true;
    renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText(/tap a code below to feature it/)).toBeInTheDocument();
  });

  it("LIVE: ເປີດ realtime + ເວລາທີ່ຜ່ານໄປ; ຂາດການເຊື່ອມ → ປ້າຍກຳລັງເຊື່ອມຄືນ", async () => {
    realtime.status = "reconnecting";
    renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText(/Elapsed 0?1:0\d/)).toBeInTheDocument();
    expect(screen.getByText("Reconnecting… (refreshing every 5 s)")).toBeInTheDocument();
    expect(realtime.calls.at(-1)).toEqual(["s1", true]);
  });

  it("DRAFT / ENDED: ປ້າຍ ແລະ ບໍ່ເປີດ realtime; ENDED ບໍ່ໃຫ້ແຕະນຳສະເໜີ", async () => {
    mockSnapshot({ ...SNAPSHOT, session: { ...SNAPSHOT.session, status: "DRAFT", startedAt: null } });
    const { unmount } = renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText(/Not started yet/)).toBeInTheDocument();
    expect(realtime.calls.at(-1)).toEqual(["s1", false]);
    unmount();
    mockSnapshot({ ...SNAPSHOT, session: { ...SNAPSHOT.session, status: "ENDED", endedAt: new Date().toISOString() } });
    renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText("Session ended: final totals")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Feature/ })).toBeNull();
  });

  it("ປຸ່ມອອກໄປ /live/:id; 404 → ບໍ່ພົບ; error → Retry", async () => {
    const { unmount } = renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByRole("link", { name: "Exit" })).toHaveAttribute("href", "/live/s1");
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "nf", [], "LIVE_SESSION_NOT_FOUND"));
    const nf = renderWithProviders(<HostScreen id="s1" />);
    expect(await screen.findByText("This session was not found")).toBeInTheDocument();
    nf.unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<HostScreen id="s1" />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockSnapshot();
    await user.click(retry);
    expect(await screen.findByRole("region", { name: "Now selling" })).toBeInTheDocument();
  });
});

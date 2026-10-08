import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { LiveSessionDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SESSION } from "./fixtures";
import { SessionDetail } from "./session-detail";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn(), info: vi.fn() } };
});
const auth = vi.hoisted(() => ({ permissions: ["live-cf:write", "orders:read"] as string[] }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.permissions.includes(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

function mockSession(session: LiveSessionDetailDto, after: Partial<LiveSessionDetailDto> = {}) {
  let current = session;
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path.includes("/comments")) return { items: [], total: 0, page: 1, pageSize: 30 };
    if (options?.method === "POST") current = { ...current, ...after };
    return current;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.permissions = ["live-cf:write", "orders:read"];
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  mockSession(SESSION);
});

describe("SessionDetail", () => {
  it("ຫົວ: ຊື່, ສະຖານະ, id ໂພສ, ການຕອບສາທາລະນະ; ມີ card ລະຫັດ ແລະ ຄອມເມັ້ນ", async () => {
    renderWithProviders(<SessionDetail id="s1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Friday live" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("111_222")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CF codes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CF comments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sessions" })).toHaveAttribute("href", "/live");
    expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1");
  });

  it("DRAFT ພ້ອມ: ກົດເລີ່ມ → POST /start ແລ້ວສະແດງ LIVE + ປຸ່ມຈົບ + ຂໍ້ຄວາມ poll", async () => {
    mockSession(SESSION, { status: "LIVE", startedAt: "2026-10-08T04:00:00.000Z" });
    const { user } = renderWithProviders(<SessionDetail id="s1" />);
    await user.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/start", { method: "POST" }));
    expect(await screen.findByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(screen.getByText("Refreshing every 5 seconds")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Session started: capturing CF comments");
  });

  it("ຍັງເລີ່ມບໍ່ໄດ້: ປຸ່ມ disabled ພ້ອມເຫດຜົນ (ບໍ່ມີ id ໂພສ / ບໍ່ມີລະຫັດ)", async () => {
    mockSession({ ...SESSION, externalPostId: null });
    const { unmount } = renderWithProviders(<SessionDetail id="s1" />);
    const start = await screen.findByRole("button", { name: "Start" });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription("Add the post id (Edit) before starting");
    unmount();
    mockSession({ ...SESSION, items: [], itemCount: 0 });
    renderWithProviders(<SessionDetail id="s1" />);
    expect(await screen.findByRole("button", { name: "Start" })).toHaveAccessibleDescription("Add at least one code before starting");
  });

  it("LIVE: ຈົບ ຕ້ອງຢືນຢັນ → POST /end; ຈົບແລ້ວບໍ່ມີປຸ່ມ action/ແກ້", async () => {
    mockSession({ ...SESSION, status: "LIVE" }, { status: "ENDED", endedAt: "2026-10-08T05:00:00.000Z" });
    const { user } = renderWithProviders(<SessionDetail id="s1" />);
    await user.click(await screen.findByRole("button", { name: "End session" }));
    const dialog = await screen.findByRole("dialog", { name: "End this session?" });
    await user.click(within(dialog).getByRole("button", { name: "End session" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/end", { method: "POST" }));
    expect(await screen.findByText("Ended", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("action ລົ້ມ: alert ພ້ອມຂໍ້ຄວາມແປ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path.includes("/comments")) return { items: [], total: 0, page: 1, pageSize: 30 };
      if (options?.method === "POST") throw new ApiError(409, "dup", [], "DUPLICATE_VALUE");
      return SESSION;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SessionDetail id="s1" />);
    await user.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByText("This value already exists", { selector: "[role=alert]" })).toBeInTheDocument();
  });

  it("ແກ້ໄຂ ເປີດ dialog ທີ່ມີຄ່າເດີມ", async () => {
    const { user } = renderWithProviders(<SessionDetail id="s1" />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit session" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Friday live");
  });

  it("ບໍ່ມີ live-cf:write: ບໍ່ມີປຸ່ມເລີ່ມ/ແກ້", async () => {
    auth.permissions = [];
    renderWithProviders(<SessionDetail id="s1" />);
    await screen.findByRole("heading", { level: 1, name: "Friday live" });
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("404 → ບໍ່ພົບ + ກັບຄືນ; 500 → error + Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "nf", [], "LIVE_SESSION_NOT_FOUND"));
    const { unmount } = renderWithProviders(<SessionDetail id="s1" />);
    expect(await screen.findByText("This session was not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sessions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<SessionDetail id="s1" />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockSession(SESSION);
    await user.click(retry);
    expect(await screen.findByRole("heading", { level: 1, name: "Friday live" })).toBeInTheDocument();
  });
});

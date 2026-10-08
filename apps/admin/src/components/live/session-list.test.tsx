import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { LiveSessionDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SESSION, SESSION_ROW as ROW } from "./fixtures";
import { SessionList } from "./session-list";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const page = (items: LiveSessionDto[]): Page<LiveSessionDto> => ({ items, total: items.length, page: 1, pageSize: 10 });

function mockList(items: LiveSessionDto[] = [{ ...ROW, status: "LIVE", itemCount: 3, commentCount: 12 }]) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (options?.method === "POST") return { ...SESSION, id: "new1" };
    return page(path.includes("status=ENDED") ? [] : items);
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockList();
});

describe("SessionList", () => {
  it("ສະແດງແຖວ: ຊື່ລິ້ງໄປ detail, ປະເພດ, ສະຖານະ, ຈຳນວນລະຫັດ/ຄອມເມັ້ນ", async () => {
    renderWithProviders(<SessionList />);
    const link = await screen.findByRole("link", { name: "Friday live" });
    expect(link).toHaveAttribute("href", "/live/s1");
    const row = screen.getByTestId("row-live-s1");
    // ປະເພດ (Live) + ສະຖານະ (Live)
    expect(within(row).getAllByText("Live")).toHaveLength(2);
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1 sessions")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/live-sessions?page=1&pageSize=10");
  });

  it("ກອງສະຖານະ: ສົ່ງ status ແລະ ສະແດງ empty ແບບມີ filter + ລ້າງ", async () => {
    const { user } = renderWithProviders(<SessionList />);
    await screen.findByRole("link", { name: "Friday live" });
    await user.selectOptions(screen.getByLabelText("Filter by status"), "ENDED");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions?status=ENDED&page=1&pageSize=10"));
    expect(await screen.findByText("No sessions with this status")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("link", { name: "Friday live" })).toBeInTheDocument();
  });

  it("ບໍ່ມີ session: empty state ພ້ອມຄຳແນະນຳ", async () => {
    mockList([]);
    renderWithProviders(<SessionList />);
    expect(await screen.findByText("No sessions yet")).toBeInTheDocument();
    expect(screen.getByText(/add product codes, then start/)).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ: error + Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<SessionList />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockList();
    await user.click(retry);
    expect(await screen.findByRole("link", { name: "Friday live" })).toBeInTheDocument();
  });

  it("ສ້າງໃໝ່ (ມີ live-cf:write): ເປີດ dialog ແລ້ວໄປໜ້າ detail ຂອງ session ໃໝ່", async () => {
    const { user } = renderWithProviders(<SessionList />);
    await user.click(await screen.findByRole("button", { name: "New session" }));
    await user.type(screen.getByLabelText(/^Title/), "Sunday live");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/live/new1"));
  });

  it("ບໍ່ມີ live-cf:write: ບໍ່ມີປຸ່ມສ້າງ", async () => {
    auth.canWrite = false;
    renderWithProviders(<SessionList />);
    await screen.findByRole("link", { name: "Friday live" });
    expect(screen.queryByRole("button", { name: "New session" })).toBeNull();
  });
});

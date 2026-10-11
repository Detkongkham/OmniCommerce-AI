import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { SocialPostDto } from "@/lib/posts";
import type { Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { POST } from "./fixtures";
import { PostList } from "./post-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const page = (items: SocialPostDto[]): Page<SocialPostDto> => ({ items, total: items.length, page: 1, pageSize: 10 });

const SCHEDULED: SocialPostDto = {
  ...POST,
  id: "p2",
  message: "Flash sale tonight",
  status: "SCHEDULED",
  scheduledAt: "2026-10-09T12:00:00.000Z", // 19:00 ເວລາລາວ
  media: [],
  liveSession: { id: "s1", title: "Sale CF", status: "DRAFT" },
};
const PUBLISHED: SocialPostDto = {
  ...POST,
  id: "p3",
  message: "Published one",
  status: "PUBLISHED",
  publishedAt: "2026-10-31T18:30:00.000Z", // 01:30 ຂອງ 1 ພ.ຈ. ເວລາລາວ
};

function mockList(items: SocialPostDto[] = [POST, SCHEDULED]) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.includes("status=FAILED")) return page([]);
    if (path.includes("from=")) return page([SCHEDULED, PUBLISHED]);
    return page(items);
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockList();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PostList", () => {
  it("ຕາຕະລາງ: ລິ້ງໂພສ, ຮູບປົກຜ່ານ /api, ສະຖານະ, ເວລາລາວ, session, ຜູ້ສ້າງ", async () => {
    renderWithProviders(<PostList />);
    const link = await screen.findByRole("link", { name: "New arrivals this week" });
    expect(link).toHaveAttribute("href", "/posts/p1");
    const row = screen.getByTestId("row-post-p1");
    expect(row.querySelector("img")).toHaveAttribute("src", "/api/media/files/aaa.png");
    expect(within(row).getByText("Draft")).toBeInTheDocument();
    expect(within(row).getByText("1 images")).toBeInTheDocument();
    expect(within(row).getByText("Noy")).toBeInTheDocument();
    const scheduled = screen.getByTestId("row-post-p2");
    expect(within(scheduled).getByText("Scheduled")).toBeInTheDocument();
    expect(within(scheduled).getByText("09/10/2026 19:00")).toBeInTheDocument();
    expect(within(scheduled).getByRole("link", { name: "Sale CF" })).toHaveAttribute("href", "/live/s1");
    expect(screen.getByRole("link", { name: "New post" })).toHaveAttribute("href", "/posts/new");
    expect(apiFetch).toHaveBeenCalledWith("/posts?page=1&pageSize=10");
  });

  it("ກອງສະຖານະ + empty + ລ້າງ; ບໍ່ມີສິດຂຽນ = ບໍ່ມີປຸ່ມສ້າງ", async () => {
    auth.canWrite = false;
    const { user } = renderWithProviders(<PostList />);
    await screen.findByRole("link", { name: "New arrivals this week" });
    expect(screen.queryByRole("link", { name: "New post" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter by status"), "FAILED");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/posts?status=FAILED&page=1&pageSize=10"));
    expect(await screen.findByText("No posts with this status")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("link", { name: "New arrivals this week" })).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ → Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<PostList />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockList();
    await user.click(retry);
    expect(await screen.findByRole("link", { name: "New arrivals this week" })).toBeInTheDocument();
  });

  it("ປະຕິທິນ: ດຶງຊ່ວງເດືອນ (ເວລາລາວ), ວາງໂພສຕາມວັນລາວ, ເລື່ອນເດືອນ", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T05:00:00.000Z") });
    const { user } = renderWithProviders(<PostList />);
    await user.click(await screen.findByRole("tab", { name: "Calendar" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/posts?from=2026-09-30T17%3A00%3A00.000Z&to=2026-10-31T17%3A00%3A00.000Z&page=1&pageSize=100"),
    );
    const day = await screen.findByTestId("day-2026-10-09");
    const link = await within(day).findByRole("link", { name: /Flash sale tonight/ });
    expect(link).toHaveAttribute("href", "/posts/p2");
    expect(link).toHaveTextContent("19:00");
    // ໂພສທີ່ຂຶ້ນເພຈຕອນ 01:30 ເວລາລາວ ຢູ່ວັນທີ 1 ພະຈິກ (ບໍ່ແມ່ນ 31 ຕຸລາ)
    expect(within(screen.getByTestId("day-2026-11-01")).getByRole("link", { name: /Published one/ })).toBeInTheDocument();
    expect(within(screen.getByTestId("day-2026-10-31")).queryByRole("link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("from=2026-10-31T17%3A00%3A00.000Z")));
  });
});

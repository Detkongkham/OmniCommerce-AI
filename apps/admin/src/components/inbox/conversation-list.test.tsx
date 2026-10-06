import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ConversationList } from "./conversation-list";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const make = (id: string, overrides: Partial<ConversationDto> = {}): ConversationDto => ({
  id,
  channel: "FACEBOOK",
  displayName: `Customer ${id}`,
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: `hello ${id}`,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
  ...overrides,
});

const items = [
  make("c1", { unreadCount: 3, assignee: { id: "u1", name: "Chat Admin" } }),
  make("c2", { lastMessagePreview: null }),
  make("c3", { status: "CLOSED" }),
];

function mockApi(page: Page<ConversationDto> = { items, total: 3, page: 1, pageSize: 30 }) {
  vi.mocked(apiFetch).mockImplementation((async () => page) as typeof apiFetch);
}
const urls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]);
const lastUrl = () => urls().at(-1);
const SEARCH = "Search name or message...";

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ConversationList", () => {
  it("ສະແດງຊື່, ຕົວຢ່າງຂໍ້ຄວາມ, ເວລາລາວ, ຜູ້ຮັບຜິດຊອບ/ຍັງບໍ່ມີ, ເຄສປິດ; ເລກ unread ມີຊື່ສຳລັບ screen reader", async () => {
    renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    const first = await screen.findByTestId("conversation-c1");
    expect(within(first).getByText("Customer c1")).toBeInTheDocument();
    expect(within(first).getByText("hello c1")).toBeInTheDocument();
    expect(within(first).getByText("06/10/2026 12:30")).toBeInTheDocument();
    expect(within(first).getByText("Chat Admin")).toBeInTheDocument();
    expect(within(first).getByText("3 unread")).toBeInTheDocument();
    const second = screen.getByTestId("conversation-c2");
    expect(within(second).getByText("[Attachment]")).toBeInTheDocument();
    expect(within(second).getByText("Unassigned")).toBeInTheDocument();
    expect(within(second).queryByText(/unread/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId("conversation-c3")).getByText("Closed")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Conversations" })).toBeInTheDocument();
  });

  it("request ທຳອິດ: status=OPEN, ໜ້າ 1, 30 ແຖວ", async () => {
    renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    expect(urls()[0]).toBe("/conversations?status=OPEN&page=1&pageSize=30");
  });

  it("ກອງ status, ຜູ້ຮັບຜິດຊອບ ແລະ ສະເພາະທີ່ຍັງບໍ່ອ່ານ", async () => {
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");

    await user.selectOptions(screen.getByLabelText("Conversation status"), "");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?page=1&pageSize=30"));
    await user.selectOptions(screen.getByLabelText("Conversation status"), "CLOSED");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&page=1&pageSize=30"));

    await user.selectOptions(screen.getByLabelText("Assignee"), "me");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=me&page=1&pageSize=30"));
    await user.selectOptions(screen.getByLabelText("Assignee"), "unassigned");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=unassigned&page=1&pageSize=30"));

    await user.click(screen.getByRole("checkbox", { name: "Unread only" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=unassigned&unread=true&page=1&pageSize=30"));
  });

  it("ຄົ້ນຫາ (debounce) ສົ່ງ q ແລະ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 90, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=2&pageSize=30"));

    await user.type(screen.getByRole("searchbox", { name: SEARCH }), "somchai");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&q=somchai&page=1&pageSize=30"));
  });

  it("ກົດແຖວ → onSelect(id); ແຖວທີ່ເລືອກມີ aria-current", async () => {
    const onSelect = vi.fn();
    // ໃຊ້ Harness ທີ່ເກັບ selectedId ເອງ: `rerender` ຂອງ renderWithProviders ຈະເສຍ providers ເພາະ providers ຫໍ່ຢູ່ນອກ `ui`
    function Harness() {
      const [id, setId] = useState<string | null>(null);
      return (
        <ConversationList
          selectedId={id}
          onSelect={(next) => {
            onSelect(next);
            setId(next);
          }}
        />
      );
    }
    const { user } = renderWithProviders(<Harness />);
    const row = await screen.findByTestId("conversation-c2");
    expect(row).not.toHaveAttribute("aria-current");
    await user.click(row);
    expect(onSelect).toHaveBeenCalledWith("c2");
    expect(screen.getByTestId("conversation-c2")).toHaveAttribute("aria-current", "true");
  });

  it("ບໍ່ມີຂໍ້ມູນ: ຂໍ້ຄວາມຕ່າງກັນລະຫວ່າງ 'ຍັງບໍ່ມີ' ກັບ 'ຄົ້ນຫາບໍ່ພົບ'", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    // ຄ່າເລີ່ມຕົ້ນ (status=OPEN) ຖືວ່າເປັນ filter ຢູ່ ແຕ່ຍັງບໍ່ໄດ້ຄົ້ນຫາ/ກອງເອງ → ຍັງບໍ່ມີ
    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Unread only" }));
    expect(await screen.findByText("No conversations match your search")).toBeInTheDocument();
  });

  it("ໂຫຼດບໍ່ສຳເລັດ: ສະແດງ error ແລະ ປຸ່ມລອງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "boom"));
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("conversation-c1")).toBeInTheDocument();
  });

  it("ແບ່ງໜ້າ: 'Page 1 / 3', ກ່ອນໜ້າຖືກປິດຢູ່ໜ້າ 1, ໜ້າຕໍ່ໄປຂໍ page=2", async () => {
    mockApi({ items, total: 65, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=2&pageSize=30"));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("ໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ (ຂໍ້ມູນຫຼຸດ) → ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ", async () => {
    const empty: Page<ConversationDto> = { items: [], total: 30, page: 2, pageSize: 30 };
    vi.mocked(apiFetch).mockImplementation((async (url: string) =>
      url.includes("page=2") ? empty : { items, total: 90, page: 1, pageSize: 30 }) as typeof apiFetch);
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=1&pageSize=30"));
  });

  it("ໜ້າ 2 ຄືນ total=0 → ກັບໄປໜ້າ 1", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string) =>
      url.includes("page=2") ? { items: [], total: 0, page: 2, pageSize: 30 } : { items, total: 90, page: 1, pageSize: 30 }) as typeof apiFetch);
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(urls().filter((u) => u === "/conversations?status=OPEN&page=1&pageSize=30").length).toBeGreaterThan(0));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=1&pageSize=30"));
  });

  it("refetch ລົ້ມຫຼັງມີຂໍ້ມູນ: ຍັງສະແດງແຖວ + banner (role=alert) ພ້ອມລອງໃໝ່", async () => {
    const { user, queryClient } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "boom"));
    await act(async () => {
      await queryClient.refetchQueries();
    });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-c1")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByTestId("conversation-c1")).toBeInTheDocument();
  });

  it("ປ່ຽນ filter ຈາກໜ້າ 2 → ກັບໄປ page=1 (status, assignee, unread)", async () => {
    mockApi({ items, total: 90, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    const goPage2 = async () => {
      await user.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(lastUrl()).toMatch(/page=2/));
    };

    await goPage2();
    await user.selectOptions(screen.getByLabelText("Conversation status"), "CLOSED");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&page=1&pageSize=30"));
    await goPage2();
    await user.selectOptions(screen.getByLabelText("Assignee"), "me");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=me&page=1&pageSize=30"));
    await goPage2();
    await user.click(screen.getByRole("checkbox", { name: "Unread only" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=me&unread=true&page=1&pageSize=30"));
  });

  describe("ຄົ້ນຫາ (fake timers)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // RTL asyncWrapper detects fake timers via `jest`; shim it so waits advance vitest timers
      vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime.bind(vi) });
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
    const setup = () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLanguage="en">
            <ConversationList selectedId={null} onSelect={() => undefined} />
          </LanguageProvider>
        </QueryClientProvider>,
      );
      return user;
    };
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const qUrls = () => urls().filter((u) => String(u).includes("q="));

    it("debounce 300ms: ບໍ່ມີ q= ກ່ອນ 300ms, ແລະ ສົ່ງ q ດຽວຫຼັງພິມ 'somchai'", async () => {
      const user = setup();
      await advance(0);
      await user.type(screen.getByRole("searchbox", { name: SEARCH }), "somchai");
      await advance(299);
      expect(qUrls()).toEqual([]);
      await advance(1);
      expect(qUrls()).toEqual(["/conversations?status=OPEN&q=somchai&page=1&pageSize=30"]);
    });

    it("ລ້າງແລ້ວພິມໃໝ່ພາຍໃນ 300ms: ບໍ່ສົ່ງ q ເກົ່າ", async () => {
      const user = setup();
      await advance(0);
      const box = screen.getByRole("searchbox", { name: SEARCH });
      await user.type(box, "abc");
      await advance(300);
      expect(qUrls()).toEqual(["/conversations?status=OPEN&q=abc&page=1&pageSize=30"]);
      const before = urls().length;
      await user.clear(box);
      await user.type(box, "ab");
      await advance(299);
      expect(urls().slice(before).filter((u) => String(u).includes("q=abc"))).toEqual([]);
      await advance(1);
      expect(lastUrl()).toBe("/conversations?status=OPEN&q=ab&page=1&pageSize=30");
    });
  });
});

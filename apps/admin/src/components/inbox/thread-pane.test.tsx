import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, MessageDto, MessagePage } from "@/lib/types";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { renderWithProviders } from "@/test/render";
import { ThreadPane } from "./thread-pane";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 3,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: "m3",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const message = (id: string, minute: number, overrides: Partial<MessageDto> = {}): MessageDto => ({
  id,
  direction: "IN",
  text: id,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: `2026-10-06T05:${String(minute).padStart(2, "0")}:00.000Z`,
  ...overrides,
});

interface Setup {
  conversation?: ConversationDto;
  /** ໃໝ່ສຸດກ່ອນ ຕາມ API */
  pages?: MessagePage[];
}
function mockApi({ conversation: conv = conversation, pages = [{ items: [message("m3", 30), message("m2", 20), message("m1", 10)], hasMore: false }] }: Setup = {}) {
  const [first, ...older] = pages;
  vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
    if (url === "/conversations/c1") return conv;
    if (url === "/conversations/c1/read") return { ...conv, unreadCount: 0 };
    if (url.startsWith("/conversations/c1/messages") && init?.method === "POST") return message("sent", 40, { direction: "OUT" });
    if (url.startsWith("/conversations/c1/messages")) {
      // ໜ້າທຳອິດ (ບໍ່ມີ beforeId) ຕອບຊ້ຳໄດ້ເມື່ອ refetch/invalidate; ໜ້າເກົ່າກວ່າຕອບຕາມລຳດັບ
      if (!url.includes("beforeId=")) return first ?? { items: [], hasMore: false };
      return older.shift() ?? { items: [], hasMore: false };
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
}
const calls = (predicate: (url: string, method?: string) => boolean) =>
  vi.mocked(apiFetch).mock.calls.filter((call) => predicate(call[0], call[1]?.method));
const reads = () => calls((url, method) => url === "/conversations/c1/read" && method === "POST");

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ThreadPane", () => {
  it("header ສະແດງຊື່ ແລະ ຊ່ອງທາງ; ຂໍ້ຄວາມລຽງເກົ່າ→ໃໝ່ (API ສົ່ງໃໝ່ສຸດກ່ອນ)", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByRole("heading", { name: "Somchai Vong" })).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    const region = screen.getByRole("log", { name: "Conversation messages" });
    await within(region).findByTestId("message-m1");
    const order = within(region)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-testid"));
    expect(order).toEqual(["message-m1", "message-m2", "message-m3"]);
  });

  it("ໝາຍອ່ານແລ້ວຄັ້ງດຽວເມື່ອ unread > 0 ແລະ ມີສິດຂຽນ", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await waitFor(() => expect(reads()).toHaveLength(1));
    // refetch ຫຼັງ invalidate ຍັງໄດ້ unread ເທົ່າເກົ່າ (mock): ບໍ່ວົນຍິງຊ້ຳ
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reads()).toHaveLength(1);
    // ຢືນຢັນວ່າມີ refetch ເກີດຂຶ້ນແທ້ (ບໍ່ vacuous)
    expect(calls((url, method) => url === "/conversations/c1" && !method).length).toBeGreaterThan(1);
  });

  it("ບໍ່ໝາຍອ່ານເມື່ອບໍ່ມີສິດຂຽນ ຫຼື unread = 0", async () => {
    const { unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    await screen.findByTestId("message-m1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toHaveLength(0);
    unmount();
    mockApi({ conversation: { ...conversation, unreadCount: 0 } });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toHaveLength(0);
  });

  it("'Load older' ຂຶ້ນເມື່ອ hasMore ແລະ ໂຫຼດດ້ວຍ beforeId = ຂໍ້ຄວາມເກົ່າສຸດທີ່ມີ; ເກົ່າກວ່າຖືກວາງຂ້າງເທິງ", async () => {
    mockApi({
      pages: [
        { items: [message("m3", 30), message("m2", 20)], hasMore: true },
        { items: [message("m1", 10)], hasMore: false },
      ],
    });
    const { user } = renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m2");
    await user.click(screen.getByRole("button", { name: "Load older messages" }));
    await screen.findByTestId("message-m1");
    // mark-read invalidate ອາດ refetch ໜ້າທຳອິດຊ້ຳ: ກວດລຳດັບທີ່ບໍ່ຊ້ຳ ແລະ ວ່າ beforeId ຖືກຍິງຄັ້ງດຽວ
    const urls = calls((url) => url.startsWith("/conversations/c1/messages?")).map((call) => call[0]);
    expect([...new Set(urls)]).toEqual([
      "/conversations/c1/messages?limit=30",
      "/conversations/c1/messages?limit=30&beforeId=m2",
    ]);
    expect(urls.filter((url) => url.includes("beforeId="))).toHaveLength(1);
    const ids = screen.getAllByRole("listitem").map((item) => item.getAttribute("data-testid"));
    expect(ids).toEqual(["message-m1", "message-m2", "message-m3"]);
    expect(screen.queryByRole("button", { name: "Load older messages" })).not.toBeInTheDocument();
  });

  it("ບໍ່ມີຂໍ້ຄວາມ: ສະແດງ 'No messages yet'", async () => {
    mockApi({ pages: [{ items: [], hasMore: false }] });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
  });

  it("ໂຫຼດຂໍ້ຄວາມບໍ່ສຳເລັດ: ສະແດງ error + ລອງໃໝ່; ໂຫຼດເຄສບໍ່ສຳເລັດ (ເຊັ່ນ 404): ບອກເຫດຜົນຕາມ code", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === "/conversations/c1") return conversation;
      throw new ApiError(500, "boom");
    }) as typeof apiFetch);
    const { user, unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    mockApi();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("message-m1")).toBeInTheDocument();
    unmount();

    vi.mocked(apiFetch).mockImplementation((async () => {
      throw new ApiError(404, "nf", [], "CONVERSATION_NOT_FOUND");
    }) as typeof apiFetch);
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("This conversation was not found")).toBeInTheDocument();
  });

  it("ປຸ່ມກັບລາຍການ/ລາຍລະອຽດ ມີສະເພາະເມື່ອສົ່ງ callback ມາ", async () => {
    const onBack = vi.fn();
    const onShowDetails = vi.fn();
    const { user } = renderWithProviders(<ThreadPane conversationId="c1" canWrite onBack={onBack} onShowDetails={onShowDetails} />);
    await screen.findByTestId("message-m1");
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });

  it("ບໍ່ສົ່ງ callback = ບໍ່ມີປຸ່ມ", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    expect(screen.queryByRole("button", { name: "Back to list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
  });

  it("ມີ composer ທີ່ສົ່ງໄປຍັງເຄສນີ້; ບໍ່ມີສິດ = ຄຳອະທິບາຍ", async () => {
    const { user, unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await user.type(screen.getByRole("textbox", { name: "Reply to the customer" }), "ok{Enter}");
    await waitFor(() =>
      expect(calls((url, method) => url === "/conversations/c1/messages" && method === "POST")).toHaveLength(1),
    );
    unmount();
    renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    expect(await screen.findByText("You can view conversations but not reply")).toBeInTheDocument();
  });

  it("ເຄສທີ່ປິດແລ້ວສະແດງປ້າຍ Closed", async () => {
    mockApi({ conversation: { ...conversation, status: "CLOSED", unreadCount: 0 } });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("Closed")).toBeInTheDocument();
  });
});

describe("ThreadPane: refetch ທີ່ລົ້ມບໍ່ລຶບເນື້ອຫາທີ່ໂຫຼດແລ້ວ", () => {
  it("messages refetch ລົ້ມ: ຂໍ້ຄວາມເກົ່າຍັງຢູ່ ພ້ອມ banner + ລອງໃໝ່", async () => {
    const { user, queryClient } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    await screen.findByTestId("message-m1");
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === "/conversations/c1") return conversation;
      throw new ApiError(500, "boom");
    }) as typeof apiFetch);
    await queryClient.invalidateQueries();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load data");
    expect(screen.getByTestId("message-m1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Somchai Vong" })).toBeInTheDocument();
    mockApi();
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByTestId("message-m1")).toBeInTheDocument();
  });

  it("conversation refetch ລົ້ມ: header ແລະ ຂໍ້ຄວາມຍັງຢູ່ (ບໍ່ປ່ຽນເປັນໜ້າ error)", async () => {
    const { queryClient } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    await screen.findByTestId("message-m1");
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === "/conversations/c1") throw new ApiError(500, "boom");
      return { items: [message("m3", 30), message("m2", 20), message("m1", 10)], hasMore: false };
    }) as typeof apiFetch);
    await queryClient.invalidateQueries();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Somchai Vong" })).toBeInTheDocument();
    expect(screen.getByTestId("message-m1")).toBeInTheDocument();
  });

  it("ຂະນະໂຫຼດຄັ້ງທຳອິດ: skeleton ມີ role=status", () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => undefined)) as typeof apiFetch);
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});

function setVisibility(state: "visible" | "hidden") {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
}

describe("ThreadPane: hardening", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Load older ຮັກສາຕຳແໜ່ງເລື່ອນ (scrollTop += ຄວາມສູງທີ່ເພີ່ມ) ແລະ ບໍ່ກະໂດດລົງລຸ່ມ", async () => {
    mockApi({
      pages: [
        { items: [message("m3", 30), message("m2", 20)], hasMore: true },
        { items: [message("m1", 10)], hasMore: false },
      ],
    });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m2");
    const region = screen.getByRole("log", { name: "Conversation messages" });
    let height = 1000;
    Object.defineProperty(region, "scrollHeight", { configurable: true, get: () => height });
    region.scrollTop = 200;
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    height = 1500;
    await screen.findByTestId("message-m1");
    await waitFor(() => expect(region.scrollTop).toBe(700));
  });

  it("ຫຼັງ mark-read ໃນແຖບທີ່ເຊື່ອງຢູ່: ບໍ່ໝາຍຈົນກວ່າແຖບຈະເບິ່ງເຫັນ (visibilitychange)", async () => {
    setVisibility("hidden");
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toHaveLength(0);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(reads()).toHaveLength(1));
  });

  it("ປ່ຽນ conversationId: composer ຖືກຣີເຊັດ (ຂໍ້ຄວາມ/error ຂອງ A ຫາຍ) ແລະ ບໍ່ມີຂໍ້ຄວາມໄປ A", async () => {
    const other: ConversationDto = { ...conversation, id: "c2", displayName: "Other", unreadCount: 0 };
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/conversations/c1" || url === "/conversations/c2") return url.endsWith("c1") ? { ...conversation, unreadCount: 0 } : other;
      if (url.startsWith("/conversations/c1/messages") && init?.method === "POST") throw new ApiError(404, "nf", [], "CONVERSATION_NOT_FOUND");
      if (url.includes("/messages")) return { items: [message("m1", 10)], hasMore: false };
      throw new Error(`unexpected ${url}`);
    }) as typeof apiFetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const ui = (id: string) => (
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLanguage="en">
          <ThreadPane conversationId={id} canWrite />
        </LanguageProvider>
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    const { rerender } = render(ui("c1"));
    await screen.findByTestId("message-m1");
    const box = () => screen.getByRole("textbox", { name: "Reply to the customer" });
    await user.type(box(), "draft A{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation was not found");
    expect(box()).toHaveValue("draft A");
    rerender(ui("c2"));
    await screen.findByRole("heading", { name: "Other" });
    expect(box()).toHaveValue("");
    expect(screen.queryByText("This conversation was not found")).not.toBeInTheDocument();
    await user.type(box(), "for B{Enter}");
    await waitFor(() => expect(calls((url, method) => url === "/conversations/c2/messages" && method === "POST")).toHaveLength(1));
    expect(calls((url, method) => url === "/conversations/c1/messages" && method === "POST")).toHaveLength(1);
  });

  it("ໜ້າຕ່າງຂໍ້ຄວາມເປັນ role=log (aria-live polite) ແລະ ມີ skeleton role=status ອັນດຽວ", () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => undefined)) as typeof apiFetch);
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(screen.getByRole("log", { name: "Conversation messages" })).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

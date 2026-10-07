import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { StreamStatus } from "@/lib/inbox-stream";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { InboxPage } from "./inbox-page";

const state = vi.hoisted(() => ({ canWrite: true, status: "connected" as StreamStatus }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "inbox:write" ? state.canWrite : true),
}));
vi.mock("@/lib/use-inbox-realtime", () => ({ useInboxRealtime: () => state.status }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const make = (id: string, name: string): ConversationDto => ({
  id,
  channel: "FACEBOOK",
  displayName: name,
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: `hello from ${name}`,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
});
const conversations = [make("c1", "Somchai"), make("c2", "Dala")];
const message = (conversationId: string): MessageDto => ({
  id: `m-${conversationId}`,
  direction: "IN",
  text: `text of ${conversationId}`,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T05:30:00.000Z",
});

function setViewport(xl: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: xl,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error ລ້າງ stub
  delete window.matchMedia;
  window.history.replaceState(null, "", "/");
});

beforeEach(() => {
  state.canWrite = true;
  state.status = "connected";
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url.startsWith("/conversations?")) return { items: conversations, total: 2, page: 1, pageSize: 30 };
    if (url === "/inbox/assignees") return [];
    if (url.startsWith("/orders")) return { items: [], total: 0, page: 1, pageSize: 20 };
    const detail = /^\/conversations\/(c\d)$/.exec(url);
    if (detail) return conversations.find((c) => c.id === detail[1]);
    const messages = /^\/conversations\/(c\d)\/messages/.exec(url);
    if (messages) return { items: [message(messages[1] as string)], hasMore: false };
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("InboxPage", () => {
  it("ບໍ່ເລືອກເຄສ: ສະແດງລາຍການ + ຄຳເຊີນໃຫ້ເລືອກ; ປ້າຍການເຊື່ອມຕໍ່ສົດ", async () => {
    renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(await screen.findByTestId("conversation-c1")).toBeInTheDocument();
    expect(screen.getByText("Select a conversation from the list to start")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Live");
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
  });

  it("ປ້າຍການເຊື່ອມຕໍ່ປ່ຽນຕາມສະຖານະ (connecting / reconnecting)", () => {
    state.status = "reconnecting";
    const { unmount } = renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Connection lost, retrying");
    unmount();
    state.status = "connecting";
    renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Connecting...");
  });

  it("ເລືອກເຄສຈາກລາຍການ → ເປີດ thread ແລະ ລາຍລະອຽດ; ເລືອກອັນອື່ນ → ປ່ຽນ thread", async () => {
    setViewport(true);
    const { user } = renderWithProviders(<InboxPage initialConversationId={null} />);
    await user.click(await screen.findByTestId("conversation-c1"));
    const region = await screen.findByRole("log", { name: "Conversation messages" });
    expect(await within(region).findByText("text of c1")).toBeInTheDocument();
    expect(await screen.findAllByRole("heading", { name: "Conversation details" })).toHaveLength(1);
    await user.click(screen.getByTestId("conversation-c2"));
    expect(await within(screen.getByRole("log", { name: "Conversation messages" })).findByText("text of c2")).toBeInTheDocument();
    expect(screen.queryByText("text of c1")).not.toBeInTheDocument();
  });

  it("initialConversationId (ຈາກ ?c=) ເປີດ thread ທັນທີ", async () => {
    renderWithProviders(<InboxPage initialConversationId="c2" />);
    const region = await screen.findByRole("log", { name: "Conversation messages" });
    expect(await within(region).findByText("text of c2")).toBeInTheDocument();
    expect(screen.queryByText("Select a conversation from the list to start")).not.toBeInTheDocument();
  });

  it("ປຸ່ມ 'Back to list' ເຮັດໃຫ້ກັບໄປສະຖານະບໍ່ເລືອກ", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    expect(await screen.findByText("Select a conversation from the list to start")).toBeInTheDocument();
  });

  it("ຈໍແຄບ: Details ເປີດ dialog ທີ່ມີ SidePanel ດຽວ (ບໍ່ມີ aside), ຫົວຂໍ້ດຽວ", async () => {
    setViewport(false);
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    expect(screen.queryByRole("heading", { name: "Conversation details" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("heading", { name: "Conversation details" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Channel" })).toHaveLength(1);
  });

  it("ຈໍ xl: aside ສະແດງ SidePanel, ປຸ່ມ Details ບໍ່ເປີດ dialog ຊ້ອນ", async () => {
    setViewport(true);
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    expect(await screen.findAllByRole("heading", { name: "Channel" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Channel" })).toHaveLength(1);
  });

  it("dialog ຄ້າງເປີດຂອງ c1 ບໍ່ເດັ້ງຂຶ້ນເມື່ອເລືອກ c2 (detailsFor ຜູກກັບ id)", async () => {
    setViewport(false);
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog");
    // ກັບລາຍການຜ່ານ DOM ໂດຍກົງ (dialog modal ບັງ pointer ແຕ່ state ຍັງຄ້າງ)
    const back = screen.getByRole("button", { name: "Back to list", hidden: true });
    back.click();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(dialog).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("conversation-c2"));
    await screen.findByRole("log", { name: "Conversation messages" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ປິດ dialog ອັດຕະໂນມັດເມື່ອ viewport ເປັນ xl", async () => {
    let change: () => void = () => {};
    const list = {
      matches: false,
      addEventListener: (_: string, h: () => void) => {
        change = h;
      },
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(() => list) as unknown as typeof window.matchMedia;
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Details" }));
    await screen.findByRole("dialog");
    list.matches = true;
    act(() => change());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findAllByRole("heading", { name: "Channel" })).toHaveLength(1);
    list.matches = false;
    act(() => change());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("class ແບບ responsive: ເລືອກເຄສ = ລາຍການເຊື່ອງ (ຈໍແຄບ), ບໍ່ເລືອກ = thread ເຊື່ອງ", async () => {
    const { unmount } = renderWithProviders(<InboxPage initialConversationId={null} />);
    const listWrap = (await screen.findByRole("region", { name: "Conversations" })).closest("section") as HTMLElement;
    expect(listWrap).toHaveClass("block");
    expect(listWrap).not.toHaveClass("hidden");
    expect(screen.getByText("Select a conversation from the list to start").closest("section")).toHaveClass("hidden", "lg:block");
    unmount();
    renderWithProviders(<InboxPage initialConversationId="c1" />);
    const log = await screen.findByRole("log", { name: "Conversation messages" });
    expect(log.closest("section")).toHaveClass("block");
    expect(log.closest("section")).not.toHaveClass("hidden");
    const list2 = (await screen.findByTestId("conversation-c1")).closest("section") as HTMLElement;
    expect(list2).toHaveClass("hidden", "lg:block");
  });

  it("canWrite: ມີ composer textbox", async () => {
    renderWithProviders(<InboxPage initialConversationId="c1" />);
    expect(await screen.findByRole("textbox", { name: "Reply to the customer" })).toBeInTheDocument();
  });

  it("refetch ພື້ນຫຼັງຂອງເຄສທີ່ເລືອກລົ້ມ: SidePanel ຍັງຢູ່ (ໃຊ້ data ເກົ່າ)", async () => {
    setViewport(true);
    const { queryClient } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    expect(await screen.findByRole("heading", { name: "Channel" })).toBeInTheDocument();
    const base = vi.mocked(apiFetch).getMockImplementation() as (url: string) => Promise<unknown>;
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === "/conversations/c1") throw new Error("boom");
      return base(url);
    }) as typeof apiFetch);
    await queryClient.invalidateQueries({ queryKey: ["conversations", "detail", "c1"], refetchType: "all" }).catch(() => {});
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some((c) => c[0] === "/conversations/c1")).toBe(true));
    expect(screen.getByRole("heading", { name: "Channel" })).toBeInTheDocument();
  });

  it("?c= ຖືກຊິງກັບການເລືອກ/ກັບລາຍການ ດ້ວຍ replaceState", async () => {
    window.history.replaceState(null, "", "/inbox");
    const { user } = renderWithProviders(<InboxPage initialConversationId={null} />);
    await user.click(await screen.findByTestId("conversation-c2"));
    expect(window.location.search).toBe("?c=c2");
    await user.click(await screen.findByRole("button", { name: "Back to list" }));
    expect(window.location.search).toBe("");
  });

  it("ບໍ່ມີສິດຂຽນ: ໃຊ້ໄດ້ແບບອ່ານຢ່າງດຽວ (composer ເປັນຄຳອະທິບາຍ)", async () => {
    state.canWrite = false;
    renderWithProviders(<InboxPage initialConversationId="c1" />);
    expect(await screen.findByText("You can view conversations but not reply")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Reply to the customer" })).not.toBeInTheDocument());
  });

  it("ປ່ຽນເຄສ: ThreadPane remount (scroll refs / state ບໍ່ຕິດມາ)", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    const first = await screen.findByRole("log", { name: "Conversation messages" });
    await within(first).findByText("text of c1");
    await user.click(screen.getByTestId("conversation-c2"));
    const second = await screen.findByRole("log", { name: "Conversation messages" });
    await within(second).findByText("text of c2");
    expect(second).not.toBe(first);
  });

  it("disconnected: ປ້າຍສະແດງຄຳເຕືອນໃຫ້ໂຫຼດໃໝ່ (tone danger)", () => {
    state.status = "disconnected";
    renderWithProviders(<InboxPage initialConversationId={null} />);
    const pill = screen.getByTestId("connection-status");
    expect(pill).toHaveTextContent("Disconnected, please reload the page");
    expect(pill.querySelector("[class*='danger']")).not.toBeNull();
    expect(screen.getByTestId("reload-hint")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("reload-hint")).toHaveTextContent("Disconnected, please reload the page");
  });
});

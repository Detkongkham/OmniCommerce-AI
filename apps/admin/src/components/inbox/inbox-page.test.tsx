import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  state.canWrite = true;
  state.status = "connected";
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url.startsWith("/conversations?")) return { items: conversations, total: 2, page: 1, pageSize: 30 };
    if (url === "/inbox/assignees") return [];
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
    const { user } = renderWithProviders(<InboxPage initialConversationId={null} />);
    await user.click(await screen.findByTestId("conversation-c1"));
    const region = await screen.findByRole("log", { name: "Conversation messages" });
    expect(await within(region).findByText("text of c1")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Conversation details" }).length).toBeGreaterThan(0);
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

  it("ປຸ່ມ Details ເປີດ dialog ລາຍລະອຽດ (ສຳລັບຈໍແຄບ)", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("log", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("heading", { name: "Conversation details" }).length).toBeGreaterThan(0);
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
  });
});

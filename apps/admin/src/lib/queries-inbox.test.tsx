import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import {
  queryKeys,
  useAssignees,
  useConversation,
  useConversations,
  useCreateCustomerFromChat,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useUpdateConversation,
} from "./queries";
import type { ConversationDto, MessageDto, MessagePage, Page } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  apiFetch: vi.fn(),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

const message = (id: string): MessageDto => ({
  id,
  direction: "IN",
  text: id,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T00:00:00.000Z",
});
const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T00:00:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("useConversations", () => {
  it("ສ້າງ query string ຕາມ filter (ຂ້າມຄ່າວ່າງ ແລະ unread=false)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [conversation], total: 1, page: 1, pageSize: 30 } satisfies Page<ConversationDto>);
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(
      ({ unread }: { unread: boolean }) =>
        useConversations({ status: "OPEN", assignee: "me", unread, q: "som", page: 2, pageSize: 30 }),
      { wrapper: Wrapper, initialProps: { unread: true } },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(1));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations?status=OPEN&assignee=me&unread=true&q=som&page=2&pageSize=30");
    rerender({ unread: false });
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBe(2));
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toBe("/conversations?status=OPEN&assignee=me&q=som&page=2&pageSize=30");
  });
});

describe("useConversations query key", () => {
  it("unread=false ແລະ unread=undefined ໃຊ້ key ດຽວກັນ (cache entry ດຽວ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30 } satisfies Page<ConversationDto>);
    const { client, Wrapper } = wrapper();
    const base = { page: 1, pageSize: 30 };
    const a = renderHook(() => useConversations({ ...base, unread: false }), { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    const b = renderHook(() => useConversations({ ...base }), { wrapper: Wrapper });
    await waitFor(() => expect(b.result.current.data).toBeDefined());
    expect(client.getQueryCache().findAll({ queryKey: [...queryKeys.conversations, "list"] })).toHaveLength(1);
  });
});

describe("useConversation", () => {
  it("ບໍ່ຍິງເມື່ອ id ເປັນ null", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useConversation(null), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("GET /conversations/:id", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useConversation("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.displayName).toBe("Somchai"));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations/c1");
  });
});

describe("useMessages (cursor)", () => {
  it("ໜ້າທຳອິດບໍ່ມີ beforeId; ໜ້າຕໍ່ໄປໃຊ້ id ຂອງຂໍ້ຄວາມສຸດທ້າຍ (ເກົ່າສຸດ) ຂອງໜ້າກ່ອນ; hasMore=false ຢຸດ", async () => {
    const pages: MessagePage[] = [
      { items: [message("m3"), message("m2")], hasMore: true },
      { items: [message("m1")], hasMore: false },
    ];
    vi.mocked(apiFetch).mockImplementation((async () => pages.shift()) as typeof apiFetch);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMessages("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations/c1/messages?limit=30");
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toBe("/conversations/c1/messages?limit=30&beforeId=m2");
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(result.current.data?.pages).toHaveLength(2);
  });
  it("ບໍ່ຍິງເມື່ອ conversationId ເປັນ null", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useMessages(null), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("mutations", () => {
  it("useSendMessage: POST /conversations/:id/messages ແລະ invalidate ທຸກ query ຂອງ conversations (ທັງຕອນລົ້ມ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(message("m9"));
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSendMessage(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { text: "hello" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/messages", { method: "POST", body: { text: "hello" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });

    invalidate.mockClear();
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { text: "again" } }).catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("useUpdateConversation: PATCH ແລະ invalidate conversations (ທັງຕອນລົ້ມ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateConversation(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { assigneeId: null, status: "CLOSED" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1", { method: "PATCH", body: { assigneeId: null, status: "CLOSED" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });

    invalidate.mockClear();
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "c1", input: { status: "OPEN" } })).rejects.toThrow("boom");
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("useMarkConversationRead: POST /read ແລະ invalidate conversations", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1");
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/read", { method: "POST" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("useCreateCustomerFromChat: POST /customer ແລະ invalidate customers ນຳ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateCustomerFromChat(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { name: "Dala", phone: "020111111" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/customer", {
      method: "POST",
      body: { name: "Dala", phone: "020111111" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.customers });
  });
});

describe("useAssignees", () => {
  it("GET /inbox/assignees; enabled=false ບໍ່ຍິງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ id: "u1", name: "Chat" }]);
    const { Wrapper } = wrapper();
    const off = renderHook(() => useAssignees({ enabled: false }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    off.unmount();
    const { result } = renderHook(() => useAssignees(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "u1", name: "Chat" }]));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/inbox/assignees");
  });
});

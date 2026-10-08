import { act, screen, waitFor, within } from "@testing-library/react";
import { clearToasts, getToasts } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, MessageDto, OrderDetailDto, VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ChatOrderPage } from "./chat-order-page";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "conv1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-07T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: { id: "c1", name: "Mali", phone: "02055550001" },
  createdAt: "2026-10-07T05:00:00.000Z",
};
const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }],
};
const warehouses = [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };
const createdOrder: OrderDetailDto = {
  id: "o9", orderNumber: "SO-000009", status: "PENDING_PAYMENT", channel: "FACEBOOK", source: "CHAT", conversationId: "conv1",
  customer: { id: "c1", name: "Mali", phone: "02055550001", email: null },
  currency: "LAK", exchangeRate: "1.000000", subtotal: "200.00", discountTotal: "0.00", shippingFee: "0.00",
  vatRate: "10.00", vatAmount: "18.18", total: "200.00", shippingName: "Mali", shippingPhone: "02055550001",
  shippingAddress: null, note: null, reservedUntil: "2026-10-07T06:00:00.000Z", secondsUntilExpiry: 1800,
  paidAt: null, shippedAt: null, completedAt: null, cancelledAt: null, createdAt: "2026-10-07T05:30:00.000Z", shipment: null,
  items: [{ id: "i1", variantId: "v1", warehouseId: "w1", productName: "Tee", variantName: "Red", sku: "TEE-R", unitPrice: "100.00", quantity: 2, discount: "0.00", lineTotal: "200.00" }],
  movements: [],
};

const message = (status: MessageDto["status"], errorCode: string | null = null): MessageDto => ({
  id: "m1", direction: "OUT", text: "x", attachments: [], status, errorCode, sentBy: null, createdAt: "2026-10-07T05:31:00.000Z",
});

/** ຄິວຄຳຕອບຂອງ POST /conversations/conv1/messages (ອັນທຳອິດຖືກໃຊ້ກ່ອນ) */
let replies: (MessageDto | Error)[] = [];

const orderPosts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders" && call[1]?.method === "POST");
const messagePosts = () =>
  vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/conversations/conv1/messages" && call[1]?.method === "POST");
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body: Record<string, unknown> }).body;

async function submitOrder(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.type(await screen.findByLabelText("Add item (search SKU/name)"), "tee");
  await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
  await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
}

beforeEach(() => {
  router.push.mockReset();
  clearToasts();
  replies = [];
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/conversations/conv1" && !options?.method) return conversation;
    if (path === "/warehouses") return warehouses;
    if (path === "/settings/store") return settings;
    if (path.startsWith("/variants")) return { items: [tee], total: 1, page: 1, pageSize: 8 };
    if (path.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return createdOrder;
    if (path === "/conversations/conv1/messages" && options?.method === "POST") {
      const next = replies.shift();
      if (!next) throw new Error("no reply queued");
      if (next instanceof Error) throw next;
      return next;
    }
    throw new Error(`unexpected ${path}`);
  }) as typeof apiFetch);
});

describe("ChatOrderPage", () => {
  it("ໂຫຼດເຄສລົ້ມ (404): ສະແດງຂໍ້ຄວາມຂອງ code + ລິ້ງກັບໄປ inbox, ບໍ່ສະແດງຟອມ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "x", [], "CONVERSATION_NOT_FOUND"));
    renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation was not found");
    expect(screen.getByRole("link", { name: "Back to chat" })).toHaveAttribute("href", "/inbox?c=conv1");
    expect(screen.queryByLabelText("Add item (search SKU/name)")).not.toBeInTheDocument();
  });

  it("ສຳເລັດທັງສອງ: POST /orders ຄັ້ງດຽວ (ມີ conversationId), ສົ່ງສະຫຼຸບເຂົ້າແຊັດ, ແລ້ວກັບໄປ /inbox?c=", async () => {
    replies = [message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(bodyOf(orderPosts()[0])).toMatchObject({ conversationId: "conv1", customerId: "c1" });
    expect(messagePosts()).toHaveLength(1);
    const text = String(bodyOf(messagePosts()[0]).text);
    expect(text).toContain("SO-000009");
    expect(text).toContain("Tee (Red) 2 x 100.00 = 200.00");
    expect(text).toContain("200.00 LAK");
    const titles = getToasts().map((item) => item.title);
    expect(titles).toContain("Order SO-000009 created");
    expect(titles).toContain("Order summary sent to the chat");
  });

  it("ເອົາຕິກ 'ສົ່ງສະຫຼຸບ' ອອກ: ສ້າງບິນແລ້ວກັບໄປແຊັດເລີຍ ໂດຍບໍ່ສົ່ງຂໍ້ຄວາມ", async () => {
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await user.click(await screen.findByRole("checkbox", { name: "Send the order summary to the customer in chat" }));
    await submitOrder(user);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(0);
  });

  it("ສົ່ງສະຫຼຸບ FAILED (OUTSIDE_WINDOW): ບິນຍັງຢູ່, ບອກຊັດ, ບໍ່ໄປໜ້າອື່ນ; Retry ສົ່ງສະເພາະຂໍ້ຄວາມ (ບໍ່ສ້າງບິນໃໝ່) ແລ້ວກັບໄປແຊັດ", async () => {
    replies = [message("FAILED", "OUTSIDE_WINDOW"), message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Order SO-000009 was created, but the summary could not be sent to the chat/);
    expect(alert).toHaveTextContent("More than 24 hours since the customer's last message; Meta does not allow a reply");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/orders/o9");
    expect(screen.getByRole("link", { name: "Back to chat" })).toHaveAttribute("href", "/inbox?c=conv1");
    expect(orderPosts()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(messagePosts()).toHaveLength(2);
    expect(bodyOf(messagePosts()[1]).text).toBe(bodyOf(messagePosts()[0]).text);
    expect(orderPosts()).toHaveLength(1); // ບິນບໍ່ຖືກສ້າງຊ້ຳ
  });

  it("request ສົ່ງສະຫຼຸບ throw (ເຄືອຂ່າຍ/5xx): ປະຕິບັດຄືກັນ: ບິນຢູ່, ມີ Retry, retry ບໍ່ສ້າງບິນໃໝ່", async () => {
    replies = [new ApiError(503, "x", [], "CHANNEL_NOT_CONFIGURED"), message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Order SO-000009 was created, but the summary could not be sent/);
    expect(router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(2);
  });

  it("Retry ລົ້ມອີກ: ຍັງສະແດງ alert + ປຸ່ມ Retry (ບໍ່ຄ້າງສະຖານະກຳລັງສົ່ງ)", async () => {
    replies = [message("FAILED", "CHANNEL_AUTH"), message("FAILED", "CHANNEL_AUTH")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    await user.click(await screen.findByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(messagePosts()).toHaveLength(2));
    expect(await screen.findByRole("button", { name: "Send summary again" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The Page token is invalid or expired");
    expect(router.push).not.toHaveBeenCalled();
    expect(orderPosts()).toHaveLength(1);
  });

  it("ກົດ 'Send summary again' ຊ້ຳໆ: ສົ່ງຂໍ້ຄວາມເພີ່ມພຽງຄັ້ງດຽວ", async () => {
    let release: (value: MessageDto) => void = () => {};
    const slow = new Promise<MessageDto>((resolve) => {
      release = resolve;
    });
    replies = [message("FAILED", "CHANNEL_AUTH"), slow as unknown as MessageDto];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    const retry = await screen.findByRole("button", { name: "Send summary again" });
    await user.dblClick(retry);
    expect(await screen.findByRole("status")).toHaveTextContent("Sending the order summary to the chat...");
    release(message("SENT"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(messagePosts()).toHaveLength(2);
    expect(orderPosts()).toHaveLength(1);
  });

  it("refetch ຂອງເຄສລົ້ມຫຼັງສະແດງຟອມແລ້ວ: ຟອມບໍ່ຫາຍ", async () => {
    const { user, queryClient } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await user.type(await screen.findByLabelText("Add item (search SKU/name)"), "tee");
    const base = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/conversations/conv1" && !options?.method) throw new ApiError(500, "x", [], "INTERNAL");
      return (base as (p: string, o?: unknown) => Promise<unknown>)(path, options);
    }) as typeof apiFetch);
    await queryClient.refetchQueries({ queryKey: ["conversations"] });
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter((c) => c[0] === "/conversations/conv1").length).toBeGreaterThan(1));
    expect(screen.getByLabelText("Add item (search SKU/name)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create order and reserve stock" })).toBeInTheDocument();
  });

  it("ອອກຈາກໜ້າຂະນະສົ່ງສະຫຼຸບ: ບໍ່ push ຫຼັງ unmount ແຕ່ toast ຍັງສະແດງ", async () => {
    let release: (value: MessageDto) => void = () => {};
    const slow = new Promise<MessageDto>((resolve) => {
      release = resolve;
    });
    replies = [slow as unknown as MessageDto];
    const { user, unmount } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    expect(await screen.findByRole("status")).toBeInTheDocument();
    unmount();
    release(message("SENT"));
    await waitFor(() => expect(getToasts().map((item) => item.title)).toContain("Order summary sent to the chat"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ອອກຈາກໜ້າທັງໜ້າຂະນະ POST /orders ຍັງແລ່ນ: ບິນຖືກສ້າງ, ສະຫຼຸບຍັງຖືກສົ່ງຄັ້ງດຽວ + toast, ບໍ່ push, ບໍ່ມີ error ຈາກ React", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let release: (value: OrderDetailDto) => void = () => {};
    const pending = new Promise<OrderDetailDto>((resolve) => {
      release = resolve;
    });
    const base = vi.mocked(apiFetch).getMockImplementation() as (p: string, o?: { method?: string }) => Promise<unknown>;
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) =>
      path === "/orders" && options?.method === "POST" ? pending : base(path, options)) as typeof apiFetch);
    replies = [message("SENT")];
    const { user, unmount } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    await waitFor(() => expect(orderPosts()).toHaveLength(1));
    unmount();
    release(createdOrder);
    await waitFor(() => expect(messagePosts()).toHaveLength(1));
    await waitFor(() => expect(getToasts().map((item) => item.title)).toContain("Order summary sent to the chat"));
    expect(router.push).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("ສົ່ງສະຫຼຸບ throw: alert ບອກໃຫ້ກວດແຊັດກ່ອນສົ່ງຊ້ຳ (ເຊີບເວີອາດສົ່ງແລ້ວ)", async () => {
    replies = [new ApiError(503, "x", [], "CHANNEL_NOT_CONFIGURED")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the chat before sending again");
  });

  it("ສົ່ງສະຫຼຸບ FAILED: alert ບໍ່ເວົ້າເລື່ອງກວດແຊັດ/ຊ້ຳ", async () => {
    replies = [message("FAILED", "OUTSIDE_WINDOW")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    expect(await screen.findByRole("alert")).not.toHaveTextContent(/Check the chat/i);
  });

  it("a11y: ບິນຖືກສ້າງ → focus ຢູ່ຫົວຂໍ້ h1 (tabindex -1); breadcrumb ສຸດທ້າຍ = ຊື່ໜ້າ ບໍ່ຊ້ຳຫົວຂໍ້", async () => {
    replies = [new Promise<MessageDto>(() => {}) as unknown as MessageDto];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    const heading = await screen.findByRole("heading", { level: 1, name: /SO-000009/ });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute("tabindex", "-1");
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Open order from chat");
    expect(crumb).toHaveAttribute("aria-current", "page");
  });

  it("a11y: ສະຖານະ failed → focus ຍ້າຍໄປ alert (ທຸກຄັ້ງທີ່ລົ້ມ ລວມ retry ລົ້ມອີກ)", async () => {
    replies = [message("FAILED", "CHANNEL_AUTH"), message("FAILED", "CHANNEL_AUTH")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(messagePosts()).toHaveLength(2));
    const again = await screen.findByRole("alert");
    await waitFor(() => expect(again).toHaveFocus());
  });

  it("guard sending: ກົດ retry ສອງຄັ້ງໃນ tick ດຽວ (ປຸ່ມຍັງຢູ່) ສົ່ງຂໍ້ຄວາມເພີ່ມພຽງຄັ້ງດຽວ", async () => {
    replies = [message("FAILED", "CHANNEL_AUTH"), new Promise<MessageDto>(() => {}) as unknown as MessageDto, message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    const retry = await screen.findByRole("button", { name: "Send summary again" });
    act(() => {
      retry.click();
      retry.click();
    });
    await waitFor(() => expect(messagePosts()).toHaveLength(2));
    expect(messagePosts()).toHaveLength(2);
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, OrderDetailDto, VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderForm } from "./order-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }],
};
const warehouses = [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };
const created = { id: "o9", orderNumber: "SO-000009" } as OrderDetailDto;

const conversation = (customer: ConversationDto["customer"]): ConversationDto => ({
  id: "conv1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-07T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer,
  createdAt: "2026-10-07T05:00:00.000Z",
});
const mali = { id: "c1", name: "Mali", phone: "02055550001" };

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path in overrides) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path === "/warehouses") return warehouses;
    if (path === "/settings/store") return settings;
    if (path.startsWith("/variants")) return { items: [tee], total: 1, page: 1, pageSize: 8 };
    if (path.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return created;
    return { items: [], total: 0, page: 1, pageSize: 8 };
  }) as typeof apiFetch);
}

const orderPosts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders" && call[1]?.method === "POST");
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body: Record<string, unknown> }).body;

async function addTeeAndSubmit(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.type(screen.getByLabelText("Add item (search SKU/name)"), "tee");
  await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
  await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
}

beforeEach(() => {
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderForm (ໂໝດແຊັດ)", () => {
  it("ຫົວຂໍ້ເປັນ 'ເປີດບິນຈາກແຊັດ'; ເຄສມີລູກຄ້າ = prefill ແລະ ເລືອກໂໝດ 'ເລືອກລູກຄ້າທີ່ມີ'", () => {
    renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated: vi.fn() }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Open order from chat" })).toBeInTheDocument();
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pick an existing customer" })).toBeChecked();
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Mali");
    expect(screen.queryByText(/not linked to a customer/)).not.toBeInTheDocument();
  });

  it("ເຄສບໍ່ມີລູກຄ້າ: ຟອມເປົ່າ ແລະ ມີຄຳບອກວ່າຈະບໍ່ລິ້ງເຄສໃຫ້", () => {
    renderWithProviders(<OrderForm chat={{ conversation: conversation(null), onCreated: vi.fn() }} />);
    expect(screen.getByRole("radio", { name: "Walk-in customer (not saved)" })).toBeChecked();
    expect(screen.getByText(/This conversation is not linked to a customer/)).toBeInTheDocument();
  });

  it("ສົ່ງ: payload ມີ conversationId + customerId; ເອີ້ນ onCreated (sendSummary ເລີ່ມຕົ້ນ true) ແລະ ບໍ່ພາໄປ /orders/[id]", async () => {
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(created, { sendSummary: true });
    expect(orderPosts()).toHaveLength(1);
    expect(bodyOf(orderPosts()[0])).toMatchObject({ conversationId: "conv1", customerId: "c1" });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ເອົາຕິກ 'ສົ່ງສະຫຼຸບ' ອອກ → onCreated ໄດ້ sendSummary=false", async () => {
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    const box = screen.getByRole("checkbox", { name: "Send the order summary to the customer in chat" });
    expect(box).toBeChecked();
    await user.click(box);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, { sendSummary: false }));
  });

  it("ສ້າງບິນລົ້ມ (409 ສະຕ໋ອກບໍ່ພໍ): ບໍ່ເອີ້ນ onCreated ແລະ ສະແດງ alert ຂອງຟອມ", async () => {
    mockApi({ "/orders": new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: [] }) });
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("ຍົກເລີກ → ກັບໄປແຊັດຂອງເຄສ", async () => {
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated: vi.fn() }} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1");
  });

  it("ບໍ່ມີ prop chat: ຄືເດີມ (ບໍ່ມີ checkbox, ຍົກເລີກໄປ /orders)", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    expect(screen.queryByRole("checkbox", { name: /order summary/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Create order" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.push).toHaveBeenCalledWith("/orders");
  });

  it("ສົ່ງຊ້ຳຂະນະ POST ຍັງແລ່ນ: POST /orders ຄັ້ງດຽວ ແລະ onCreated ຄັ້ງດຽວ", async () => {
    let release: (value: OrderDetailDto) => void = () => {};
    const pending = new Promise<OrderDetailDto>((resolve) => {
      release = resolve;
    });
    mockApi({ "/orders": pending });
    const onCreated = vi.fn();
    const { user, container } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    release(created);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(orderPosts()).toHaveLength(1);
  });

  it("ອອກຈາກໜ້າຂະນະ POST ຍັງແລ່ນ: onCreated ຍັງຖືກເອີ້ນຄັ້ງດຽວ (ບິນຖືກສ້າງແລ້ວ ຕ້ອງສົ່ງສະຫຼຸບ)", async () => {
    let release: (value: OrderDetailDto) => void = () => {};
    const pending = new Promise<OrderDetailDto>((resolve) => {
      release = resolve;
    });
    mockApi({ "/orders": pending });
    const onCreated = vi.fn();
    const { user, unmount } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(orderPosts()).toHaveLength(1));
    unmount();
    release(created);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(created, { sendSummary: true });
  });

  it("onCreated ຖືກເອີ້ນຫຼັງ saving ຖືກລ້າງ ແລະ ບໍ່ມີ alert ຂອງຟອມ (ຢູ່ນອກ try ຂອງການສ້າງ)", async () => {
    const seen: { alerts: number } = { alerts: -1 };
    const onCreated = vi.fn(() => {
      seen.alerts = screen.queryAllByRole("alert").length;
    });
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(seen.alerts).toBe(0);
  });
});

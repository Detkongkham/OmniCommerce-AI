import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderDetail } from "./order-detail";

const ALL = ["orders:read", "orders:write", "payments:write", "logistics:write", "costs:read"];
const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const base: OrderDetailDto = {
  id: "o1", orderNumber: "SO-000001", status: "PENDING_PAYMENT", channel: "OFFLINE", source: "MANUAL",
  customer: { id: "c1", name: "Mali", phone: "02055550001", email: null },
  currency: "LAK", exchangeRate: "1.000000", subtotal: "190.00", discountTotal: "10.00", shippingFee: "5.00",
  vatRate: "10.00", vatAmount: "17.73", total: "195.00", shippingName: "Mali", shippingPhone: "02055550001",
  shippingAddress: "Vientiane", note: "gift", reservedUntil: "2026-10-05T06:00:00.000Z", secondsUntilExpiry: 120,
  paidAt: null, shippedAt: null, completedAt: null, cancelledAt: null, createdAt: "2026-10-05T05:30:00.000Z",
  items: [{ id: "i1", variantId: "v1", warehouseId: "w1", productName: "Tee", variantName: "Red", sku: "TEE-R", unitPrice: "100.00", unitCost: "60.00", quantity: 2, discount: "10.00", lineTotal: "190.00" }],
  movements: [{ id: "m1", type: "RESERVE", quantity: 2, variantId: "v1", sku: "TEE-R", warehouseId: "w1", warehouseCode: "MAIN", createdAt: "2026-10-05T05:30:00.000Z" }],
};
const withStatus = (status: OrderDetailDto["status"], patch: Partial<OrderDetailDto> = {}): OrderDetailDto => ({
  ...base, status, secondsUntilExpiry: null, ...patch,
});

function mockOrder(order: OrderDetailDto) {
  vi.mocked(apiFetch).mockImplementation((async () => order) as typeof apiFetch);
}
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");
const gets = () => vi.mocked(apiFetch).mock.calls.filter((call) => !call[1]?.method);
const heading = () => screen.findByRole("heading", { level: 1, name: "SO-000001" });

beforeEach(() => {
  auth.perms = new Set(ALL);
  vi.mocked(apiFetch).mockReset();
  mockOrder(base);
});
afterEach(() => vi.useRealTimers());

describe("OrderDetail: ສະແດງຂໍ້ມູນ", () => {
  it("ເລກບິນ, ສະຖານະ, ລາຍການ (ລວມຕົ້ນທຶນ), ສະຫຼຸບເງິນ, ລູກຄ້າ, ທີ່ຢູ່, ເສັ້ນເວລາ ແລະ movement; ຮຽກ GET /orders/o1", async () => {
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(gets()[0]?.[0]).toBe("/orders/o1");
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    const line = screen.getByTestId("order-item-i1");
    expect(within(line).getByText("TEE-R")).toBeInTheDocument();
    expect(within(line).getByText("100.00")).toBeInTheDocument();
    expect(within(line).getByText("60.00")).toBeInTheDocument();
    expect(screen.getByTestId("detail-total")).toHaveTextContent("195.00");
    expect(screen.getByText("Vientiane")).toBeInTheDocument();
    expect(screen.getAllByText("Mali").length).toBeGreaterThan(0); // ລູກຄ້າ + ຜູ້ຮັບ
    const timeline = screen.getByRole("list", { name: "Timeline" });
    expect(within(timeline).getByText("05/10/2026 12:30")).toBeInTheDocument();
    expect(screen.getByTestId("order-movement-m1")).toHaveTextContent("Reserve");
  });

  it("ຕາຕະລາງ: aria-label, scope=col, ຫົວແຖວ (scope=row)", async () => {
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const items = screen.getByRole("table", { name: "Order items" });
    expect(within(items).getAllByRole("columnheader").every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(within(items).getByRole("rowheader")).toHaveTextContent("TEE-R");
    const movements = screen.getByRole("table", { name: "Stock movements of this order" });
    expect(within(movements).getAllByRole("columnheader").every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(within(movements).getByRole("rowheader")).toHaveTextContent("Reserve");
  });

  it("ບໍ່ມີ costs:read: ບໍ່ມີຄອລຳຕົ້ນທຶນ ເຖິງ response ມີ unitCost; response ບໍ່ມີ unitCost ກໍ່ບໍ່ມີ", async () => {
    auth.perms = new Set(["orders:read"]);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.queryByText("Unit cost")).toBeNull();
    expect(screen.queryByText("60.00")).toBeNull();
  });

  it("ມີ costs:read ແຕ່ API ບໍ່ສົ່ງ unitCost: ບໍ່ມີຄອລຳ ແລະ ບໍ່ມີ NaN", async () => {
    mockOrder({ ...base, items: base.items.map(({ unitCost: _omit, ...item }) => item) });
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.queryByText("Unit cost")).toBeNull();
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("ລູກຄ້າໜ້າຮ້ານ (null), ບໍ່ມີທີ່ຢູ່/ໝາຍເຫດ: ຂໍ້ຄວາມ fallback ແປແລ້ວ", async () => {
    mockOrder({ ...base, customer: null, shippingName: null, shippingPhone: null, shippingAddress: null, note: null });
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByText("Walk-in customer")).toBeInTheDocument();
    expect(screen.getByText("No shipping details")).toBeInTheDocument();
    expect(screen.getByText("No note")).toBeInTheDocument();
  });

  it("movement ຫວ່າງ: ຂໍ້ຄວາມ; ມີລິ້ງກັບໄປ /orders", async () => {
    mockOrder({ ...base, movements: [] });
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByText("No movements yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to orders" })).toHaveAttribute("href", "/orders");
  });

  it("EXPIRED: ເສັ້ນເວລາບອກເວລາໝົດອາຍຸຈອງ ແລະ ບໍ່ມີນັບຖອຍ", async () => {
    mockOrder(withStatus("EXPIRED"));
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const timeline = screen.getByRole("list", { name: "Timeline" });
    expect(within(timeline).getByText("Reservation expired")).toBeInTheDocument();
    expect(within(timeline).getByText("05/10/2026 13:00")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
  });
});

describe("OrderDetail: ໂຫຼດ/ຜິດພາດ", () => {
  it("ໂຫຼດຄັ້ງທຳອິດ: skeleton (aria-busy)", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    renderWithProviders(<OrderDetail id="o1" />);
    expect(screen.getByLabelText("Loading...", { selector: "[aria-busy=true]" })).toBeInTheDocument();
  });

  it("404 ORDER_NOT_FOUND: ຂໍ້ຄວາມບໍ່ພົບ + ລິ້ງກັບ /orders, ບໍ່ມີ Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "Order not found", [], "ORDER_NOT_FOUND"));
    renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByText("This order was not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to orders" })).toHaveAttribute("href", "/orders");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("ຜິດພາດອື່ນ: ຂໍ້ຄວາມແປ + Retry ໂຫຼດໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    mockOrder(base);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await heading();
  });
});

describe("OrderDetail: ນັບຖອຍ", () => {
  it("ສະແດງເວລາທີ່ເຫຼືອ (role=timer, ບໍ່ແມ່ນ aria-live) ແລະ ນັບລົງ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<OrderDetail id="o1" />);
    const timer = await screen.findByRole("timer");
    expect(timer).toHaveTextContent("Reservation expires in 02:00");
    expect(timer.closest("[aria-live]")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("Reservation expires in 01:55");
  });

  it("ບິນທີ່ບໍ່ແມ່ນ PENDING_PAYMENT ບໍ່ມີນັບຖອຍ", async () => {
    mockOrder(withStatus("PAID", { secondsUntilExpiry: 50 }));
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("API ບອກ 0: 'ໝົດເວລາຈອງ' + ລໍລະບົບປ່ອຍສະຕ໋ອກ (role=status) ແລະ ປິດປຸ່ມຢືນຢັນຊຳລະ; ຍົກເລີກຍັງໄດ້", async () => {
    mockOrder({ ...base, secondsUntilExpiry: 0 });
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByText("Reservation expired")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the system to release/).closest("[role=status]")).not.toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
  });

  it("ນັບຮອດ 0 ທີ່ client ໃນຂະນະ API ຍັງບອກ PENDING: refetch ບິນ ແລະ ປິດປຸ່ມຈ່າຍ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // GET ຄັ້ງທຳອິດຍັງເຫຼືອ 2 ວິ; ຄັ້ງຕໍ່ໄປ server ບອກ 0 (ຍັງບໍ່ທັນ expire)
    vi.mocked(apiFetch).mockImplementation((async () => ({ ...base, secondsUntilExpiry: gets().length <= 1 ? 2 : 0 })) as typeof apiFetch);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(gets()).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(gets().length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });
});

describe("OrderDetail: ປຸ່ມຂັ້ນຕໍ່ໄປ", () => {
  it("PENDING_PAYMENT: ຢືນຢັນຊຳລະ → POST /pay (ບໍ່ມີ body); ຍົກເລີກມີ; ແພັກບໍ່ມີ", async () => {
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start packing" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(posts()).toEqual([["/orders/o1/pay", { method: "POST" }]]));
  });

  it.each([
    ["PAID", "Start packing", "pack"],
    ["PACKING", "Ship", "ship"],
    ["SHIPPED", "Complete order", "complete"],
  ] as const)("%s: ປຸ່ມຂັ້ນຕໍ່ໄປຄື '%s' (POST /%s)", async (status, label, action) => {
    mockOrder(withStatus(status));
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(posts()).toEqual([[`/orders/o1/${action}`, { method: "POST" }]]));
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
  });

  it("SHIPPED ຍົກເລີກບໍ່ໄດ້; COMPLETED/CANCELLED/EXPIRED ບໍ່ມີປຸ່ມ action ເລີຍ", async () => {
    mockOrder(withStatus("SHIPPED"));
    const first = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    first.unmount();
    for (const status of ["COMPLETED", "CANCELLED", "EXPIRED"] as const) {
      mockOrder(withStatus(status));
      const view = renderWithProviders(<OrderDetail id="o1" />);
      await heading();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      view.unmount();
    }
  });

  it("ກົດສອງເທື່ອຕິດ: POST ເທື່ອດຽວ; ຂະນະລໍ ທຸກປຸ່ມ action (ລວມຍົກເລີກ) ຖືກ disable", async () => {
    let resolve!: (value: OrderDetailDto) => void;
    let current = base;
    vi.mocked(apiFetch).mockImplementation(((_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? new Promise<OrderDetailDto>((r) => (resolve = r)) : Promise.resolve(current)) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const pay = screen.getByRole("button", { name: "Confirm payment" });
    await user.dblClick(pay);
    expect(posts()).toHaveLength(1);

    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Confirm payment/ })).toBeDisabled();
    current = withStatus("PAID");
    resolve(current);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull());
  });

  it("ສອງ click ໃນ tick ດຽວກັນ (ກ່ອນ React render ປຸ່ມເປັນ disabled): ຍິງ POST ເທື່ອດຽວ", async () => {
    vi.mocked(apiFetch).mockImplementation(((_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? new Promise(() => {}) : Promise.resolve(base)) as typeof apiFetch);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const pay = screen.getByRole("button", { name: "Confirm payment" });
    await act(async () => {
      pay.click();
      pay.click();
    });
    expect(posts()).toHaveLength(1);
  });

  it("ສຳເລັດ: ປະກາດຜົນ (role=status) ແລະ focus ຍ້າຍໄປ status region ເມື່ອປຸ່ມຫາຍ", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") current = withStatus("PAID");
      return current;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start packing" })).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("order-announce")));
    expect(screen.getByTestId("order-announce")).toHaveTextContent("Payment confirmed");
  });

  it("ORDER_INVALID_STATE: ສະແດງຂໍ້ຄວາມແປ (role=alert) ແລະ ສະຖານະຫຼ້າສຸດ (refetch)", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") {
        current = withStatus("PAID");
        throw new ApiError(409, "x", [], "ORDER_INVALID_STATE", { status: "PAID" });
      }
      return current;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The order status does not allow this step");
    expect(await screen.findByText("Paid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start packing" })).toBeEnabled();
  });

  it("RESERVATION_EXPIRED: ຂໍ້ຄວາມແປ; ປຸ່ມກັບມາໃຊ້ໄດ້ (ບໍ່ຄ້າງ pending)", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new ApiError(409, "x", [], "RESERVATION_EXPIRED");
      return base;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The reservation expired");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm payment" })).toBeEnabled());
  });
});

describe("OrderDetail: ສິດ", () => {
  it("ມີແຕ່ logistics:write: ເຫັນແພັກ ແຕ່ບໍ່ເຫັນຢືນຢັນຊຳລະ/ຍົກເລີກ", async () => {
    auth.perms = new Set(["orders:read", "logistics:write"]);
    mockOrder(withStatus("PAID"));
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("button", { name: "Start packing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  it("ມີແຕ່ payments:write: ເຫັນຢືນຢັນຊຳລະ ແຕ່ບໍ່ເຫັນຍົກເລີກ; ແລະ ບໍ່ເຫັນແພັກ", async () => {
    auth.perms = new Set(["orders:read", "payments:write"]);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  it("ມີແຕ່ orders:write: ເຫັນຍົກເລີກ ແຕ່ບໍ່ເຫັນຢືນຢັນຊຳລະ", async () => {
    auth.perms = new Set(["orders:read", "orders:write"]);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
  });

  it("ມີແຕ່ orders:read: ທຸກຂັ້ນຕອນ ບໍ່ມີປຸ່ມ action ເລີຍ ແລະ ບໍ່ມີຄອລຳຕົ້ນທຶນ", async () => {
    auth.perms = new Set(["orders:read"]);
    for (const status of ["PENDING_PAYMENT", "PAID", "PACKING", "SHIPPED"] as const) {
      mockOrder(withStatus(status, { secondsUntilExpiry: status === "PENDING_PAYMENT" ? 60 : null }));
      const view = renderWithProviders(<OrderDetail id="o1" />);
      await heading();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(screen.queryByText("Unit cost")).toBeNull();
      view.unmount();
    }
  });
});

describe("OrderDetail: ຍົກເລີກ", () => {
  it("dialog ມີຊ່ອງເຫດຜົນ → POST /cancel { reason }; ສຳເລັດແລ້ວ dialog ປິດ", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") current = withStatus("CANCELLED");
      return current;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.type(await screen.findByLabelText("Reason (optional)"), "customer changed mind");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" }));
    await waitFor(() =>
      expect(posts()).toEqual([["/orders/o1/cancel", { method: "POST", body: { reason: "customer changed mind" } }]]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Cancelled", { selector: "span" })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("order-announce")));
  });

  it("ບໍ່ໃສ່ເຫດຜົນ: POST /cancel body {}", async () => {
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(posts()).toEqual([["/orders/o1/cancel", { method: "POST", body: {} }]]));
  });

  it("ຍົກເລີກລົ້ມ (ORDER_INVALID_STATE): ຂໍ້ຄວາມແປໃນ dialog, ບິນ refetch", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new ApiError(409, "x", [], "ORDER_INVALID_STATE", { status: "SHIPPED" });
      return base;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const before = gets().length;
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("does not allow this step");
    await waitFor(() => expect(gets().length).toBeGreaterThan(before));
  });
});

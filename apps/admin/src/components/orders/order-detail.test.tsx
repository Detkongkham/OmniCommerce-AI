import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToasts, subscribe } from "@oca/ui";
import { useState } from "react";
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
  paidAt: null, shippedAt: null, completedAt: null, cancelledAt: null, createdAt: "2026-10-05T05:30:00.000Z", shipment: null,
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
    const timer = await screen.findByRole("timer", { name: "Time left before the reservation expires" });
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
    for (let i = 0; i < 8; i++) {
      // ນັບຮອດ 0 ແລ້ວ poll ທຸກ 5 ວິ (ເດີນເທື່ອລະວິ ໃຫ້ React flush ລະຫວ່າງທາງ)
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
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

  it.each(["PAID", "PACKING"] as const)("%s: ແພັກ/ສົ່ງ ເຮັດທີ່ໜ້າ fulfillment (ລິ້ງ, ບໍ່ POST)", async (status) => {
    mockOrder(withStatus(status));
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("link", { name: "Go to pack & ship" })).toHaveAttribute("href", "/fulfillment/o1");
    expect(screen.queryByRole("button", { name: "Start packing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ship" })).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("ຂໍ້ມູນການສົ່ງ: ບໍລິສັດ + tracking + ລິ້ງຕິດຕາມ", async () => {
    mockOrder(
      withStatus("SHIPPED", {
        shipment: { courierName: "Anousith", trackingNumber: "AN123", trackingUrl: "https://an.la/t/AN123", notifyStatus: "SENT", shippedAt: "2026-10-05T06:00:00.000Z" },
      }),
    );
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByText("Anousith · AN123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Track parcel" })).toHaveAttribute("href", "https://an.la/t/AN123");
  });

  it.each([["SHIPPED", "Complete order", "complete"]] as const)("%s: ປຸ່ມຂັ້ນຕໍ່ໄປຄື '%s' (POST /%s)", async (status, label, action) => {
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
    expect(screen.queryByRole("alert")).toBeNull(); // ກົດຊ້ຳບໍ່ແມ່ນຄວາມຜິດ

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
    expect(screen.queryByRole("alert")).toBeNull(); // ກົດຊ້ຳ: ບໍ່ສະແດງ error
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
    await waitFor(() => expect(screen.getByRole("link", { name: "Go to pack & ship" })).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("order-announce")));
    expect(screen.getByTestId("order-announce")).toHaveTextContent("Payment confirmed");
  });

  it("ORDER_INVALID_STATE: ສະຖານະຫຼ້າສຸດ (refetch) ແລະ ຂໍ້ຄວາມແປຖືກປະກາດ; alert ເກົ່າບໍ່ຄ້າງ", async () => {
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
    // ສະຖານະຫຼ້າສຸດມາແລ້ວ: ບໍ່ມີ alert ເກົ່າຄ້າງຂ້າງສະຖານະໃໝ່; ຂໍ້ຄວາມຖືກປະກາດທີ່ status region
    expect(await screen.findByText("Paid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to pack & ship" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("order-announce")).toHaveTextContent("The order status does not allow this step");
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
    expect(screen.getByRole("link", { name: "Go to pack & ship" })).toBeInTheDocument();
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

describe("OrderDetail: ແກ້ຕາມ review (ຂໍ້ມູນເກົ່າ/ຄ້າງ)", () => {
  const advance = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });

  it("ຢືນຢັນຍົກເລີກຂະນະມີ action ອື່ນກຳລັງສົ່ງ: ບໍ່ POST ຊ້ຳ, dialog ຍັງເປີດ ພ້ອມຂໍ້ຄວາມ", async () => {
    vi.mocked(apiFetch).mockImplementation(((_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? new Promise(() => {}) : Promise.resolve(base)) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog");
    const pay = screen.getByRole("button", { name: "Confirm payment", hidden: true });
    const confirm = within(dialog).getByRole("button", { name: "Cancel order" });
    await act(async () => {
      pay.click(); // action ອື່ນເລີ່ມກ່ອນ ໃນ tick ດຽວກັນ
      confirm.click();
    });
    expect(posts()).toEqual([["/orders/o1/pay", { method: "POST" }]]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Another action is still in progress");
  });

  it("ຂະນະ action ກຳລັງສົ່ງ: ປຸ່ມຢືນຢັນໃນ dialog ຖືກ disable", async () => {
    vi.mocked(apiFetch).mockImplementation(((_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? new Promise(() => {}) : Promise.resolve(base)) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await screen.findByRole("dialog");
    await act(async () => {
      screen.getByRole("button", { name: "Confirm payment", hidden: true }).click();
    });
    expect(posts()).toHaveLength(1);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" })).toBeDisabled());
  });

  it("poll ລົ້ມ (ມີຂໍ້ມູນເກົ່າ): ປ້າຍເຕືອນ role=alert + Retry, ປຸ່ມ action ຖືກປິດ; Retry ສຳເລັດ → ກັບປົກກະຕິ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = false;
    vi.mocked(apiFetch).mockImplementation((async () => {
      if (fail) throw new ApiError(500, "", [], "INTERNAL_ERROR");
      return { ...base, secondsUntilExpiry: 0 };
    }) as typeof apiFetch);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
    fail = true;
    await advance(15_000);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not refresh, showing the last known state");
    expect(screen.getByRole("heading", { level: 1, name: "SO-000001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
  });

  it("action ລົ້ມ ແລ້ວ refetch ຂອງ hook ກໍ່ລົ້ມ: ປ້າຍເຕືອນ ແລະ ປຸ່ມຖືກປິດ", async () => {
    let getsFail = false;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") {
        getsFail = true;
        throw new ApiError(409, "x", [], "ORDER_INVALID_STATE");
      }
      if (getsFail) throw new ApiError(500, "", [], "INTERNAL_ERROR");
      return base;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByText(/Could not refresh, showing the last known state/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled();
  });

  it("server ຍັງບອກເຫຼືອ 1 ວິຕະຫຼອດ: ຈຳນວນ GET ມີຂອບເຂດ (poll 5 ວິ ບໍ່ແມ່ນທຸກວິ)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOrder({ ...base, secondsUntilExpiry: 1 });
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    for (let i = 0; i < 30; i++) await advance(1000);
    expect(gets().length).toBeLessThanOrEqual(1 + 6 + 2);
  });

  it("refetch ຕອນໝົດເວລາລົ້ມ: ລອງໃໝ່ເອງ ແລ້ວປ່ຽນເປັນໝົດເວລາຈອງ (ບໍ່ຄ້າງ)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockImplementation((async () => {
      const n = gets().length;
      if (n === 2) throw new ApiError(500, "", [], "INTERNAL_ERROR");
      return n === 1 ? { ...base, secondsUntilExpiry: 1 } : withStatus("EXPIRED");
    }) as typeof apiFetch);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    for (let i = 0; i < 25; i++) await advance(1000);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull());
    expect(within(screen.getByRole("group", { name: "Order status" })).getByText("Reservation expired")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ບິນບໍ່ cancel ໄດ້ແລ້ວຂະນະ dialog ເປີດ: dialog ປິດ, ປະກາດ 'Order status changed to Shipped' ແລະ focus ໄປ status region", async () => {
    let current = withStatus("PACKING");
    vi.mocked(apiFetch).mockImplementation((async () => current) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.type(await screen.findByLabelText("Reason (optional)"), "abc");
    current = withStatus("SHIPPED");
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const announce = screen.getByTestId("order-announce");
    expect(announce).toHaveTextContent("Order status changed to Shipped");
    await waitFor(() => expect(document.activeElement).toBe(announce));
  });

  it("ເປີດ dialog ໂດຍບໍ່ focus ປຸ່ມ ແລ້ວກົດ 'Keep order': focus ຄືນປຸ່ມ 'Cancel order'", async () => {
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const opener = screen.getByRole("button", { name: "Cancel order" });
    fireEvent.click(opener);
    await user.click(await screen.findByRole("button", { name: "Keep order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("ຫຼັງ action ສຳເລັດ ບໍ່ໃຊ້ setTimeout 50ms ເພື່ອຍ້າຍ focus (ໃຊ້ effect)", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") current = withStatus("PAID");
      return current;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    const spy = vi.spyOn(window, "setTimeout");
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("order-announce")));
    expect(spy.mock.calls.some((call) => call[1] === 50)).toBe(false);
    spy.mockRestore();
  });

  it("ປະກາດເກົ່າຖືກລ້າງເມື່ອສະຖານະປ່ຽນຈາກພາຍນອກ", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") current = withStatus("PAID");
      return current;
    }) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(screen.getByTestId("order-announce")).toHaveTextContent("Payment confirmed"));
    current = withStatus("PACKING");
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.getByTestId("order-announce").textContent).toBe(""));
  });

  it("network error (ບໍ່ແມ່ນ ApiError): ຂໍ້ຄວາມກາງແປແລ້ວ ແລະ ປ່ອຍ guard (ກົດໃໝ່ໄດ້)", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new TypeError("Failed to fetch");
      return base;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm payment" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
  });

  it("alert ຂອງ network error ຫາຍເມື່ອສະຖານະປ່ຽນຈາກພາຍນອກ", async () => {
    let current = base;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new TypeError("Failed to fetch");
      return current;
    }) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    current = withStatus("PAID");
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.getByRole("link", { name: "Go to pack & ship" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("unmount ຂະນະ POST ຄ້າງ: ຈົບແລ້ວ toast.success ອອກເທື່ອດຽວ, ບໍ່ມີ error/unhandled rejection", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    let resolve!: (value: OrderDetailDto) => void;
    vi.mocked(apiFetch).mockImplementation(((_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? new Promise<OrderDetailDto>((r) => (resolve = r)) : Promise.resolve(base)) as typeof apiFetch);
    const { user, unmount } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    // store ຕັດເຫຼືອ 5 ອັນ ຈຶ່ງນັບຈາກ id ໃໝ່ທີ່ເກີດຂຶ້ນ ບໍ່ແມ່ນຈຳນວນໃນ store
    const old = new Set(getToasts().map((item) => item.id));
    const seen = new Set<string>();
    const unsubscribe = subscribe(() => {
      for (const item of getToasts()) if (item.title === "Payment confirmed" && !old.has(item.id)) seen.add(item.id);
    });
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    unmount();
    await act(async () => {
      resolve(withStatus("PAID"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    unsubscribe();
    expect(seen.size).toBe(1);
    expect(errors).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
    errors.mockRestore();
  });

  it("ເປີດ dialog ແລ້ວຂໍ້ມູນກາຍເປັນເກົ່າ: dialog ສະແດງເຫດຜົນ (role=alert) ຂ້າງປຸ່ມຢືນຢັນທີ່ຖືກປິດ", async () => {
    let fail = false;
    vi.mocked(apiFetch).mockImplementation((async () => {
      if (fail) throw new ApiError(500, "", [], "INTERNAL_ERROR");
      return base;
    }) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await screen.findByRole("dialog");
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
    fail = true;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Could not refresh, showing the last known state"));
    expect(within(dialog).getByRole("button", { name: "Cancel order" })).toBeDisabled();
  });

  it("ຍົກເລີກບໍ່ໄດ້ແລ້ວ ເພາະສິດຖືກຖອນ (ສະຖານະເດີມ): ບໍ່ປະກາດວ່າສະຖານະປ່ຽນ ແຕ່ບອກວ່າຍົກເລີກບໍ່ໄດ້ແລ້ວ", async () => {
    const { user, queryClient } = renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await screen.findByRole("dialog");
    auth.perms = new Set(["orders:read", "payments:write"]);
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const announce = screen.getByTestId("order-announce");
    expect(announce).not.toHaveTextContent("status changed");
    expect(announce).toHaveTextContent("You can no longer cancel this order");
  });

  it("ໄປບິນອື່ນ (ບໍ່ remount): latch ຂອງບິນ A ບໍ່ຕິດໄປ poll ບິນ B ທຸກ 5 ວິ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockImplementation((async (path: string) =>
      path === "/orders/o2"
        ? { ...base, id: "o2", orderNumber: "SO-000002", secondsUntilExpiry: 300 }
        : { ...base, secondsUntilExpiry: 1 }) as typeof apiFetch);
    function Harness() {
      const [id, setId] = useState("o1");
      return (
        <>
          <button type="button" onClick={() => setId("o2")}>
            go B
          </button>
          <OrderDetail id={id} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    await heading();
    for (let i = 0; i < 3; i++) await advance(1000); // A ນັບຮອດ 0 (latch)
    fireEvent.click(screen.getByRole("button", { name: "go B" }));
    await screen.findByRole("heading", { level: 1, name: "SO-000002" });
    for (let i = 0; i < 30; i++) await advance(1000);
    expect(vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders/o2")).toHaveLength(1);
  });

  it("latch ຖືກລ້າງເມື່ອ fetch ໃໝ່ບອກວ່າເຫຼືອເວລາ >0: ເຊົາ poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockImplementation((async () => ({ ...base, secondsUntilExpiry: gets().length <= 1 ? 1 : 300 })) as typeof apiFetch);
    renderWithProviders(<OrderDetail id="o1" />);
    await heading();
    for (let i = 0; i < 8; i++) await advance(1000); // latch → poll ຄັ້ງທີ 2 ບອກ 300
    const afterReset = gets().length;
    expect(afterReset).toBe(2);
    for (let i = 0; i < 30; i++) await advance(1000);
    expect(gets()).toHaveLength(afterReset);
  });
});

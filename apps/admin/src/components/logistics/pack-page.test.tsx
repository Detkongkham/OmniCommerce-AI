import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CourierDto, FulfillmentDetailDto, ShipmentDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { PackPage } from "./pack-page";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
const auth = vi.hoisted(() => ({ permissions: ["logistics:write"] as string[] }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.permissions.includes(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));
// ກ້ອງ: ປຸ່ມທີ່ "ເຫັນ" SKU-2
vi.mock("./camera-scanner", () => ({
  CameraScanner: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button type="button" onClick={() => onDetected("SKU-2")}>
      fake-camera-detect
    </button>
  ),
}));

const SHIPMENT: ShipmentDto = {
  id: "sh1",
  courier: null,
  trackingNumber: null,
  trackingUrl: null,
  packedBy: { id: "u1", name: "Somsack" },
  packedAt: "2026-10-08T03:00:00.000Z",
  verifiedAt: null,
  verifiedBy: null,
  verifyOverrideReason: null,
  shippedBy: null,
  shippedAt: null,
  notifyStatus: "NONE",
  notifyErrorCode: null,
  notifiedAt: null,
};
const DETAIL: FulfillmentDetailDto = {
  id: "o1",
  orderNumber: "SO-000001",
  status: "PACKING",
  channel: "FACEBOOK",
  customer: { id: "cu1", name: "Noy", phone: "020555" },
  shippingName: "Noy",
  shippingPhone: "020555",
  shippingAddress: "Vientiane",
  note: null,
  paidAt: "2026-10-08T02:00:00.000Z",
  items: [
    { id: "i1", variantId: "v1", sku: "SKU-1", barcode: "8850001", productName: "Shirt", variantName: "M", quantity: 2, warehouseId: "w1", warehouseCode: "A" },
    { id: "i2", variantId: "v2", sku: "SKU-2", barcode: null, productName: "Mug", variantName: null, quantity: 1, warehouseId: "w1", warehouseCode: "A" },
  ],
  shipment: SHIPMENT,
  notifyText: null,
  storeName: "OCA Store",
};
const VERIFIED: FulfillmentDetailDto = { ...DETAIL, shipment: { ...SHIPMENT, verifiedAt: "2026-10-08T03:05:00.000Z", verifiedBy: { id: "u1", name: "Somsack" } } };
const SHIPPED: FulfillmentDetailDto = {
  ...VERIFIED,
  status: "SHIPPED",
  shipment: {
    ...(VERIFIED.shipment as ShipmentDto),
    courier: { id: "c1", code: "AN", name: "Anousith" },
    trackingNumber: "AN123",
    trackingUrl: "https://an.la/t/AN123",
    shippedBy: { id: "u1", name: "Somsack" },
    shippedAt: "2026-10-08T03:10:00.000Z",
    notifyStatus: "SENT",
  },
  notifyText: "📦 SO-000001 AN123",
};
const COURIERS: CourierDto[] = [
  { id: "c1", code: "AN", name: "Anousith", trackingUrlTemplate: null, isActive: true, createdAt: "" },
  { id: "c2", code: "OLD", name: "Old Courier", trackingUrlTemplate: null, isActive: false, createdAt: "" },
];

const state = vi.hoisted(() => ({ detail: null as unknown as FulfillmentDetailDto, next: {} as Record<string, unknown> }));

function mockApi(detail: FulfillmentDetailDto) {
  state.detail = detail;
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/couriers") return COURIERS;
    if (options?.method) {
      const action = path.split("/").at(-1) as string;
      const next = state.next[action];
      if (next instanceof Error) throw next;
      if (next) state.detail = next as FulfillmentDetailDto;
      return state.detail;
    }
    return state.detail;
  }) as typeof apiFetch);
}
const calls = (method: string) => vi.mocked(apiFetch).mock.calls.filter(([, o]) => (o as { method?: string } | undefined)?.method === method);

beforeEach(() => {
  auth.permissions = ["logistics:write"];
  state.next = {};
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mockApi(DETAIL);
});

describe("PackPage", () => {
  it("PAID: ປຸ່ມເລີ່ມແພັກ → POST start ແລ້ວຊ່ອງຍິງປາກົດ", async () => {
    mockApi({ ...DETAIL, status: "PAID", shipment: null });
    state.next.start = DETAIL;
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "SO-000001" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Scan a barcode or type a SKU")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start packing" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/start", { method: "POST" }));
    expect(await screen.findByLabelText("Scan a barcode or type a SKU")).toHaveFocus();
  });

  it("ຍິງ: ຖືກ/ຜິດ/ເກີນ ມີຂໍ້ຄວາມ; ຄົບ → verify ອັດຕະໂນມັດ (ຈຳນວນຕໍ່ SKU) → ກວດຄົບແລ້ວ", async () => {
    state.next.verify = VERIFIED;
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    const input = await screen.findByLabelText("Scan a barcode or type a SKU");
    await user.type(input, "8850001{Enter}");
    expect(screen.getByTestId("pack-feedback")).toHaveTextContent("✓ Shirt — M (1/2)");
    expect(within(screen.getByTestId("pack-line-v1")).getByText("1/2")).toBeInTheDocument();
    expect(input).toHaveValue("");
    await user.type(input, "XYZ{Enter}");
    expect(screen.getByText("XYZ is not in this order")).toBeInTheDocument();
    await user.type(input, "sku-1{Enter}");
    await user.type(input, "SKU-1{Enter}");
    expect(screen.getByText("Shirt — M is already complete: more than ordered")).toBeInTheDocument();
    expect(calls("POST")).toHaveLength(0);
    await user.type(input, "SKU-2{Enter}");
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/verify", {
        method: "POST",
        body: { scans: [{ code: "SKU-1", quantity: 2 }, { code: "SKU-2", quantity: 1 }] },
      }),
    );
    expect(await screen.findByText("All items verified, ready to ship")).toBeInTheDocument();
  });

  it("ກ້ອງ: ເປີດ → ລະຫັດທີ່ກ້ອງເຫັນຖືກນັບ; ເລີ່ມຍິງໃໝ່ ລ້າງຕົວນັບ", async () => {
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    await user.click(await screen.findByRole("button", { name: "Scan with camera" }));
    await user.click(screen.getByRole("button", { name: "fake-camera-detect" }));
    expect(within(screen.getByTestId("pack-line-v2")).getByText("1/1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset scans" }));
    expect(within(screen.getByTestId("pack-line-v2")).getByText("0/1")).toBeInTheDocument();
  });

  it("override: ສະເພາະຜູ້ມີ orders:write; ເຫດຜົນ → POST override", async () => {
    const { unmount } = renderWithProviders(<PackPage orderId="o1" />);
    await screen.findByLabelText("Scan a barcode or type a SKU");
    expect(screen.queryByRole("button", { name: "Skip scanning" })).toBeNull();
    unmount();
    auth.permissions = ["logistics:write", "orders:write"];
    state.next.override = { ...VERIFIED, shipment: { ...(VERIFIED.shipment as ShipmentDto), verifyOverrideReason: "torn barcode", verifiedBy: { id: "u2", name: "Manager" } } };
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    await user.click(await screen.findByRole("button", { name: "Skip scanning" }));
    const dialog = await screen.findByRole("dialog", { name: "Skip scan verification?" });
    await user.type(within(dialog).getByLabelText(/^Reason/), "torn barcode");
    await user.click(within(dialog).getByRole("button", { name: "Skip scanning" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/override", { method: "POST", body: { reason: "torn barcode" } }));
    expect(await screen.findByText("Scan skipped by Manager: torn barcode")).toBeInTheDocument();
  });

  it("ຜູ້ຮັບ: ແກ້ທີ່ຢູ່ → PATCH shipping; ບໍ່ມີເບີ → ປຸ່ມສົ່ງອອກ disabled ພ້ອມເຫດຜົນ", async () => {
    mockApi({ ...VERIFIED, shippingPhone: null });
    state.next.shipping = { ...VERIFIED, shippingAddress: "Pakse" };
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    const ship = await screen.findByRole("button", { name: "Ship" });
    expect(ship).toBeDisabled();
    expect(ship).toHaveAccessibleDescription("Verify all items and fill in the recipient first");
    expect(screen.getByText("Recipient name and phone are required before shipping")).toBeInTheDocument();
    const address = screen.getByLabelText("Address");
    await user.clear(address);
    await user.type(address, "Pakse");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/shipping", {
        method: "PATCH",
        body: { shippingName: "Noy", shippingPhone: null, shippingAddress: "Pakse" },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Recipient saved");
  });

  it("ສົ່ງອອກ: ເລືອກ courier (ສະເພາະທີ່ເປີດ) + tracking → POST ship → ສະແດງການສົ່ງ + ແຈ້ງແລ້ວ", async () => {
    mockApi(VERIFIED);
    state.next.ship = SHIPPED;
    const { user } = renderWithProviders(<PackPage orderId="o1" />);
    await user.click(await screen.findByRole("button", { name: "Ship" }));
    const dialog = await screen.findByRole("dialog", { name: "Ship order SO-000001" });
    const courier = within(dialog).getByLabelText(/^Courier/);
    expect(within(courier).queryByRole("option", { name: "Old Courier" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Ship" }));
    expect(await within(dialog).findByText("Choose a courier")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the tracking number")).toBeInTheDocument();
    await user.selectOptions(courier, "c1");
    await user.type(within(dialog).getByLabelText(/^Tracking number/), "AN123{Enter}");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/ship", { method: "POST", body: { courierId: "c1", trackingNumber: "AN123" } }));
    expect(toast.success).toHaveBeenCalledWith("Order shipped");
    expect(await screen.findByText("Customer notified by chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AN123" })).toHaveAttribute("href", "https://an.la/t/AN123");
  });

  it("ແຈ້ງບໍ່ສຳເລັດ: ເຫດຜົນ + ສົ່ງໃໝ່ (POST notify) + copy; MANUAL ບອກໃຫ້ copy", async () => {
    mockApi({ ...SHIPPED, shipment: { ...(SHIPPED.shipment as ShipmentDto), notifyStatus: "FAILED", notifyErrorCode: "CHANNEL_AUTH" } });
    state.next.notify = SHIPPED;
    const { user, unmount } = renderWithProviders(<PackPage orderId="o1" />);
    // userEvent.setup() ຕິດຕັ້ງ clipboard ປອມຂອງມັນ: spy ຫຼັງ render
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    expect(await screen.findByText(/Could not notify by chat: The Page token is invalid/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith("📦 SO-000001 AN123");
    await user.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment/o1/notify", { method: "POST", body: { force: false } }));
    expect(toast.success).toHaveBeenCalledWith("Customer notified");
    unmount();
    mockApi({ ...SHIPPED, shipment: { ...(SHIPPED.shipment as ShipmentDto), notifyStatus: "MANUAL" } });
    renderWithProviders(<PackPage orderId="o1" />);
    expect(await screen.findByText("No chat with this customer: copy the message and send it yourself")).toBeInTheDocument();
  });

  it("ບໍ່ມີ logistics:write: ບໍ່ມີປຸ່ມເລີ່ມ/ຊ່ອງຍິງ; 404 → ບໍ່ພົບ + ກັບຄືນ", async () => {
    auth.permissions = [];
    mockApi({ ...DETAIL, status: "PAID", shipment: null });
    const { unmount } = renderWithProviders(<PackPage orderId="o1" />);
    await screen.findByRole("heading", { level: 1, name: "SO-000001" });
    expect(screen.queryByRole("button", { name: "Start packing" })).toBeNull();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "nf", [], "ORDER_NOT_FOUND"));
    renderWithProviders(<PackPage orderId="o1" />);
    expect(await screen.findByText("Order not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to queue" })).toHaveAttribute("href", "/fulfillment");
  });
});

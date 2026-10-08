import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { FulfillmentDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ShippingLabels } from "./shipping-labels";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const base: FulfillmentDetailDto = {
  id: "o1",
  orderNumber: "SO-000001",
  status: "PACKING",
  channel: "FACEBOOK",
  customer: null,
  shippingName: "Noy",
  shippingPhone: "02055551234",
  shippingAddress: "Ban Sisavat, Vientiane",
  note: null,
  paidAt: null,
  items: [
    { id: "i1", variantId: "v1", sku: "SKU-1", barcode: null, productName: "Shirt", variantName: null, quantity: 2, warehouseId: "w1", warehouseCode: "A" },
    { id: "i2", variantId: "v2", sku: "SKU-2", barcode: null, productName: "Mug", variantName: null, quantity: 1, warehouseId: "w1", warehouseCode: "A" },
  ],
  shipment: null,
  notifyText: null,
  storeName: "OCA Store",
};
const SHIPPED: FulfillmentDetailDto = {
  ...base,
  id: "o2",
  orderNumber: "SO-000002",
  shipment: {
    id: "s2", courier: { id: "c1", code: "AN", name: "Anousith" }, trackingNumber: "AN123", trackingUrl: null,
    packedBy: null, packedAt: null, verifiedAt: null, verifiedBy: null, verifyOverrideReason: null,
    shippedBy: null, shippedAt: null, notifyStatus: "SENT", notifyErrorCode: null, notifiedAt: null,
  },
};

let print: ReturnType<typeof vi.fn>;
beforeEach(() => {
  print = vi.fn();
  vi.stubGlobal("print", print);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/fulfillment/o1") return base;
    if (path === "/fulfillment/o2") return SHIPPED;
    throw new ApiError(404, "nf", [], "ORDER_NOT_FOUND");
  }) as typeof apiFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShippingLabels", () => {
  it("ໃບປະໜ້າຕໍ່ບິນ: ຜູ້ສົ່ງ, ຜູ້ຮັບ, ຈຳນວນຊິ້ນ, ບາໂຄດເລກບິນ (+ tracking ຖ້າມີ); ພິມອັດຕະໂນມັດຄັ້ງດຽວ", async () => {
    renderWithProviders(<ShippingLabels ids={["o1", "o2"]} />);
    const first = await screen.findByTestId("label-o1");
    expect(first).toHaveTextContent("OCA Store");
    expect(first).toHaveTextContent("Noy");
    expect(first).toHaveTextContent("02055551234");
    expect(first).toHaveTextContent("Ban Sisavat, Vientiane");
    expect(first).toHaveTextContent("3 items");
    expect(screen.getByRole("img", { name: "SO-000001" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "AN123" })).toBeInTheDocument();
    expect(screen.getByTestId("label-o2")).toHaveTextContent("Anousith");
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("ບາງບິນໂຫຼດບໍ່ໄດ້: ແຈ້ງ ແລະ ພິມສະເພາະທີ່ໄດ້ (ບໍ່ພິມອັດຕະໂນມັດ)", async () => {
    renderWithProviders(<ShippingLabels ids={["o1", "nope"]} />);
    expect(await screen.findByText("Some orders could not be loaded")).toBeInTheDocument();
    expect(screen.getByTestId("label-o1")).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("ບໍ່ມີ ids ຫຼື ເກີນ 50 → ຂໍ້ຄວາມ", () => {
    const { unmount } = renderWithProviders(<ShippingLabels ids={[]} />);
    expect(screen.getByText("No orders selected")).toBeInTheDocument();
    unmount();
    renderWithProviders(<ShippingLabels ids={Array.from({ length: 51 }, (_, i) => `o${i}`)} />);
    expect(screen.getByText("Up to 50 labels at a time")).toBeInTheDocument();
  });
});

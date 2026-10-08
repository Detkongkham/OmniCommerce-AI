import { describe, expect, it } from "vitest";
import {
  buildTrackingMessage,
  buildTrackingUrl,
  createCourierSchema,
  fulfillmentListQuerySchema,
  notifyShipmentSchema,
  overridePackSchema,
  shipOrderSchema,
  updateCourierSchema,
  updateShippingSchema,
  verifyPackSchema,
} from "./logistics";

describe("courier schemas", () => {
  it("code: trim + ຕົວໃຫຍ່, A-Z0-9_- ≤20; isActive default true", () => {
    expect(createCourierSchema.parse({ code: " anousith ", name: " Anousith Express " })).toEqual({
      code: "ANOUSITH",
      name: "Anousith Express",
      isActive: true,
    });
    expect(createCourierSchema.safeParse({ code: "HAL EXPRESS", name: "x" }).success).toBe(false);
    expect(createCourierSchema.safeParse({ code: "A".repeat(21), name: "x" }).success).toBe(false);
    expect(createCourierSchema.safeParse({ code: "HAL", name: "" }).success).toBe(false);
  });

  it("trackingUrlTemplate: https + ມີ {tracking}; ວ່າງ = null", () => {
    const ok = createCourierSchema.parse({ code: "HAL", name: "HAL", trackingUrlTemplate: "https://hal.la/track/{tracking}" });
    expect(ok.trackingUrlTemplate).toBe("https://hal.la/track/{tracking}");
    expect(createCourierSchema.parse({ code: "HAL", name: "HAL", trackingUrlTemplate: "" }).trackingUrlTemplate).toBeNull();
    expect(createCourierSchema.safeParse({ code: "HAL", name: "HAL", trackingUrlTemplate: "http://hal.la/{tracking}" }).success).toBe(false);
    expect(createCourierSchema.safeParse({ code: "HAL", name: "HAL", trackingUrlTemplate: "https://hal.la/track" }).success).toBe(false);
  });

  it("update: ຕ້ອງມີຢ່າງໜ້ອຍ 1 field; strict", () => {
    expect(updateCourierSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateCourierSchema.safeParse({}).success).toBe(false);
    expect(updateCourierSchema.safeParse({ x: 1 }).success).toBe(false);
  });
});

describe("fulfillment schemas", () => {
  it("list query: status ສະເພາະ PAID/PACKING, page default", () => {
    expect(fulfillmentListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(fulfillmentListQuerySchema.parse({ status: "PACKING", q: " SO-1 " })).toMatchObject({ status: "PACKING", q: "SO-1" });
    expect(fulfillmentListQuerySchema.safeParse({ status: "SHIPPED" }).success).toBe(false);
  });

  it("verify: scans 1..500 ແຖວ, code trim, quantity ຈຳນວນເຕັມ ≥1", () => {
    expect(verifyPackSchema.parse({ scans: [{ code: " sku-1 ", quantity: 2 }] })).toEqual({ scans: [{ code: "sku-1", quantity: 2 }] });
    expect(verifyPackSchema.safeParse({ scans: [] }).success).toBe(false);
    expect(verifyPackSchema.safeParse({ scans: [{ code: "", quantity: 1 }] }).success).toBe(false);
    expect(verifyPackSchema.safeParse({ scans: [{ code: "A", quantity: 0 }] }).success).toBe(false);
    expect(verifyPackSchema.safeParse({ scans: [{ code: "A", quantity: 1.5 }] }).success).toBe(false);
  });

  it("override: ເຫດຜົນ 3..300", () => {
    expect(overridePackSchema.parse({ reason: "  ບາໂຄດຂາດ  " })).toEqual({ reason: "ບາໂຄດຂາດ" });
    expect(overridePackSchema.safeParse({ reason: "ab" }).success).toBe(false);
  });

  it("shipping: ວ່າງ = null, ຕ້ອງມີ 1 field", () => {
    expect(updateShippingSchema.parse({ shippingName: " Noy ", shippingAddress: "" })).toEqual({ shippingName: "Noy", shippingAddress: null });
    expect(updateShippingSchema.safeParse({}).success).toBe(false);
  });

  it("ship ແລະ notify", () => {
    expect(shipOrderSchema.parse({ courierId: "c1", trackingNumber: " AN123 " })).toEqual({ courierId: "c1", trackingNumber: "AN123" });
    expect(shipOrderSchema.safeParse({ courierId: "c1", trackingNumber: " " }).success).toBe(false);
    expect(notifyShipmentSchema.parse({})).toEqual({ force: false });
  });
});

describe("tracking helpers", () => {
  it("buildTrackingUrl: ແທນ {tracking} ແບບ encode; ບໍ່ມີ template = null", () => {
    expect(buildTrackingUrl("https://x.la/t/{tracking}", "AB 1/2")).toBe("https://x.la/t/AB%201%2F2");
    expect(buildTrackingUrl(null, "AB")).toBeNull();
  });

  it("buildTrackingMessage: ເລກບິນ, ບໍລິສັດ, tracking, ລິ້ງ (ຖ້າມີ)", () => {
    const text = buildTrackingMessage({ orderNumber: "SO-000001", courierName: "Anousith", trackingNumber: "AN123", trackingUrl: "https://x.la/t/AN123" });
    expect(text).toContain("SO-000001");
    expect(text).toContain("Anousith");
    expect(text).toContain("AN123");
    expect(text).toContain("https://x.la/t/AN123");
    expect(buildTrackingMessage({ orderNumber: "SO-1", courierName: "HAL", trackingNumber: "H1", trackingUrl: null })).not.toContain("http");
  });
});

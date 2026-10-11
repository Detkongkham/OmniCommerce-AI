import { describe, expect, it } from "vitest";
import { actionGroups, auditDiff, entityHref } from "./audit-diff";

describe("auditDiff", () => {
  it("object: ທຸກ key ຂອງທັງສອງຂ້າງ ແລະ ບອກວ່າປ່ຽນ", () => {
    expect(auditDiff({ price: "10.00", sku: "A" }, { price: "12.00", sku: "A", isActive: false })).toEqual([
      { key: "price", before: "10.00", after: "12.00", changed: true },
      { key: "sku", before: "A", after: "A", changed: false },
      { key: "isActive", before: "—", after: "false", changed: true },
    ]);
  });
  it("ມີແຕ່ after; ບໍ່ມີທັງສອງ; ຄ່າບໍ່ແມ່ນ object", () => {
    expect(auditDiff(null, { status: "CANCELLED" })).toEqual([{ key: "status", before: "—", after: "CANCELLED", changed: true }]);
    expect(auditDiff(null, null)).toEqual([]);
    expect(auditDiff([1], [1, 2])).toEqual([{ key: "value", before: "[1]", after: "[1,2]", changed: true }]);
    expect(auditDiff({ items: [{ a: 1 }] }, undefined)[0]).toMatchObject({ before: '[{"a":1}]', after: "—" });
  });
});

describe("entityHref / actionGroups", () => {
  it("ລິ້ງສະເພາະ entity ທີ່ມີໜ້າ", () => {
    expect(entityHref("Order", "o1")).toBe("/orders/o1");
    expect(entityHref("Product", "p 1")).toBe("/products/p%201");
    expect(entityHref("LiveSession", "s1")).toBe("/live/s1");
    expect(entityHref("StockLevel", "x")).toBeNull();
    expect(entityHref("Order", null)).toBeNull();
  });
  it("ກຸ່ມ prefix ທີ່ມີ ≥ 2", () => {
    expect(actionGroups(["order.create", "order.pay", "auth.login", "live.start", "live.end"])).toEqual(["live.*", "order.*"]);
  });
});

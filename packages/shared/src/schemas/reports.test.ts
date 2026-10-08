import { describe, expect, it } from "vitest";
import { auditLogQuerySchema, deadstockQuerySchema, reportRangeQuerySchema, topProductsQuerySchema } from "./reports";

describe("report schemas", () => {
  it("ຊ່ວງວັນທີ: ເວລາຮ້ານ UTC+7, to ຮວມມື້ສຸດທ້າຍ", () => {
    const range = reportRangeQuerySchema.parse({ from: "2026-10-01", to: "2026-10-07" });
    expect(range.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-07T17:00:00.000Z");
    expect(range.days).toBe(7);
    expect(reportRangeQuerySchema.parse({ from: "2026-10-01", to: "2026-10-01" }).days).toBe(1);
  });

  it("ປະຕິເສດ: ບໍ່ສົ່ງ, ຮູບແບບຜິດ, ວັນທີເປັນໄປບໍ່ໄດ້, to ກ່ອນ from, ເກີນ 366 ມື້", () => {
    expect(reportRangeQuerySchema.safeParse({}).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2026-10-01T00:00", to: "2026-10-02" }).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-02" }).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2026-10-02", to: "2026-10-01" }).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2025-01-01", to: "2026-01-01" }).success).toBe(true);
    expect(reportRangeQuerySchema.safeParse({ from: "2025-01-01", to: "2026-01-02" }).success).toBe(false);
  });

  it("top-products limit 1..50 default 10; deadstock days 7..365 default 60", () => {
    expect(topProductsQuerySchema.parse({ from: "2026-10-01", to: "2026-10-01" }).limit).toBe(10);
    expect(topProductsQuerySchema.safeParse({ from: "2026-10-01", to: "2026-10-01", limit: "51" }).success).toBe(false);
    expect(deadstockQuerySchema.parse({}).days).toBe(60);
    expect(deadstockQuerySchema.safeParse({ days: "6" }).success).toBe(false);
  });

  it("audit: action ກົງ ຫຼື prefix .*", () => {
    expect(auditLogQuerySchema.parse({ action: "order.*" }).action).toBe("order.*");
    expect(auditLogQuerySchema.parse({ action: "auth.login_failed" }).action).toBe("auth.login_failed");
    expect(auditLogQuerySchema.safeParse({ action: "order.%" }).success).toBe(false);
    expect(auditLogQuerySchema.parse({}).pageSize).toBe(50);
  });
});

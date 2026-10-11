import { describe, expect, it } from "vitest";
import { isPublishPending } from "./queries-posts";

describe("isPublishPending", () => {
  const now = Date.parse("2026-10-09T00:00:00.000Z");
  it("PUBLISHING ຫຼື SCHEDULED ທີ່ຮອດເວລາແລ້ວ = poll", () => {
    expect(isPublishPending({ status: "PUBLISHING", scheduledAt: null }, now)).toBe(true);
    expect(isPublishPending({ status: "SCHEDULED", scheduledAt: "2026-10-08T23:59:00.000Z" }, now)).toBe(true);
    expect(isPublishPending({ status: "SCHEDULED", scheduledAt: "2026-10-09T05:00:00.000Z" }, now)).toBe(false);
    expect(isPublishPending({ status: "PUBLISHED", scheduledAt: "2026-10-08T23:59:00.000Z" }, now)).toBe(false);
  });
});

import type { PrismaClient } from "@oca/database";
import { LIVE_EVENTS_CHANNEL } from "@oca/shared";
import { describe, expect, it, vi } from "vitest";
import { publishExpiredLiveSessions } from "./live-expiry-events";

describe("publishExpiredLiveSessions", () => {
  const since = new Date("2026-10-10T12:00:00.000Z");

  it("ຫາ session ບໍ່ຊ້ຳຂອງບິນ CF ທີ່ໝົດເວລາຕັ້ງແຕ່ since ແລ້ວ publish ຄັ້ງລະ session", async () => {
    const findMany = vi.fn().mockResolvedValue([{ liveSessionId: "s1" }, { liveSessionId: "s2" }]);
    const db = { order: { findMany } } as unknown as PrismaClient;
    const redis = { publish: vi.fn().mockResolvedValue(1) };
    expect(await publishExpiredLiveSessions(db, redis, since)).toEqual(["s1", "s2"]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "EXPIRED", liveSessionId: { not: null }, updatedAt: { gte: since } },
      distinct: ["liveSessionId"],
      select: { liveSessionId: true },
    });
    expect(redis.publish.mock.calls).toEqual([
      [LIVE_EVENTS_CHANNEL, JSON.stringify({ type: "live.updated", sessionId: "s1" })],
      [LIVE_EVENTS_CHANNEL, JSON.stringify({ type: "live.updated", sessionId: "s2" })],
    ]);
  });

  it("ບໍ່ມີບິນ CF → ບໍ່ publish; publish ລົ້ມ → ບໍ່ throw (log ແທນ)", async () => {
    const empty = { order: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    const redis = { publish: vi.fn() };
    expect(await publishExpiredLiveSessions(empty, redis, since)).toEqual([]);
    expect(redis.publish).not.toHaveBeenCalled();

    const db = { order: { findMany: vi.fn().mockResolvedValue([{ liveSessionId: "s1" }]) } } as unknown as PrismaClient;
    const failing = { publish: vi.fn().mockRejectedValue(new Error("down")) };
    const logger = { warn: vi.fn() };
    await expect(publishExpiredLiveSessions(db, failing, since, logger)).resolves.toEqual(["s1"]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("down"));
  });
});

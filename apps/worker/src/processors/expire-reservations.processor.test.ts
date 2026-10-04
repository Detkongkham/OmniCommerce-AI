import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { expireReservationsJob } from "./expire-reservations.processor";

describe("expireReservationsJob", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");

  it("ຄືນຜົນນັບ expired/skipped/failed ແລະ log ບິນທີ່ພັງ ໂດຍບໍ່ຢຸດບິນອື່ນ", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const db = { order: { findMany } } as unknown as PrismaClient;
    const logger = { error: vi.fn() };
    const expire = vi.fn(async (_db: PrismaClient, orderId: string) => {
      if (orderId === "b") throw new Error("boom");
      return orderId === "a";
    });

    const result = await expireReservationsJob(db, logger, { now, expire });

    expect(result).toEqual({ expired: 1, skipped: 1, failed: 1 });
    expect(expire).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0]).toContain("b");
    expect(logger.error.mock.calls[0]?.[0]).toContain("boom");
  });

  it("ບໍ່ມີບິນໝົດເວລາ → ຜົນເປັນ 0 ທັງໝົດ", async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    const logger = { error: vi.fn() };
    expect(await expireReservationsJob(db, logger, { now })).toEqual({ expired: 0, skipped: 0, failed: 0 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("ຖາມ findMany ດ້ວຍ status PENDING_PAYMENT ແລະ reservedUntil < now", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { order: { findMany } } as unknown as PrismaClient;
    await expireReservationsJob(db, { error: vi.fn() }, { now, limit: 7 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING_PAYMENT", reservedUntil: { lt: now } }),
        take: 7,
      }),
    );
  });
});

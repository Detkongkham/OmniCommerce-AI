import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { cleanupRefreshTokens } from "./cleanup-refresh-tokens.processor";

describe("cleanupRefreshTokens", () => {
  it("deletes tokens expired > 1 day ago or revoked > 7 days ago and returns the count", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 4 });
    const db = { refreshToken: { deleteMany } } as unknown as PrismaClient;
    const now = new Date("2026-10-10T03:00:00.000Z");

    const result = await cleanupRefreshTokens(db, now);

    expect(result).toEqual({ deleted: 4 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: new Date("2026-10-09T03:00:00.000Z") } },
          { revokedAt: { lt: new Date("2026-10-03T03:00:00.000Z") } },
        ],
      },
    });
  });
});

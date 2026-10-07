import type { PrismaClient } from "@oca/database";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: number;
}

/** Delete refresh tokens expired more than 1 day ago, or revoked more than 7 days ago. */
export async function cleanupRefreshTokens(
  db: Pick<PrismaClient, "refreshToken">,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const { count } = await db.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } },
        { revokedAt: { lt: new Date(now.getTime() - 7 * DAY_MS) } },
      ],
    },
  });
  return { deleted: count };
}

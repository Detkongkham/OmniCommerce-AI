import type { PrismaClient } from "@oca/database";
import { LIVE_EVENTS_CHANNEL, type LiveEvent } from "@oca/shared";

export interface Publisher {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface WarnLogger {
  warn(message: string): void;
}

/**
 * ບິນ CF ທີ່ໝົດເວລາຈອງ (ຕັ້ງແຕ່ `since`) ຫຼຸດໂຄຕ້າ ແລະ ຍອດຈອງຂອງ session → ແຈ້ງ Host screen ຜ່ານຊ່ອງດຽວກັບ API.
 * publish ລົ້ມ = log ເທົ່ານັ້ນ (ໜ້າຈໍມີ poll ສຳຮອງ); ຄືນ sessionId ທີ່ພະຍາຍາມແຈ້ງ.
 */
export async function publishExpiredLiveSessions(
  db: PrismaClient,
  redis: Publisher,
  since: Date,
  logger: WarnLogger = console,
): Promise<string[]> {
  const rows = await db.order.findMany({
    where: { status: "EXPIRED", liveSessionId: { not: null }, updatedAt: { gte: since } },
    distinct: ["liveSessionId"],
    select: { liveSessionId: true },
  });
  const sessionIds = rows.flatMap((row) => (row.liveSessionId ? [row.liveSessionId] : []));
  for (const sessionId of sessionIds) {
    const event: LiveEvent = { type: "live.updated", sessionId };
    try {
      await redis.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (error) {
      logger.warn(`live event publish failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return sessionIds;
}

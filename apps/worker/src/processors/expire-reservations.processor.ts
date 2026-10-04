import {
  type ExpireReservationsOptions,
  type ExpireReservationsResult,
  type PrismaClient,
  runExpireReservations,
} from "@oca/database";

export interface ErrorLogger {
  error(message: string): void;
}

/**
 * ຄືນສະຕ໋ອກຂອງບິນ PENDING_PAYMENT ທີ່ເກີນ reservedUntil. Logic ຢູ່ໃນ @oca/database
 * (ທົດສອບກັບ Postgres ຈິງ); ຕົວນີ້ເພີ່ມແຕ່ການ log ບິນທີ່ພັງ.
 */
export function expireReservationsJob(
  db: PrismaClient,
  logger: ErrorLogger,
  options: ExpireReservationsOptions = {},
): Promise<ExpireReservationsResult> {
  return runExpireReservations(db, {
    ...options,
    onError: (orderId, error) => {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to expire order ${orderId}: ${reason}`);
    },
  });
}

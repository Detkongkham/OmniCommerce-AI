import type { PrismaClient } from "../generated/client";
import { releaseMany } from "./stock-engine";

/**
 * ປ່ຽນບິນ PENDING_PAYMENT ທີ່ເກີນ reservedUntil ເປັນ EXPIRED ແລະ ຄືນສະຕ໋ອກທີ່ຈອງ ໃນ transaction ດຽວ.
 * guard ໃນ WHERE (status + reservedUntil) ເຮັດໃຫ້ cancel / pay / expire ທີ່ແຂ່ງກັນ ມີຜູ້ຊະນະຄົນດຽວ:
 * ຜູ້ແພ້ໄດ້ 0 ແຖວ ແລະ ບໍ່ຄືນສະຕ໋ອກຊ້ຳ. ຄືນ true ຖ້າບິນນີ້ຖືກ expire ໂດຍການເອີ້ນນີ້.
 */
export async function expireOrder(db: PrismaClient, orderId: string, now: Date = new Date()): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT", reservedUntil: { lt: now } },
      data: { status: "EXPIRED" },
    });
    if (count === 0) return false;

    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { variantId: true, warehouseId: true, quantity: true },
    });
    await releaseMany(tx, items, { orderId });
    return true;
  });
}

/** ບິນທີ່ໝົດເວລາແລ້ວ ເກົ່າສຸດກ່ອນ (ໃຊ້ index (status, reservedUntil)). */
export async function findExpiredOrderIds(
  db: PrismaClient,
  now: Date,
  limit: number,
  excludeIds: readonly string[] = [],
): Promise<string[]> {
  const rows = await db.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      reservedUntil: { lt: now },
      ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
    },
    orderBy: { reservedUntil: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export interface ExpireReservationsOptions {
  now?: Date;
  /** ຈຳນວນບິນຕໍ່ຮອບ */
  limit?: number;
  /** ຈຳນວນຮອບສູງສຸດຕໍ່ການເອີ້ນ 1 ຄັ້ງ */
  maxRounds?: number;
  onError?: (orderId: string, error: unknown) => void;
  /** ໃຊ້ແທນ expireOrder (ສຳລັບ test) */
  expire?: (db: PrismaClient, orderId: string, now: Date) => Promise<boolean>;
}

export interface ExpireReservationsResult {
  expired: number;
  skipped: number;
  failed: number;
}

/**
 * ລ້າງບິນທີ່ໝົດເວລາທັງໝົດ (ສູງສຸດ maxRounds x limit ບິນ). ບິນໜຶ່ງ throw → ບັນທຶກ ແລະ ຂ້າມ
 * (ບໍ່ລອງຊ້ຳໃນການເອີ້ນນີ້) ເພື່ອບໍ່ໃຫ້ບິນທີ່ພັງຂັດຂວາງບິນອື່ນ.
 */
export async function runExpireReservations(
  db: PrismaClient,
  options: ExpireReservationsOptions = {},
): Promise<ExpireReservationsResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const maxRounds = options.maxRounds ?? 10;
  const expire = options.expire ?? expireOrder;

  const result: ExpireReservationsResult = { expired: 0, skipped: 0, failed: 0 };
  const failedIds: string[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const ids = await findExpiredOrderIds(db, now, limit, failedIds);
    if (ids.length === 0) break;

    for (const id of ids) {
      try {
        if (await expire(db, id, now)) result.expired += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        failedIds.push(id);
        options.onError?.(id, error);
      }
    }
    if (ids.length < limit) break;
  }
  return result;
}

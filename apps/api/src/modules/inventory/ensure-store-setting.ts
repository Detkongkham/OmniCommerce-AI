import type { Prisma, PrismaClient } from "@oca/database";

export const DEFAULT_STORE_NAME = "OCA Store";

export type StoreSettingRow = Awaited<ReturnType<PrismaClient["storeSetting"]["findUniqueOrThrow"]>>;

/**
 * ຄືນແຖວ StoreSetting (id 1), ສ້າງຄ່າເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ກໍລະນີຍັງບໍ່ໄດ້ run seed).
 * ໃຊ້ INSERT ... ON CONFLICT DO NOTHING (createMany + skipDuplicates) ແທນ upsert ຂອງ Prisma
 * ເພາະ upsert ທີ່ແຂ່ງກັນຕອນຍັງບໍ່ມີແຖວ ໄດ້ P2002 (unique violation).
 */
export async function ensureStoreSetting(
  db: Pick<PrismaClient, "storeSetting"> | Prisma.TransactionClient,
): Promise<StoreSettingRow> {
  await db.storeSetting.createMany({ data: [{ id: 1, name: DEFAULT_STORE_NAME }], skipDuplicates: true });
  return db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
}

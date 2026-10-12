import { type PrismaClient, type RecomputeTiersResult, runRecomputeMemberTiers } from "@oca/database";

/**
 * ຄິດລະດັບສະມາຊິກໃໝ່ປະຈຳຄືນ (ຫຼຸດລະດັບຄົນທີ່ຍອດຊື້ຕົກອອກຈາກ 12 ເດືອນ). Logic ຢູ່ໃນ @oca/database
 * (ທົດສອບກັບ Postgres ຈິງໃນ apps/api/test/loyalty.e2e.test.ts); `run` ປ່ຽນໄດ້ສຳລັບ test.
 */
export function recomputeMemberTiersJob(
  db: PrismaClient,
  run: (db: PrismaClient) => Promise<RecomputeTiersResult> = runRecomputeMemberTiers,
): Promise<RecomputeTiersResult> {
  return run(db);
}

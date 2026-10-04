import type { PrismaClient } from "../generated/client";

export type SeedStoreDb = Pick<PrismaClient, "storeSetting" | "warehouse">;

export interface SeedStoreInput {
  storeName: string;
}

export const DEFAULT_WAREHOUSE_CODE = "MAIN";

/** Run ຊ້ຳໄດ້: ບໍ່ຂຽນທັບຊື່ຮ້ານ ແລະ ບໍ່ສ້າງສາງ default ຊ້ຳ. */
export async function seedStore(db: SeedStoreDb, input: SeedStoreInput): Promise<void> {
  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1, name: input.storeName },
    update: {},
  });

  const existingDefault = await db.warehouse.findFirst({ where: { isDefault: true } });
  if (existingDefault) return;

  await db.warehouse.upsert({
    where: { code: DEFAULT_WAREHOUSE_CODE },
    create: { code: DEFAULT_WAREHOUSE_CODE, name: "ສາງຫຼັກ", isDefault: true },
    update: { isDefault: true },
  });
}

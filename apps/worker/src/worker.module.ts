import { Module } from "@nestjs/common";
import { LocalDiskStorage, createSlipReader } from "@oca/ai-engine";
import { AppConfigModule } from "./config/config.module";
import { ENV, type Env } from "./config/env";
import { InventoryWorker } from "./processors/inventory.worker";
import { MaintenanceWorker } from "./processors/maintenance.worker";
import { SLIP_READER, SLIP_STORAGE, SlipWorker } from "./processors/slip.worker";
import { SystemWorker } from "./processors/system.worker";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule, PrismaModule],
  providers: [
    SystemWorker,
    MaintenanceWorker,
    InventoryWorker,
    SlipWorker,
    { provide: SLIP_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.SLIP_STORAGE_DIR) },
    {
      // SLIP_READER ທີ່ບໍ່ຮູ້ຈັກ → createSlipReader throw ຕອນ boot (ລົ້ມທັນທີ ບໍ່ລໍຖ້າ job ທຳອິດ)
      provide: SLIP_READER,
      inject: [ENV],
      useFactory: (env: Env) =>
        createSlipReader({ SLIP_READER: env.SLIP_READER, SLIP_FAKE_RESULT: env.SLIP_FAKE_RESULT }),
    },
  ],
})
export class WorkerModule {}

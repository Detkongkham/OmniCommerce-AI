import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { InventoryWorker } from "./processors/inventory.worker";
import { MaintenanceWorker } from "./processors/maintenance.worker";
import { SystemWorker } from "./processors/system.worker";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule, PrismaModule],
  providers: [SystemWorker, MaintenanceWorker, InventoryWorker],
})
export class WorkerModule {}

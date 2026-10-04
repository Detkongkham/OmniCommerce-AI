import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { SystemWorker } from "./processors/system.worker";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule],
  providers: [SystemWorker],
})
export class WorkerModule {}

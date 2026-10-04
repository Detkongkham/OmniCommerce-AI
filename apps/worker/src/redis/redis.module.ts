import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";

export const REDIS = Symbol("REDIS");

class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // BullMQ ຕ້ອງການ maxRetriesPerRequest: null ສຳລັບ Worker
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}

import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";
import { JOB_CLEANUP_REFRESH_TOKENS, QUEUE_MAINTENANCE } from "../queues/names";
import { REDIS } from "../redis/redis.module";
import { cleanupRefreshTokens } from "./cleanup-refresh-tokens.processor";

@Injectable()
export class MaintenanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceWorker.name);
  private worker: Worker | undefined;
  private queue: Queue | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(QUEUE_MAINTENANCE, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: this.env.WORKER_CONCURRENCY,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name}#${job?.id} failed: ${error.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.error(error.message);
    });
    await this.worker.waitUntilReady();

    this.queue = new Queue(QUEUE_MAINTENANCE, { connection: this.redis, prefix: this.env.QUEUE_PREFIX });
    // Daily at 03:00; upsert keeps this idempotent across restarts and multiple worker instances.
    await this.queue.upsertJobScheduler(
      JOB_CLEANUP_REFRESH_TOKENS,
      { pattern: "0 3 * * *" },
      { name: JOB_CLEANUP_REFRESH_TOKENS },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_CLEANUP_REFRESH_TOKENS: {
        const result = await cleanupRefreshTokens(this.prisma);
        this.logger.log(`Deleted ${result.deleted} stale refresh tokens`);
        return result;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }
}

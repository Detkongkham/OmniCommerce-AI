import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { JOB_PING, type PingData, QUEUE_SYSTEM } from "../queues/names";
import { REDIS } from "../redis/redis.module";
import { handlePing } from "./ping.processor";

@Injectable()
export class SystemWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemWorker.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(QUEUE_SYSTEM, (job) => this.process(job), {
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
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_PING:
        return handlePing(job.data as PingData);
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }
}

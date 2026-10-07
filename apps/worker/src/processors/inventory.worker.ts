import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";
import { JOB_EXPIRE_RESERVATIONS, QUEUE_INVENTORY } from "../queues/names";
import { REDIS } from "../redis/redis.module";
import { expireReservationsJob } from "./expire-reservations.processor";

const EXPIRE_INTERVAL_MS = 60_000;

@Injectable()
export class InventoryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryWorker.name);
  private worker: Worker | undefined;
  private queue: Queue | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    // concurrency 1: ບໍ່ໃຫ້ job ຄືນສະຕ໋ອກສອງອັນຊ້ອນກັນໃນ worker ດຽວ (ເຄື່ອງຈັກກັນຊ້ຳໃນລະດັບ DB ຢູ່ແລ້ວ)
    this.worker = new Worker(QUEUE_INVENTORY, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name}#${job?.id} failed: ${error.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.error(error.message);
    });
    await this.worker.waitUntilReady();

    this.queue = new Queue(QUEUE_INVENTORY, { connection: this.redis, prefix: this.env.QUEUE_PREFIX });
    // upsert ເຮັດໃຫ້ idempotent ເມື່ອ restart ຫຼືມີຫຼາຍ worker
    await this.queue.upsertJobScheduler(
      JOB_EXPIRE_RESERVATIONS,
      { every: EXPIRE_INTERVAL_MS },
      { name: JOB_EXPIRE_RESERVATIONS },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_EXPIRE_RESERVATIONS: {
        const result = await expireReservationsJob(this.prisma, this.logger);
        if (result.expired > 0 || result.failed > 0) {
          this.logger.log(
            `Expired ${result.expired} reservation(s), skipped ${result.skipped}, failed ${result.failed}`,
          );
        }
        return result;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }
}

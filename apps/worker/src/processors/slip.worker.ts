import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { SlipReader, StorageService } from "@oca/ai-engine";
import {
  type PrismaClient,
  SLIP_JOB_READ,
  SLIP_QUEUE_NAME,
  type SlipReadJobData,
  markSlipReadFailed,
} from "@oca/database";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";
import { REDIS } from "../redis/redis.module";
import { createReadSlipDeps, processReadSlip } from "./read-slip.processor";

export const SLIP_STORAGE = Symbol("SLIP_STORAGE");
export const SLIP_READER = Symbol("SLIP_READER");

/** reader ອາດໜັກ (GPU ໃນຂັ້ນ 2): ອ່ານພ້ອມກັນໄດ້ນ້ອຍ */
const SLIP_CONCURRENCY = 2;

export interface SlipJobFailedDeps {
  db: PrismaClient;
  markFailed: (db: PrismaClient, slipId: string) => Promise<boolean>;
  logger: { error(message: string): void; warn(message: string): void };
}

/**
 * ຕາໜ່າງຄວາມປອດໄພຕອນ event `failed`: ຖ້າ job ໝົດໂອກາດແລ້ວ ແຕ່ processor ບໍ່ໄດ້ mark (ເຊັ່ນ ລົ້ມເພາະ stalled ເກີນກຳນົດ)
 * ໃຫ້ mark READ_FAILED ຢ່າງສຸດຄວາມສາມາດ. markSlipReadFailed ມີເງື່ອນໄຂ PENDING_READ ຈຶ່ງ idempotent. ບໍ່ throw.
 */
export async function handleSlipJobFailed(
  deps: SlipJobFailedDeps,
  job: Pick<Job, "name" | "data" | "attemptsMade" | "opts"> | undefined,
  error: Error,
): Promise<void> {
  if (!job || job.name !== SLIP_JOB_READ) return;
  const { slipId } = (job.data ?? {}) as Partial<SlipReadJobData>;
  if (typeof slipId !== "string" || slipId === "") return;
  if (job.attemptsMade < (job.opts?.attempts ?? 1)) return; // ຍັງມີໂອກາດ retry
  try {
    if (await deps.markFailed(deps.db, slipId)) {
      deps.logger.warn(`Slip ${slipId}: marked READ_FAILED after job failure (${error.message})`);
    }
  } catch (markError) {
    const reason = markError instanceof Error ? markError.message : String(markError);
    deps.logger.error(`Failed to mark slip ${slipId} READ_FAILED: ${reason}`);
  }
}

@Injectable()
export class SlipWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlipWorker.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SLIP_STORAGE) private readonly storage: StorageService,
    @Inject(SLIP_READER) private readonly reader: SlipReader,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(SLIP_QUEUE_NAME, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: SLIP_CONCURRENCY,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name}#${job?.id} failed: ${error.message}`);
      void handleSlipJobFailed(
        { db: this.prisma, markFailed: markSlipReadFailed, logger: this.logger },
        job,
        error,
      );
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
    if (job.name !== SLIP_JOB_READ) throw new Error(`Unknown job: ${job.name}`);
    const { slipId } = job.data as Partial<SlipReadJobData>;
    if (typeof slipId !== "string" || slipId === "") throw new Error("Job data must include slipId");
    const outcome = await processReadSlip(createReadSlipDeps(this.prisma, this.storage, this.reader, this.logger), {
      slipId,
      attemptsMade: job.attemptsMade,
      attempts: job.opts.attempts,
    });
    if (outcome !== "read") this.logger.warn(`Slip ${slipId}: ${outcome}`);
    return outcome;
  }
}

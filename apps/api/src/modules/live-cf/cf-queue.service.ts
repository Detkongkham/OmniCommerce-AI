import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { ENV, type Env } from "../../config/env";
import { type CfCommentJob, CfProcessorService } from "./cf-processor.service";

export const QUEUE_CF_COMMENTS = "cf-comments";
const JOB_COMMENT = "comment";
const CONCURRENCY = 4;
const CLOSE_TIMEOUT_MS = 2000;

/** queue ຄອມເມັ້ນ CF ແລະ consumer ໃນ process ຂອງ API. ບໍ່ block ການ boot ເມື່ອ Redis ຍັງບໍ່ພ້ອມ (bullmq ຈະ reconnect ເອງ) */
@Injectable()
export class CfQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CfQueueService.name);
  private connection: Redis | undefined;
  private queue: Queue<CfCommentJob> | undefined;
  private worker: Worker<CfCommentJob> | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CfProcessorService) private readonly processor: CfProcessorService,
  ) {}

  onModuleInit(): void {
    // Worker ຕ້ອງ maxRetriesPerRequest: null (blocking commands)
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on("error", (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    const options = { connection: this.connection, prefix: this.env.QUEUE_PREFIX };
    this.queue = new Queue<CfCommentJob>(QUEUE_CF_COMMENTS, options);
    this.queue.on("error", (error) => this.logger.warn(`queue: ${error.message}`));
    this.worker = new Worker<CfCommentJob>(QUEUE_CF_COMMENTS, (job) => this.processor.process(job.data), {
      ...options,
      concurrency: CONCURRENCY,
    });
    this.worker.on("failed", (job, error) => this.logger.error(`job ${job?.id} failed: ${error.name}`));
    this.worker.on("error", (error) => this.logger.warn(`worker: ${error.message}`));
  }

  async add(job: CfCommentJob): Promise<void> {
    if (!this.queue) throw new Error("CF queue is not initialised");
    await this.queue.add(JOB_COMMENT, job, {
      // bullmq ຫ້າມ ":" ໃນ custom id; commentId ຂອງ Facebook ເປັນ "<ເລກ>_<ເລກ>" ຢູ່ແລ້ວ
      jobId: job.commentId.replaceAll(":", "_"),
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 1,
    });
  }

  async onModuleDestroy(): Promise<void> {
    const closing = Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))]);
    this.connection?.disconnect();
  }
}

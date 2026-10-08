import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_JOB_OPTIONS, type SlipReadJobData } from "@oca/database";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../../config/env";

export const SLIP_STORAGE = Symbol("SLIP_STORAGE");
export const SLIP_QUEUE = Symbol("SLIP_QUEUE");
export const SLIP_FETCH = Symbol("SLIP_FETCH");

/** ຝ່າຍ API ເປັນຜູ້ enqueue ເທົ່ານັ້ນ; worker ເປັນຜູ້ອ່ານ */
export interface SlipQueue {
  enqueueRead(slipId: string): Promise<void>;
}

type QueueEnv = Pick<Env, "REDIS_URL" | "QUEUE_PREFIX">;

interface QueueHandle {
  add(name: string, data: SlipReadJobData, options: typeof SLIP_READ_JOB_OPTIONS): Promise<unknown>;
  close(): Promise<unknown>;
}

const logger = new Logger("SlipQueue");

function createBullQueue(env: QueueEnv): QueueHandle {
  // ຈຳກັດ retry ເພື່ອບໍ່ໃຫ້ request ຄ້າງເມື່ອ Redis ຫາຍ
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  connection.on("error", (error: Error) => logger.warn(`Redis: ${error.message}`));
  const queue = new Queue(SLIP_QUEUE_NAME, { connection, prefix: env.QUEUE_PREFIX });
  return {
    add: (name, data, options) => queue.add(name, data, options),
    close: async () => {
      await queue.close();
      connection.disconnect();
    },
  };
}

/** ສ້າງ queue ແບບ lazy (ຕອນ enqueue ຄັ້ງທຳອິດ) ເພື່ອບໍ່ເຊື່ອມ Redis ເມື່ອບໍ່ມີການອັບໂຫຼດສະລິບ */
export class BullSlipQueue implements SlipQueue, OnModuleDestroy {
  private handle: QueueHandle | undefined;

  constructor(
    private readonly env: QueueEnv,
    private readonly createQueue: (env: QueueEnv) => QueueHandle = createBullQueue,
  ) {}

  async enqueueRead(slipId: string): Promise<void> {
    this.handle ??= this.createQueue(this.env);
    await this.handle.add(SLIP_JOB_READ, { slipId }, SLIP_READ_JOB_OPTIONS);
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}

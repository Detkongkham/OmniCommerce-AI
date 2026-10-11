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
  // ຈຳກັດ retry ແລະ ການ reconnect ເພື່ອບໍ່ໃຫ້ request ຄ້າງເມື່ອ Redis ຫາຍ (ເກີນ 3 ຄັ້ງຍອມແພ້)
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  connection.on("error", (error: Error) => logger.warn(`Redis: ${error.message}`));
  let queue: Queue;
  try {
    queue = new Queue(SLIP_QUEUE_NAME, { connection, prefix: env.QUEUE_PREFIX });
  } catch (error) {
    connection.disconnect();
    throw error;
  }
  return {
    add: (name, data, options) => queue.add(name, data, options),
    close: async () => {
      try {
        await queue.close();
      } finally {
        connection.disconnect();
      }
    },
  };
}

const DEFAULT_ADD_TIMEOUT_MS = 3000;

/** ສ້າງ queue ແບບ lazy (ຕອນ enqueue ຄັ້ງທຳອິດ) ເພື່ອບໍ່ເຊື່ອມ Redis ເມື່ອບໍ່ມີການອັບໂຫຼດສະລິບ */
export class BullSlipQueue implements SlipQueue, OnModuleDestroy {
  private handle: QueueHandle | undefined;
  private closed = false;
  private readonly addTimeoutMs: number;

  constructor(
    private readonly env: QueueEnv,
    private readonly createQueue: (env: QueueEnv) => QueueHandle = createBullQueue,
    options: { addTimeoutMs?: number } = {},
  ) {
    this.addTimeoutMs = options.addTimeoutMs ?? DEFAULT_ADD_TIMEOUT_MS;
  }

  async enqueueRead(slipId: string): Promise<void> {
    if (this.closed) throw new Error("Slip queue closed");
    const handle = (this.handle ??= this.createQueue(this.env));
    let timer: NodeJS.Timeout | undefined;
    try {
      // bullmq add ອາດລໍຖ້າ Redis ຕະຫຼອດໄປ: ຕັດດ້ວຍ timeout ບໍ່ໃຫ້ request ຄ້າງ
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Slip queue unavailable: add timed out")), this.addTimeoutMs);
      });
      await Promise.race([handle.add(SLIP_JOB_READ, { slipId }, SLIP_READ_JOB_OPTIONS), timeout]);
    } catch (error) {
      // ຖິ້ມ handle ທີ່ອາດຕາຍແລ້ວ ເພື່ອຄັ້ງຕໍ່ໄປສ້າງການເຊື່ອມຕໍ່ໃໝ່
      if (this.handle === handle) this.handle = undefined;
      handle.close().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    const handle = this.handle;
    this.handle = undefined;
    await handle?.close();
  }
}

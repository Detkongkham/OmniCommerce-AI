import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_JOB_OPTIONS } from "@oca/database";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRISMA } from "../src/prisma/prisma.module";
import { SLIP_READER, SLIP_STORAGE } from "../src/processors/slip.worker";
import { WorkerModule } from "../src/worker.module";

describe("SlipWorker (integration, Redis ຈິງ, prisma/storage/reader stub)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;

  // prisma stub ຂະໜາດນ້ອຍ: ພຽງພໍສຳລັບ processReadSlip + storeSlipReadResult + evaluateSlip
  const slipRow = {
    id: "s1",
    imageKey: "slips/k",
    imageMime: "image/png",
    imageSha256: "a".repeat(64),
    status: "PENDING_READ",
    order: null,
    readAmount: { toFixed: () => "100.00" },
    readCurrency: "LAK",
    readPaidAt: null,
    readDestAccount: null,
    readRefNo: "R1",
    confirmedAmount: null,
    confirmedCurrency: null,
    confirmedPaidAt: null,
    confirmedRefNo: null,
    confirmedDestAccount: null,
  };
  const updateMany = vi.fn();
  const paymentSlip = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany,
  };
  const prismaStub: Record<string, unknown> = {
    paymentSlip,
    storeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    order: { findMany: vi.fn().mockResolvedValue([]) },
    $disconnect: async () => undefined,
  };
  // storeSlipReadResult ໃຊ້ db.$transaction(async tx => ...): ສົ່ງ stub ເອງເປັນ tx
  prismaStub.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(prismaStub);
  const read = vi.fn();
  const get = vi.fn();

  let app: INestApplicationContext;
  let producer: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    expect(redisUrl, "REDIS_URL must be set (copy .env.example to .env)").toBeTruthy();
    // ປ້ອງກັນ: ຫ້າມແຕະ Redis 6379 ຂອງຜູ້ໃຊ້
    expect(new URL(redisUrl).port, "REDIS_URL must not be the user's Redis (6379)").not.toBe("6379");
    process.env.QUEUE_PREFIX = prefix;

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PRISMA)
      .useValue(prismaStub)
      .overrideProvider(SLIP_STORAGE)
      .useValue({ put: vi.fn(), get })
      .overrideProvider(SLIP_READER)
      .useValue({ name: "fake", version: "1", read })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(SLIP_QUEUE_NAME, { connection: producer, prefix });
    events = new QueueEvents(SLIP_QUEUE_NAME, { connection: eventsConnection, prefix });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await events?.close();
    await queue?.obliterate({ force: true });
    await queue?.close();
    await app?.close();
    producer?.disconnect();
    eventsConnection?.disconnect();
    delete process.env.QUEUE_PREFIX;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    paymentSlip.findUnique.mockResolvedValue(slipRow);
    paymentSlip.findMany.mockResolvedValue([]);
    paymentSlip.findFirst.mockResolvedValue(null);
    paymentSlip.update.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 1 });
    get.mockResolvedValue({ bytes: new Uint8Array([1]), mime: "image/png" });
  });

  it("ປະມວນຜົນ job read-slip: ອ່ານຮູບ, ເອີ້ນ reader, ບັນທຶກ READ", async () => {
    read.mockResolvedValue({ amount: "100", refNo: "R1", raw: {} });
    const job = await queue.add(SLIP_JOB_READ, { slipId: "s1" }, SLIP_READ_JOB_OPTIONS);
    await job.waitUntilFinished(events, 10_000);
    expect(get).toHaveBeenCalledWith("slips/k");
    expect(read).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: "PENDING_READ" },
        data: expect.objectContaining({ status: "READ", readerName: "fake" }),
      }),
    );
    expect(paymentSlip.update).toHaveBeenCalled(); // evaluateSlip ບັນທຶກ flags
  });

  it("reader ລົ້ມ ແລະ ບໍ່ມີໂອກາດ retry (attempts: 1) → job ລົ້ມ ແລະ ສະລິບເປັນ READ_FAILED", async () => {
    read.mockRejectedValue(new Error("model down"));
    const job = await queue.add(SLIP_JOB_READ, { slipId: "s1" }, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("model down");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", status: "PENDING_READ" }, data: { status: "READ_FAILED" } }),
    );
    // event 'failed' (ຕາໜ່າງຄວາມປອດໄພ) mark ຊ້ຳແບບ idempotent: ລໍໃຫ້ຈົບກ່ອນ test ຖັດໄປ ບໍ່ໃຫ້ຮົ່ວຂ້າມ test
    await vi.waitFor(() => expect(updateMany).toHaveBeenCalledTimes(2));
  });

  it("job ທີ່ data ຜິດ (ບໍ່ມີ slipId) → ລົ້ມ ໂດຍບໍ່ແຕະ DB", async () => {
    const job = await queue.add(SLIP_JOB_READ, {} as never, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("slipId");
    expect(paymentSlip.findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("job ຊື່ທີ່ບໍ່ຮູ້ຈັກ → ລົ້ມ", async () => {
    const job = await queue.add("nope", { slipId: "s1" }, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job");
  });
});

describe("WorkerModule boot", () => {
  it("SLIP_READER ທີ່ບໍ່ຮູ້ຈັກ → boot ລົ້ມດ້ວຍຂໍ້ຄວາມຊັດເຈນ", async () => {
    const previous = process.env.SLIP_READER;
    process.env.SLIP_READER = "nope";
    try {
      await expect(Test.createTestingModule({ imports: [WorkerModule] }).compile()).rejects.toThrow(
        "Unknown SLIP_READER",
      );
    } finally {
      if (previous === undefined) delete process.env.SLIP_READER;
      else process.env.SLIP_READER = previous;
    }
  });
});

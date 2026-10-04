import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PRISMA } from "../src/prisma/prisma.module";
import { JOB_EXPIRE_RESERVATIONS, QUEUE_INVENTORY } from "../src/queues/names";
import { WorkerModule } from "../src/worker.module";

describe("InventoryWorker (integration, Redis ຈິງ, prisma stub)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;
  const findMany = vi.fn().mockResolvedValue([]);
  let app: INestApplicationContext;
  let producer: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    expect(redisUrl, "REDIS_URL must be set (copy .env.example to .env)").toBeTruthy();
    process.env.QUEUE_PREFIX = prefix;

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PRISMA)
      .useValue({ order: { findMany }, $disconnect: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_INVENTORY, { connection: producer, prefix });
    events = new QueueEvents(QUEUE_INVENTORY, { connection: eventsConnection, prefix });
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

  it("ລົງທະບຽນ schedule ທຸກ 60 ວິນາທີ ຕອນເລີ່ມ", async () => {
    const scheduler = await queue.getJobScheduler(JOB_EXPIRE_RESERVATIONS);
    expect(scheduler).toMatchObject({ name: JOB_EXPIRE_RESERVATIONS, every: 60_000 });
  });

  it("ຣັນ job ແລະ ຄືນຜົນນັບ (ບໍ່ມີບິນໝົດເວລາ = 0 ທັງໝົດ)", async () => {
    const job = await queue.add(JOB_EXPIRE_RESERVATIONS, {});
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toEqual({ expired: 0, skipped: 0, failed: 0 });
    expect(findMany).toHaveBeenCalled();
  });

  it("job ທີ່ບໍ່ຮູ້ຈັກ fail ພ້ອມເຫດຜົນ", async () => {
    const bad = await queue.add("nope", {}, { attempts: 1 });
    await expect(bad.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job: nope");
  });
});

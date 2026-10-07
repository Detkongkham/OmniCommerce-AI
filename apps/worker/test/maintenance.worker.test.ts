import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JOB_CLEANUP_REFRESH_TOKENS, QUEUE_MAINTENANCE } from "../src/queues/names";
import { PRISMA } from "../src/prisma/prisma.module";
import { WorkerModule } from "../src/worker.module";

describe("MaintenanceWorker (integration, Redis ຈິງ, prisma stub)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;
  const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
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
      .useValue({ refreshToken: { deleteMany }, $disconnect: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_MAINTENANCE, { connection: producer, prefix });
    events = new QueueEvents(QUEUE_MAINTENANCE, { connection: eventsConnection, prefix });
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

  it("registers the daily 03:00 cleanup schedule on startup", async () => {
    const scheduler = await queue.getJobScheduler(JOB_CLEANUP_REFRESH_TOKENS);
    expect(scheduler).toMatchObject({ pattern: "0 3 * * *", name: JOB_CLEANUP_REFRESH_TOKENS });
  });

  it("runs the cleanup job and returns the deleted count", async () => {
    const job = await queue.add(JOB_CLEANUP_REFRESH_TOKENS, {});
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toEqual({ deleted: 3 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it("fails unknown jobs with a clear reason", async () => {
    const bad = await queue.add("nope", {}, { attempts: 1 });
    await expect(bad.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job: nope");
  });
});

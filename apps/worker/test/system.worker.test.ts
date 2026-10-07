import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JOB_PING, QUEUE_SYSTEM } from "../src/queues/names";
import { WorkerModule } from "../src/worker.module";

describe("SystemWorker (integration, Redis ຈິງ)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;
  let app: INestApplicationContext;
  let producer: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    expect(redisUrl, "REDIS_URL must be set (copy .env.example to .env)").toBeTruthy();
    process.env.QUEUE_PREFIX = prefix;

    app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_SYSTEM, { connection: producer, prefix });
    events = new QueueEvents(QUEUE_SYSTEM, { connection: eventsConnection, prefix });
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

  it("ປະມວນຜົນ job ping ແລະ ຄືນ pong", async () => {
    const job = await queue.add(JOB_PING, { message: "hello" });
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toMatchObject({ pong: true, message: "hello" });
  });

  it("job ທີ່ບໍ່ຮູ້ຈັກ fail ພ້ອມເຫດຜົນ ແລະ worker ຍັງເຮັດວຽກຕໍ່", async () => {
    const bad = await queue.add("nope", {}, { attempts: 1 });
    await expect(bad.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job: nope");

    const again = await queue.add(JOB_PING, {});
    await expect(again.waitUntilFinished(events, 10_000)).resolves.toMatchObject({ pong: true, message: "ping" });
  });
});

import type { PrismaClient } from "@oca/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { HealthService } from "./health.service";

describe("HealthService caching", () => {
  let queries: number;
  let service: HealthService;
  let redisChecks: number;

  beforeEach(() => {
    vi.useFakeTimers();
    queries = 0;
    redisChecks = 0;
    const prisma = {
      $queryRaw: async () => {
        queries++;
        return [{ "?column?": 1 }];
      },
    } as unknown as PrismaClient;
    service = new HealthService(prisma, { REDIS_URL: "redis://127.0.0.1:1" } as Env);
    vi.spyOn(service as unknown as { checkRedis(): Promise<boolean> }, "checkRedis").mockImplementation(async () => {
      redisChecks++;
      return true;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one in-flight check between concurrent callers", async () => {
    const [a, b] = await Promise.all([service.check(), service.check()]);
    expect(a).toEqual({ db: true, redis: true });
    expect(b).toEqual(a);
    expect(queries).toBe(1);
    expect(redisChecks).toBe(1);
  });

  it("serves the cached result within 2s and recomputes afterwards", async () => {
    await service.check();
    vi.advanceTimersByTime(1900);
    await service.check();
    expect(queries).toBe(1);
    vi.advanceTimersByTime(200);
    await service.check();
    expect(queries).toBe(2);
    expect(redisChecks).toBe(2);
  });
});

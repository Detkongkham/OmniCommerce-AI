import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";

export interface HealthResult {
  db: boolean;
  redis: boolean;
}

const CACHE_MS = 2000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cached: { at: number; result: HealthResult } | null = null;
  private inFlight: Promise<HealthResult> | null = null;

  /** Public endpoint: cache for CACHE_MS and share one in-flight check so hits cannot amplify DB/Redis load. */
  async check(): Promise<HealthResult> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.result;
    this.inFlight ??= this.compute().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async compute(): Promise<HealthResult> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const result = { db, redis };
    this.cached = { at: Date.now(), result };
    return result;
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
      return (await client.ping()) === "PONG";
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }
}

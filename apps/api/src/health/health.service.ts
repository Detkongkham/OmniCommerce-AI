import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";

export interface HealthResult {
  db: boolean;
  redis: boolean;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<HealthResult> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    return { db, redis };
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

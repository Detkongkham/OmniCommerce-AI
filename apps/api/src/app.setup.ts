import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Env } from "./config/env";

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureApp(app: INestApplication, env: Env): void {
  const httpAdapter = app.getHttpAdapter().getInstance() as { set(setting: string, value: unknown): void };
  httpAdapter.set("trust proxy", env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: parseCorsOrigins(env.CORS_ORIGIN), credentials: true });
  app.enableShutdownHooks();
}

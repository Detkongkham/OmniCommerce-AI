import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { Env } from "./config/env";

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureApp(app: INestApplication, env: Env): void {
  app.use(cookieParser());
  app.enableCors({ origin: parseCorsOrigins(env.CORS_ORIGIN), credentials: true });
  app.enableShutdownHooks();
}

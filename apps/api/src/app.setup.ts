import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
  // batch ຂອງ Meta ອາດເກີນ 100kb (default ຂອງ express). req.rawBody (ກວດລາຍເຊັນ webhook) ຕ້ອງການ
  // option `rawBody: true` ຕອນ NestFactory.create / createNestApplication (main.ts, test/helpers.ts)
  (app as NestExpressApplication).useBodyParser("json", { limit: "1mb" });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: parseCorsOrigins(env.CORS_ORIGIN), credentials: true });
  app.enableShutdownHooks();
}

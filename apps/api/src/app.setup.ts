import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { Env } from "./config/env";

export function configureApp(app: INestApplication, env: Env): void {
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGIN.split(","), credentials: true });
  app.enableShutdownHooks();
}

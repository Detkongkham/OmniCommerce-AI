import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log("Worker started");
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

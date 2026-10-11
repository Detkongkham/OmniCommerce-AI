import { z } from "zod";

/** ຄ່າວ່າງ ("KEY=" ໃນ .env) ຖືວ່າບໍ່ໄດ້ຕັ້ງ (ຄືກັບ API) */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // ຕ້ອງຄືກັບ API
  QUEUE_PREFIX: z.preprocess(emptyToUndefined, z.string().min(1).default("oca")),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // ຕ້ອງຊີ້ບ່ອນດຽວກັບ API (ເບິ່ງ apps/api/src/config/env.ts)
  SLIP_STORAGE_DIR: z.preprocess(emptyToUndefined, z.string().min(1).default("../../.data/slips")),
  SLIP_READER: z.preprocess(emptyToUndefined, z.string().min(1).default("fake")),
  SLIP_FAKE_RESULT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

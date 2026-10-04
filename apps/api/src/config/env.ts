import { z } from "zod";

const PLACEHOLDER_SECRET_PREFIXES = ["dev-only", "test-secret"];

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === "production" &&
      PLACEHOLDER_SECRET_PREFIXES.some((prefix) => env.JWT_ACCESS_SECRET.startsWith(prefix))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET must not be a placeholder value in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

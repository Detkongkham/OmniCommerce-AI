import { z } from "zod";

const PLACEHOLDER_SECRET_PREFIXES = ["dev-only", "test-secret"];

/**
 * "false" -> false; a non-negative integer -> number of trusted proxy hops.
 * "true" (trust everything) is deliberately rejected: it allows X-Forwarded-For spoofing.
 */
const trustProxySchema = z
  .string()
  .default("false")
  .transform((value, ctx): false | number => {
    if (value === "false") return false;
    if (/^\d+$/.test(value)) return Number(value);
    ctx.addIssue({
      code: "custom",
      message: 'TRUST_PROXY must be "false" or a non-negative integer number of proxy hops (never "true")',
    });
    return z.NEVER;
  });

/** ຄ່າວ່າງ ("") ຖືວ່າບໍ່ໄດ້ຕັ້ງ (.env.example ມີແຖວວ່າງ) */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

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
    LOGIN_EMAIL_MAX_FAILURES: z.coerce.number().int().positive().default(10),
    LOGIN_EMAIL_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    TRUST_PROXY: trustProxySchema,
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    REFRESH_COOKIE_PATH: z.string().startsWith("/").default("/auth"),
    FACEBOOK_APP_SECRET: optionalString,
    FACEBOOK_WEBHOOK_VERIFY_TOKEN: optionalString,
    FACEBOOK_PAGE_ACCESS_TOKEN: optionalString,
    // ຊີ້ໄປ simulator ໃນ dev; ບໍ່ຕັ້ງ = https://graph.facebook.com/v21.0
    FACEBOOK_GRAPH_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
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

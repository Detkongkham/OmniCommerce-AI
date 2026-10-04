import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://x",
  REDIS_URL: "redis://x",
  JWT_ACCESS_SECRET: "a".repeat(32),
};

describe("parseEnv", () => {
  it("ໃຊ້ຄ່າ default", () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.LOGIN_RATE_LIMIT).toBe(10);
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });

  it("ແປງຕົວເລກຈາກ string", () => {
    expect(parseEnv({ ...base, PORT: "4000", LOGIN_RATE_LIMIT: "3" })).toMatchObject({
      PORT: 4000,
      LOGIN_RATE_LIMIT: 3,
    });
  });

  it("ປະຕິເສດ secret ສັ້ນກວ່າ 32 ແລະ ຂາດ DATABASE_URL", () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: "short" })).toThrow();
    expect(() => parseEnv({ REDIS_URL: "redis://x", JWT_ACCESS_SECRET: "a".repeat(32) })).toThrow();
  });
});

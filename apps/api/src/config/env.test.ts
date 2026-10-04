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

  it("rejects placeholder JWT secrets in production only", () => {
    const dev = { ...base, JWT_ACCESS_SECRET: `dev-only-${"x".repeat(32)}` };
    const test = { ...base, JWT_ACCESS_SECRET: `test-secret-${"x".repeat(32)}` };
    expect(() => parseEnv({ ...dev, NODE_ENV: "production" })).toThrow();
    expect(() => parseEnv({ ...test, NODE_ENV: "production" })).toThrow();
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).not.toThrow();
    expect(() => parseEnv({ ...dev, NODE_ENV: "development" })).not.toThrow();
    expect(() => parseEnv(test)).not.toThrow();
  });

  it("parses TRUST_PROXY: default false, hop count, rejects everything else", () => {
    expect(parseEnv(base).TRUST_PROXY).toBe(false);
    expect(parseEnv({ ...base, TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
    expect(parseEnv({ ...base, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(0);
    expect(parseEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
    for (const bad of ["true", "-1", "1.5", "loopback", "", "1 "]) {
      expect(() => parseEnv({ ...base, TRUST_PROXY: bad })).toThrow(/TRUST_PROXY/);
    }
  });

  it("has per-email login lockout defaults and parses overrides", () => {
    const env = parseEnv(base);
    expect(env.LOGIN_EMAIL_MAX_FAILURES).toBe(10);
    expect(env.LOGIN_EMAIL_WINDOW_MINUTES).toBe(15);
    expect(parseEnv({ ...base, LOGIN_EMAIL_MAX_FAILURES: "3", LOGIN_EMAIL_WINDOW_MINUTES: "5" })).toMatchObject({
      LOGIN_EMAIL_MAX_FAILURES: 3,
      LOGIN_EMAIL_WINDOW_MINUTES: 5,
    });
  });
});

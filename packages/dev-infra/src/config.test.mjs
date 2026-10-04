import { describe, expect, it } from "vitest";
import { describeUrls, parseConfig } from "./config.mjs";

describe("parseConfig", () => {
  it("uses defaults", () => {
    expect(parseConfig({}, "/repo")).toEqual({
      postgresPort: 5432,
      redisPort: 6379,
      dataDir: "/repo/.local/postgres",
      user: "oca",
      password: "oca",
      database: "oca",
    });
  });
  it("applies overrides", () => {
    const c = parseConfig({ POSTGRES_PORT: "5433", REDIS_PORT: "6380", DEV_INFRA_DATA_DIR: "/x" }, "/repo");
    expect(c.postgresPort).toBe(5433);
    expect(c.redisPort).toBe(6380);
    expect(c.dataDir).toBe("/x");
  });
  it.each(["abc", "0", "65536", "-1", "12.5"])("rejects invalid port %s", (v) => {
    expect(() => parseConfig({ POSTGRES_PORT: v }, "/r")).toThrow(/POSTGRES_PORT/);
    expect(() => parseConfig({ REDIS_PORT: v }, "/r")).toThrow(/REDIS_PORT/);
  });
});

describe("describeUrls", () => {
  it("builds URLs", () => {
    const urls = describeUrls(parseConfig({ POSTGRES_PORT: "5440", REDIS_PORT: "6390" }, "/r"));
    expect(urls.DATABASE_URL).toBe("postgresql://oca:oca@localhost:5440/oca");
    expect(urls.REDIS_URL).toBe("redis://localhost:6390");
  });
});

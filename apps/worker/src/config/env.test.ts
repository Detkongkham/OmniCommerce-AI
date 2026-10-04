import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("ໃຊ້ຄ່າ default", () => {
    const env = parseEnv({ REDIS_URL: "redis://x" });
    expect(env.QUEUE_PREFIX).toBe("oca");
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.NODE_ENV).toBe("development");
  });

  it("ແປງຕົວເລກຈາກ string", () => {
    expect(parseEnv({ REDIS_URL: "redis://x", WORKER_CONCURRENCY: "2" }).WORKER_CONCURRENCY).toBe(2);
  });

  it("ປະຕິເສດເມື່ອຂາດ REDIS_URL ຫຼື concurrency ບໍ່ຖືກຕ້ອງ", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ REDIS_URL: "redis://x", WORKER_CONCURRENCY: "0" })).toThrow();
  });
});

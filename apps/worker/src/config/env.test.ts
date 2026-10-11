import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = { REDIS_URL: "redis://x", DATABASE_URL: "postgresql://x" };

describe("parseEnv", () => {
  it("ໃຊ້ຄ່າ default", () => {
    const env = parseEnv({ ...base });
    expect(env.QUEUE_PREFIX).toBe("oca");
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.NODE_ENV).toBe("development");
  });

  it("ແປງຕົວເລກຈາກ string", () => {
    expect(parseEnv({ ...base, WORKER_CONCURRENCY: "2" }).WORKER_CONCURRENCY).toBe(2);
  });

  it("ປະຕິເສດເມື່ອຂາດ REDIS_URL ຫຼື concurrency ບໍ່ຖືກຕ້ອງ", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ REDIS_URL: "redis://x" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...base, WORKER_CONCURRENCY: "0" })).toThrow();
  });

  it("SLIP_*: ຄ່າເລີ່ມຕົ້ນ ແລະ ອ່ານຄ່າທີ່ຕັ້ງ; SLIP_FAKE_RESULT ວ່າງ = ບໍ່ຕັ້ງ", () => {
    const defaults = parseEnv(base);
    expect(defaults.SLIP_STORAGE_DIR).toBe("../../.data/slips");
    expect(defaults.SLIP_READER).toBe("fake");
    expect(defaults.SLIP_FAKE_RESULT).toBeUndefined();
    const set = parseEnv({ ...base, SLIP_STORAGE_DIR: "/d", SLIP_READER: "x", SLIP_FAKE_RESULT: "" });
    expect(set.SLIP_STORAGE_DIR).toBe("/d");
    expect(set.SLIP_READER).toBe("x");
    expect(set.SLIP_FAKE_RESULT).toBeUndefined();
  });

  it("ຄ່າວ່າງ (KEY=) ຖືວ່າບໍ່ໄດ້ຕັ້ງ ສຳລັບ QUEUE_PREFIX/SLIP_STORAGE_DIR/SLIP_READER → ໃຊ້ default", () => {
    const env = parseEnv({ ...base, QUEUE_PREFIX: "", SLIP_STORAGE_DIR: "", SLIP_READER: "", SLIP_FAKE_RESULT: "" });
    expect(env.QUEUE_PREFIX).toBe("oca");
    expect(env.SLIP_STORAGE_DIR).toBe("../../.data/slips");
    expect(env.SLIP_READER).toBe("fake");
    expect(env.SLIP_FAKE_RESULT).toBeUndefined();
  });

  it("SLIP_FAKE_RESULT ທີ່ຕັ້ງຄ່າ ຖືກສົ່ງຕໍ່", () => {
    expect(parseEnv({ ...base, SLIP_FAKE_RESULT: '{"amount":"1"}' }).SLIP_FAKE_RESULT).toBe('{"amount":"1"}');
  });
});

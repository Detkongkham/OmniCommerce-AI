import type { PrismaClient } from "@oca/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseName, testDatabaseUrl } from "./env";
import { resetDb } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("testDatabaseName", () => {
  it("defaults to oca_test when OCA_TEST_DB is unset or empty", () => {
    vi.stubEnv("OCA_TEST_DB", undefined);
    expect(testDatabaseName()).toBe("oca_test");
    vi.stubEnv("OCA_TEST_DB", "");
    expect(testDatabaseName()).toBe("oca_test");
  });

  it("accepts oca_test and oca_test_<suffix>", () => {
    vi.stubEnv("OCA_TEST_DB", "oca_test_slip_2");
    expect(testDatabaseName()).toBe("oca_test_slip_2");
    vi.stubEnv("OCA_TEST_DB", "oca_test");
    expect(testDatabaseName()).toBe("oca_test");
  });

  it.each(["oca", "postgres", "oca_testing", "oca_test_", "oca_test_A", "oca_test-x", 'oca_test_x"; DROP', "prod_oca_test"])(
    "rejects %s",
    (bad) => {
      vi.stubEnv("OCA_TEST_DB", bad);
      expect(() => testDatabaseName()).toThrow(/OCA_TEST_DB/);
    },
  );
});

describe("testDatabaseUrl", () => {
  it("uses OCA_TEST_DB for the database name", () => {
    vi.stubEnv("OCA_TEST_DB", "oca_test_slip");
    const url = new URL(testDatabaseUrl("postgresql://oca:oca@localhost:5433/oca"));
    expect(url.pathname).toBe("/oca_test_slip");
  });

  it("rejects a bad OCA_TEST_DB", () => {
    vi.stubEnv("OCA_TEST_DB", "oca");
    expect(() => testDatabaseUrl("postgresql://oca:oca@localhost:5433/oca")).toThrow(/OCA_TEST_DB/);
  });

  it("swaps the database name to oca_test", () => {
    vi.stubEnv("OCA_TEST_DB", undefined);
    const url = new URL(testDatabaseUrl("postgresql://oca:oca@localhost:5433/oca"));
    expect(url.pathname).toBe("/oca_test");
    expect(url.port).toBe("5433");
  });

  it("accepts loopback hosts", () => {
    expect(() => testDatabaseUrl("postgresql://u:p@127.0.0.1:5433/oca")).not.toThrow();
    expect(() => testDatabaseUrl("postgresql://u:p@[::1]:5433/oca")).not.toThrow();
  });

  it("rejects undefined", () => {
    expect(() => testDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-local host", () => {
    expect(() => testDatabaseUrl("postgresql://u:p@db.example.com:5432/oca")).toThrow(/local/i);
  });
});

describe("resetDb guard", () => {
  const fakeDb = (name: string) => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ name }]),
      $executeRawUnsafe: executeRawUnsafe,
    } as unknown as PrismaClient;
    return { db, executeRawUnsafe };
  };

  it("refuses to truncate a database that is not oca_test", async () => {
    const { db, executeRawUnsafe } = fakeDb("oca");
    await expect(resetDb(db)).rejects.toThrow(/Refusing to truncate non-test database/);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("refuses plain oca_test when OCA_TEST_DB selects another database", async () => {
    vi.stubEnv("OCA_TEST_DB", "oca_test_slip");
    const { db, executeRawUnsafe } = fakeDb("oca_test");
    await expect(resetDb(db)).rejects.toThrow(/Refusing to truncate non-test database "oca_test"/);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("truncates the database named by OCA_TEST_DB", async () => {
    vi.stubEnv("OCA_TEST_DB", "oca_test_slip");
    const { db, executeRawUnsafe } = fakeDb("oca_test_slip");
    await resetDb(db);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("truncates oca_test", async () => {
    vi.stubEnv("OCA_TEST_DB", undefined);
    const { db, executeRawUnsafe } = fakeDb("oca_test");
    await resetDb(db);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2); // TRUNCATE + sequence restart
  });
});

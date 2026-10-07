import type { PrismaClient } from "@oca/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidTestDatabaseName, testDatabaseName, testDatabaseUrl } from "./env";
import { resetDb } from "./helpers";

// ກັນ OCA_TEST_DB_NAME ໃນ .env ຂອງເຄື່ອງມາລົບກວນ: ທຸກ test ເລີ່ມຈາກຄ່າ default
beforeEach(() => vi.stubEnv("OCA_TEST_DB_NAME", "oca_test"));
afterEach(() => vi.unstubAllEnvs());

describe("testDatabaseUrl", () => {
  it("swaps the database name to oca_test", () => {
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

describe("test database name", () => {
  it("accepts oca_test and suffixed names", () => {
    expect(isValidTestDatabaseName("oca_test")).toBe(true);
    expect(isValidTestDatabaseName("oca_test_cf")).toBe(true);
  });

  it("rejects real databases and injection attempts", () => {
    for (const bad of ["oca", "postgres", "oca_test; drop", "OCA_TEST", "oca_test-x", ""]) {
      expect(isValidTestDatabaseName(bad), bad).toBe(false);
    }
  });

  it("defaults to oca_test when unset", () => {
    expect(testDatabaseName(undefined)).toBe("oca_test");
  });

  it("uses OCA_TEST_DB_NAME and validates it", () => {
    expect(testDatabaseName("oca_test_cf")).toBe("oca_test_cf");
    expect(() => testDatabaseName("oca")).toThrow(/OCA_TEST_DB_NAME/);
    expect(() => testDatabaseName("")).toThrow(/OCA_TEST_DB_NAME/);
  });

  it("builds the url with the configured name", () => {
    const url = new URL(testDatabaseUrl("postgresql://oca:oca@localhost:5433/oca", "oca_test_cf"));
    expect(url.pathname).toBe("/oca_test_cf");
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

  it("refuses postgres", async () => {
    const { db, executeRawUnsafe } = fakeDb("postgres");
    await expect(resetDb(db)).rejects.toThrow(/Refusing to truncate non-test database/);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("truncates a configured oca_test_* database", async () => {
    vi.stubEnv("OCA_TEST_DB_NAME", "oca_test_cf");
    const { db, executeRawUnsafe } = fakeDb("oca_test_cf");
    await resetDb(db);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("truncates oca_test", async () => {
    const { db, executeRawUnsafe } = fakeDb("oca_test");
    await resetDb(db);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2); // TRUNCATE + sequence restart
  });
});

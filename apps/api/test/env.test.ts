import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "./env";
import { resetDb } from "./helpers";

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

  it("truncates oca_test", async () => {
    const { db, executeRawUnsafe } = fakeDb("oca_test");
    await resetDb(db);
    expect(executeRawUnsafe).toHaveBeenCalledOnce();
  });
});

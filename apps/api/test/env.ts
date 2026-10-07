import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** ໂຫຼດ .env ຂອງ repo (ບໍ່ຂຽນທັບຕົວແປທີ່ຕັ້ງໄວ້ແລ້ວ). */
export function loadRepoEnv(): void {
  const file = `${REPO_ROOT}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const TEST_DB_NAME_PATTERN = /^oca_test[a-z0-9_]*$/;

export function isValidTestDatabaseName(name: string): boolean {
  return TEST_DB_NAME_PATTERN.test(name);
}

/** ຊື່ database ຂອງ test: OCA_TEST_DB_NAME (ຕ້ອງຂຶ້ນຕົ້ນ oca_test) ຫຼື oca_test ຖ້າບໍ່ຕັ້ງ. */
export function testDatabaseName(raw: string | undefined = process.env.OCA_TEST_DB_NAME): string {
  if (raw === undefined) return "oca_test";
  if (!isValidTestDatabaseName(raw)) {
    throw new Error(`OCA_TEST_DB_NAME must match ${TEST_DB_NAME_PATTERN}, got "${raw}"`);
  }
  return raw;
}

/** ປ່ຽນຊື່ database ໃນ URL ເປັນຊື່ test ເພື່ອບໍ່ໃຫ້ test ແຕະຂໍ້ມູນ dev. */
export function testDatabaseUrl(url: string | undefined, name: string = testDatabaseName()): string {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  if (!isValidTestDatabaseName(name)) throw new Error(`Invalid test database name "${name}"`);
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to run tests against non-local host "${parsed.hostname}"`);
  }
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

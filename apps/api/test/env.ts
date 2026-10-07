import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** ໂຫຼດ .env ຂອງ repo (ບໍ່ຂຽນທັບຕົວແປທີ່ຕັ້ງໄວ້ແລ້ວ). */
export function loadRepoEnv(): void {
  const file = `${REPO_ROOT}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const TEST_DB_PATTERN = /^oca_test(_[a-z0-9_]+)?$/;

/** ຊື່ database ສຳລັບ test: OCA_TEST_DB (ຄ່າເລີ່ມຕົ້ນ oca_test), ຕ້ອງຂຶ້ນຕົ້ນດ້ວຍ oca_test. */
export function testDatabaseName(): string {
  const name = process.env.OCA_TEST_DB || "oca_test";
  if (!TEST_DB_PATTERN.test(name)) {
    throw new Error(`Invalid OCA_TEST_DB "${name}": must match ${TEST_DB_PATTERN} (e.g. oca_test_mybranch)`);
  }
  return name;
}

/** ປ່ຽນຊື່ database ໃນ URL ເປັນຊື່ test (ເບິ່ງ testDatabaseName) ເພື່ອບໍ່ໃຫ້ test ແຕະຂໍ້ມູນ dev. */
export function testDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to run tests against non-local host "${parsed.hostname}"`);
  }
  parsed.pathname = `/${testDatabaseName()}`;
  return parsed.toString();
}

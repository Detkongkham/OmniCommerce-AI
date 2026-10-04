import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** ໂຫຼດ .env ຂອງ repo (ບໍ່ຂຽນທັບຕົວແປທີ່ຕັ້ງໄວ້ແລ້ວ). */
export function loadRepoEnv(): void {
  const file = `${REPO_ROOT}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}

/** ປ່ຽນຊື່ database ໃນ URL ເປັນ oca_test ເພື່ອບໍ່ໃຫ້ test ແຕະຂໍ້ມູນ dev. */
export function testDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const parsed = new URL(url);
  parsed.pathname = "/oca_test";
  return parsed.toString();
}

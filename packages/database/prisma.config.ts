import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma CLI ບໍ່ອ່ານ .env ເອງ. ໂຫຼດ .env ຂອງ repo (ບໍ່ຂຽນທັບຕົວແປທີ່ຕັ້ງໄວ້ແລ້ວ) ເພື່ອບໍ່ໃຫ້ migrate/db:*
// ຕົກໄປຫາ default 5432 ໂດຍບໍ່ຮູ້ຕົວ (ເຄື່ອງ dev ໃຊ້ Postgres ແຍກຢູ່ພອດອື່ນ).
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://oca:oca@localhost:5432/oca",
  },
});

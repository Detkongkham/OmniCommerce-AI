import { hash } from "@node-rs/argon2";
import { emailSchema, passwordSchema } from "@oca/shared";
import { createPrismaClient } from "../src/index";
import { seedAuth } from "../src/seed/seed-auth";
import { seedStore } from "../src/seed/seed-store";

async function main(): Promise<void> {
  const ownerEmail = emailSchema.parse(process.env.SEED_OWNER_EMAIL);
  const ownerPassword = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);
  const storeName = process.env.SEED_STORE_NAME?.trim() || "OCA Store";

  const db = createPrismaClient();
  try {
    await seedAuth(db, { ownerEmail, ownerPasswordHash: await hash(ownerPassword) });
    await seedStore(db, { storeName });
    console.log(`Seed ok: owner ${ownerEmail}, store "${storeName}"`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

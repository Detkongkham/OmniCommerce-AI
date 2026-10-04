import { hash } from "@node-rs/argon2";
import { emailSchema, passwordSchema } from "@oca/shared";
import { createPrismaClient } from "../src/index";
import { seedAuth } from "../src/seed/seed-auth";

async function main(): Promise<void> {
  const ownerEmail = emailSchema.parse(process.env.SEED_OWNER_EMAIL);
  const ownerPassword = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);

  const db = createPrismaClient();
  try {
    await seedAuth(db, { ownerEmail, ownerPasswordHash: await hash(ownerPassword) });
    console.log(`Seed ok: owner ${ownerEmail}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

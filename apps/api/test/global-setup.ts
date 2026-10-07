import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { REPO_ROOT, loadRepoEnv, testDatabaseUrl } from "./env";

export default async function setup(): Promise<void> {
  loadRepoEnv();
  const testUrl = testDatabaseUrl(process.env.DATABASE_URL);

  if (new URL(testUrl).pathname !== "/oca_test") {
    throw new Error(`Refusing to set up a database other than oca_test: ${new URL(testUrl).pathname}`);
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = 'oca_test'");
    if (found.rowCount === 0) await client.query("CREATE DATABASE oca_test");
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["--filter", "@oca/database", "db:deploy"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}

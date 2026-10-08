import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { REPO_ROOT, loadRepoEnv, testDatabaseName, testDatabaseUrl } from "./env";

export default async function setup(): Promise<void> {
  loadRepoEnv();
  const name = testDatabaseName(); // throws unless it matches /^oca_test[a-z0-9_]*$/
  const testUrl = testDatabaseUrl(process.env.DATABASE_URL, name);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["--filter", "@oca/database", "db:deploy"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}

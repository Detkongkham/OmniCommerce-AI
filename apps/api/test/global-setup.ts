import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { REPO_ROOT, loadRepoEnv, testDatabaseName, testDatabaseUrl } from "./env";

export default async function setup(): Promise<void> {
  loadRepoEnv();
  const dbName = testDatabaseName();
  const testUrl = testDatabaseUrl(process.env.DATABASE_URL);

  if (new URL(testUrl).pathname !== `/${dbName}`) {
    throw new Error(`Refusing to set up a database other than ${dbName}: ${new URL(testUrl).pathname}`);
  }
  console.log(`[global-setup] test database: ${dbName}`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["--filter", "@oca/database", "db:deploy"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}

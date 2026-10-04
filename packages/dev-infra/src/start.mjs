import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { RedisMemoryServer } from "redis-memory-server";
import { describeUrls, parseConfig } from "./config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = path.join(repoRoot, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile); // does not override already-set vars

let config;
try {
  config = parseConfig(process.env, repoRoot);
} catch (err) {
  console.error(`ການຕັ້ງຄ່າບໍ່ຖືກຕ້ອງ / Invalid configuration: ${err.message}`);
  process.exit(1);
}

// Port is "in use" if we cannot listen on it. No connection/authentication is attempted.
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

const busy = [];
if (!(await portFree(config.postgresPort))) busy.push(`Postgres (${config.postgresPort})`);
if (!(await portFree(config.redisPort))) busy.push(`Redis (${config.redisPort})`);
if (busy.length) {
  console.error(
    `ພອດຖືກໃຊ້ແລ້ວ / Port already in use: ${busy.join(", ")}\n` +
      `ຕັ້ງ POSTGRES_PORT / REDIS_PORT ໃນ .env ເປັນພອດອື່ນ ແລ້ວແກ້ DATABASE_URL / REDIS_URL ໃຫ້ກົງກັນ.\n` +
      `Set POSTGRES_PORT / REDIS_PORT in .env to free ports and update DATABASE_URL / REDIS_URL to match.`,
  );
  process.exit(1);
}

const pg = new EmbeddedPostgres({
  databaseDir: config.dataDir,
  user: config.user,
  password: config.password,
  port: config.postgresPort,
  persistent: true,
});
const redis = new RedisMemoryServer({ instance: { port: config.redisPort } });
let pgStarted = false;
let redisStarted = false;

async function stopAll() {
  if (redisStarted) await redis.stop().catch((e) => console.error("redis stop:", e.message));
  if (pgStarted) await pg.stop().catch((e) => console.error("postgres stop:", e.message));
  redisStarted = pgStarted = false;
}

try {
  if (!fs.existsSync(path.join(config.dataDir, "PG_VERSION"))) {
    console.log("Initialising Postgres data dir (first run downloads Postgres)...");
    await pg.initialise();
  }
  await pg.start();
  pgStarted = true;
  try {
    await pg.createDatabase(config.database);
  } catch (err) {
    if (!/already exists/i.test(String(err?.message))) throw err;
  }
  console.log("Starting Redis (first run compiles Redis from source)...");
  await redis.start();
  redisStarted = true;
} catch (err) {
  console.error("Startup failed:", err?.message ?? err);
  await stopAll();
  process.exit(1);
}

const urls = describeUrls(config);
console.log(
  `\nReady. Put these in .env:\nDATABASE_URL=${urls.DATABASE_URL}\nREDIS_URL=${urls.REDIS_URL}\n\nPress Ctrl+C to stop.`,
);

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${sig} received, stopping...`);
    await stopAll();
    process.exit(0);
  });
}
setInterval(() => {}, 1 << 30); // keep the process alive

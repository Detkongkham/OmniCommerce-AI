import path from "node:path";

function parsePort(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer 1-65535, got "${value}"`);
  const n = Number(value);
  if (n < 1 || n > 65535) throw new Error(`${name} must be an integer 1-65535, got "${value}"`);
  return n;
}

export function parseConfig(env, repoRoot) {
  return {
    postgresPort: parsePort(env.POSTGRES_PORT, 5432, "POSTGRES_PORT"),
    redisPort: parsePort(env.REDIS_PORT, 6379, "REDIS_PORT"),
    dataDir: env.DEV_INFRA_DATA_DIR || path.join(repoRoot, ".local", "postgres"),
    user: "oca",
    password: "oca",
    database: "oca",
  };
}

export function describeUrls(config) {
  return {
    DATABASE_URL: `postgresql://${config.user}:${config.password}@localhost:${config.postgresPort}/${config.database}`,
    REDIS_URL: `redis://localhost:${config.redisPort}`,
  };
}

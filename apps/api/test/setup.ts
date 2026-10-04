import { loadRepoEnv, testDatabaseUrl } from "./env";

loadRepoEnv();
process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.LOGIN_RATE_LIMIT = "1000";

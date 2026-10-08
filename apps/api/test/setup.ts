import { loadRepoEnv, testDatabaseUrl } from "./env";

loadRepoEnv();
delete process.env.REFRESH_COOKIE_PATH;
process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
process.env.JWT_ACCESS_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.LOGIN_RATE_LIMIT = "1000";
// prefix ສະເພາະຮອບ test: ບໍ່ໃຫ້ API/worker dev ຂອງຜູ້ໃຊ້ (prefix "oca") ມາຍາດ job ຂອງ test
process.env.QUEUE_PREFIX = `oca-test-${process.pid}`;

// ກັນ test ຍິງ Meta ຈິງຖ້າ .env ຂອງເຄື່ອງມີ token: test ທີ່ຕ້ອງການໃຫ້ສົ່ງ overrides ຜ່ານ createTestApp
for (const key of [
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "FACEBOOK_GRAPH_BASE_URL",
]) {
  delete process.env[key];
}

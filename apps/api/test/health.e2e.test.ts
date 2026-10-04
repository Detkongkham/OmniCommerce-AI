import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers";

describe("health (e2e)", () => {
  it("GET /health ບໍ່ຕ້ອງ login ແລະ ຄືນ ok ເມື່ອ DB ແລະ Redis ເຮັດວຽກ", async () => {
    const { app } = await createTestApp();
    try {
      const res = await request(app.getHttpServer()).get("/health").expect(200);
      expect(res.body).toEqual({ status: "ok", db: "up", redis: "up" });
    } finally {
      await app.close();
    }
  });

  it("ຄືນ 503 ແລະ ບອກວ່າ redis ລົ້ມ ເມື່ອເຊື່ອມ Redis ບໍ່ໄດ້", async () => {
    const { app } = await createTestApp({ REDIS_URL: "redis://127.0.0.1:1" });
    try {
      const res = await request(app.getHttpServer()).get("/health").expect(503);
      expect(res.body).toMatchObject({ status: "degraded", db: "up", redis: "down" });
    } finally {
      await app.close();
    }
  });
});

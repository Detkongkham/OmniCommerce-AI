import { describe, expect, it } from "vitest";
import { createPrismaClient } from "./index";

describe("createPrismaClient", () => {
  it("throw ເມື່ອບໍ່ມີ connection string", () => {
    expect(() => createPrismaClient("")).toThrow("DATABASE_URL");
  });

  it("ສ້າງ client ໂດຍບໍ່ເຊື່ອມຕໍ່ DB ທັນທີ ແລະ ມີ model ໃໝ່", async () => {
    const db = createPrismaClient("postgresql://u:p@localhost:5432/x");
    expect(typeof db.user.findMany).toBe("function");
    expect(typeof db.role.findUnique).toBe("function");
    expect(typeof db.auditLog.create).toBe("function");
    await db.$disconnect();
  });
});

import { ConflictException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { RolesService } from "./roles.service";
import { prismaErrorCode, uniqueViolationFields } from "./staff.service";

const actor = { id: "u1", roleName: "OWNER", permissions: [] } as unknown as AuthUser;
const roleRow = {
  id: "r1",
  name: "X",
  description: null,
  isSystem: false,
  createdAt: new Date(),
  permissions: [],
  _count: { users: 0 },
};

function serviceWith(overrides: { delete?: unknown; transaction?: unknown }) {
  const prisma = {
    role: {
      findUnique: vi.fn().mockResolvedValue(roleRow),
      delete: vi.fn().mockRejectedValue(overrides.delete),
    },
    $transaction: vi.fn().mockRejectedValue(overrides.transaction),
  } as unknown as PrismaClient;
  const audit = { record: vi.fn() } as unknown as AuditService;
  return new RolesService(prisma, audit);
}

describe("prisma error helpers", () => {
  it("reads the error code", () => {
    expect(prismaErrorCode({ code: "P2003" })).toBe("P2003");
    expect(prismaErrorCode(new Error("x"))).toBeUndefined();
    expect(prismaErrorCode(null)).toBeUndefined();
  });

  it("reads unique violation fields from meta.target", () => {
    expect(uniqueViolationFields({ code: "P2002", meta: { target: ["name"] } })).toEqual(["name"]);
    expect(uniqueViolationFields({ code: "P2002", meta: { target: "Role_name_key" } })).toEqual(["Role_name_key"]);
    const adapter = { code: "P2002", meta: { driverAdapterError: { cause: { constraint: { index: "Role_name_key" } } } } };
    expect(uniqueViolationFields(adapter)).toEqual(["Role_name_key"]);
    expect(uniqueViolationFields({ code: "P2002" })).toEqual([]);
    expect(uniqueViolationFields({ code: "P2003" })).toBeUndefined();
  });
});

describe("RolesService error mapping", () => {
  it("remove: FK restrict (P2003) becomes 409", async () => {
    const svc = serviceWith({ delete: { code: "P2003" } });
    await expect(svc.remove("r1", actor, undefined)).rejects.toEqual(
      new ConflictException("Role is assigned to users"),
    );
  });

  it("remove: record vanished (P2025) becomes 404", async () => {
    const svc = serviceWith({ delete: { code: "P2025" } });
    await expect(svc.remove("r1", actor, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("update: record vanished (P2025) becomes 404", async () => {
    const svc = serviceWith({ transaction: { code: "P2025" } });
    await expect(svc.update("r1", { name: "X", permissions: [] }, actor, undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("update: unique violation on name vs another field", async () => {
    const onName = serviceWith({ transaction: { code: "P2002", meta: { target: ["name"] } } });
    await expect(onName.update("r1", { name: "X", permissions: [] }, actor, undefined)).rejects.toMatchObject({
      status: 409,
      response: { code: "DUPLICATE_VALUE" },
    });
    const other = serviceWith({ transaction: { code: "P2002", meta: { target: ["roleId", "permission"] } } });
    await expect(other.update("r1", { name: "X", permissions: [] }, actor, undefined)).rejects.toEqual(
      new ConflictException("Conflict"),
    );
  });
});

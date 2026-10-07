import { type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../common/auth-types";
import { RequirePermissions } from "../common/decorators";
import { PermissionsGuard } from "./permissions.guard";

class Sample {
  @RequirePermissions("staff:write")
  write(): void {}

  @RequirePermissions("staff:read", "inventory:read")
  readBoth(): void {}

  open(): void {}
}

function contextFor(method: keyof Sample, user?: Partial<AuthUser>): ExecutionContext {
  return {
    getHandler: () => Sample.prototype[method],
    getClass: () => Sample,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  const guard = new PermissionsGuard(new Reflector());

  it("ຜ່ານເມື່ອ route ບໍ່ກຳນົດ permission", () => {
    expect(guard.canActivate(contextFor("open", { permissions: [] }))).toBe(true);
  });

  it("ຜ່ານເມື່ອມີ permission ຄົບ", () => {
    expect(guard.canActivate(contextFor("write", { permissions: ["staff:write"] }))).toBe(true);
    expect(
      guard.canActivate(contextFor("readBoth", { permissions: ["staff:read", "inventory:read", "crm:read"] })),
    ).toBe(true);
  });

  it("ປະຕິເສດ 403 ເມື່ອຂາດ permission ແມ່ນແຕ່ອັນດຽວ (write ບໍ່ implies read)", () => {
    expect(() => guard.canActivate(contextFor("write", { permissions: ["staff:read"] }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor("readBoth", { permissions: ["staff:read"] }))).toThrow(ForbiddenException);
  });

  it("ປະຕິເສດເມື່ອບໍ່ມີ user ໃນ request", () => {
    expect(() => guard.canActivate(contextFor("write"))).toThrow(ForbiddenException);
  });
});

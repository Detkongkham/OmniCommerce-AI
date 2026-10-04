import { describe, expect, it } from "vitest";
import { ACTIONS, MODULES, PERMISSIONS, hasPermission, isPermission } from "./permissions";

describe("permissions", () => {
  it("ມີ 12 module ແລະ 2 action", () => {
    expect(MODULES).toHaveLength(12);
    expect(ACTIONS).toEqual(["read", "write"]);
  });

  it("PERMISSIONS ແມ່ນ module x action ທັງໝົດ ບໍ່ຊ້ຳ", () => {
    expect(PERMISSIONS).toHaveLength(24);
    expect(new Set(PERMISSIONS).size).toBe(24);
    expect(PERMISSIONS).toContain("staff:write");
    expect(PERMISSIONS).toContain("inventory:read");
  });

  it("isPermission ຮັບສະເພາະຄ່າທີ່ຖືກຕ້ອງ", () => {
    expect(isPermission("staff:write")).toBe(true);
    expect(isPermission("staff:delete")).toBe(false);
    expect(isPermission("nope:read")).toBe(false);
    expect(isPermission("")).toBe(false);
  });

  it("hasPermission ກົງກັນແບບຊັດເຈນ (write ບໍ່ໄດ້ implies read)", () => {
    expect(hasPermission(["staff:write"], "staff:write")).toBe(true);
    expect(hasPermission(["staff:write"], "staff:read")).toBe(false);
    expect(hasPermission([], "staff:read")).toBe(false);
  });
});

import { PERMISSIONS, SYSTEM_ROLE_OWNER, isPermission } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ROLE_DEFINITIONS } from "./roles";

describe("ROLE_DEFINITIONS", () => {
  it("ຊື່ role ບໍ່ຊ້ຳ ແລະ ມີ 5 role", () => {
    const names = ROLE_DEFINITIONS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([SYSTEM_ROLE_OWNER, "MANAGER", "CHAT_ADMIN", "WAREHOUSE", "ACCOUNTANT"]);
  });

  it("ມີແຕ່ OWNER ທີ່ເປັນ role ລະບົບ ແລະ ມີທຸກ permission", () => {
    const system = ROLE_DEFINITIONS.filter((r) => r.isSystem);
    expect(system.map((r) => r.name)).toEqual([SYSTEM_ROLE_OWNER]);
    expect(system[0]?.permissions).toEqual(PERMISSIONS);
  });

  it("ທຸກ permission ທີ່ໃຊ້ແມ່ນຄ່າທີ່ຖືກຕ້ອງ ແລະ ບໍ່ຊ້ຳໃນແຕ່ລະ role", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(role.permissions.every((p) => isPermission(p))).toBe(true);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it("MANAGER ບໍ່ມີ staff:write ແຕ່ມີ inventory:write", () => {
    const manager = ROLE_DEFINITIONS.find((r) => r.name === "MANAGER");
    expect(manager?.permissions).not.toContain("staff:write");
    expect(manager?.permissions).toContain("inventory:write");
  });

  it("role ຕົວຢ່າງມີສິດຕາມໜ້າທີ່", () => {
    const get = (name: string) => ROLE_DEFINITIONS.find((r) => r.name === name)?.permissions ?? [];
    expect(get("CHAT_ADMIN")).toEqual(expect.arrayContaining(["inbox:write", "live-cf:write", "crm:read"]));
    expect(get("WAREHOUSE")).toEqual(expect.arrayContaining(["inventory:write", "logistics:write"]));
    expect(get("ACCOUNTANT")).toEqual(expect.arrayContaining(["analytics:read"]));
    expect(get("ACCOUNTANT").some((p) => p.endsWith(":write"))).toBe(false);
  });
});

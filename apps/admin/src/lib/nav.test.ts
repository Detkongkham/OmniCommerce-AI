import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@oca/shared";
import { NAV_GROUPS, firstAllowedHref, isActivePath, visibleNavGroups } from "./nav";

describe("visibleNavGroups", () => {
  it("ຜູ້ມີ staff:read ເຫັນສະເພາະ staff ແລະ roles", () => {
    const groups = visibleNavGroups(["staff:read"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("settings");
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/staff", "/roles"]);
  });

  it("ຜູ້ມີ inventory:read ເຫັນກຸ່ມສະຕ໊ອກ (ສິນຄ້າ, ສະຕ໋ອກ, ສາງ, ໝວດໝູ່) ແລະ ຕັ້ງຄ່າຮ້ານ", () => {
    const groups = visibleNavGroups(["inventory:read"]);
    expect(groups.map((group) => group.id)).toEqual(["inventory", "settings"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/products", "/stock", "/warehouses", "/categories"]);
    expect(groups[1]?.items.map((item) => item.href)).toEqual(["/settings"]);
  });

  it("ຜູ້ມີ orders:read ເຫັນ /orders ໃນກຸ່ມສະຕ໊ອກ (ແມ່ນບໍ່ມີ inventory:read ກໍເຫັນ)", () => {
    const groups = visibleNavGroups(["orders:read"]);
    expect(groups.map((group) => group.id)).toEqual(["inventory"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/orders"]);
  });

  it("ຜູ້ມີ inventory:read + orders:read ເຫັນ /orders ຖັດຈາກ /stock", () => {
    const groups = visibleNavGroups(["inventory:read", "orders:read"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/products", "/stock", "/orders", "/warehouses", "/categories"]);
  });

  it("ບໍ່ມີສິດ: ບໍ່ມີກຸ່ມເລີຍ (ກຸ່ມທີ່ບໍ່ມີລາຍການບໍ່ຖືກ render)", () => {
    expect(visibleNavGroups([])).toEqual([]);
    expect(visibleNavGroups(["inbox:read"])).toEqual([]);
  });
});

describe("isActivePath", () => {
  it("ກົງ ຫຼື ເປັນໜ້າຍ່ອຍ, ແຕ່ບໍ່ແມ່ນ prefix ທີ່ຊື່ຄ້າຍກັນ", () => {
    expect(isActivePath("/staff", "/staff")).toBe(true);
    expect(isActivePath("/staff/123", "/staff")).toBe(true);
    expect(isActivePath("/staffing", "/staff")).toBe(false);
    expect(isActivePath("/roles", "/staff")).toBe(false);
  });
});

// สิດຈິງຂອງແຕ່ລະ role (seed ຂອງລະບົບ)
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  OWNER: PERMISSIONS,
  CHAT_ADMIN: ["crm:read", "inbox:read", "inbox:write", "inventory:read", "live-cf:read", "live-cf:write", "orders:read", "orders:write", "promotion:read"],
  WAREHOUSE: ["inventory:read", "inventory:write", "logistics:read", "logistics:write", "orders:read"],
  ACCOUNTANT: ["analytics:read", "costs:read", "crm:read", "inventory:read", "logistics:read", "orders:read", "payments:read"],
};

describe("firstAllowedHref (ໜ້າຫຼັງ login)", () => {
  it.each(Object.keys(ROLE_PERMISSIONS))("%s ລົງໜ້າທຳອິດໃນເມນູທີ່ຕົນເປີດໄດ້ (ບໍ່ແມ່ນ /staff ຖ້າບໍ່ມີ staff:read)", (role) => {
    const permissions = ROLE_PERMISSIONS[role] ?? [];
    const href = firstAllowedHref(permissions);
    expect(href).toBe(visibleNavGroups(permissions)[0]?.items[0]?.href);
    const item = NAV_GROUPS.flatMap((group) => group.items).find((entry) => entry.href === href);
    expect(item && permissions.includes(item.permission)).toBe(true);
    if (role !== "OWNER") expect(href).not.toBe("/staff");
  });

  it("OWNER -> ລາຍການທຳອິດຂອງເມນູ (/products); CHAT_ADMIN/WAREHOUSE/ACCOUNTANT -> /products", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) expect(firstAllowedHref(ROLE_PERMISSIONS[role] ?? [])).toBe("/products");
  });

  it("ມີແຕ່ orders:read -> /orders; ມີແຕ່ staff:read -> /staff", () => {
    expect(firstAllowedHref(["orders:read"])).toBe("/orders");
    expect(firstAllowedHref(["staff:read"])).toBe("/staff");
  });

  it("ບໍ່ມີສິດທີ່ເຫັນໃນເມນູເລີຍ: null", () => {
    expect(firstAllowedHref([])).toBeNull();
    expect(firstAllowedHref(["crm:read", "payments:read"])).toBeNull();
  });
});

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
    expect(visibleNavGroups(["crm:read"])).toEqual([]);
  });

  it("ຜູ້ມີ inbox:read ເຫັນກຸ່ມສົນທະນາ (/inbox) ແຕ່ landing ຫຼັງ login ຍັງເປັນໜ້າທຳອິດຂອງກຸ່ມທຳອິດ", () => {
    const groups = visibleNavGroups(["inbox:read"]);
    expect(groups.map((group) => group.id)).toEqual(["chat"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/inbox"]);
    expect(firstAllowedHref(["inbox:read"])).toBe("/inbox");
    // ມີສິດສະຕ໊ອກນຳ: ກຸ່ມ inventory ຍັງມາກ່ອນ ຈຶ່ງບໍ່ປ່ຽນໜ້າຫຼັງ login ຂອງຜູ້ໃຊ້ເດີມ
    expect(firstAllowedHref(["inbox:read", "inventory:read"])).toBe("/products");
  });
});

describe("visibleNavGroups: logistics", () => {
  it("logistics:read ເຫັນ /fulfillment (ກຸ່ມສາງ) ແລະ /couriers (ກຸ່ມຕັ້ງຄ່າ)", () => {
    const groups = visibleNavGroups(["logistics:read"]);
    expect(groups.map((group) => [group.id, group.items.map((item) => item.href)])).toEqual([
      ["inventory", ["/fulfillment"]],
      ["settings", ["/couriers"]],
    ]);
  });

  it("WAREHOUSE (inventory + logistics + orders:read): /fulfillment ຖັດຈາກ /orders; landing ຍັງ /products", () => {
    const permissions = ["inventory:read", "logistics:read", "orders:read"];
    expect(visibleNavGroups(permissions)[0]?.items.map((item) => item.href)).toEqual([
      "/products",
      "/stock",
      "/orders",
      "/fulfillment",
      "/warehouses",
      "/categories",
    ]);
    expect(firstAllowedHref(permissions)).toBe("/products");
  });
});

describe("visibleNavGroups: live-cf", () => {
  it("ຜູ້ມີ live-cf:read ເຫັນກຸ່ມ live (/live)", () => {
    const groups = visibleNavGroups(["live-cf:read"]);
    expect(groups.map((group) => group.id)).toEqual(["live"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/live"]);
  });

  it("inbox:read + live-cf:read: ກຸ່ມ chat ມາກ່ອນ live ຈຶ່ງ landing ຍັງເປັນ /inbox", () => {
    expect(visibleNavGroups(["inbox:read", "live-cf:read"]).map((group) => group.id)).toEqual(["chat", "live"]);
    expect(firstAllowedHref(["inbox:read", "live-cf:read"])).toBe("/inbox");
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

import { describe, expect, it } from "vitest";
import { isActivePath, visibleNavGroups } from "./nav";

describe("visibleNavGroups", () => {
  it("ຜູ້ມີ staff:read ເຫັນ staff ແລະ roles", () => {
    const groups = visibleNavGroups(["staff:read"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/staff", "/roles"]);
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

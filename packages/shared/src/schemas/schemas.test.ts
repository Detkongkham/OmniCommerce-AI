import { describe, expect, it } from "vitest";
import { createStaffSchema, loginSchema, roleSchema, updateStaffSchema } from "../index";

describe("loginSchema", () => {
  it("ຮັບ email/password ທີ່ຖືກຕ້ອງ ແລະ ປ່ຽນ email ເປັນຕົວນ້ອຍ", () => {
    const r = loginSchema.parse({ email: "  Owner@Example.COM ", password: "password123" });
    expect(r.email).toBe("owner@example.com");
  });

  it("ປະຕິເສດ email ຜິດ ແລະ ລະຫັດສັ້ນເກີນ", () => {
    expect(loginSchema.safeParse({ email: "x", password: "password123" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });
});

describe("createStaffSchema", () => {
  const valid = { email: "a@b.co", name: "ສົມຊາຍ", password: "password123", roleId: "role1" };

  it("ຮັບຂໍ້ມູນທີ່ຖືກຕ້ອງ", () => {
    expect(createStaffSchema.safeParse(valid).success).toBe(true);
  });

  it("ປະຕິເສດເມື່ອຂາດ roleId ຫຼື name ເປົ່າ", () => {
    expect(createStaffSchema.safeParse({ ...valid, roleId: "" }).success).toBe(false);
    expect(createStaffSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });
});

describe("updateStaffSchema", () => {
  it("ທຸກ field ເປັນ optional ແຕ່ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateStaffSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateStaffSchema.safeParse({}).success).toBe(false);
  });

  it("ບໍ່ໃຫ້ແກ້ email", () => {
    expect(updateStaffSchema.safeParse({ email: "x@y.co" }).success).toBe(false);
  });
});

describe("roleSchema", () => {
  it("ຮັບ permission ທີ່ຖືກຕ້ອງ ແລະ ເອົາຄ່າຊ້ຳອອກ", () => {
    const r = roleSchema.parse({
      name: "Sales",
      permissions: ["inbox:read", "inbox:read", "inbox:write"],
    });
    expect(r.permissions).toEqual(["inbox:read", "inbox:write"]);
  });

  it("ປະຕິເສດ permission ທີ່ບໍ່ມີໃນລະບົບ ແລະ name ເປົ່າ", () => {
    expect(roleSchema.safeParse({ name: "X", permissions: ["staff:delete"] }).success).toBe(false);
    expect(roleSchema.safeParse({ name: "", permissions: [] }).success).toBe(false);
  });
});

import { Prisma } from "@oca/database";
import { describe, expect, it } from "vitest";
import { money, moneyOrNull } from "./money";

describe("money", () => {
  it("ສະແດງ 2 ທົດສະນິຍົມສະເໝີ", () => {
    expect(money(new Prisma.Decimal("12500"))).toBe("12500.00");
    expect(money(new Prisma.Decimal("0.5"))).toBe("0.50");
  });
  it("moneyOrNull ຮັບ null", () => {
    expect(moneyOrNull(null)).toBeNull();
    expect(moneyOrNull(new Prisma.Decimal("1"))).toBe("1.00");
  });
});

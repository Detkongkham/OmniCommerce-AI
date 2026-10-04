import { MODULES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { FEATURE_MODULES } from "./index";

describe("FEATURE_MODULES", () => {
  it("ມີ module ຄົບຕາມ MODULES ຂອງ @oca/shared (12 ໂຕ) ບໍ່ຂາດບໍ່ເກີນ", () => {
    expect(Object.keys(FEATURE_MODULES).sort()).toEqual([...MODULES].sort());
  });

  it("ແຕ່ລະ module ເປັນ class ຄົນລະອັນ", () => {
    const classes = Object.values(FEATURE_MODULES);
    expect(new Set(classes).size).toBe(12);
    expect(classes.every((c) => typeof c === "function")).toBe(true);
  });
});

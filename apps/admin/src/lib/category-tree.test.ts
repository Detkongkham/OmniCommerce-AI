import { describe, expect, it } from "vitest";
import { descendantIds, flattenCategories } from "./category-tree";
import type { CategoryDto } from "./types";

const cat = (id: string, parentId: string | null, position = 0, name = id): CategoryDto => ({
  id,
  name,
  slug: id,
  parentId,
  position,
  productCount: 0,
});

describe("flattenCategories", () => {
  it("ຮຽງແບບ depth-first: ແມ່ ຕາມດ້ວຍລູກ; ລູກຮຽງຕາມ position ແລ້ວຊື່", () => {
    const rows = flattenCategories([
      cat("b", null, 1),
      cat("a", null, 0),
      cat("a2", "a", 2),
      cat("a1", "a", 1),
      cat("a1x", "a1", 0),
    ]);
    expect(rows.map((row) => [row.category.id, row.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a1x", 2],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("ໝວດທີ່ແມ່ຫາຍ (orphan) ຖືກຖືວ່າເປັນຮາກ ເພື່ອບໍ່ໃຫ້ຫາຍຈາກລາຍການ; ວົງຈອນບໍ່ເຮັດໃຫ້ວົນບໍ່ຈົບ", () => {
    expect(flattenCategories([cat("x", "ghost")]).map((row) => row.category.id)).toEqual(["x"]);
    const looped = flattenCategories([cat("p", "q"), cat("q", "p")]);
    expect(looped.length).toBeLessThanOrEqual(2);
  });
});

describe("descendantIds", () => {
  it("ຄືນລູກຫຼານທຸກຊັ້ນ (ບໍ່ລວມໂຕເອງ)", () => {
    const list = [cat("a", null), cat("a1", "a"), cat("a1x", "a1"), cat("b", null)];
    expect([...descendantIds(list, "a")].sort()).toEqual(["a1", "a1x"]);
    expect(descendantIds(list, "b").size).toBe(0);
  });
});

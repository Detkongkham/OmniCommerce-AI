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

  it("ວົງຈອນລ້ວນ ຄືນທັງສອງ id ຄັ້ງດຽວ", () => {
    const ids = flattenCategories([cat("p", "q"), cat("q", "p")]).map((row) => row.category.id);
    expect(ids.sort()).toEqual(["p", "q"]);
  });

  it("ວົງຈອນທີ່ຫ້ອຍຢູ່ກັບຮາກທີ່ຖືກຕ້ອງ ຍັງຄືນທຸກ id ຄັ້ງດຽວ", () => {
    const list = [cat("root", null), cat("p", "q"), cat("q", "p"), cat("r", "p")];
    const ids = flattenCategories(list).map((row) => row.category.id);
    expect(ids.sort()).toEqual(["p", "q", "r", "root"]);
  });

  it("position ເທົ່າກັນ ຮຽງຕາມຊື່", () => {
    const rows = flattenCategories([cat("1", null, 0, "Zeta"), cat("2", null, 0, "Alpha")]);
    expect(rows.map((row) => row.category.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("orphan ທີ່ມີລູກ ຍັງຮັກສາ subtree ຊ້ອນກັນ", () => {
    const rows = flattenCategories([cat("x", "ghost"), cat("x1", "x")]);
    expect(rows.map((row) => [row.category.id, row.depth])).toEqual([
      ["x", 0],
      ["x1", 1],
    ]);
  });
});

describe("descendantIds", () => {
  it("ຄືນລູກຫຼານທຸກຊັ້ນ (ບໍ່ລວມໂຕເອງ)", () => {
    const list = [cat("a", null), cat("a1", "a"), cat("a1x", "a1"), cat("b", null)];
    expect([...descendantIds(list, "a")].sort()).toEqual(["a1", "a1x"]);
    expect(descendantIds(list, "b").size).toBe(0);
  });

  it("ວົງຈອນຈົບ ແລະ ບໍ່ລວມ id ເອງ", () => {
    const list = [cat("p", "q"), cat("q", "p")];
    expect([...descendantIds(list, "p")]).toEqual(["q"]);
  });

  it("id ທີ່ບໍ່ຮູ້ຈັກ ແລະ ລາຍການຫວ່າງ ຄືນ set ຫວ່າງ", () => {
    expect(descendantIds([cat("a", null)], "nope").size).toBe(0);
    expect(descendantIds([], "a").size).toBe(0);
  });
});

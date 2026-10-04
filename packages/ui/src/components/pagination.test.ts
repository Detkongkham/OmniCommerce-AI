import { describe, expect, it } from "vitest";
import { getPageItems, paginate } from "./pagination";

describe("getPageItems", () => {
  it("ໜ້ອຍກວ່າຫຼືເທົ່າ 7 ໜ້າ: ສະແດງທັງໝົດ", () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(1, 0)).toEqual([1]);
  });

  it("ຫຼາຍກວ່າ 7 ໜ້າ: ຫຍໍ້ເປັນ 1 … x-1 x x+1 … ສຸດທ້າຍ", () => {
    expect(getPageItems(6, 12)).toEqual([1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 12]);
    expect(getPageItems(1, 12)).toEqual([1, 2, "ellipsis-end", 12]);
    expect(getPageItems(12, 12)).toEqual([1, "ellipsis-start", 11, 12]);
    expect(getPageItems(3, 12)).toEqual([1, 2, 3, 4, "ellipsis-end", 12]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("ຕັດຕາມໜ້າ ແລະ ຄິດ from/to", () => {
    const slice = paginate(items, 2, 10);
    expect(slice.rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(slice).toMatchObject({ page: 2, totalPages: 3, total: 25, from: 11, to: 20 });
  });

  it("ໜ້າເກີນຂອບເຂດຖືກບີບເຂົ້າຂອບເຂດ", () => {
    const slice = paginate(items, 99, 10);
    expect(slice).toMatchObject({ page: 3, from: 21, to: 25 });
    expect(slice.rows).toHaveLength(5);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("pageSize 0 = ທັງໝົດ", () => {
    const slice = paginate(items, 1, 0);
    expect(slice.rows).toHaveLength(25);
    expect(slice).toMatchObject({ totalPages: 1, from: 1, to: 25 });
  });

  it("ບໍ່ມີຂໍ້ມູນ: from/to ເປັນ 0 ແລະ ມີ 1 ໜ້າ", () => {
    expect(paginate([], 1, 10)).toMatchObject({ rows: [], totalPages: 1, total: 0, from: 0, to: 0 });
  });
});

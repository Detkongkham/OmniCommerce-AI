import { describe, expect, it } from "vitest";
import { parseProductsParams } from "./search-params";

describe("parseProductsParams", () => {
  it("ຄ່າປົກກະຕິ", () => {
    expect(parseProductsParams({ category: "shirts", q: " ເສື້ອ ", page: "3" })).toEqual({ category: "shirts", q: "ເສື້ອ", page: 3 });
    expect(parseProductsParams({})).toEqual({ category: undefined, q: undefined, page: 1 });
  });

  it("ຄ່າທີ່ API ຈະປະຕິເສດ ຖືກຖິ້ມ ແທນທີ່ຈະເຮັດໃຫ້ໜ້າພັງ", () => {
    expect(parseProductsParams({ category: "Bad Slug", page: "0" })).toEqual({ category: undefined, q: undefined, page: 1 });
    expect(parseProductsParams({ page: "abc" }).page).toBe(1);
    expect(parseProductsParams({ page: "2.5" }).page).toBe(1);
    expect(parseProductsParams({ page: "99999999" }).page).toBe(10_000);
    expect(parseProductsParams({ q: "   " }).q).toBeUndefined();
    expect(parseProductsParams({ q: "x".repeat(150) }).q).toHaveLength(100);
  });

  it("ຄ່າຊ້ຳ (array) ໃຊ້ໂຕທຳອິດ", () => {
    expect(parseProductsParams({ category: ["shirts", "hats"], q: ["a", "b"] })).toMatchObject({ category: "shirts", q: "a" });
  });
});

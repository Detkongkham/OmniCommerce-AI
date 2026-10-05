import { describe, expect, it } from "vitest";
import { toQueryString } from "./query-string";

describe("toQueryString", () => {
  it("ຂ້າມ undefined / null / ສະຕຣິງຫວ່າງ ແລະ ເຂົ້າລະຫັດຄ່າ", () => {
    expect(toQueryString({ q: "ສີ ແດງ", page: 2, status: undefined, categoryId: "", x: null })).toBe(
      `?q=${encodeURIComponent("ສີ ແດງ")}&page=2`,
    );
  });
  it("ບໍ່ມີ param ໃດ → ສະຕຣິງຫວ່າງ", () => {
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ q: "" })).toBe("");
  });
  it("boolean ເປັນ true/false", () => {
    expect(toQueryString({ lowStock: true, includeInactive: false })).toBe("?lowStock=true&includeInactive=false");
  });
});

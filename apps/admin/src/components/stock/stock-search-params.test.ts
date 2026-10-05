import { describe, expect, it } from "vitest";
import { parseStockSearchParams } from "./stock-search-params";

describe("parseStockSearchParams", () => {
  it("ຄ່າປົກກະຕິ", () => {
    expect(parseStockSearchParams({ q: "TEE", tab: "movements" })).toEqual({ q: "TEE", tab: "movements" });
  });
  it("trim q, ຄ່າຫວ່າງ/ບໍ່ມີ -> '' ແລະ tab ເລີ່ມຕົ້ນ levels", () => {
    expect(parseStockSearchParams({ q: "  TEE  " })).toEqual({ q: "TEE", tab: "levels" });
    expect(parseStockSearchParams({ q: "   ", tab: undefined })).toEqual({ q: "", tab: "levels" });
    expect(parseStockSearchParams({})).toEqual({ q: "", tab: "levels" });
  });
  it("array ໃຊ້ຄ່າທຳອິດ", () => {
    expect(parseStockSearchParams({ q: ["A", "B"], tab: ["movements", "levels"] })).toEqual({
      q: "A",
      tab: "movements",
    });
    expect(parseStockSearchParams({ q: [], tab: [] })).toEqual({ q: "", tab: "levels" });
  });
  it("tab ທີ່ບໍ່ຮູ້ຈັກ -> levels", () => {
    expect(parseStockSearchParams({ tab: "foo" })).toEqual({ q: "", tab: "levels" });
    expect(parseStockSearchParams({ tab: null, q: null })).toEqual({ q: "", tab: "levels" });
  });
});

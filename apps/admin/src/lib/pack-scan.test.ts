import { describe, expect, it } from "vitest";
import { type PackLine, applyScan, isPackComplete, packScans, packLinesOf } from "./pack-scan";

const ITEMS = [
  { variantId: "v1", sku: "SKU-1", barcode: "8850001", productName: "Shirt", variantName: "M", quantity: 2 },
  { variantId: "v2", sku: "SKU-2", barcode: null, productName: "Mug", variantName: null, quantity: 1 },
  // variant ດຽວກັນຈາກອີກສາງ: ລວມເປັນແຖວດຽວ
  { variantId: "v2", sku: "SKU-2", barcode: null, productName: "Mug", variantName: null, quantity: 1 },
];

describe("pack-scan", () => {
  it("packLinesOf ລວມ variant ດຽວກັນ", () => {
    const lines = packLinesOf(ITEMS);
    expect(lines.map((line) => [line.variantId, line.expected, line.scanned])).toEqual([
      ["v1", 2, 0],
      ["v2", 2, 0],
    ]);
  });

  it("ຍິງ barcode ຫຼື SKU (ບໍ່ສົນຕົວໃຫຍ່/ນ້ອຍ) → ok; ເກີນ → over; ບໍ່ຢູ່ໃນບິນ → unknown (ບໍ່ນັບ)", () => {
    let lines: PackLine[] = packLinesOf(ITEMS);
    let result = applyScan(lines, " 8850001 ");
    expect(result.outcome).toEqual({ kind: "ok", variantId: "v1" });
    lines = result.lines;
    result = applyScan(lines, "sku-1");
    expect(result.outcome.kind).toBe("ok");
    lines = result.lines;
    result = applyScan(lines, "SKU-1");
    expect(result.outcome).toEqual({ kind: "over", variantId: "v1" });
    expect(result.lines).toBe(lines);
    result = applyScan(lines, "XYZ");
    expect(result.outcome).toEqual({ kind: "unknown", code: "XYZ" });
    expect(result.lines).toBe(lines);
    expect(applyScan(lines, "   ").outcome).toEqual({ kind: "empty" });
  });

  it("isPackComplete ແລະ packScans (ສົ່ງ API ເປັນ SKU ຂອງແຕ່ລະ variant)", () => {
    let lines = packLinesOf(ITEMS);
    expect(isPackComplete(lines)).toBe(false);
    for (const code of ["8850001", "SKU-1", "sku-2", "SKU-2"]) lines = applyScan(lines, code).lines;
    expect(isPackComplete(lines)).toBe(true);
    expect(packScans(lines)).toEqual([
      { code: "SKU-1", quantity: 2 },
      { code: "SKU-2", quantity: 2 },
    ]);
  });
});

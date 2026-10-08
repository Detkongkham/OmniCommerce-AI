/** ສະຖານະການຍິງກວດສິນຄ້າໃນໜ້າແພັກ (ບໍລິສຸດ; server ກວດຊ້ຳດ້ວຍ POST /fulfillment/:id/verify) */
export interface PackLine {
  variantId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  variantName: string | null;
  expected: number;
  scanned: number;
}

export type ScanOutcome =
  | { kind: "ok"; variantId: string }
  | { kind: "over"; variantId: string }
  | { kind: "unknown"; code: string }
  | { kind: "empty" };

interface PackItem {
  variantId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
}

/** ລວມແຖວຂອງ variant ດຽວກັນ (ຫຼາຍສາງ) ເປັນແຖວດຽວ */
export function packLinesOf(items: readonly PackItem[]): PackLine[] {
  const lines: PackLine[] = [];
  for (const item of items) {
    const existing = lines.find((line) => line.variantId === item.variantId);
    if (existing) existing.expected += item.quantity;
    else lines.push({ ...item, expected: item.quantity, scanned: 0 });
  }
  return lines;
}

/** code = barcode ຫຼື SKU (ບໍ່ສົນຕົວໃຫຍ່/ນ້ອຍ). ຖືກ = ນັບ +1; ເກີນ/ບໍ່ຢູ່ໃນບິນ = ບໍ່ປ່ຽນ lines */
export function applyScan(lines: PackLine[], raw: string): { lines: PackLine[]; outcome: ScanOutcome } {
  const code = raw.trim();
  if (code === "") return { lines, outcome: { kind: "empty" } };
  const upper = code.toUpperCase();
  const line = lines.find((candidate) => candidate.barcode?.toUpperCase() === upper || candidate.sku.toUpperCase() === upper);
  if (!line) return { lines, outcome: { kind: "unknown", code } };
  if (line.scanned >= line.expected) return { lines, outcome: { kind: "over", variantId: line.variantId } };
  return {
    lines: lines.map((candidate) => (candidate === line ? { ...candidate, scanned: candidate.scanned + 1 } : candidate)),
    outcome: { kind: "ok", variantId: line.variantId },
  };
}

export function isPackComplete(lines: readonly PackLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.scanned === line.expected);
}

/** body ຂອງ verify: ຈຳນວນທີ່ຍິງຕໍ່ variant (ໃຊ້ SKU ເປັນ code) */
export function packScans(lines: readonly PackLine[]): { code: string; quantity: number }[] {
  return lines.filter((line) => line.scanned > 0).map((line) => ({ code: line.sku, quantity: line.scanned }));
}

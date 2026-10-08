/** ແຖວປຽບທຽບ before/after ຂອງ audit (ລະດັບ key ທຳອິດ) */
export interface DiffRow {
  key: string;
  before: string;
  after: string;
  changed: boolean;
}

function show(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * object ທັງສອງຂ້າງ → ແຖວຕໍ່ key (ຕາມລຳດັບທີ່ພົບ); ຄ່າອື່ນ (array/ຄ່າດ່ຽວ) → ແຖວດຽວ key "value".
 * ບໍ່ມີທັງສອງ → [].
 */
export function auditDiff(before: unknown, after: unknown): DiffRow[] {
  if ((before === null || before === undefined) && (after === null || after === undefined)) return [];
  if ((isRecord(before) || before == null) && (isRecord(after) || after == null)) {
    const b = (before ?? {}) as Record<string, unknown>;
    const a = (after ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    return keys.map((key) => {
      const left = show(b[key]);
      const right = show(a[key]);
      return { key, before: left, after: right, changed: left !== right };
    });
  }
  const left = show(before);
  const right = show(after);
  return [{ key: "value", before: left, after: right, changed: left !== right }];
}

/** ລິ້ງໄປໜ້າຂອງ entity ທີ່ admin ມີໜ້າລາຍລະອຽດ; null = ບໍ່ມີໜ້າ */
export function entityHref(entity: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entity) {
    case "Order":
      return `/orders/${encodeURIComponent(entityId)}`;
    case "Product":
      return `/products/${encodeURIComponent(entityId)}`;
    case "LiveSession":
      return `/live/${encodeURIComponent(entityId)}`;
    default:
      return null;
  }
}

/** ກຸ່ມ action ຕາມ prefix (`order.*`) ສຳລັບ filter: ສະເພາະ prefix ທີ່ມີ ≥ 2 action */
export function actionGroups(actions: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const action of actions) {
    const dot = action.indexOf(".");
    if (dot > 0) counts.set(action.slice(0, dot), (counts.get(action.slice(0, dot)) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count >= 2).map(([prefix]) => `${prefix}.*`).sort();
}

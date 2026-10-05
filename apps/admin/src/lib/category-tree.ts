import type { CategoryDto } from "./types";

export interface CategoryRow {
  category: CategoryDto;
  depth: number;
}

const byOrder = (a: CategoryDto, b: CategoryDto) => a.position - b.position || a.name.localeCompare(b.name);

/** ແບນ tree ເປັນລາຍການ depth-first ພ້ອມ depth ສຳລັບ indent. ໝວດທີ່ແມ່ຫາຍຖືເປັນຮາກ; ກັນວົງຈອນ. */
export function flattenCategories(list: readonly CategoryDto[]): CategoryRow[] {
  const ids = new Set(list.map((category) => category.id));
  const children = new Map<string | null, CategoryDto[]>();
  for (const category of list) {
    const key = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(key, [...(children.get(key) ?? []), category]);
  }
  const rows: CategoryRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const category of [...(children.get(parent) ?? [])].sort(byOrder)) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  // ໝວດທີ່ຢູ່ໃນວົງຈອນ (ຫຼືຫ້ອຍຢູ່ກັບວົງຈອນ) ບໍ່ຖືກເຂົ້າເຖິງຈາກຮາກ: ເພີ່ມເປັນຮາກ ເພື່ອບໍ່ໃຫ້ຫາຍ
  for (const category of [...list].sort(byOrder)) {
    if (seen.has(category.id)) continue;
    seen.add(category.id);
    rows.push({ category, depth: 0 });
    walk(category.id, 1);
  }
  return rows;
}

/** id ຂອງລູກຫຼານທຸກຊັ້ນຂອງ `id` (ບໍ່ລວມ `id` ເອງ) */
export function descendantIds(list: readonly CategoryDto[], id: string): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const category of list) {
      if (category.parentId === current && !result.has(category.id)) {
        result.add(category.id);
        stack.push(category.id);
      }
    }
  }
  result.delete(id);
  return result;
}

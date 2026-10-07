import { randomUUID } from "node:crypto";
import { slugify } from "@oca/shared";

/** slug ຈາກຊື່ ແລະ ຕໍ່ -2, -3 ... ຈົນບໍ່ຊ້ຳ; `fallback` ໃຊ້ເມື່ອຊື່ບໍ່ມີ a-z/0-9 (ເຊັ່ນ ຊື່ລາວລ້ວນ). */
export async function uniqueSlug(
  name: string,
  fallback: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || fallback;
  if (!(await exists(base))) return base;
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base.slice(0, 90)}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base.slice(0, 80)}-${randomUUID().slice(0, 8)}`;
}

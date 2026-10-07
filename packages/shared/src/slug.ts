export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;

/** ສ້າງ slug ຈາກຊື່ (ASCII ເທົ່ານັ້ນ). ຊື່ທີ່ບໍ່ມີ a-z/0-9 ເລີຍຈະໄດ້ "" - ຜູ້ເອີ້ນຕ້ອງມີ fallback. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

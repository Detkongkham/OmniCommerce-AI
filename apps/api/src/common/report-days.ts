import { Prisma } from "@oca/database";
import { SOLD_ORDER_STATUSES } from "@oca/shared";

/**
 * ມື້ຕາມເວລາຮ້ານ ("YYYY-MM-DD") ຂອງຖັນ timestamp (Prisma ເກັບເປັນ UTC ບໍ່ມີ timezone):
 * ຕ້ອງບອກກ່ອນວ່າເປັນ UTC ແລ້ວຈຶ່ງແປງເປັນເວລາລາວ.
 */
export function storeDay(column: string): Prisma.Sql {
  return Prisma.raw(
    `to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Vientiane', 'YYYY-MM-DD')`,
  );
}

/** ທຸກມື້ຈາກ from ຫາ to (ຮວມ), "YYYY-MM-DD" */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 24 * 60 * 60 * 1000) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
}

/** SQL literal ຂອງສະຖານະບິນທີ່ນັບເປັນຍອດຂາຍ (ຄ່າຄົງທີ່ ບໍ່ແມ່ນ input ຂອງຜູ້ໃຊ້) */
export const SOLD_STATUSES_SQL: Prisma.Sql = Prisma.raw(`(${SOLD_ORDER_STATUSES.map((status) => `'${status}'`).join(", ")})`);

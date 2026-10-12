import { Prisma } from "@oca/database";

/**
 * ຈຸດດຽວຂອງສະຖິຕິ ແລະ RFM ຕໍ່ລູກຄ້າ (spec 3d §2). CTE `rfm` ມີແຖວສະເພາະລູກຄ້າທີ່ມີບິນທີ່ນັບ >= 1.
 *   R: ມື້ນັບຈາກບິນຫຼ້າສຸດ  <=30:5  <=60:4  <=90:3  <=180:2  ອື່ນ:1
 *   F: ຈຳນວນບິນ            >=10:5  >=5:4   >=3:3   2:2      1:1
 *   M: ceil(CUME_DIST ຂອງຍອດຊື້ x 5): ທຽບກັບລູກຄ້າຄົນອື່ນ, ຍອດເທົ່າກັນໄດ້ຄະແນນເທົ່າກັນ
 * ກຸ່ມ = ກົດທຳອິດທີ່ກົງ. ຜູ້ໃຊ້ຕ້ອງຕໍ່ທ້າຍດ້ວຍ SELECT ... FROM rfm (ຫຼື JOIN ກັບ "Customer").
 */
export function customerStatsCte(now: Date): Prisma.Sql {
  return Prisma.sql`
    WITH stats AS (
      SELECT o."customerId" AS id,
             COUNT(*)::int AS "orderCount",
             SUM(o."subtotal") AS "totalSpent",
             MIN(o."paidAt") AS "firstPaidAt",
             MAX(o."paidAt") AS "lastPaidAt"
      FROM "Order" o
      WHERE o."customerId" IS NOT NULL AND o."status" IN ('PAID', 'PACKING', 'SHIPPED', 'COMPLETED')
      GROUP BY o."customerId"
    ),
    scored AS (
      SELECT s.*,
             CASE
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '30 days' THEN 5
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '60 days' THEN 4
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '90 days' THEN 3
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '180 days' THEN 2
               ELSE 1
             END AS r,
             CASE
               WHEN s."orderCount" >= 10 THEN 5
               WHEN s."orderCount" >= 5 THEN 4
               WHEN s."orderCount" >= 3 THEN 3
               WHEN s."orderCount" = 2 THEN 2
               ELSE 1
             END AS f,
             CEIL(CUME_DIST() OVER (ORDER BY s."totalSpent") * 5)::int AS m
      FROM stats s
    ),
    rfm AS (
      SELECT sc.*,
             CASE
               WHEN sc.r >= 4 AND sc.f >= 4 AND sc.m >= 4 THEN 'CHAMPION'
               WHEN sc.r >= 3 AND sc.f >= 3 THEN 'LOYAL'
               WHEN sc.r >= 4 AND sc.f = 1 THEN 'NEW'
               WHEN sc.r <= 2 AND (sc.f >= 3 OR sc.m >= 4) THEN 'AT_RISK'
               WHEN sc.r = 1 THEN 'LOST'
               ELSE 'REGULAR'
             END AS segment
      FROM scored sc
    )`;
}

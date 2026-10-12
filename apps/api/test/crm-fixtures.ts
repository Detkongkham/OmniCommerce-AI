import type { OrderStatus, PrismaClient } from "@oca/database";

const DAY_MS = 24 * 60 * 60 * 1000;
let sequence = 0;

/** ບິນສຳເລັດຮູບຂອງລູກຄ້າ (ຂ້າມ stock engine): ໃຊ້ທົດສອບສະຖິຕິ/RFM. paidDaysAgo = ອາຍຸຂອງ paidAt */
export async function seedCustomerOrder(
  db: PrismaClient,
  customerId: string,
  options: { subtotal?: string; paidDaysAgo?: number; status?: OrderStatus } = {},
) {
  sequence += 1;
  const status = options.status ?? "COMPLETED";
  const subtotal = options.subtotal ?? "100.00";
  const paid = ["PAID", "PACKING", "SHIPPED", "COMPLETED"].includes(status);
  const paidAt = paid ? new Date(Date.now() - (options.paidDaysAgo ?? 0) * DAY_MS) : null;
  return db.order.create({
    data: {
      orderNumber: `CRM-${String(sequence).padStart(5, "0")}`,
      customerId,
      channel: "OFFLINE",
      source: "MANUAL",
      status,
      currency: "LAK",
      subtotal,
      vatRate: "0",
      vatAmount: "0",
      total: subtotal,
      paidAt,
      createdAt: paidAt ?? new Date(),
    },
  });
}

/** ຫຼາຍບິນ: ບິນຫຼ້າສຸດອາຍຸ lastDaysAgo, ບິນກ່ອນໜ້າເກົ່າຂຶ້ນບິນລະ 1 ມື້ */
export async function seedCustomerOrders(db: PrismaClient, customerId: string, count: number, lastDaysAgo: number, subtotal = "100.00") {
  for (let index = 0; index < count; index += 1) {
    await seedCustomerOrder(db, customerId, { subtotal, paidDaysAgo: lastDaysAgo + index });
  }
}

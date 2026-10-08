import type { PrismaClient } from "@oca/database";
import { apiError } from "../../common/api-error";
import { type SlipRow, slipInclude } from "./slips.mapper";

/** ຊ່ວຍຮ່ວມຂອງ SlipsService ແລະ SlipReviewService: ຫາແຖວ ຫຼື throw 404 */
export async function requireOrder(prisma: PrismaClient, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
}

export async function requireRow(prisma: PrismaClient, id: string): Promise<SlipRow> {
  const row = await prisma.paymentSlip.findUnique({ where: { id }, include: slipInclude });
  if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
  return row;
}

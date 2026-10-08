import type { OrderSource, OrderStatus, PrismaClient, SalesChannel } from "@oca/database";

let seq = 0;

/**
 * ບິນສຳລັບ test ລາຍງານ (ຂຽນລົງ DB ໂດຍກົງ ບໍ່ຈອງສະຕ໋ອກ). ເງິນ: total = subtotal + shipping (ລາຄາລວມ VAT),
 * VAT ກຳນົດເອງໄດ້. items: unitPrice/unitCost/quantity ຂອງ variant.
 */
export async function makeOrder(
  db: PrismaClient,
  options: {
    status?: OrderStatus;
    channel?: SalesChannel;
    source?: OrderSource;
    createdById?: string | null;
    customerId?: string | null;
    createdAt?: Date;
    paidAt?: Date | null;
    cancelledAt?: Date | null;
    shippingFee?: string;
    discountTotal?: string;
    vatAmount?: string;
    items: { variantId: string; warehouseId: string; unitPrice: string; unitCost: string; quantity: number; sku?: string }[];
  },
) {
  seq += 1;
  const subtotal = options.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0) - Number(options.discountTotal ?? 0);
  const total = subtotal + Number(options.shippingFee ?? 0);
  const status = options.status ?? "PAID";
  const createdAt = options.createdAt ?? new Date();
  return db.order.create({
    data: {
      orderNumber: `T-${String(seq).padStart(6, "0")}-${Math.random().toString(36).slice(2, 6)}`,
      channel: options.channel ?? "OFFLINE",
      source: options.source ?? "MANUAL",
      status,
      currency: "LAK",
      subtotal: subtotal.toFixed(2),
      discountTotal: options.discountTotal ?? "0",
      shippingFee: options.shippingFee ?? "0",
      vatRate: "10",
      vatAmount: options.vatAmount ?? "0",
      total: total.toFixed(2),
      createdById: options.createdById ?? null,
      customerId: options.customerId ?? null,
      createdAt,
      paidAt: options.paidAt === undefined ? (status === "PENDING_PAYMENT" ? null : createdAt) : options.paidAt,
      cancelledAt: options.cancelledAt ?? null,
      items: {
        create: options.items.map((item) => ({
          variantId: item.variantId,
          warehouseId: item.warehouseId,
          productName: "Product",
          sku: item.sku ?? "SKU",
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          quantity: item.quantity,
          lineTotal: (Number(item.unitPrice) * item.quantity).toFixed(2),
        })),
      },
    },
  });
}

/** ເວລາຮ້ານ (UTC+7) → Date */
export const storeTime = (local: string): Date => new Date(`${local}+07:00`);

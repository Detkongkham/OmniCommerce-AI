import { computeSlipFlags, receivingAccountSchema } from "@oca/shared";
import type { PrismaClient } from "../generated/client";

export interface EvaluateSlipOptions {
  /** ສຳລັບ test */
  now?: Date;
}

/** ຄ່າທີ່ໃຊ້ຕັດສິນ: ແອດມິນຢືນຢັນ/ແກ້ແລ້ວ ໃຊ້ກ່ອນຄ່າທີ່ເຄື່ອງອ່ານ */
function effective<T>(confirmed: T | null, read: T | null): T | null {
  return confirmed ?? read;
}

/**
 * ຄິດ flag ຂອງສະລິບ ແລະ ບັນທຶກລົງ `PaymentSlip.flags` (ໃຊ້ຮ່ວມໂດຍ API ແລະ worker).
 * duplicate = ສະລິບອື່ນ (ບໍ່ແມ່ນ REJECTED, ບໍ່ແມ່ນຕົວເອງ) ທີ່ມີ refNo+ບັນຊີ ຫຼື sha256 ດຽວກັນ.
 */
export async function evaluateSlip(db: PrismaClient, slipId: string, options: EvaluateSlipOptions = {}) {
  const slip = await db.paymentSlip.findUnique({
    where: { id: slipId },
    include: { order: { select: { total: true, currency: true, exchangeRate: true, createdAt: true, status: true, reservedUntil: true } } },
  });
  if (!slip) throw new Error(`Slip ${slipId} not found`);

  const setting = await db.storeSetting.findUnique({ where: { id: 1 }, select: { receivingAccounts: true } });
  const receivingAccounts = (Array.isArray(setting?.receivingAccounts) ? setting.receivingAccounts : []).flatMap((entry) => {
    const parsed = receivingAccountSchema.safeParse(entry);
    return parsed.success ? [{ accountNo: parsed.data.accountNo }] : [];
  });

  const amount = effective(slip.confirmedAmount, slip.readAmount);
  const refNo = effective(slip.confirmedRefNo, slip.readRefNo);
  const destAccount = effective(slip.confirmedDestAccount, slip.readDestAccount);

  const others = { id: { not: slip.id }, status: { not: "REJECTED" as const } };
  const [refDuplicate, imageDuplicate] = await Promise.all([
    refNo
      ? db.paymentSlip.findFirst({
          where: {
            ...others,
            OR: [{ readRefNo: refNo }, { confirmedRefNo: refNo }],
            // ເລກອ້າງອີງຊ້ຳ ແຕ່ບັນຊີປາຍທາງຕ່າງ ບໍ່ແມ່ນສະລິບຊ້ຳ (ຄົນລະທະນາຄານອາດໃຊ້ເລກຄືກັນ)
            ...(destAccount ? { AND: [{ OR: [{ readDestAccount: destAccount }, { confirmedDestAccount: destAccount }] }] } : {}),
          },
          select: { id: true },
        })
      : null,
    db.paymentSlip.findFirst({ where: { ...others, imageSha256: slip.imageSha256 }, select: { id: true } }),
  ]);

  const flags = computeSlipFlags({
    amount: amount?.toFixed(2) ?? null,
    currency: effective(slip.confirmedCurrency, slip.readCurrency),
    paidAt: effective(slip.confirmedPaidAt, slip.readPaidAt),
    destAccount,
    refNo,
    order: slip.order
      ? {
          total: slip.order.total.toFixed(2),
          currency: slip.order.currency,
          exchangeRate: slip.order.exchangeRate.toString(),
          createdAt: slip.order.createdAt,
          status: slip.order.status,
          reservedUntil: slip.order.reservedUntil,
        }
      : null,
    receivingAccounts,
    duplicateRef: refDuplicate !== null,
    duplicateImage: imageDuplicate !== null,
    now: options.now ?? new Date(),
  });

  await db.paymentSlip.update({ where: { id: slip.id }, data: { flags } });
  return flags;
}

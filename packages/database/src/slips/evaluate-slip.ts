import { type SlipFlag, computeSlipFlags, receivingAccountSchema, sameAccount } from "@oca/shared";
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
 * duplicate ເປັນ advisory ແລະ ບໍ່ເປັນ transaction (ປະເມີນພ້ອມກັນອາດພາດກັນ; ປະເມີນຄືນຕອນແກ້/ຢືນຢັນຈະແກ້ເອງ).
 * duplicate = ສະລິບອື່ນ (ບໍ່ແມ່ນ REJECTED, ບໍ່ແມ່ນຕົວເອງ) ທີ່ມີ refNo+ບັນຊີ ຫຼື sha256 ດຽວກັນ.
 */
export async function evaluateSlip(db: PrismaClient, slipId: string, options: EvaluateSlipOptions = {}): Promise<SlipFlag[]> {
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
  const [refCandidates, imageDuplicate] = await Promise.all([
    refNo
      ? db.paymentSlip.findMany({
          where: { ...others, OR: [{ readRefNo: refNo }, { confirmedRefNo: refNo }] },
          select: { readRefNo: true, confirmedRefNo: true, readDestAccount: true, confirmedDestAccount: true },
          take: 20,
        })
      : [],
    db.paymentSlip.findFirst({ where: { ...others, imageSha256: slip.imageSha256 }, select: { id: true } }),
  ]);
  // ຂາດບັນຊີປາຍທາງຝ່າຍໃດຝ່າຍໜຶ່ງ = ບໍ່ຮູ້ → ຍັງຖືວ່າຊ້ຳ (flag ເປັນຄຳແນະນຳ); ມີທັງສອງແລະຕ່າງກັນຈິງ ຈຶ່ງບໍ່ຊ້ຳ
  const refDuplicate = refCandidates.some((candidate) => {
    if (effective(candidate.confirmedRefNo, candidate.readRefNo) !== refNo) return false;
    const candidateDest = effective(candidate.confirmedDestAccount, candidate.readDestAccount);
    return !destAccount || !candidateDest || sameAccount(candidateDest, destAccount);
  });

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
    duplicateRef: refDuplicate,
    duplicateImage: imageDuplicate !== null,
    now: options.now ?? new Date(),
  });

  await db.paymentSlip.update({ where: { id: slip.id }, data: { flags } });
  return flags;
}

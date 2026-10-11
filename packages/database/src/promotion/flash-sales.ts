import type { Prisma, PrismaClient } from "../generated/client";
import type { Tx } from "../inventory/stock-engine";

type Decimal = Prisma.Decimal;

/** ລາຄາພິເສດທີ່ກຳລັງມີຜົນຂອງ variant ໜຶ່ງ */
export interface ActiveFlashPrice {
  flashSaleId: string;
  salePrice: Decimal;
  endsAt: Date;
}

/**
 * ລາຄາ Flash Sale ທີ່ກຳລັງດຳເນີນ (isActive ແລະ startsAt <= now < endsAt) ຂອງ variant ທີ່ຖາມ.
 * ຖ້າ variant ຢູ່ໃນຫຼາຍແຄມເປນພ້ອມກັນ (ບໍ່ຄວນເກີດ: API ກັນການຊ້ອນ) ໃຊ້ລາຄາຕ່ຳສຸດ.
 */
export async function activeFlashPrices(
  db: Tx | PrismaClient,
  variantIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, ActiveFlashPrice>> {
  const prices = new Map<string, ActiveFlashPrice>();
  if (variantIds.length === 0) return prices;
  const rows = await db.flashSaleItem.findMany({
    where: {
      variantId: { in: [...variantIds] },
      flashSale: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    },
    select: { variantId: true, salePrice: true, flashSale: { select: { id: true, endsAt: true } } },
  });
  for (const row of rows) {
    const current = prices.get(row.variantId);
    if (!current || row.salePrice.lessThan(current.salePrice)) {
      prices.set(row.variantId, { flashSaleId: row.flashSale.id, salePrice: row.salePrice, endsAt: row.flashSale.endsAt });
    }
  }
  return prices;
}

export interface EffectivePrice {
  /** ລາຄາທີ່ຂາຍຕອນນີ້ */
  price: Decimal;
  regularPrice: Decimal;
  /** null = ຂາຍໃນລາຄາປົກກະຕິ */
  flashSaleId: string | null;
  saleEndsAt: Date | null;
}

/**
 * ຈຸດດຽວທີ່ຕັດສິນລາຄາຂາຍ: ລາຄາພິເສດມີຜົນສະເພາະເມື່ອຕ່ຳກວ່າລາຄາປົກກະຕິ
 * (ຖ້າລາຄາປົກກະຕິຖືກແກ້ຈົນຕ່ຳກວ່າ/ເທົ່າລາຄາພິເສດ ຖືວ່າບໍ່ມີ Flash Sale).
 * ທຸກບ່ອນທີ່ສະແດງ ຫຼື ຄິດລາຄາຂາຍຕ້ອງຜ່ານຟັງຊັນນີ້.
 */
export function effectivePrice(regularPrice: Decimal, flash: ActiveFlashPrice | undefined): EffectivePrice {
  if (!flash || !flash.salePrice.lessThan(regularPrice)) {
    return { price: regularPrice, regularPrice, flashSaleId: null, saleEndsAt: null };
  }
  return { price: flash.salePrice, regularPrice, flashSaleId: flash.flashSaleId, saleEndsAt: flash.endsAt };
}

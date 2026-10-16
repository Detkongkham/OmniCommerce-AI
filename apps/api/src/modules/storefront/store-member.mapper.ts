import { Prisma } from "@oca/database";
import {
  type MemberTier,
  type NextTierInfo,
  type OrderStatus,
  type PointEntryType,
  type SalesChannel,
  type TierRule,
  nextTierAfter,
  tierMultiplier,
} from "@oca/shared";
import { money } from "../../common/money";
import { isReservationExpired } from "./storefront.mapper";

/**
 * ແຖວ ແລະ DTO ຂອງສະມາຊິກເທິງເວັບ (ເບີ + PIN). `id` ຂອງລູກຄ້າຢູ່ໃນແຖວສຳລັບໃຊ້ພາຍໃນ API ເທົ່ານັ້ນ:
 * DTO ບໍ່ມີ id, pinHash ຫຼື ບັນທຶກພາຍໃນຂອງແອດມິນ.
 */
export const storeMemberSelect = {
  id: true,
  name: true,
  phone: true,
  pointsBalance: true,
  tier: true,
} as const satisfies Prisma.CustomerSelect;

/** ລູກຄ້າຂອງ session ສະມາຊິກ (ໃຊ້ພາຍໃນ API; `id` ບໍ່ອອກໄປຫາ client) */
export type StoreMemberRow = Prisma.CustomerGetPayload<{ select: typeof storeMemberSelect }>;

export interface StoreMemberDto {
  name: string;
  phone: string | null;
  pointsBalance: number;
  tier: MemberTier;
  /** ຍອດຊື້ 12 ເດືອນຫຼ້າສຸດ (ຕົວກຳນົດລະດັບ) */
  spend12m: string;
  /** ລະດັບຖັດຈາກ `tier`, ເກນຂອງມັນ ແລະ ຍອດທີ່ຕ້ອງຊື້ຕື່ມ (ບໍ່ຕິດລົບ); null = ລະດັບສູງສຸດແລ້ວ */
  nextTier: NextTierInfo | null;
  /** ຕົວຄູນແຕ້ມຂອງລະດັບປັດຈຸບັນ ເຊັ່ນ "1.25" */
  pointsMultiplier: string;
}

export function toStoreMember(row: StoreMemberRow, spend12m: string, rules: readonly TierRule[]): StoreMemberDto {
  return {
    name: row.name,
    phone: row.phone,
    pointsBalance: row.pointsBalance,
    tier: row.tier,
    spend12m,
    nextTier: nextTierAfter(rules, row.tier, spend12m),
    pointsMultiplier: tierMultiplier(rules, row.tier),
  };
}

export const storeMemberOrderSelect = {
  orderNumber: true,
  createdAt: true,
  status: true,
  reservedUntil: true,
  total: true,
  channel: true,
  publicToken: true,
} as const satisfies Prisma.OrderSelect;

type StoreMemberOrderRow = Prisma.OrderGetPayload<{ select: typeof storeMemberOrderSelect }>;

export interface StoreMemberOrderDto {
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  total: string;
  channel: SalesChannel;
  /** ລິ້ງຕິດຕາມບິນ (/orders/:token) ສະເພາະບິນຂອງເວັບ; ຊ່ອງທາງອື່ນ = null */
  token: string | null;
}

export function toStoreMemberOrder(row: StoreMemberOrderRow, now: Date = new Date()): StoreMemberOrderDto {
  return {
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    status: isReservationExpired(row, now) ? "EXPIRED" : row.status,
    total: money(row.total),
    channel: row.channel,
    token: row.channel === "STOREFRONT" ? row.publicToken : null,
  };
}

/** ບໍ່ select `note`/`actorId`: note ຂອງ ADJUST ແມ່ນບັນທຶກຂອງພະນັກງານ (ບໍ່ມີເຫດຜົນແຍກສຳລັບລູກຄ້າ) */
export const storeMemberPointSelect = {
  createdAt: true,
  type: true,
  points: true,
  balanceAfter: true,
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.PointEntrySelect;

type StoreMemberPointRow = Prisma.PointEntryGetPayload<{ select: typeof storeMemberPointSelect }>;

export interface StoreMemberPointDto {
  createdAt: Date;
  type: PointEntryType;
  /** ມີເຄື່ອງໝາຍ: ບວກ = ໄດ້, ລົບ = ໃຊ້ */
  points: number;
  balanceAfter: number;
  orderNumber: string | null;
}

export function toStoreMemberPoint(row: StoreMemberPointRow): StoreMemberPointDto {
  return {
    createdAt: row.createdAt,
    type: row.type,
    points: row.points,
    balanceAfter: row.balanceAfter,
    orderNumber: row.order?.orderNumber ?? null,
  };
}

import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import { type ReceivingAccount, type TierRule, type UpdateStoreSettingsInput, parseTierRules, receivingAccountSchema } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { type StoreSettingRow, ensureStoreSetting } from "./ensure-store-setting";

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  /** string ສອງທົດສະນິຍົມ ("7.00") ຄືກັບ vatRate ຂອງບິນ */
  vatRate: string;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
  /** null = payment reminders off */
  paymentReminderMinutes: number | null;
  /** ແຕ້ມ ແລະ ລະດັບສະມາຊິກ: ປິດ = ບໍ່ໃຫ້ແຕ້ມ ແລະ ແລກບໍ່ໄດ້ (ແຕ້ມທີ່ມີຢູ່ບໍ່ຫາຍ) */
  loyaltyEnabled: boolean;
  /** ກີບຕໍ່ 1 ແຕ້ມທີ່ໄດ້ */
  pointsEarnPer: string;
  /** ກີບຕໍ່ 1 ແຕ້ມຕອນແລກ */
  pointValue: string;
  pointsMaxRedeemPercent: number;
  tierRules: TierRule[];
  paymentInstructions: string | null;
  receivingAccounts: ReceivingAccount[];
}

/** ອ່ານ Json ຂອງ DB ຢ່າງປອດໄພ: ຂ້າມລາຍການທີ່ຮູບແບບຜິດ (ແກ້ໃນ DB ດ້ວຍມື) ແທນທີ່ຈະເຮັດໃຫ້ GET ລົ້ມ */
function parseReceivingAccounts(value: unknown): ReceivingAccount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = receivingAccountSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function toStoreSettingsDto(row: StoreSettingRow): StoreSettingsDto {
  return {
    name: row.name,
    baseCurrency: row.baseCurrency,
    vatRate: row.vatRate.toFixed(2),
    pricesIncludeVat: row.pricesIncludeVat,
    reservationMinutes: row.reservationMinutes,
    paymentReminderMinutes: row.paymentReminderMinutes,
    loyaltyEnabled: row.loyaltyEnabled,
    pointsEarnPer: row.pointsEarnPer.toFixed(2),
    pointValue: row.pointValue.toFixed(2),
    pointsMaxRedeemPercent: row.pointsMaxRedeemPercent,
    tierRules: parseTierRules(row.tierRules),
    paymentInstructions: row.paymentInstructions,
    receivingAccounts: parseReceivingAccounts(row.receivingAccounts),
  };
}

@Injectable()
export class StoreSettingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** ສ້າງແຖວເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ກໍລະນີຍັງບໍ່ໄດ້ run seed). */
  async get(): Promise<StoreSettingsDto> {
    return toStoreSettingsDto(await ensureStoreSetting(this.prisma));
  }

  async update(input: UpdateStoreSettingsInput, actor: AuthUser, ip: string | undefined): Promise<StoreSettingsDto> {
    const before = await ensureStoreSetting(this.prisma);
    const after = await this.prisma.storeSetting.update({
      where: { id: 1 },
      data: {
        name: input.name,
        vatRate: input.vatRate === undefined ? undefined : new Prisma.Decimal(input.vatRate).toFixed(2),
        pricesIncludeVat: input.pricesIncludeVat,
        reservationMinutes: input.reservationMinutes,
        paymentReminderMinutes: input.paymentReminderMinutes,
        loyaltyEnabled: input.loyaltyEnabled,
        pointsEarnPer: input.pointsEarnPer,
        pointValue: input.pointValue,
        pointsMaxRedeemPercent: input.pointsMaxRedeemPercent,
        tierRules: input.tierRules as Prisma.InputJsonValue | undefined,
        paymentInstructions: input.paymentInstructions,
        receivingAccounts: input.receivingAccounts as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: "settings.store.update",
      entity: "StoreSetting",
      entityId: "1",
      before: { ...toStoreSettingsDto(before) },
      after: { ...toStoreSettingsDto(after) },
      ip,
    });
    return toStoreSettingsDto(after);
  }
}

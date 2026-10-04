import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { UpdateStoreSettingsInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { type StoreSettingRow, ensureStoreSetting } from "./ensure-store-setting";

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  vatRate: number;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}

export function toStoreSettingsDto(row: StoreSettingRow): StoreSettingsDto {
  return {
    name: row.name,
    baseCurrency: row.baseCurrency,
    vatRate: Number(row.vatRate.toString()),
    pricesIncludeVat: row.pricesIncludeVat,
    reservationMinutes: row.reservationMinutes,
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
        vatRate: input.vatRate === undefined ? undefined : input.vatRate.toFixed(2),
        pricesIncludeVat: input.pricesIncludeVat,
        reservationMinutes: input.reservationMinutes,
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

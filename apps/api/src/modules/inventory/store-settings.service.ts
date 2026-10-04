import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { UpdateStoreSettingsInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  vatRate: number;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}

type SettingsRow = Awaited<ReturnType<PrismaClient["storeSetting"]["upsert"]>>;

export function toStoreSettingsDto(row: SettingsRow): StoreSettingsDto {
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
    return toStoreSettingsDto(await this.ensure());
  }

  async update(input: UpdateStoreSettingsInput, actor: AuthUser, ip: string | undefined): Promise<StoreSettingsDto> {
    const before = await this.ensure();
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

  private ensure(): Promise<SettingsRow> {
    return this.prisma.storeSetting.upsert({
      where: { id: 1 },
      create: { id: 1, name: "OCA Store" },
      update: {},
    });
  }
}

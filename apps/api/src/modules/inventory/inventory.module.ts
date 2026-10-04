import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { InsufficientStockFilter } from "./insufficient-stock.filter";
import { StoreSettingsController } from "./store-settings.controller";
import { StoreSettingsService } from "./store-settings.service";

@Module({
  controllers: [StoreSettingsController],
  providers: [{ provide: APP_FILTER, useClass: InsufficientStockFilter }, StoreSettingsService],
})
export class InventoryModule {}

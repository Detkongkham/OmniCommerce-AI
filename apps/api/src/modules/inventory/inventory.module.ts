import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { InsufficientStockFilter } from "./insufficient-stock.filter";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";
import { StoreSettingsController } from "./store-settings.controller";
import { StoreSettingsService } from "./store-settings.service";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";

@Module({
  controllers: [StoreSettingsController, WarehousesController, CategoriesController, ProductsController, StockController],
  providers: [
    { provide: APP_FILTER, useClass: InsufficientStockFilter },
    StoreSettingsService,
    WarehousesService,
    CategoriesService,
    ProductsService,
    StockService,
  ],
})
export class InventoryModule {}

import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { StoreCatalogService } from "./store-catalog.service";
import { StoreOrdersService } from "./store-orders.service";
import { StoreRateLimiter } from "./store-rate-limiter";
import { StorefrontController } from "./storefront.controller";

/** ໂມດູນ 7 (Storefront): API ສາທາລະນະ `/store/*` ຂອງໜ້າຮ້ານ. ບໍ່ແມ່ນ permission module (ບໍ່ມີສິດຂອງຕົນ) */
@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [StorefrontController],
  providers: [
    StoreCatalogService,
    StoreOrdersService,
    { provide: StoreRateLimiter, useFactory: () => new StoreRateLimiter() },
  ],
})
export class StorefrontModule {}

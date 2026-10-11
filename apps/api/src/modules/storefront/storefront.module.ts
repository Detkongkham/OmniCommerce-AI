import { Module } from "@nestjs/common";
import { StoreCatalogService } from "./store-catalog.service";
import { StoreRateLimiter } from "./store-rate-limiter";
import { StorefrontController } from "./storefront.controller";

/** ໂມດູນ 7 (Storefront): API ສາທາລະນະ `/store/*` ຂອງໜ້າຮ້ານ. ບໍ່ແມ່ນ permission module (ບໍ່ມີສິດຂອງຕົນ) */
@Module({
  controllers: [StorefrontController],
  providers: [StoreCatalogService, { provide: StoreRateLimiter, useFactory: () => new StoreRateLimiter() }],
})
export class StorefrontModule {}

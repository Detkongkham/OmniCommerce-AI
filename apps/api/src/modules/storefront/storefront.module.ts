import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../../auth/auth.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { StoreCatalogService } from "./store-catalog.service";
import { StoreMemberService } from "./store-member.service";
import { StoreOrdersService } from "./store-orders.service";
import { StoreRateLimiter } from "./store-rate-limiter";
import { StorefrontController } from "./storefront.controller";

/** ໂມດູນ 7 (Storefront): API ສາທາລະນະ `/store/*` ຂອງໜ້າຮ້ານ. ບໍ່ແມ່ນ permission module (ບໍ່ມີສິດຂອງຕົນ) */
@Module({
  imports: [OrdersModule, PaymentsModule, AuthModule, JwtModule.register({})],
  controllers: [StorefrontController],
  providers: [
    StoreCatalogService,
    StoreOrdersService,
    StoreMemberService,
    { provide: StoreRateLimiter, useFactory: () => new StoreRateLimiter() },
  ],
})
export class StorefrontModule {}

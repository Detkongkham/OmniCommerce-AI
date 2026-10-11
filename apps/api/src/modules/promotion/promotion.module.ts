import { Module } from "@nestjs/common";
import { CouponsController } from "./coupons.controller";
import { CouponsService } from "./coupons.service";

/** ໂມດູນ 5 (Promotion): ໂຄດສ່ວນຫຼຸດ. ການກວດ/ໃຊ້ໂຄດຕອນສ້າງບິນຢູ່ໃນ OrdersService ຜ່ານ `evaluateCoupon` ຂອງ @oca/database */
@Module({
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class PromotionModule {}

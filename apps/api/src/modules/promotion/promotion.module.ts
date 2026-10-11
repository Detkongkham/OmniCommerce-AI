import { Module } from "@nestjs/common";
import { CouponsController } from "./coupons.controller";
import { CouponsService } from "./coupons.service";
import { FlashSalesController } from "./flash-sales.controller";
import { InboxModule } from "../inbox/inbox.module";
import { FlashSalesService } from "./flash-sales.service";
import { PaymentReminderService } from "./payment-reminder.service";

/**
 * ໂມດູນ 5 (Promotion): ໂຄດສ່ວນຫຼຸດ ແລະ Flash Sale. ການໃຊ້ຕອນສ້າງບິນຢູ່ໃນ OrdersService ຜ່ານ
 * `evaluateCoupon` / `activeFlashPrices` ຂອງ @oca/database (ບໍ່ມີ module ໃດ import ໂມດູນນີ້).
 */
@Module({
  imports: [InboxModule],
  controllers: [CouponsController, FlashSalesController],
  providers: [CouponsService, FlashSalesService, PaymentReminderService],
})
export class PromotionModule {}

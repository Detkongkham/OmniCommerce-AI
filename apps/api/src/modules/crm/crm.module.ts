import { Module } from "@nestjs/common";
import { CrmCustomersController } from "./crm-customers.controller";
import { CrmCustomersService } from "./crm-customers.service";

/** ໂມດູນ 11 (CRM): Customer 360 + RFM. ແຕ້ມ/ລະດັບສະມາຊິກ ເພີ່ມໃນ D2 */
@Module({
  controllers: [CrmCustomersController],
  providers: [CrmCustomersService],
})
export class CrmModule {}

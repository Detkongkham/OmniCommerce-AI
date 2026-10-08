import { Module } from "@nestjs/common";
import { LocalDiskStorage } from "@oca/ai-engine";
import { ENV, type Env } from "../../config/env";
import { OrdersModule } from "../orders/orders.module";
import { BullSlipQueue, SLIP_FETCH, SLIP_QUEUE, SLIP_STORAGE } from "./slip.providers";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";

/** ໂມດູນ 9 (Slip Verification): ຮັບສະລິບ, ໃຫ້ແອດມິນກວດ/ຢືນຢັນ (ການອ່ານດ້ວຍ AI ຢູ່ worker) */
@Module({
  imports: [OrdersModule],
  controllers: [SlipsController],
  providers: [
    SlipsService,
    { provide: SLIP_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.SLIP_STORAGE_DIR) },
    { provide: SLIP_QUEUE, inject: [ENV], useFactory: (env: Env) => new BullSlipQueue(env) },
    { provide: SLIP_FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
  ],
})
export class PaymentsModule {}

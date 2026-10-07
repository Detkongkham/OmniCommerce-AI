import { Module } from "@nestjs/common";

// ໂມດູນ 9 (Slip Verification): ຍັງບໍ່ມີ logic. ສິດ `payments:write` ໃຊ້ຢືນຢັນຊຳລະ (POST /orders/:id/pay) ໄປກ່ອນ
@Module({})
export class PaymentsModule {}

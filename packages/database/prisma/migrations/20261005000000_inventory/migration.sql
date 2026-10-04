-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN "reservationMinutes" INTEGER NOT NULL DEFAULT 30;

-- ຂຽນເພີ່ມດ້ວຍມື: Prisma schema ບໍ່ຮອງຮັບ CHECK constraint ແລະ sequence
ALTER TABLE "StoreSetting" ADD CONSTRAINT "StoreSetting_reservation_check"
  CHECK ("reservationMinutes" BETWEEN 1 AND 10080);

-- ເລກບິນ: "SO-" + lpad(nextval, 6, '0') ສ້າງໃນ OrdersService
CREATE SEQUENCE "Order_number_seq" START 1;

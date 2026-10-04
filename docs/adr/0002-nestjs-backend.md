# ADR 0002: ໃຊ້ NestJS ເປັນ Backend

* **ສະຖານະ:** ຕົກລົງແລ້ວ
* **ວັນທີ:** 2026-10-04

## ບໍລິບົດ
README ເດີມລະບຸ "NestJS / Express" ໂດຍຍັງບໍ່ໄດ້ເລືອກ.

## ການຕັດສິນໃຈ
ໃຊ້ **NestJS + TypeScript** ສຳລັບ `apps/api` ແລະ `apps/worker`.

## ເຫດຜົນ
* ລະບົບ module ຂອງ NestJS ກົງກັບ 12 ໂມດູນ (`apps/api/src/modules/*`).
* ມີ WebSocket gateway (Socket.io) ແລະ BullMQ ຮອງຮັບໃນຕົວ.

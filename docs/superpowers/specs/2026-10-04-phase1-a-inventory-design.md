# Phase 1-A: Inventory (ໂມດູນ 7) Design

Sub-project ທຳອິດຂອງ Phase 1 ([ROADMAP](../../ROADMAP.md)). ແບ່ງເປັນ 2 plan: **1a-api** (API + worker) ແລະ **1a-ui** (ໜ້າ admin). ໂມດູນ Inbox, CF Engine ແລະ Slip Verification ເປັນ sub-project ແຍກ ແລະຈະເອີ້ນ `StockService` / `OrdersService` ຂອງໂມດູນນີ້.

Schema ມີຄົບແລ້ວ ([DATABASE.md](../../DATABASE.md)). ການປ່ຽນ schema ມີພຽງ `StoreSetting.reservationMinutes` ແລະ sequence ຂອງເລກບິນ.

## ການຕັດສິນໃຈ
* **ເຄື່ອງຈັກສະຕ໋ອກ = conditional `UPDATE` ດ້ວຍ raw SQL ໃນ `$transaction` ດຽວ** (ຕາມ DATABASE.md). ບໍ່ອ່ານແລ້ວຂຽນທັບ, ບໍ່ໃຊ້ `FOR UPDATE`, ບໍ່ມີ version column.
* **ຄຳສັ່ງຊື້ໃນ 1a:** admin ສ້າງດ້ວຍມື (channel `OFFLINE`, source `MANUAL`) ແລະ ຂັບວົງຈອນເຕັມ PENDING_PAYMENT → PAID → PACKING → SHIPPED → COMPLETED ພ້ອມ CANCELLED / EXPIRED. ການຢືນຢັນຊຳລະແມ່ນ admin ກົດເອງ (Slip Verification ມາທີຫຼັງ).
* **ສາງ:** ຈອງຈາກສາງ default ເປັນຄ່າເລີ່ມຕົ້ນ, ແຕ່ແຕ່ລະລາຍການລະບຸ `warehouseId` ໄດ້. ບໍ່ມີ auto-allocate ຂ້າມສາງ.
* **ຮູບສິນຄ້າ:** admin ໃສ່ `url` ດ້ວຍມື. ບໍ່ມີ upload (ໄປກັບ Image Studio, ເຟດ 3).
* **ເວລາຈອງ:** `StoreSetting.reservationMinutes` (default 30). ບິນໜຶ່ງ override ໄດ້ດ້ວຍ `reservationMinutes` ໃນ request ຕອນສ້າງ; ຜົນເກັບໃນ `Order.reservedUntil`.
* **ສິດ:** ໃຊ້ `inventory:read` / `inventory:write` ທີ່ມີຢູ່ (ບໍ່ເພີ່ມ module ໃໝ່). ການແກ້ສິນຄ້າ, ການເຄື່ອນໄຫວສະຕ໋ອກ ແລະ ການປ່ຽນສະຖານະບິນ ຂຽນ `AuditLog`.

## ໂຄງສ້າງ `apps/api/src/modules/inventory/`
| ໜ່ວຍ | ໜ້າທີ່ | ເອີ້ນໃຊ້ |
|---|---|---|
| `CategoriesService` | CRUD ໝວດໝູ່ (tree, slug unique) | controller |
| `ProductsService` | ສິນຄ້າ + options + variants + ຮູບ (URL). ສ້າງ/ແກ້ໃນ transaction; ສິນຄ້າບໍ່ມີ option ຕ້ອງມີ 1 variant; archive ແທນລຶບຖ້າເຄີຍຖືກຂາຍ | controller |
| `WarehousesService` | CRUD ສາງ; ຕັ້ງ default ໄດ້ດຽວ; ປິດສາງທີ່ຍັງມີສະຕ໋ອກບໍ່ໄດ້ | controller |
| `StockService` | **ເຈົ້າຂອງ `StockLevel`/`StockMovement` ຜູ້ດຽວ**: `receive`, `adjust`, `transfer`, `reserve`, `release`, `ship`, `return`. ຮັບ `tx` ຈາກຜູ້ເອີ້ນເພື່ອຢູ່ transaction ດຽວກັບບິນ | `OrdersService`, ໂມດູນອື່ນໃນອະນາຄົດ |
| `OrdersService` | ສ້າງບິນ (snapshot, VAT, ຈອງ), ປ່ຽນສະຖານະ, ຍົກເລີກ, ໝົດເວລາ | controller, worker |
| `OrderNumberService` | ເລກບິນຈາກ Postgres sequence, ຮູບແບບ `SO-000001` | `OrdersService` |

ໂມດູນອື່ນຫ້າມແຕະ `StockLevel` / `StockMovement` ໂດຍກົງ.

## `StockService`: ກົດ
ທຸກ method ເຮັດໃນ transaction ດຽວ: (1) conditional UPDATE ຂອງ `StockLevel`, (2) INSERT `StockMovement`. ຖ້າ UPDATE ໄດ້ 0 ແຖວ = ສະຕ໋ອກບໍ່ພໍ → throw `InsufficientStockError` ແລ້ວ rollback ທັງ transaction.

| method | ເງື່ອນໄຂ UPDATE | ຜົນ |
|---|---|---|
| `receive` | (upsert ແຖວ StockLevel) | onHand + qty |
| `adjust` (delta ±) | `onHand + delta >= reserved` | onHand + delta |
| `reserve` | `onHand - reserved >= qty` | reserved + qty |
| `release` | `reserved >= qty` | reserved - qty |
| `ship` | `reserved >= qty` | onHand - qty, reserved - qty |
| `return` | (upsert) | onHand + qty |
| `transfer` | ຕົ້ນທາງ `onHand - reserved >= qty` | ຕົ້ນທາງ onHand - qty (`TRANSFER_OUT`), ປາຍທາງ onHand + qty (`TRANSFER_IN`) |

* ເມື່ອຈອງ/ປ່ອຍຫຼາຍລາຍການ, ຮຽງຕາມ `(variantId, warehouseId)` ກ່ອນ UPDATE ເພື່ອກັນ deadlock.
* `transfer` ຕ້ອງຕ່າງສາງ. `quantity` ເປັນເລກເຕັມບວກສະເໝີ, ຍົກເວັ້ນ `adjust` ທີ່ຕິດລົບໄດ້ (ກົງກັບ CHECK ໃນ migration).
* CHECK `0 <= reserved <= onHand` ເປັນດ່ານສຸດທ້າຍ; ຖ້າຊົນ ແປເປັນ `InsufficientStockError` ຄືກັນ.

## ວົງຈອນຄຳສັ່ງຊື້
| endpoint | ຈາກ → ໄປ | ຜົນຕໍ່ສະຕ໋ອກ | field |
|---|---|---|---|
| `POST /orders` | → PENDING_PAYMENT | `reserve` ທຸກລາຍການ | `reservedUntil` |
| `POST /orders/:id/pay` | PENDING_PAYMENT → PAID | ບໍ່ມີ | `paidAt`; ປະຕິເສດຖ້າເກີນ `reservedUntil` |
| `POST /orders/:id/pack` | PAID → PACKING | ບໍ່ມີ | |
| `POST /orders/:id/ship` | PACKING → SHIPPED | `ship` ທຸກລາຍການ | `shippedAt` |
| `POST /orders/:id/complete` | SHIPPED → COMPLETED | ບໍ່ມີ | `completedAt` |
| `POST /orders/:id/cancel` | PENDING_PAYMENT / PAID / PACKING → CANCELLED | `release` | `cancelledAt` |
| worker | PENDING_PAYMENT ທີ່ເກີນ `reservedUntil` → EXPIRED | `release` | |

* ການປ່ຽນສະຖານະໃຊ້ `UPDATE ... WHERE status = <ຕົ້ນທາງ>` ແລະ ກວດຈຳນວນແຖວ ເພື່ອກັນ cancel ກັບ expire/pay ຊົນກັນ. ຜູ້ແພ້ໄດ້ `409`.
* ການຍົກເລີກຫຼັງ SHIPPED ບໍ່ມີ; ສິນຄ້າຄືນໃຊ້ `POST /stock/return` ແຍກ (ບໍ່ປ່ຽນສະຖານະບິນໃນ 1a).
* ຕອນສ້າງບິນ: ໂຫຼດ variant + ລາຄາ/ຕົ້ນທຶນມາ snapshot ລົງ `OrderItem`; `subtotal` = Σ `lineTotal`; VAT ຕາມ `StoreSetting` (`pricesIncludeVat`); `currency` = `baseCurrency`, `exchangeRate` = 1 (ສະກຸນອື່ນຢູ່ນອກຂອບເຂດ 1a). Variant ທີ່ `isActive = false` ຫຼື ສິນຄ້າທີ່ບໍ່ແມ່ນ `ACTIVE` ສັ່ງບໍ່ໄດ້.
* ລູກຄ້າ: ຮັບ `customerId` ຫຼື `{name, phone}` (upsert ຕາມ `phone`).

## API (REST, Zod schema ໃນ `@oca/shared`)
ອ່ານ = `inventory:read`, ຂຽນ = `inventory:write`.

| ກຸ່ມ | endpoints |
|---|---|
| ໝວດໝູ່ | `GET/POST /categories`, `PATCH/DELETE /categories/:id` |
| ສິນຄ້າ | `GET /products` (q, status, categoryId, page), `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` (archive ຫຼື ລຶບຖ້າບໍ່ເຄີຍຖືກຂາຍ) |
| Variants/ຮູບ | `POST /products/:id/variants`, `PATCH /variants/:id`, `PUT /products/:id/images` (ແທນທັງລາຍການ, ກຳນົດ position) |
| ສາງ | `GET/POST /warehouses`, `PATCH /warehouses/:id`, `POST /warehouses/:id/default` |
| ສະຕ໋ອກ | `GET /stock` (warehouseId, variantId, lowStock, page), `GET /stock/movements` (variantId, orderId, type, page), `POST /stock/receive`, `/stock/adjust`, `/stock/transfer`, `/stock/return`, `PATCH /stock/:id/threshold` |
| ບິນ | `GET /orders` (status, channel, q, page), `GET /orders/:id`, `POST /orders` + 5 endpoints ຂ້າງເທິງ |
| ຕັ້ງຄ່າ | `GET/PATCH /settings/store` (ຊື່ຮ້ານ, VAT, `reservationMinutes`) |

## ຂໍ້ຜິດພາດ
* `InsufficientStockError` → `409` ພ້ອມລາຍການທີ່ບໍ່ພໍ (`variantId`, `available`, `requested`).
* ການປ່ຽນສະຖານະທີ່ບໍ່ຖືກ ຫຼື ແພ້ການແຂ່ງ → `409`. ບິນໝົດເວລາແລ້ວແຕ່ກົດ pay → `409`.
* SKU / barcode / slug ຊ້ຳ → `409`. ບໍ່ພົບ → `404`. Zod ບໍ່ຜ່ານ → `400` (pipe ທີ່ມີຢູ່).
* ລຶບສາງ default, ປິດສາງທີ່ຍັງມີສະຕ໋ອກ, ລຶບໝວດທີ່ມີສິນຄ້າ → `409` ພ້ອມຂໍ້ຄວາມຊັດເຈນ.

## Worker
ເພີ່ມ queue `inventory` ແລະ job `expire-reservations` (repeat ທຸກ 1 ນາທີ), ຕາມ pattern ຂອງ `cleanup-refresh-tokens`. Job ເລືອກບິນ `PENDING_PAYMENT AND reservedUntil < now()` ເທື່ອລະກຸ່ມ (limit 100), ແຕ່ລະບິນໃນ transaction ແຍກ: ປ່ຽນເປັນ EXPIRED (guard ດ້ວຍ status) ແລ້ວ `release`. ບິນໜຶ່ງຜິດບໍ່ຢຸດບິນອື່ນ; log ແລ້ວຂ້າມ. Logic ການຄືນສະຕ໋ອກຢູ່ `OrdersService.expire()` ທີ່ API ແລະ worker ໃຊ້ຮ່ວມ (ຍ້າຍໄປ package ຮ່ວມ ຖ້າ worker ບໍ່ສາມາດ import API ໄດ້; plan ຈະຕັດສິນຫຼັງກວດ dependency).

## 1a-ui (plan ແຍກ)
ຕາມ [DESIGN.md](../../DESIGN.md) ແລະ pattern ຂອງ `/staff`, `/roles`:
* `/products`: ຕາຕະລາງ + filter; ຟອມສ້າງ/ແກ້ (options, ຕາຕະລາງ variants, ຮູບ URL).
* `/stock`: ຍອດຕາມສາງ/variant (onHand, reserved, ຂາຍໄດ້, ໃກ້ໝົດ), dialog ຮັບເຂົ້າ/ປັບຍອດ/ຍ້າຍ/ຮັບຄືນ, ແຖບປະຫວັດການເຄື່ອນໄຫວ.
* `/orders`: ລາຍການ + filter ສະຖານະ; ສ້າງບິນ (ຄົ້ນຫາ variant, ຈຳນວນ, ລູກຄ້າ); ໜ້າລາຍລະອຽດມີປຸ່ມປ່ຽນສະຖານະ ແລະ ໂມງນັບຖອຍຫຼັງ `reservedUntil`.
* `/warehouses`, `/categories`, ແລະ ຕັ້ງຄ່າເວລາຈອງ.
* ປຸ່ມ/ເມນູຊ່ອນຕາມ `useCan("inventory:write")`.

## ການທົດສອບ
* **Unit:** ຄຳນວນ VAT/ລວມ, state machine ຂອງບິນ, ການແປ error.
* **Integration ກັບ Postgres ຈິງ** (ເຄື່ອງ dev ແຍກພອດ 5433, ບໍ່ແຕະ 5432): 
  * ຍິງ `reserve` ພ້ອມກັນ N ເທື່ອໃສ່ສະຕ໋ອກ 1 ຊິ້ນ → ສຳເລັດ 1, ທີ່ເຫຼືອ `InsufficientStockError`, `reserved = 1`.
  * ບິນຫຼາຍລາຍການທີ່ລາຍການສຸດທ້າຍບໍ່ພໍ → rollback ທັງບິນ (ບໍ່ມີ movement ຄ້າງ).
  * ສອງບິນຈອງຄູ່ variant ຄົນລະລຳດັບພ້ອມກັນ → ບໍ່ deadlock.
  * cancel ແຂ່ງກັບ expire → ຄືນສະຕ໋ອກຄັ້ງດຽວ.
  * ຜົນລວມ `StockMovement` ຕໍ່ variant/ສາງ ກົງກັບ `onHand`/`reserved` ສະເໝີ.
* **Worker:** `expire-reservations` ຄືນສະຕ໋ອກ ແລະ ຂ້າມບິນທີ່ຜິດ.
* **Controller:** ສິດ read/write, 409/404/400.
* 1a-ui: component test ຕາມ pattern ຂອງ admin + ກວດໜ້າດ້ວຍ Playwright headless ຄືກັບ Phase 0.

## ນອກຂອບເຂດ
ອັບໂຫຼດຮູບ, auto-allocate ຂ້າມສາງ, ສະກຸນເງິນອື່ນນອກຈາກ base, ສ່ວນຫຼຸດ/ໂປຣໂມຊັນ, ການສົ່ງຄືນທີ່ປ່ຽນສະຖານະບິນ, ການຊຳລະ/ສະລິບ (ໂມດູນ 9), ພັດສະດຸ/Tracking (ໂມດູນ 8), ໜ້າຮ້ານສາທາລະນະ (ເຟດ 3).

# Phase 1-A: Inventory (ໂມດູນ 7) Design

Sub-project ທຳອິດຂອງ Phase 1 ([ROADMAP](../../ROADMAP.md)). ແບ່ງເປັນ 2 plan: **1a-api** (ເຄື່ອງຈັກສະຕ໋ອກ, API, worker, migration, seed) ແລະ **1a-ui** (ໜ້າ admin). Inbox, CF Engine ແລະ Slip Verification ເປັນ sub-project ແຍກ ແລະຈະເອີ້ນ `OrdersService` / ເຄື່ອງຈັກສະຕ໋ອກຂອງໂມດູນນີ້.

Schema ຫຼັກມີຄົບແລ້ວ ([DATABASE.md](../../DATABASE.md)). ການປ່ຽນ schema ມີພຽງ §3.

## 1. ການຕັດສິນໃຈ
| ຫົວຂໍ້ | ຕັດສິນໃຈ |
|---|---|
| ກົນໄກປ້ອງກັນຂາຍເກີນ | Conditional `UPDATE` ດ້ວຍ raw SQL ໃນ `$transaction` ດຽວ (isolation ເລີ່ມຕົ້ນ Read Committed). ບໍ່ໃຊ້ `FOR UPDATE`, ບໍ່ມີ version column |
| ບ່ອນຢູ່ຂອງເຄື່ອງຈັກສະຕ໋ອກ | `packages/database/src/inventory/` (ບໍ່ແມ່ນໃນ `apps/api`) ເພາະ worker ມີແຕ່ `@oca/database` ແລະຕ້ອງຄືນສະຕ໋ອກເມື່ອໝົດເວລາ; ກົງກັບ ADR 0001. API ຫໍ່ດ້ວຍ Nest service (DI, audit, DTO) |
| ຄຳສັ່ງຊື້ | admin ສ້າງດ້ວຍມື (`channel=OFFLINE`, `source=MANUAL`) ແລະຂັບວົງຈອນເຕັມ. Admin ກົດຢືນຢັນຊຳລະເອງ (Slip Verification ມາທີຫຼັງ) |
| ສາງ | ຈອງຈາກສາງ default ເປັນຄ່າເລີ່ມຕົ້ນ; ລະບຸ `warehouseId` ຕໍ່ລາຍການໄດ້. ບໍ່ມີ auto-allocate ຂ້າມສາງ |
| ຮູບສິນຄ້າ | admin ໃສ່ `url` ດ້ວຍມື (http/https). ບໍ່ມີ upload |
| ເວລາຈອງ | `StoreSetting.reservationMinutes` (default 30, 1–10080); override ຕໍ່ບິນດ້ວຍ `reservationMinutes` ໃນ request |
| ສິດ | ສາງ/ສິນຄ້າ = `inventory:*`. ບິນແຍກອອກ (ແກ້ຕາມ final review, ເບິ່ງ §6.1): `orders:*` (ອ່ານ/ສ້າງ/ຍົກເລີກ), `payments:write` (ຢືນຢັນຊຳລະ), `logistics:write` (ແພັກ/ສົ່ງ/ປິດບິນ), `costs:read\|write` (ເຫັນ/ຕັ້ງຕົ້ນທຶນ). ເພີ່ມ module ສິດ `orders`, `payments`, `costs` ໃນ `@oca/shared` (ທຸກ module ສິດມີ Nest module ຄູ່) |
| ເງິນ | ໃຊ້ `Decimal` ທັງໝົດ (Prisma `Decimal`/`decimal.js`), ຫ້າມ `number` ໃນການຄຳນວນ. DTO ສົ່ງເງິນເປັນ **string** (`"12500.00"`) |
| ສະກຸນເງິນ | `currency = baseCurrency`, `exchangeRate = 1` ສະເໝີໃນ 1a |

## 2. ໂຄງສ້າງໂຄດ
**`packages/database/src/inventory/`** (ບໍ່ຮູ້ຈັກ Nest/HTTP; ຮັບ `tx: Prisma.TransactionClient`; export ຜ່ານ `@oca/database`)
| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `stock-engine.ts` | `receive`, `adjust`, `transfer`, `reserve`, `release`, `ship`, `returnStock`, ແລະ `reserveMany`/`releaseMany`/`shipMany` (ຮຽງ lock). Throw `InsufficientStockError` |
| `errors.ts` | `InsufficientStockError { variantId, warehouseId, requested, available }` |
| `expire-reservations.ts` | `expireOrder(db, orderId, now)` ແລະ `findExpiredOrderIds(db, now, limit)` ທີ່ API ແລະ worker ໃຊ້ຮ່ວມ |

**`apps/api/src/modules/inventory/`**
| ໜ່ວຍ | ໜ້າທີ່ |
|---|---|
| `CategoriesService` + controller | CRUD ໝວດໝູ່ |
| `ProductsService` + controller | ສິນຄ້າ, options, variants, ຮູບ |
| `WarehousesService` + controller | CRUD ສາງ |
| `StockService` + controller | ຫໍ່ເຄື່ອງຈັກ: ກວດ input, ຂຽນ `AuditLog`, ແປ `InsufficientStockError` → `409`; query ຍອດ/ປະຫວັດ |
| `OrdersService` + controller | ສ້າງບິນ, ປ່ຽນສະຖານະ, ຍົກເລີກ |
| `StoreSettingsService` + controller | ອ່ານ/ແກ້ການຕັ້ງຄ່າຮ້ານ |

**`packages/shared/src/schemas/inventory.ts`**: Zod schema ທັງໝົດ (§5) ເພື່ອໃຫ້ admin ໃຊ້ຮ່ວມ. **ກົດ:** ໂມດູນອື່ນຫ້າມ UPDATE `StockLevel` / INSERT `StockMovement` ນອກຈາກຜ່ານເຄື່ອງຈັກນີ້.

## 3. Migration ແລະ Seed
Migration ໃໝ່ `20261005000000_inventory`:
```sql
ALTER TABLE "StoreSetting" ADD COLUMN "reservationMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "StoreSetting" ADD CONSTRAINT "StoreSetting_reservation_check"
  CHECK ("reservationMinutes" BETWEEN 1 AND 10080);
CREATE SEQUENCE "Order_number_seq" START 1;
```
ແກ້ `schema.prisma` ໃຫ້ກົງ (`reservationMinutes Int @default(30)`) ແລ້ວ `db:generate`.

**Seed** (`prisma/seed.ts`, run ຊ້ຳໄດ້) ເພີ່ມ: ແຖວ `StoreSetting` (`id=1`, `name` ຈາກ env `SEED_STORE_NAME` ຫຼື `"OCA Store"`) ຖ້າຍັງບໍ່ມີ, ແລະ ສາງ `code="MAIN"`, `name="ສາງຫຼັກ"`, `isDefault=true` ຖ້າຍັງບໍ່ມີສາງ default. ບໍ່ຂຽນທັບຄ່າທີ່ມີຢູ່. API ກໍ່ເຮັດ `upsert` ແຖວ `StoreSetting` ຕອນ `GET /settings/store` ເພື່ອບໍ່ຕົກຖ້າ seed ຍັງບໍ່ໄດ້ຮັນ.

ເລກບິນ: `SELECT nextval('"Order_number_seq"')` ໃນ transaction ດຽວກັບການສ້າງບິນ; ຮູບແບບ `"SO-" + lpad(n, 6, '0')` (ເກີນ 6 ຫຼັກກໍຂະຫຍາຍຕໍ່). Rollback ເຮັດໃຫ້ເລກຂາດໄດ້ (ຍອມຮັບ).

## 4. ເຄື່ອງຈັກສະຕ໋ອກ (ລາຍລະອຽດ)
ທຸກ function ຮັບ `tx`, ເຮັດ (1) UPDATE/INSERT ຂອງ `StockLevel` ແລ້ວ (2) INSERT `StockMovement` ໃນ `tx` ດຽວກັນ. ຜູ້ເອີ້ນເປັນຄົນເປີດ `$transaction`. ຖ້າ UPDATE ກະທົບ 0 ແຖວ → throw `InsufficientStockError` (transaction rollback ທັງໝົດ).

ຕົວເລກທັງໝົດ `quantity` ເປັນ integer ບວກ (> 0), ຍົກເວັ້ນ `adjust` ທີ່ `delta` ເປັນ integer ≠ 0 (ກົງ CHECK `StockMovement_quantity_check`).

| function | SQL ຫຼັກ (ຍ່ໍ) | ເງື່ອນໄຂສຳເລັດ | Movement |
|---|---|---|---|
| `receive` | `INSERT ... ON CONFLICT (variantId, warehouseId) DO UPDATE SET onHand = "StockLevel".onHand + $q` | ສະເໝີ | `RECEIVE +q` |
| `returnStock` | ຄືກັບ `receive` | ສະເໝີ | `RETURN +q` |
| `adjust` (delta>0) | ຄືກັບ `receive` | ສະເໝີ | `ADJUST +delta` |
| `adjust` (delta<0) | `UPDATE SET onHand = onHand + $d WHERE variantId=$v AND warehouseId=$w AND onHand + $d >= reserved` | ແຖວຖືກແກ້ 1 | `ADJUST delta` |
| `reserve` | `UPDATE SET reserved = reserved + $q WHERE ... AND onHand - reserved >= $q` | ແຖວຖືກແກ້ 1 | `RESERVE +q` |
| `release` | `UPDATE SET reserved = reserved - $q WHERE ... AND reserved >= $q` | ແຖວຖືກແກ້ 1 | `RELEASE +q` |
| `ship` | `UPDATE SET onHand = onHand - $q, reserved = reserved - $q WHERE ... AND reserved >= $q` | ແຖວຖືກແກ້ 1 | `SHIP +q` |
| `transfer` | ຕົ້ນທາງ: `onHand - reserved >= $q` ແລ້ວ `onHand - $q`; ປາຍທາງ: upsert `onHand + $q` | ທັງສອງສຳເລັດ | `TRANSFER_OUT +q` (ຕົ້ນທາງ) ແລະ `TRANSFER_IN +q` (ປາຍທາງ), `note` ອ້າງສາງຄູ່ |

* UPDATE ທຸກອັນຕ້ອງໃສ່ `"updatedAt" = now()` ເພາະ raw SQL ບໍ່ຜ່ານ `@updatedAt` ຂອງ Prisma.
* Upsert ແຖວໃໝ່ໃຊ້ `id = crypto.randomUUID()`.
* `adjust` ຕ້ອງມີ `note` (ເຫດຜົນ). `receive` / `transfer` / `returnStock` ມີ `note` ເປັນທາງເລືອກ.
* **ຄວາມປອດໄພຂອງການແຂ່ງ:** conditional UPDATE ລັອກແຖວ; ຜູ້ແຂ່ງຕໍ່ມາລໍຖ້າແລ້ວ re-evaluate ເງື່ອນໄຂດ້ວຍຄ່າໃໝ່ (Read Committed) ຈຶ່ງບໍ່ເກີດ lost update.
* **ກັນ deadlock:** `reserveMany` / `releaseMany` / `shipMany` ຮຽງລາຍການຕາມ `(variantId, warehouseId)` ແບບ ASCII ກ່ອນ UPDATE. `transfer` ເຮັດ 2 ຂັ້ນຕອນຕາມລຳດັບ `warehouseId` ນ້ອຍ→ໃຫຍ່ (ຂັ້ນຕອນຕົ້ນທາງທີ່ເປັນເງື່ອນໄຂ ແພ້ກໍ rollback ທັງ tx).
* **`InsufficientStockError.available`:** ເມື່ອ UPDATE ບໍ່ສຳເລັດ ອ່ານ `onHand - reserved` ປັດຈຸບັນ (SELECT) ເພື່ອໃສ່ໃນຂໍ້ຄວາມ. (ຄ່ານີ້ເປັນຂໍ້ມູນໃຫ້ຜູ້ໃຊ້ເທົ່ານັ້ນ, ບໍ່ໃຊ້ຕັດສິນ.)
* ຖ້າ CHECK `StockLevel_stock_check` ຖືກຕີ (Postgres code `23514`) ແປເປັນ `InsufficientStockError` ຄືກັນ.
* **Invariant:** ສຳລັບທຸກ (variant, warehouse): `onHand = Σ(RECEIVE+RETURN+TRANSFER_IN+ADJUST) − Σ(SHIP+TRANSFER_OUT)` ແລະ `reserved = Σ RESERVE − Σ RELEASE − Σ SHIP`. ໃຊ້ເປັນ assertion ໃນ test.

## 5. Zod schemas (ກົດ validation)
ທຸກ schema ເປັນ `z.strictObject` (ປະຕິເສດ field ແປກ). `id` = `z.string().min(1)`.

**ທົ່ວໄປ**
* `pagination`: `page` (int ≥1, default 1), `pageSize` (int 1–100, default 20). Response ລາຍການ: `{ items, total, page, pageSize }`.
* `money`: string ກົງ `^\d{1,16}(\.\d{1,2})?$`, ≥ 0.
* `vatRate`: **string** ຄືກັບເງິນ (`"7"`/`"7.00"`, 0–100, ≤2 ທົດສະນິຍົມ). ທັງ request ຂອງ `PATCH /settings/store` ແລະ response ຂອງ settings + ບິນ ຄືນ `"7.00"` (ກ່ອນນີ້ settings ເປັນ number, ບິນເປັນ string).
* **filter ວັນທີ** (`from`/`to` ຂອງ `/orders`, `/stock/movements`): ວັນທີລ້ວນ `YYYY-MM-DD` ຖືເປັນ **ເວລາຮ້ານ (UTC+7)**: `from` = 00:00 ຂອງມື້ນັ້ນ, `to` = 00:00 ຂອງ **ມື້ຖັດໄປ** ແບບ exclusive (ຈຶ່ງຮວມມື້ສຸດທ້າຍທັງມື້). ສົ່ງເວລາເຕັມ (ISO) ມາ ໃຊ້ຕາມນັ້ນ ແລະ `to` ກໍເປັນ exclusive. ວັນທີທີ່ບໍ່ມີຢູ່ຈິງ (`2026-02-30`) → `400`.
* `quantity`: int 1–1,000,000. `delta`: int ≠ 0, |delta| ≤ 1,000,000.

**Category**: `name` (trim, 1–100), `slug` (optional; ຖ້າບໍ່ໃສ່ສ້າງຈາກ `name`; ຮູບແບບ `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤100), `parentId` (optional|null), `position` (int ≥0).

**Product**
* `name` (1–200), `slug` (ຄືກັບ category), `description` (≤10,000, optional), `status` (`DRAFT|ACTIVE|ARCHIVED`), `categoryId` (optional|null).
* `options`: array ≤3 ຂອງ `{ name (1–50), values: string[] (1–50 ແຕ່ລະ value, 1–30 ຕົວ, ບໍ່ຊ້ຳ) }`; ຊື່ option ບໍ່ຊ້ຳ.
* `variants`: array 1–100. ແຕ່ລະອັນ: `sku` (trim, 1–64, `^[A-Za-z0-9._-]+$`), `barcode` (optional, 1–64), `price` (money), `compareAtPrice` (money, optional, ຕ້ອງ ≥ price), `costPrice` (money, default "0"), `weightGrams` (int ≥0, optional), `isActive` (default true), `optionValues`: object `{ [optionName]: value }`.
* **ສອດຄ່ອງກັບ options:** ຖ້າ `options` ວ່າງ → `variants` ຕ້ອງມີ 1 ອັນ ແລະ `optionValues` ວ່າງ. ຖ້າມີ options → ທຸກ variant ຕ້ອງລະບຸຄ່າຄົບທຸກ option, ຄ່າຕ້ອງຢູ່ໃນ `values` ຂອງ option ນັ້ນ, ແລະ **ຊຸດຄ່າບໍ່ຊ້ຳ** ລະຫວ່າງ variants. `Variant.name` ສ້າງອັດຕະໂນມັດ = ຄ່າຕາມລຳດັບ option ຕໍ່ດ້ວຍ `" / "` (ເຊັ່ນ `ດຳ / M`); `null` ຖ້າບໍ່ມີ option.
* `sku`/`barcode` ບໍ່ຊ້ຳໃນ request ແລະບໍ່ຊ້ຳກັບ DB (`409`).
* `images`: array ≤20 ຂອງ `{ url (http/https, ≤2048), alt (≤200, optional), variantSku (optional; ຕ້ອງຢູ່ໃນ variants ຂອງ request) }`. ລຳດັບໃນ array = `position`.

**ການແກ້ສິນຄ້າ (`PATCH /products/:id`)**: ແກ້ສະເພາະ field ລະດັບສິນຄ້າ (`name, slug, description, status, categoryId`). Variants/ຮູບ/options ແກ້ຜ່ານ endpoint ຂອງຕົນ (§6). ຫ້າມປ່ຽນ options ຂອງສິນຄ້າທີ່ມີ variant ຢູ່ແລ້ວໃນ 1a (ຕ້ອງສ້າງສິນຄ້າໃໝ່) — ລຸດຄວາມສັບສົນຂອງການ re-map variants.

**Variant (`POST /products/:id/variants`, `PATCH /variants/:id`)**: ຊຸດ field ດຽວກັບຂ້າງເທິງ; `PATCH` ແກ້ໄດ້ `sku, barcode, price, compareAtPrice, costPrice, weightGrams, isActive` (ບໍ່ແກ້ `optionValues`). ການແກ້ `price`/`costPrice` ບໍ່ກະທົບບິນເດີມ (snapshot).

**Warehouse**: `code` (`^[A-Z0-9_-]{1,20}$`, unique), `name` (1–100), `address` (≤300, optional), `isActive`.

**Stock ops**
* `receive`: `{ variantId, warehouseId, quantity, note? (≤200) }`
* `adjust`: `{ variantId, warehouseId, delta, note (1–200, ບັງຄັບ) }`
* `transfer`: `{ variantId, fromWarehouseId, toWarehouseId (≠ from), quantity, note? }`
* `return`: `{ variantId, warehouseId, quantity, orderId?, note? }`
* `threshold`: `PATCH /stock/:id/threshold` `{ lowStockThreshold: int ≥0 | null }`

**Order create**: 
```
{ customerId?  |  customer?: { name (1–100), phone (^\+?[0-9]{6,15}$) , email? },
  items: [{ variantId, warehouseId?, quantity, discount? (money, default "0") }]  // 1–100, ຄູ່ (variantId, warehouseId) ບໍ່ຊ້ຳ
  shippingFee? (money, default "0"),
  shippingName?, shippingPhone?, shippingAddress? (≤300), note? (≤500),
  reservationMinutes?: int 1–10080 }
```
`customerId` ກັບ `customer` ໃສ່ໄດ້ຢ່າງໃດຢ່າງໜຶ່ງ ຫຼື ບໍ່ໃສ່ເລີຍ (ລູກຄ້າໜ້າຮ້ານ). `discount` ຕໍ່ລາຍການຕ້ອງ ≤ `unitPrice × quantity`.

**Order cancel**: `{ reason? (≤200) }` — ເກັບໃນ `Order.note` ຕໍ່ທ້າຍ ແລະ `AuditLog.after`.

**StoreSetting patch**: `name` (1–100), `vatRate` (0–100, 2 ທົດສະນິຍົມ), `pricesIncludeVat` (bool), `reservationMinutes` (1–10080). ປ່ຽນ `baseCurrency` ບໍ່ອະນຸຍາດໃນ 1a.

## 6. API
ອ່ານ = `inventory:read`; ຂຽນ = `inventory:write`. Error body ໃຊ້ຮູບຂອງ Nest (`{ statusCode, message }`; `400` ມີ `issues[]` ຈາກ `ZodValidationPipe`).

| ກຸ່ມ | endpoint | ໝາຍເຫດ |
|---|---|---|
| ໝວດໝູ່ | `GET /categories` (tree ແບນ, ຮຽງ `position`), `POST`, `PATCH /:id`, `DELETE /:id` | ລຶບໄດ້ເມື່ອບໍ່ມີສິນຄ້າ; ລູກຍ້າຍຂຶ້ນລະດັບ (`onDelete: SetNull`). ຕັ້ງ `parentId` ເປັນຕົວເອງ/ລູກຫຼານ → `400` |
| ສິນຄ້າ | `GET /products?q=&status=&categoryId=&page=&pageSize=` | `q` ຄົ້ນ `name` / `variant.sku` / `variant.barcode` (case-insensitive, contains). ຄືນ: `id,name,slug,status,category,imageUrl(ຮູບທຳອິດ),variantCount,priceMin,priceMax,availableTotal` |
| | `GET /products/:id` | ເຕັມ: options, variants (ພ້ອມ `stock: [{warehouseId,onHand,reserved,available}]`), images |
| | `POST /products` | ສ້າງທັງ options+variants+ຮູບໃນ transaction ດຽວ. ສິນຄ້າໃໝ່ເລີ່ມ `DRAFT` ຖ້າບໍ່ລະບຸ |
| | `PATCH /products/:id`, `DELETE /products/:id` | ລຶບ: ຖ້າມີ `OrderItem` ຂອງ variant ໃດ → ປ່ຽນເປັນ `ARCHIVED` ແທນ (ຕອບ `200` ພ້ອມ `archived: true`); ບໍ່ມີ → ລຶບແທ້ (`204`) ແຕ່ `409` ຖ້າມີ `StockMovement` |
| Variant | `POST /products/:id/variants`, `PATCH /variants/:id` | ສິນຄ້າທີ່ມີ options ຕ້ອງສົ່ງ `optionValues` ໃຫ້ຄົບ ແລະ ບໍ່ຊ້ຳ |
| ຮູບ | `PUT /products/:id/images` | ແທນທັງລາຍການ |
| ສາງ | `GET /warehouses`, `POST`, `PATCH /:id`, `POST /:id/default` | ຕັ້ງ default: ໃນ transaction ປົດອັນເກົ່າ ແລ້ວຕັ້ງໃໝ່ (partial unique index ກັນສອງອັນ). ປິດ (`isActive=false`) ສາງທີ່ `onHand>0` ຫຼື `reserved>0` ຫຼື ເປັນ default → `409` |
| Variant | `GET /variants?q=&includeInactive=&page=&pageSize=` | ຄົ້ນ variant ພ້ອມລາຄາ ແລະ ສະຕ໋ອກຕໍ່ສາງ ສຳລັບ autocomplete ຂອງ `/orders/new` ແລະ ການຮັບສະຕ໋ອກຄັ້ງທຳອິດ. `q` ຄົ້ນ `sku`/`barcode`/ຊື່ variant/ຊື່ສິນຄ້າ. ຄືນ `id,sku,barcode,name,productId,productName,productStatus,imageUrl,price,costPrice*,isActive,availableTotal,stock[]` (`stock=[]` ຖ້າຍັງບໍ່ເຄີຍມີ StockLevel). ຄ່າເລີ່ມຕົ້ນ: ສະເພາະ variant ACTIVE ຂອງສິນຄ້າ ACTIVE; `includeInactive=true` ຮວມ DRAFT/ARCHIVED/ປິດ ເພື່ອຮັບສະຕ໋ອກ. ຮຽງຕາມ `sku` |
| ລູກຄ້າ | `GET /customers?q=&page=&pageSize=` | ຄົ້ນຊື່/ໂທ/email, ຮຽງຕາມຊື່; ຄືນ `{id,name,phone,email}`. ຕ້ອງມີ `orders:read`. ການຈັດການລູກຄ້າເຕັມເປັນຂອງ CRM ພາຍຫຼັງ |
| ສະຕ໋ອກ | `GET /stock?warehouseId=&variantId=&q=&lowStock=true&page=` | ແຖວຕໍ່ (variant, ສາງ): `onHand, reserved, available, lowStockThreshold`. `lowStock` = `available <= lowStockThreshold` |
| | `GET /stock/movements?variantId=&warehouseId=&orderId=&type=&from=&to=&page=` | ໃໝ່→ເກົ່າ; ຄືນ `actorId` ພ້ອມຊື່ຜູ້ເຮັດ |
| | `POST /stock/receive`, `/adjust`, `/transfer`, `/return`; `PATCH /stock/:id/threshold` | ຕອບ StockLevel ຫຼັງແກ້ (ແລະ ຂອງປາຍທາງສຳລັບ transfer) |
| ບິນ | `GET /orders?status=&channel=&q=&from=&to=&page=` | `q` ຄົ້ນ `orderNumber` / ຊື່ ຫຼື ໂທລະສັບລູກຄ້າ |
| | `GET /orders/:id` | ເຕັມ: items (snapshot), ລູກຄ້າ, movements ຂອງບິນ, `secondsUntilExpiry` |
| | `POST /orders`, `POST /orders/:id/pay`, `/pack`, `/ship`, `/complete`, `/cancel` | ເບິ່ງ §7 |
| ຕັ້ງຄ່າ | `GET /settings/store`, `PATCH /settings/store` | |

**Audit** (`AuditService.record`, `entity` = ຊື່ model, `before/after` = snapshot JSON):
`category.{create,update,delete}`, `product.{create,update,archive,delete}`, `variant.{create,update}`, `product.images`, `warehouse.{create,update,setDefault}`, `stock.{receive,adjust,transfer,return,threshold}`, `order.{create,pay,pack,ship,complete,cancel}`, `settings.store.update`. ໝາຍເຫດ: ການ `expire` ໂດຍ worker ບໍ່ມີ actor ຈຶ່ງບໍ່ຂຽນ AuditLog (ມີ `StockMovement RELEASE` ແລະ `status=EXPIRED` ເປັນຫຼັກຖານ).

`StockMovement.actorId` = `req.user.id`; ກໍລະນີ worker = `null`.

### 6.1 ສິດຕາມໜ້າທີ່ (ຕັດສິນແລ້ວ: ແກ້ປັນຫາ role model ຈາກ final review)
| ການກະທຳ | ສິດ |
|---|---|
| `GET /orders`, `/orders/:id`, `GET /customers` | `orders:read` |
| `POST /orders`, `POST /orders/:id/cancel` | `orders:write` |
| `POST /orders/:id/pay` (ຢືນຢັນຊຳລະ) | `payments:write` |
| `POST /orders/:id/pack`, `/ship`, `/complete` | `logistics:write` |
| ເຫັນ `costPrice` (variant) / `unitCost` (ລາຍການບິນ) | `costs:read`. **ບັງຄັບທີ່ຊັ້ນ response ທົ່ວແອັບ** (`CostRedactionInterceptor` ລຶບສອງ field ນີ້ອອກຈາກທຸກ response): endpoint ໃໝ່ (Inbox/CF) ປອດໄພໂດຍບໍ່ຕ້ອງຈື່ |
| ຕັ້ງ/ແກ້ `costPrice` | `costs:write` (ຖ້າບໍ່ມີ → `403`; ຕອນສ້າງ `"0"` ຖືວ່າບໍ່ໄດ້ຕັ້ງ) |
| ສິນຄ້າ/ສາງ/ສະຕ໋ອກ/ຕັ້ງຄ່າຮ້ານ | `inventory:read` / `inventory:write` ຄືເດີມ |

Role ຕາມ seed: **OWNER** ທຸກຢ່າງ; **MANAGER** ທຸກຢ່າງຍົກເວັ້ນ `staff:write`; **CHAT_ADMIN** `orders:*` + ອ່ານ inventory/crm (ສ້າງ/ຍົກເລີກບິນໃຫ້ Inbox ໄດ້ ແຕ່ຢືນຢັນຊຳລະ/ເຫັນຕົ້ນທຶນບໍ່ໄດ້); **WAREHOUSE** `inventory:*` + `logistics:*` + `orders:read` (ແພັກ/ສົ່ງໄດ້ ແຕ່ສ້າງບິນ/ຢືນຢັນຊຳລະ/ເຫັນຕົ້ນທຶນບໍ່ໄດ້); **ACCOUNTANT** ອ່ານຢ່າງດຽວ ລວມ `orders`, `payments`, `costs`. ການຢືນຢັນຊຳລະສຳລັບບັນຊີ (`payments:write`) ປ່ອຍໃຫ້ໂມດູນ 9 (Slip) ຕັດສິນ. Seed ບໍ່ຂຽນທັບ role ທີ່ບໍ່ແມ່ນລະບົບທີ່ມີຢູ່ແລ້ວ ຈຶ່ງຕ້ອງແກ້ role ຂອງ deployment ເດີມຜ່ານ UI `/roles` (ເບິ່ງ DEPLOYMENT-NOTES).

### 6.2 Error `code` ທີ່ຄົງທີ່
ທຸກ error ຄືນ `{ statusCode, code, message, ... }` (`400` ມີ `issues[]`; `409` ຂອງສະຕ໋ອກມີ `shortages[]`). `code` ເປັນຄ່າຈາກ `ERROR_CODES` ໃນ `@oca/shared` ແລະ **ບໍ່ປ່ຽນຊື່ຫຼັງປ່ອຍ**; UI ແປຈາກ `code` (i18n lo/en) ສ່ວນ `message` ເປັນພາສາອັງກິດສຳລັບ log. Exception ທີ່ບໍ່ລະບຸ code ເອງໄດ້ code ຕາມ status (`BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_ATTEMPTS`). ລະຫັດສະເພາະ: `*_NOT_FOUND`, `DUPLICATE_VALUE` (+`fields[]`), `CATEGORY_IN_USE`, `PRODUCT_HAS_STOCK_HISTORY`, `WAREHOUSE_NOT_EMPTY|IS_DEFAULT|INACTIVE`, `NO_DEFAULT_WAREHOUSE`, `INSUFFICIENT_STOCK`, `VARIANT_NOT_AVAILABLE`, `ORDER_INVALID_STATE` (+`status`), `RESERVATION_EXPIRED`.

**ກົດ 404 vs 400:** id ທີ່ອ້າງອີງແລ້ວ **ບໍ່ພົບ** → `404` + `<ENTITY>_NOT_FOUND` ສະເໝີ ບໍ່ວ່າຢູ່ໃນ path ຫຼື body (ກ່ອນນີ້ບິນ/ສິນຄ້າ/ໝວດ/ລູກຄ້າ/ສາງໃນ body ຕອບ `400` ແຕ່ສະຕ໋ອກຕອບ `404`). `400` ໃຊ້ສະເພາະ body/query ຜິດຮູບ ຫຼື ຜິດກົດຂໍ້ມູນ (ຊ້ຳໃນ request, `compareAtPrice < price`, ຕັ້ງ parent ເປັນລູກຫຼານ).

## 7. ຄຳສັ່ງຊື້ (ລາຍລະອຽດ)

### 7.1 ສ້າງບິນ (`POST /orders`): ຂັ້ນຕອນໃນ `$transaction` ດຽວ
1. ອ່ານ `StoreSetting` (vatRate, pricesIncludeVat, baseCurrency, reservationMinutes).
2. ແກ້ໄຂສາງ: `warehouseId` ທີ່ບໍ່ໃສ່ = ສາງ default. ສາງຕ້ອງ `isActive`.
3. ໂຫຼດ variants + product; ປະຕິເສດ `409` ຖ້າ variant `isActive=false` ຫຼື product ບໍ່ແມ່ນ `ACTIVE`, `404` ຖ້າບໍ່ມີ.
4. ລູກຄ້າ: `customerId` → ກວດມີຈິງ; `customer` → `upsert` ຕາມ `phone` (ຖ້າມີແລ້ວ **ບໍ່**ຂຽນທັບຊື່).
5. ຄຳນວນເງິນ (§7.2) ແລະ snapshot ລາຍການ.
6. ຮຽງລາຍການ ແລະ `reserveMany` (`InsufficientStockError` → ຖືກ throw → rollback ທັງບິນ).
7. ເລກບິນຈາກ sequence; INSERT `Order` + `OrderItem`; `reservedUntil = now + (reservationMinutes ?? setting)`.
8. ແຕ່ລະ `RESERVE` movement ຜູກ `orderId`.
9. ຫຼັງ commit: ຂຽນ `AuditLog` `order.create`.

### 7.2 ການຄຳນວນເງິນ
ທຸກຂັ້ນໃຊ້ `Decimal`, ປັດເສດ `ROUND_HALF_UP` ທີ່ 2 ຫຼັກ ຕອນເກັບ.
```
lineTotal   = unitPrice × quantity − discount          (ຕ້ອງ ≥ 0)
subtotal    = Σ lineTotal                              (ຫຼັງຫັກສ່ວນຫຼຸດລາຍການແລ້ວ)
discountTotal = Σ discount
vatBase     = subtotal + shippingFee
pricesIncludeVat = true :  vatAmount = round(vatBase × r / (100 + r));  total = vatBase
pricesIncludeVat = false:  vatAmount = round(vatBase × r / 100);        total = vatBase + vatAmount
```
ຕົວຢ່າງ (r = 10, ລາຄາລວມ VAT): 2 ຊິ້ນ × 12,500, ສ່ວນຫຼຸດ 500, ຄ່າສົ່ງ 15,000 → lineTotal 24,500; subtotal 24,500; vatBase 39,500; vatAmount 3,590.91; total 39,500.00.
`OrderItem` snapshot: `productName`, `variantName`, `sku`, `unitPrice`, `unitCost` (ຈາກ variant ນະ ເວລານັ້ນ), `quantity`, `discount`, `lineTotal`.

### 7.3 ການປ່ຽນສະຖານະ
ທຸກການປ່ຽນໃຊ້ guard ໃນ SQL: `UPDATE "Order" SET status=$to, ... WHERE id=$id AND status = ANY($from) [AND ...]`; ກະທົບ 0 ແຖວ → ອ່ານສະຖານະປັດຈຸບັນ ແລ້ວ `404` (ບໍ່ມີບິນ) ຫຼື `409 {message:"Order is <status>"}`.

| endpoint | `from` | `to` | ເງື່ອນໄຂເພີ່ມ | ຜົນຕໍ່ສະຕ໋ອກ | set |
|---|---|---|---|---|---|
| `pay` | PENDING_PAYMENT | PAID | `reservedUntil > now()` ໃນ guard | – | `paidAt` |
| `pack` | PAID | PACKING | – | – | – |
| `ship` | PACKING | SHIPPED | – | `shipMany` (ໃນ tx ດຽວກັນ) | `shippedAt` |
| `complete` | SHIPPED | COMPLETED | – | – | `completedAt` |
| `cancel` | PENDING_PAYMENT, PAID, PACKING | CANCELLED | – | `releaseMany` | `cancelledAt` |
| ໝົດເວລາ (worker) | PENDING_PAYMENT | EXPIRED | `reservedUntil < now()` ໃນ guard | `releaseMany` | – |

* ບິນ `PAID` ແລ້ວ `reservedUntil` ບໍ່ຖືກນຳໃຊ້ຕໍ່ (worker ເລືອກສະເພາະ `PENDING_PAYMENT`).
* ຂັ້ນຕອນ: ປ່ຽນສະຖານະກ່ອນ (ຖ້າ guard ຜ່ານ ຈຶ່ງຖືກແຖວ) → ແລ້ວປ່ອຍ/ຕັດສະຕ໋ອກຕາມ `OrderItem` ໃນ tx ດຽວ. ຖ້າສະຕ໋ອກຜິດ → rollback ທັງສອງ.
* `cancel` ແລະ `expire` ແຂ່ງກັນ: ຜູ້ທີ່ guard ຜ່ານກ່ອນຊະນະ; ຜູ້ແພ້ໄດ້ 0 ແຖວ ຈຶ່ງບໍ່ຄືນສະຕ໋ອກຊ້ຳ. ການແຂ່ງຂອງ `pay` ກັບ `expire` ກໍເຊັ່ນກັນ.
* ບໍ່ມີ transition ຍ້ອນຫຼັງ. ການຄືນສິນຄ້າຫຼັງ SHIPPED ໃຊ້ `POST /stock/return` (ບໍ່ປ່ຽນສະຖານະບິນ ໃນ 1a).

### 7.4 `OrderItem.warehouseId`
ຖືກເກັບຕອນສ້າງ ແລະ ໃຊ້ເປັນສາງທີ່ປ່ອຍ/ຕັດໃນທຸກການປ່ຽນສະຖານະຕໍ່ມາ (ບໍ່ອ່ານສາງ default ໃໝ່).

## 8. Worker
* Queue ໃໝ່ `inventory` (`names.ts`: `QUEUE_INVENTORY`, `JOB_EXPIRE_RESERVATIONS`).
* `InventoryWorker` (ຮູບແບບດຽວກັບ `MaintenanceWorker`): `upsertJobScheduler(JOB_EXPIRE_RESERVATIONS, { every: 60_000 })`, ມີ concurrency 1 ຕໍ່ job.
* Processor `expireReservations(db, now, limit=100)`: `findExpiredOrderIds` (`status='PENDING_PAYMENT' AND reservedUntil < now ORDER BY reservedUntil LIMIT limit`, ໃຊ້ index `(status, reservedUntil)`), ແຕ່ລະບິນເອີ້ນ `expireOrder` ໃນ `$transaction` ຂອງຕົນ. ຖ້າບິນໜຶ່ງ throw → `logger.error` ແລ້ວຂ້າມ; ຄືນ `{ expired, skipped, failed }`. ຖ້າຄົບ `limit` ແຖວ ໃຫ້ວົນຊ້ຳໃນ run ດຽວ (ສູງສຸດ 10 ຮອບ) ເພື່ອລ້າງຄ້າງຫຼັງ worker ຢຸດນານ.
* ບິນທີ່ຄ້າງ (worker ຢຸດ) ຍັງຖືກກັນໂດຍ `pay` (ກວດ `reservedUntil > now()`), ສະຕ໋ອກຄືນເມື່ອ worker ກັບມາ.

## 9. ຂໍ້ຜິດພາດ (ສະຫຼຸບ)
| ກໍລະນີ | HTTP |
|---|---|
| Zod ບໍ່ຜ່ານ | 400 (`issues[]`) |
| ບໍ່ມີ token / ບໍ່ມີສິດ (ລວມ ຕັ້ງຕົ້ນທຶນໂດຍບໍ່ມີ `costs:write`) | 401 / 403 |
| ບໍ່ພົບ resource (path ຫຼື id ໃນ body) | 404 (`*_NOT_FOUND`) |
| `InsufficientStockError` | 409 `{ message, shortages: [{variantId, warehouseId, sku, requested, available}] }` |
| ສະຖານະບິນບໍ່ຖືກ / ແພ້ການແຂ່ງ / ບິນໝົດເວລາແລ້ວແຕ່ pay | 409 |
| `sku` / `barcode` / `slug` / `code` ຊ້ຳ | 409 (ບອກ field ຈາກ `uniqueViolationFields`) |
| ລຶບ/ປິດສາງ default ຫຼື ສາງທີ່ມີສະຕ໋ອກ; ລຶບໝວດ/ສິນຄ້າທີ່ຖືກອ້າງອີງ | 409 |
| variant ບໍ່ active / ສິນຄ້າບໍ່ ACTIVE ຕອນສັ່ງຊື້ | 409 |

## 10. 1a-ui (ລາຍລະອຽດ)
ຕາມ [DESIGN.md](../../DESIGN.md) (ຊະນະ spec ນີ້ຖ້າຂັດ) ແລະ pattern `/staff`, `/roles`. ເມນູ sidebar ໃໝ່: ສິນຄ້າ, ສະຕ໋ອກ, ຄຳສັ່ງຊື້, ສາງ, ໝວດໝູ່ (ຊ່ອນຖ້າບໍ່ມີ `inventory:read`); ປຸ່ມຂຽນຊ່ອນດ້ວຍ `useCan("inventory:write")`. TanStack Query ຕໍ່ resource; ຫຼັງ mutation invalidate ຄີທີ່ກ່ຽວ.

| ໜ້າ | ເນື້ອຫາ |
|---|---|
| `/products` | ຕາຕະລາງ: ຮູບນ້ອຍ, ຊື່, ໝວດ, ສະຖານະ (Badge), ຊ່ວງລາຄາ, ສະຕ໋ອກຂາຍໄດ້. Filter: ຄົ້ນຫາ, ສະຖານະ, ໝວດ. Pagination. ແຖວວ່າງ/loading/error ຄົບ |
| `/products/new`, `/products/[id]` | ຟອມ: ຂໍ້ມູນທົ່ວໄປ; ຕົວເລືອກ (ເພີ່ມ/ລຶບ option ແລະ ຄ່າ, ສູງສຸດ 3); ຕາຕະລາງ variants ສ້າງຈາກ cartesian product ຂອງຄ່າ option (ແກ້ SKU, ລາຄາ, ຕົ້ນທຶນ, barcode, active ໃນແຖວ); ຮູບ (ລາຍການ URL + preview, ຈັດລຳດັບ). ໜ້າ `[id]` ສະແດງສະຕ໋ອກຕໍ່ variant/ສາງ ແລະ ລິ້ງໄປປະຫວັດ; options ແກ້ບໍ່ໄດ້ຫຼັງສ້າງ (ສະແດງ read-only ພ້ອມຄຳອະທິບາຍ) |
| `/stock` | ແຖບ "ຍອດ": ຕາຕະລາງຕາມ (variant, ສາງ) ມີ onHand/reserved/ຂາຍໄດ້, ໄອຄອນໃກ້ໝົດ; filter ສາງ + "ໃກ້ໝົດ". ປຸ່ມຕໍ່ແຖວ: ຮັບເຂົ້າ, ປັບຍອດ (ບັງຄັບໃສ່ເຫດຜົນ), ຍ້າຍສາງ, ຮັບຄືນ (dialog ຂະໜາດນ້ອຍ). ແຖບ "ປະຫວັດ": `StockMovement` ມີ filter type/variant/ວັນທີ, ລິ້ງໄປບິນ |
| `/orders` | ຕາຕະລາງ: ເລກບິນ, ລູກຄ້າ, ຊ່ອງທາງ, ສະຖານະ (Badge ສີຕາມສະຖານະ), ຍອດ, ເວລາ. Filter ສະຖານະ/ຄົ້ນຫາ/ວັນທີ |
| `/orders/new` | ຄົ້ນຫາ variant (autocomplete ຕາມ SKU/ຊື່) → ເພີ່ມລາຍການ (ຈຳນວນ, ສາງ, ສ່ວນຫຼຸດ); ສະແດງສະຕ໋ອກຂາຍໄດ້ຂ້າງແຖວ ແລະເຕືອນເມື່ອເກີນ; ລູກຄ້າ (ຄົ້ນຫາຕາມໂທ ຫຼື ກອກຂໍ້ມູນໃໝ່); ຄ່າສົ່ງ, ທີ່ຢູ່, ໝາຍເຫດ, ນາທີຈອງ; ສະຫຼຸບເງິນ (ຄຳນວນຝັ່ງ client ເພື່ອສະແດງ — ຝັ່ງ API ເປັນຄ່າຈິງ). ຖ້າ API ຕອບ `shortages` ສະແດງເຕືອນຕໍ່ແຖວ |
| `/orders/[id]` | ສ່ວນຫົວ (ເລກບິນ, ສະຖານະ, ໂມງນັບຖອຍຫຼັງ `reservedUntil` ເມື່ອ PENDING), ລາຍການ (snapshot), ສະຫຼຸບເງິນ, ລູກຄ້າ/ທີ່ຢູ່, ເສັ້ນເວລາ (paidAt, shippedAt…), ປຸ່ມຂັ້ນຕໍ່ໄປຂອງວົງຈອນ + ຍົກເລີກ (dialog ຢືນຢັນ), ປະຫວັດ movement ຂອງບິນ |
| `/warehouses` | ຕາຕະລາງ + dialog ສ້າງ/ແກ້; ປຸ່ມຕັ້ງ default; ປິດສາງ |
| `/categories` | tree + dialog ສ້າງ/ແກ້/ລຶບ |
| `/settings` (ສ່ວນຮ້ານ) | ຊື່, VAT %, ລາຄາລວມ VAT, ນາທີຈອງ. ແກ້ໄດ້ດ້ວຍ `inventory:write` |

Error ຈາກ API ສະແດງເປັນ toast ໂດຍແປຈາກ `code` (§6.2); ຖ້າບໍ່ຮູ້ຈັກ code ໃຊ້ `message`. i18n: lo/en ຕາມ dictionary ທີ່ມີ. ປຸ່ມ/ເມນູຊ່ອນຕາມສິດຈິງຂອງຜູ້ໃຊ້ (§6.1): ຄອລຳຕົ້ນທຶນສະແດງສະເພາະເມື່ອ `costs:read`; ປຸ່ມຢືນຢັນຊຳລະ = `payments:write`; ແພັກ/ສົ່ງ/ປິດ = `logistics:write`; ສ້າງ/ຍົກເລີກ = `orders:write`.

ແບ່ງ 1a-ui ເປັນ 4 plan (ແຕ່ລະອັນໃຊ້ງານໄດ້ເອງ): **A4** ພື້ນຖານ + ສາງ + ໝວດໝູ່ + ຕັ້ງຄ່າຮ້ານ, **A5** ສິນຄ້າ, **A6** ສະຕ໋ອກ (ຍອດ + ປະຫວັດ), **A7** ຄຳສັ່ງຊື້ (`docs/superpowers/plans/2026-10-05-phase1-a4…a7-*.md`). ປຸ່ມ/ເມນູຜູກສິດຕາມ §6.1.

## 11. ການທົດສອບ
**ເຄື່ອງຈັກ + e2e (Postgres ຈິງ `oca_test` ໃນ `apps/api/test`, ຕາມ pattern `staff.e2e.test.ts`; ຫ້າມແຕະ 5432 ຂອງຜູ້ໃຊ້)**
1. `reserve` ພ້ອມກັນ 20 ຄັ້ງ ໃສ່ສະຕ໋ອກ 1 ຊິ້ນ → ສຳເລັດ 1, ທີ່ເຫຼືອ `InsufficientStockError`, `reserved = 1`, movement `RESERVE` 1 ແຖວ.
2. ບິນ 3 ລາຍການທີ່ອັນສຸດທ້າຍບໍ່ພໍ → `409` ແລະ **ບໍ່ມີ** `Order`, `OrderItem`, `StockMovement` ຄ້າງ, `reserved` ບໍ່ປ່ຽນ.
3. ສອງບິນຈອງ (A,B) ແລະ (B,A) ພ້ອມກັນ ວົນ 50 ຮອບ → ບໍ່ deadlock (ບໍ່ມີ error `40P01`).
4. `cancel` ແຂ່ງ `expireOrder` ພ້ອມກັນ ວົນ 30 ຮອບ → `reserved` ກັບມາ 0 ພໍດີ (ບໍ່ຕິດລົບ, ບໍ່ຄືນຊ້ຳ); `pay` ແຂ່ງ `expire` → ຜູ້ຊະນະຄົນດຽວ.
5. Invariant (§4) ຖືກກວດຫຼັງທຸກ scenario ດ້ວຍ query ລວມ `StockMovement`.
6. `adjust` ລົບທີ່ເຮັດໃຫ້ `onHand < reserved` → `409`; `transfer` ສາງເດີມຊ້ຳ → `400`; ຕົ້ນທາງບໍ່ພໍ → `409` ແລະປາຍທາງບໍ່ປ່ຽນ.
7. ວົງຈອນເຕັມ pay→pack→ship→complete: ສະຕ໋ອກສຸດທ້າຍ `onHand` ລົດ, `reserved` ກັບ 0, movement ຄົບ.
8. `pay` ຫຼັງ `reservedUntil` → `409`. ຍົກເລີກບິນ SHIPPED → `409`.
9. ການສ້າງສິນຄ້າ: options ບໍ່ສອດຄ່ອງ variants, ຊຸດຄ່າຊ້ຳ, SKU ຊ້ຳ → `400`/`409` ແລະບໍ່ມີ product ຄ້າງ (rollback). Archive ແທນລຶບເມື່ອເຄີຍຖືກຂາຍ.
10. ສິດ: **sweep** ທຸກ route (ຄົ້ນຫາຈາກ Nest metadata ຈຶ່ງ route ໃໝ່ທີ່ລືມ `@RequirePermissions` ເຮັດໃຫ້ test ລົ້ມ): ບໍ່ມີ token → `401`; role ທີ່ຂາດສິດຂອງ route ນັ້ນຢ່າງດຽວ → `403`. ແລະ e2e ກັບ role ຕາມ seed ຈິງ (`seedRoleUsers`): CHAT_ADMIN ສ້າງບິນໄດ້/ຢືນຢັນຊຳລະບໍ່ໄດ້, WAREHOUSE ແພັກ/ສົ່ງໄດ້/ສ້າງບິນ+ຢືນຢັນຊຳລະບໍ່ໄດ້, ບໍ່ເຫັນ ແລະ ຕັ້ງຕົ້ນທຶນບໍ່ໄດ້, MANAGER/OWNER/ACCOUNTANT ຕາມທີ່ກຳນົດ.
11. ເງິນ: ຕົວຢ່າງ §7.2 ແລະ `pricesIncludeVat=false`, ຄ່າສົ່ງ 0, ສ່ວນຫຼຸດ = ລາຄາເຕັມ (lineTotal 0).

**Unit (ບໍ່ຕ້ອງມີ DB)**: ຄຳນວນເງິນ, slug generator, ການສ້າງ `Variant.name`, ການກວດ options/variants ສອດຄ່ອງ, ຕາຕະລາງ transition, ການແປ error (`23514`, P2002).

**Worker**: `expireReservations` ກັບ Postgres ຈິງ — ຄືນສະຕ໋ອກ, ຂ້າມບິນທີ່ຖືກ cancel ໄປແລ້ວ, ບິນທີ່ຜິດບໍ່ຢຸດບິນອື່ນ, ວົນເກີນ `limit`. `InventoryWorker.process` ຖິ້ມ error ເມື່ອ job ບໍ່ຮູ້ຈັກ (ຄືກັບ `MaintenanceWorker`).

**Seed**: run ຊ້ຳບໍ່ສ້າງ `StoreSetting`/ສາງຊ້ຳ ແລະ ບໍ່ຂຽນທັບຄ່າທີ່ແກ້ແລ້ວ.

**1a-ui**: component test ຕາມ pattern ຂອງ admin (ຟອມສິນຄ້າ + cartesian variants, ຟອມບິນ + ສະຫຼຸບເງິນ, ປຸ່ມຕາມສະຖານະ, ການຊ່ອນຕາມສິດ) ແລະ ກວດໜ້າຈິງດ້ວຍ Playwright headless ຄືກັບ Phase 0.

## 12. ເອກະສານທີ່ຕ້ອງອັບເດດ
`docs/DATABASE.md` (reservationMinutes, sequence, ກົດ transfer/lock), `README.md` (ສະຖານະ), `docs/ROADMAP.md` (ໝາຍ 1a), `.env.example` (`SEED_STORE_NAME`), `docs/DEPLOYMENT-NOTES.md` (worker queue `inventory`).

## 13. ຄວາມສ່ຽງ ແລະ ສິ່ງທີ່ຮູ້ວ່າຍັງຂາດ
* **Idempotency:** `POST /orders` ຍັງບໍ່ມີ idempotency key. Webhook ຂອງ Inbox/CF (ມັກສົ່ງຊ້ຳ) ຕ້ອງການມັນ; ເພີ່ມໃນ sub-project ຂອງໂມດູນນັ້ນ ໂດຍບໍ່ແຕະເຄື່ອງຈັກສະຕ໋ອກ.
* **ຕາຕະລາງ `StockMovement` ໃຫຍ່:** index `(variantId, warehouseId, createdAt)` ມີແລ້ວ; ປະຫວັດ filter ຕາມ `type`/`from..to` ໂດຍບໍ່ມີ variant ອາດຊ້າເມື່ອຫຼາຍແສນແຖວ — ເພີ່ມ index `(createdAt)` ພາຍຫຼັງຖ້າຈຳເປັນ (ຕ້ອງວັດກ່ອນ).
* **Postgres 16:** migration ໃໝ່ຕ້ອງກວດກັບ 16 (dev embedded ແມ່ນ 18) ພ້ອມງານຄ້າງຂອງ Phase 0.
* **Read Committed:** ທີ່ເລືອກ ເພາະ conditional UPDATE ຮອງຮັບ; ຖ້າໃນອະນາຄົດມີ logic ອ່ານ-ແລ້ວ-ຕັດສິນ ຕ້ອງຫຼີກ.

## 14. ນອກຂອບເຂດ
ອັບໂຫຼດຮູບ, auto-allocate ຂ້າມສາງ, ສະກຸນເງິນອື່ນ, ໂປຣໂມຊັນ/ສ່ວນຫຼຸດລະດັບບິນ, ການສົ່ງຄືນທີ່ປ່ຽນສະຖານະບິນ, ການແກ້ options ຫຼັງສ້າງ, ການນຳເຂົ້າ/ສົ່ງອອກ CSV, ການຊຳລະ/ສະລິບ (ໂມດູນ 9), ພັດສະດຸ/Tracking (ໂມດູນ 8), ໜ້າຮ້ານສາທາລະນະ (ເຟດ 3).

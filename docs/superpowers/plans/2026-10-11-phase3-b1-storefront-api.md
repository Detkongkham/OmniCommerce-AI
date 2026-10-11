# Storefront 3b-B1 (API ສາທາລະນະ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** API ສາທາລະນະ `/store/*` ໃຫ້ໜ້າຮ້ານ: ເບິ່ງສິນຄ້າ, ກວດກະຕ່າ, ສ້າງບິນ guest ທີ່ຈອງສະຕ໋ອກ, ເບິ່ງບິນດ້ວຍ token, ອັບໂຫຼດສະລິບ.

**Architecture:** ໂມດູນໃໝ່ `StorefrontModule` (ບໍ່ແມ່ນ permission module ຈຶ່ງ import ໃນ `AppModule` ໂດຍກົງ) ມີ controller ດຽວ `@Public()` ແລະ DTO ຂອງຕົນເອງ. ສ້າງບິນຜ່ານ `OrdersService.createFromStorefront` (ໃຊ້ `createInTransaction` ເດີມ + `web` extras) ແລະ ສະລິບຜ່ານ `SlipsService.uploadFromStorefront`. ຈຳກັດຄວາມຖີ່ດ້ວຍ `StoreRateLimiter` ໃນ memory (ບໍ່ໃຊ້ `ThrottlerModule` ເພາະ throttler ທີ່ຕັ້ງຊື່ເພີ່ມຈະໄປບັງຄັບໃຊ້ກັບ `/auth/login` ນຳ). Spec: `docs/superpowers/specs/2026-10-11-phase3-b-storefront-design.md`.

**Tech Stack:** NestJS 11, Prisma, Zod 4, Vitest + supertest.

## File map

**ສ້າງໃໝ່**
- migration `20261011000000_storefront`
- `packages/shared/src/schemas/storefront.ts` (+ test): ຄ່າຄົງທີ່ `STORE_*`, schema ຂອງ cart/order/list query, `storeStock()`.
- `apps/api/src/modules/storefront/`: `storefront.module.ts`, `storefront.controller.ts`, `store-catalog.service.ts`, `store-orders.service.ts`, `storefront.mapper.ts`, `store-rate-limiter.ts` (+ test).
- tests: `apps/api/test/storefront-migration.test.ts`, `orders-storefront.test.ts`, `storefront-catalog.e2e.test.ts`, `storefront-orders.e2e.test.ts`.

**ແກ້**
- `schema.prisma`; `packages/shared/src/index.ts`, `error-codes.ts` (+ test); `apps/api/src/common/api-error.ts`; `apps/admin/src/lib/i18n/dictionary.ts` (error ໃໝ່ lo + en).
- `orders.service.ts` (`OrderOrigin.web`, `createFromStorefront`, `findReplayId`); `slips.service.ts` (`uploadFromStorefront`, actor nullable); `payments.module.ts` (export `SlipsService`); `app.module.ts`; `config/env.ts`; `.env.example`.
- docs: spec (§3, §6), `DEPLOYMENT-NOTES.md`.

## ການຕັດສິນທີ່ຕ່າງຈາກ spec ຮ່າງທຳອິດ

- **GET ບໍ່ຖືກຈຳກັດຄວາມຖີ່ທີ່ API.** ໜ້າເວັບ render ຝັ່ງ server ຈຶ່ງທຸກຄຳຂໍອ່ານມາຈາກ IP ຂອງ Next ເຄື່ອງດຽວ; ຈຳກັດຕໍ່ IP ຈະບລັອກທັງເວັບ. ຈຳກັດສະເພາະ `POST` (ສັ່ງ, ສະລິບ, ກວດກະຕ່າ).
- **ສະລິບໃນ DTO ສາທາລະນະບໍ່ມີ id** ແລະ ສະຖານະຖືກຫຍໍ້ເປັນ `REVIEWING | CONFIRMED | REJECTED`.
- **`INSUFFICIENT_STOCK` ຂອງ `/store`** ຄືນ `shortages: [{ variantId, requested, available }]` (ບໍ່ມີ `warehouseId`/`sku` ຄືຂອງ admin).
- Idempotency key ຂອງເວັບເກັບເປັນ `sf:<key>` ເພື່ອບໍ່ຊົນກັບ key ຂອງ `POST /orders`.

### Task 1: migration
- [x] `schema.prisma`: `SlipSource.STOREFRONT`; `Order.publicToken String? @unique`, `shippingCourierId String?` → `Courier` (relation `"OrderShippingCourier"`, `onDelete: SetNull`), `shippingBranch String?`, `@@index([shippingCourierId])`; `Courier.preferredByOrders`.
- [x] `apps/api/test/storefront-migration.test.ts` (RED): `publicToken` ຊ້ຳ = P2002 ແຕ່ NULL ຫຼາຍແຖວໄດ້; ລຶບ courier → `shippingCourierId` ເປັນ NULL; ສ້າງ `PaymentSlip` ດ້ວຍ `source: "STOREFRONT"` ໄດ້.
- [x] ຂຽນ `migration.sql` (`ALTER TYPE ... ADD VALUE`, 3 ຖັນ, unique index, index, FK), `prisma generate`, test GREEN. commit.

### Task 2: shared
- [x] `storefront.test.ts` (RED): ເພດານ 20 ລາຍການ / 20 ອັນ, variant ຊ້ຳ, phone, `expectedTotal` ເປັນ money, `page` coerce + default 1, `category` ຕ້ອງເປັນ slug; `storeStock(0|-1)=OUT`, `1..5=LOW+remaining`, `6=IN_STOCK`.
- [x] `storefront.ts` + export ໃນ `index.ts` (GREEN).
- [x] error codes `PRICE_CHANGED`, `TOO_MANY_OPEN_ORDERS`, `SLIP_LIMIT_REACHED` (ທັງໝົດ 409) + test + `api-error.ts` + dictionary lo/en. build shared. commit.

### Task 3: OrdersService + SlipsService
- [x] `apps/api/test/orders-storefront.test.ts` (RED), ເອີ້ນ service ໂດຍກົງ: ສ້າງບິນ `STOREFRONT`/`WEB_CHECKOUT`, `createdById` null, ມີ `publicToken`/courier/branch, ຈອງສະຕ໋ອກ, audit `userId` null; key ຊ້ຳ + payload ເດີມ = id ເດີມ (ບິນດຽວ); key ຊ້ຳ + payload ຕ່າງ = `CONFLICT`; `expectedTotal` ບໍ່ຕົງ = `PRICE_CHANGED` ພ້ອມ `total` ແລະ ບໍ່ມີບິນ/ການຈອງ; `guard` throw = rollback.
- [x] `orders.service.ts`: `WebOrderExtras { publicToken, shippingCourierId, shippingBranch, expectedTotal, guard(tx) }`; `OrderOrigin { channel, source, liveSessionId?, web? }`; ໃນ `run`: ເອີ້ນ `web.guard` ທຳອິດ, ກວດ `expectedTotal` ຫຼັງຄິດຍອດ (`Prisma.Decimal.equals`), ບັນທຶກ 3 field; `findReplayId` (ໃຫ້ `findReplay` ໃຊ້ຮ່ວມ); `createFromStorefront(input, web, ip, key): Promise<string>`.
- [x] `slips.service.ts`: `CreateSlipInput.actor: AuthUser | null`, `source` ເພີ່ມ `"STOREFRONT"`, `uploadFromStorefront(orderId, file, ip)`; `payments.module.ts` export `SlipsService`.
- [x] GREEN + `orders.e2e`, `slips.e2e`, `cf-engine.e2e` ຍັງຜ່ານ. commit.

### Task 4: rate limiter + env
- [x] `store-rate-limiter.test.ts` (RED): ເກີນ limit → `TOO_MANY_ATTEMPTS` (429); ພົ້ນ window ແລ້ວຜ່ານ; key ຕ່າງກັນແຍກກັນ; ຄຳຂໍທີ່ຖືກປະຕິເສດບໍ່ຍືດ window.
- [x] `StoreRateLimiter.hit(key, limit, windowMs, now?)`; env `STORE_ORDER_RATE_LIMIT` (5 / 10 ນາທີ), `STORE_SLIP_RATE_LIMIT` (10 / 10 ນາທີ), `STORE_CHECK_RATE_LIMIT` (60 / ນາທີ); `.env.example`. GREEN. commit.

### Task 5: catalog
- [x] `storefront-catalog.e2e.test.ts` (RED): ທຸກ GET ບໍ່ຕ້ອງ token; `config` (ຊື່, ບັນຊີ, courier ທີ່ active ເທົ່ານັ້ນ); `products` (ບໍ່ມີ DRAFT/ARCHIVED/ບໍ່ມີ variant active, ຊ່ວງລາຄາ, ສະຖານະສະຕ໋ອກ 3 ຄ່າ, ກັ່ນຕອງ `category`/`q`, ແບ່ງໜ້າ 24); `products/:slug` (404 ຖ້າບໍ່ຂາຍ, variant active ເທົ່ານັ້ນ, `optionValues`); `categories` (ສະເພາະທີ່ມີສິນຄ້າຂາຍໄດ້); `cart/check` (ຍອດ, `unavailable`, `insufficient`, `orderable`); ບໍ່ມີສາງ default = `OUT`; sweep key ຕ້ອງຫ້າມ (`costPrice`, `unitCost`, `onHand`, `reserved`, `warehouseId`, `sku`, `barcode`, `createdById`, `customerId`).
- [x] `storefront.mapper.ts`, `store-catalog.service.ts`, controller (GET + `POST cart/check`), module, `app.module.ts`. GREEN + `permissions.e2e` ຜ່ານ. commit.

### Task 6: orders + slips
- [x] `storefront-orders.e2e.test.ts` (RED): ສ້າງ 201 `{ orderNumber, token }` + ແຖວ DB; ບໍ່ມີ `Idempotency-Key` = 400; replay = ບິນເດີມ; `PRICE_CHANGED`; `INSUFFICIENT_STOCK` (shortages ບໍ່ມີ `warehouseId`); ສອງຄຳຂໍແຂ່ງຊື້ອັນສຸດທ້າຍ = 201 + 409 ແລະ ledger ຕົງ; ເບີທີ່ມີຢູ່ບໍ່ຖືກແກ້ຊື່; ບິນຄ້າງທີ 3 = `TOO_MANY_OPEN_ORDERS`, ບິນໝົດອາຍຸບໍ່ນັບ; courier ບໍ່ມີ/ປິດ; ສິນຄ້າ DRAFT = `VARIANT_NOT_AVAILABLE`; `GET orders/:token` (ຮູບຮ່າງ, `EXPIRED` ເມື່ອເກີນເວລາ, tracking, token ຜິດ = 404, `Cache-Control: no-store`); ສະລິບ (201 → `STOREFRONT` + enqueue + audit null, gif = 422, ໃບທີ 4 = `SLIP_LIMIT_REACHED`, `REJECTED` ບໍ່ນັບ, ບິນ PAID = `ORDER_INVALID_STATE`, ໝົດອາຍຸ = `RESERVATION_EXPIRED`); rate limit = 429.
- [x] `store-orders.service.ts` + route. GREEN. commit.

### Task 7: ປິດງານ
- [x] ແກ້ spec §3/§6 ໃຫ້ຕົງ (ເບິ່ງ "ການຕັດສິນທີ່ຕ່າງ"), ເພີ່ມ `DEPLOYMENT-NOTES.md` (migration, env ໃໝ່, `TRUST_PROXY` ຈຳເປັນສຳລັບ rate limit).
- [x] `pnpm --filter @oca/shared test`, `pnpm --filter @oca/api exec tsc --noEmit`, `pnpm --filter @oca/api lint`, `OCA_TEST_DB_NAME=oca_test_sf pnpm --filter @oca/api exec vitest run` (ທັງໝົດ), `pnpm --filter @oca/admin exec vitest run src/lib/errors.test.ts`. commit.

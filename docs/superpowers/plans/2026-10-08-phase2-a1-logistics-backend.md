# Logistics 8a-1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** API ຂອງການແພັກ/ສົ່ງ: courier, ລາຍການລໍແພັກ, ກວດສະແກນ, override, ແກ້ຜູ້ຮັບ, ສົ່ງອອກພ້ອມ tracking ແລະ ແຈ້ງລູກຄ້າທາງແຊັດ.

**Architecture:** `LogisticsModule` (ມີ module ເປົ່າຢູ່ແລ້ວ) import `OrdersModule` (ໃຊ້ `pack`/`ship`) ແລະ `InboxModule` (export `ConversationsService` ເພື່ອສົ່ງຂໍ້ຄວາມ). `OrdersService.ship` ຮັບ hook `inTx` ເພື່ອບັນທຶກ Shipment ໃນ transaction ດຽວກັບການປ່ຽນສະຖານະ/ຕັດສະຕ໋ອກ. Spec: `docs/superpowers/specs/2026-10-08-phase2-a-logistics-design.md`.

**Tech Stack:** NestJS 11, Prisma, Zod 4, Vitest + supertest, fake Graph ຂອງ `@oca/channels/simulator`.

## File map

**ສ້າງໃໝ່**
- migration `20261008010000_logistics`
- `packages/shared/src/schemas/logistics.ts` (+ test): courier/fulfillment schemas, `buildTrackingUrl`, `buildTrackingMessage`.
- `apps/api/src/modules/logistics/`: `couriers.controller.ts`, `couriers.service.ts`, `fulfillment.controller.ts`, `fulfillment.service.ts`, `shipment-notifier.service.ts`, `logistics.mapper.ts`.
- tests: `apps/api/test/couriers.e2e.test.ts`, `fulfillment.e2e.test.ts`, `fulfillment-notify.e2e.test.ts`.

**ແກ້**
- `schema.prisma`, `packages/shared/src/index.ts`, `error-codes.ts`, `apps/api/src/common/api-error.ts` (status ຂອງ code ໃໝ່), `apps/admin/src/lib/i18n/dictionary.ts` (error ໃໝ່).
- `orders.service.ts` (`ship(..., inTx?)`), `orders.mapper.ts` (`shipment` ໃນ detail), `inbox.module.ts` (export `ConversationsService`), `logistics.module.ts`.

### Task 1: schema + shared
- [ ] migration (Courier, Shipment, enum ShipmentNotifyStatus) ຜ່ານ `prisma migrate diff`, ກວດ drift = 0.
- [ ] shared test (RED→GREEN): courier code/url template, verify body, ship body, `buildTrackingUrl` (encode tracking), `buildTrackingMessage`.
- [ ] error codes + api status + admin i18n. commit.

### Task 2: couriers API
- [ ] e2e (RED): list/create/patch, code normalize + ຊ້ຳ 409, url ບໍ່ແມ່ນ https/ບໍ່ມີ `{tracking}` 400, ສິດ read/write.
- [ ] implement. commit.

### Task 3: fulfillment queue/detail/start/verify/override/shipping
- [ ] e2e (RED) ຕາມ spec §7. implement. commit.

### Task 4: ship + order detail shipment
- [ ] e2e (RED): ບໍ່ verify 409, courier ປິດ, ບໍ່ມີຜູ້ຮັບ, ສຳເລັດ (SHIPPED, ສະຕ໋ອກຕັດ, shipment ຄົບ), ລົ້ມກາງ transaction ບໍ່ເຫຼືອ shipment ເຄິ່ງໆ, `GET /orders/:id` ມີ shipment.
- [ ] implement (`inTx` hook). commit.

### Task 5: notify
- [ ] e2e (RED) ກັບ fake Graph: conversationId → SENT + ຂໍ້ຄວາມຢູ່ Inbox; ເຄສຂອງລູກຄ້າ; ບໍ່ມີ → MANUAL; Graph ຕອບ outside window → FAILED; resend; force.
- [ ] implement `ShipmentNotifierService`. commit.

### Task 6: verify
- [ ] build/lint/test ທັງ workspace.

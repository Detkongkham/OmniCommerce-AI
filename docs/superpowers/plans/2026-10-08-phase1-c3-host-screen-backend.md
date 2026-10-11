# Host screen 4b-1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ໃຫ້ API ມີ snapshot ຂອງ Host screen, ສິນຄ້າທີ່ກຳລັງນຳສະເໜີ ແລະ event realtime (Redis + SSE) ຕໍ່ session ລວມທັງ event ຈາກ worker ເມື່ອບິນ CF ໝົດເວລາ.

**Architecture:** migration ເພີ່ມ `LiveSession.featuredItemId`. `LiveEventsService` (ແບບ `InboxEventsService`) ໃນ `LiveEventsModule` ທີ່ `OrdersModule` ແລະ `LiveCfModule` import. snapshot ຄິດໄລ່ໃນ `LiveHostService` ດ້ວຍ query ເບົາ (aggregate/groupBy). Spec: `docs/superpowers/specs/2026-10-08-phase1-c-host-screen-design.md`.

**Tech Stack:** NestJS 11, Prisma (Postgres), ioredis, rxjs, Zod 4, Vitest + supertest.

## File map

**ສ້າງໃໝ່**
- `packages/database/prisma/migrations/20261008000000_live_featured_item/migration.sql`
- `packages/shared/src/schemas/live-cf.ts` (ແກ້): `setFeaturedSchema`, `LIVE_EVENTS_CHANNEL`, `LiveEvent`, `isLiveEvent`.
- `apps/api/src/modules/live-cf/live-events.service.ts`, `live-events.module.ts`, `live-events.controller.ts` (SSE).
- `apps/api/src/modules/live-cf/live-host.service.ts` (snapshot) + route ໃນ `live-sessions.controller.ts`.
- tests: `apps/api/test/live-host.e2e.test.ts`, `apps/api/test/live-events.e2e.test.ts`, `apps/worker/src/processors/live-expiry-events.test.ts`.

**ແກ້**
- `schema.prisma`, `live-cf.mapper.ts` (`featuredItemId`), `live-sessions.service.ts` (setFeatured + publish), `cf-processor.service.ts`, `cf-comments.service.ts`, `orders.service.ts` + `orders.module.ts`, `live-cf.module.ts`, `apps/api/test/permissions.e2e.test.ts` (route ໃໝ່), worker `inventory.worker.ts` + ຟັງຊັນ `publishExpiredLiveSessions`.

## ຂໍ້ກຳນົດທົ່ວໄປ
- TDD: test RED ກ່ອນ. ຫຼັງແກ້ shared/database ຕ້ອງ build ກ່ອນ test api/worker. test api ໃຊ້ DB `oca_test` (global-setup) ເທົ່ານັ້ນ.
- commit ຕໍ່ task ພ້ອມ trailer ຂອງ session.

### Task 1: featured item
- [ ] migration + schema: `featuredItemId` FK SetNull, index; shared `setFeaturedSchema = z.strictObject({ itemId: z.string().min(1).nullable() })`.
- [ ] e2e (RED): PUT ສຳເລັດ → detail ມີ `featuredItemId`; item ຂອງ session ອື່ນ → 404 `LIVE_ITEM_NOT_FOUND`; null ລ້າງ; ENDED → 409; ລຶບລະຫັດທີ່ນຳສະເໜີ → null; ບໍ່ມີສິດ write → 403.
- [ ] implement `setFeatured` (audit `live.feature`), mapper. commit.

### Task 2: snapshot `GET /live-sessions/:id/host`
- [ ] e2e (RED) ຕາມ spec §6 (remaining/level, ບໍ່ມີ limit, ບໍ່ມີສາງຫຼັກ → stockAvailable null, buyers ບໍ່ຊ້ຳ, reserved vs paid, orders ບໍ່ນັບ CANCELLED/EXPIRED, recent ບໍ່ມີ NO_MATCH ແລະ ≤20 ລຽງໃໝ່→ເກົ່າ, 404).
- [ ] implement `LiveHostService.snapshot(id)`. commit.

### Task 3: LiveEventsService + SSE
- [ ] shared: channel + type + `isLiveEvent`.
- [ ] e2e (RED): ເປີດ SSE ຂອງ session A → `ready`; publish A ໄດ້ `live.updated`; publish B ບໍ່ໄດ້; session ບໍ່ພົບ 404; ບໍ່ມີສິດ 403.
- [ ] implement service/module/controller (guard: session ມີ + subscribe). commit.

### Task 4: publishers
- [ ] e2e (RED) ດ້ວຍ spy subscriber Redis: CF comment (simulated webhook) → event; resend → event; start/addItem/setFeatured → event; pay ບິນ CF → event; pay ບິນທົ່ວໄປ → ບໍ່ມີ.
- [ ] implement ໃນ processor, comments, sessions, orders (ຫຼັງ commit; ບໍ່ throw). commit.

### Task 5: worker
- [ ] test (RED) ກັບ Postgres + Redis ຈິງ: ບິນ CF ໝົດເວລາ → publish sessionId ຄັ້ງດຽວ; ບໍ່ແມ່ນ CF → ບໍ່ publish.
- [ ] implement `publishExpiredLiveSessions(db, redis, since)` ແລະ ເອີ້ນໃນ `InventoryWorker` ເມື່ອ `expired > 0`. commit.

### Task 6: verify
- [ ] build/lint/test ທັງ workspace; DEPLOYMENT-NOTES ບັນທຶກ SSE ຂອງ live (proxy ຕ້ອງບໍ່ buffer ຄື inbox).

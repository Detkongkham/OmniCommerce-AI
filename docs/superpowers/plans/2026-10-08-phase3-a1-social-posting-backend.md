# Social Posting 2a-1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ບ່ອນເກັບໄຟລ໌ + ອັບໂຫຼດ, API ໂພສ (ຮ່າງ/ຕັ້ງເວລາ/ຍົກເລີກ/ລອງໃໝ່), ຕົວໂພສລົງ Facebook Page ຕາມເວລາ ແລະ ເຊື່ອມ Post CF.

**Architecture:** `StorageService` (common, global ຜ່ານ `StorageModule`) ເກັບໄຟລ໌ໃນ `MEDIA_DIR`. `PostingModule` (ມີ module ເປົ່າຢູ່ແລ້ວ) import `ChannelsModule` (adapter) ແລະ `LiveCfModule` (export `LiveSessionsService` ເພື່ອ start). `PostPublisherService.runDue()` claim ໂພສໃນ DB ແລ້ວເອີ້ນ `FacebookAdapter.publishPost`. Spec: `docs/superpowers/specs/2026-10-08-phase3-a-social-posting-design.md`.

**Tech Stack:** NestJS 11 + multer (platform-express), Prisma, Zod 4, Vitest + supertest, fake Graph ຂອງ `@oca/channels/simulator`.

## File map

**ສ້າງໃໝ່**
- migration `20261008020000_social_posting`
- `packages/shared/src/schemas/posting.ts` (+ test)
- `apps/api/src/common/storage/` (`storage.service.ts`, `storage.module.ts`, `image-type.ts` + test)
- `apps/api/src/modules/posting/`: `media.controller.ts`, `media.service.ts`, `posts.controller.ts`, `posts.service.ts`, `post-publisher.service.ts`, `posting.mapper.ts`
- tests: `apps/api/test/media.e2e.test.ts`, `posts.e2e.test.ts`, `post-publisher.e2e.test.ts`

**ແກ້**
- `schema.prisma`, shared `index.ts`, `error-codes.ts`, `api-error.ts`, admin `dictionary.ts`
- `config/env.ts` (+test) (`MEDIA_DIR`, `POSTING_TICK_MS`), `.env.example`, `app.module.ts` (StorageModule)
- channels: `facebook/adapter.ts` (+test) `publishPost`, `simulator/fake-graph.ts` (`/me/photos`, `/me/feed`)
- `live-cf.module.ts` (export `LiveSessionsService`), `live-sessions.service.ts` (`start` ຮັບ `Pick<AuthUser,"id">`)
- `posting.module.ts`, seed `roles.ts` (+test), test `helpers.ts` (resetDb), `permissions.e2e.test.ts`, test env (`POSTING_TICK_MS=0`, `MEDIA_DIR` ຊົ່ວຄາວ)

### Task 1: schema + shared + storage + media API
- [ ] migration ຜ່ານ `prisma migrate diff` (+ CHECK ຂອງ SocialPostMedia ຂຽນເອງ), drift = 0.
- [ ] shared test (RED→GREEN): create/update/schedule/list query schemas.
- [ ] error codes + status + i18n; env.
- [ ] `detectImageType` unit test; `StorageService`.
- [ ] media e2e (RED) → implement controller/service. commit.

### Task 2: posts API
- [ ] e2e (RED): CRUD, validation, ສະຖານະ (schedule/cancel/retry/delete/patch ຕາມ §2), ກອງ status/from/to, ເຊື່ອມ session, ສິດ, CHAT_ADMIN.
- [ ] implement service/controller/mapper + seed role. commit.

### Task 3: adapter + fake Graph
- [ ] adapter unit (RED): photos (url + multipart) → feed attached_media; ບໍ່ມີຮູບ; error ທີ່ photo/feed; ບໍ່ມີ token.
- [ ] implement + fake Graph routes. commit.

### Task 4: publisher + CF link
- [ ] e2e (RED) ກັບ fake Graph ຕາມ spec §9.
- [ ] implement `PostPublisherService` (tick, claim, stale sweep, CF start), publish-now trigger. commit.

### Task 5: verify
- [ ] build/lint/test ທັງ workspace; DEPLOYMENT-NOTES (`MEDIA_DIR` backup, proxy upload size ≥ 8 MB, token ຕ້ອງມີ `pages_manage_posts`).

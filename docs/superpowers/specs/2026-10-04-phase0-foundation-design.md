# Phase 0: ພື້ນຖານ — ການອອກແບບ

* **ວັນທີ:** 2026-10-04
* **ສະຖານະ:** ອະນຸມັດແລ້ວ (ລໍຖ້າ review spec)
* **ອ້າງອີງ:** [ROADMAP](../../ROADMAP.md), [ADR 0001](../../adr/0001-single-store-first.md), [ADR 0002](../../adr/0002-nestjs-backend.md), [DESIGN](../../DESIGN.md)

## ເປົ້າໝາຍ
ປິດ Phase 0: ມີ tooling ຮ່ວມ, Auth + RBAC ທີ່ປັບແຕ່ງ role ໄດ້, ໂຄງ NestJS (api + worker), ແລະ ໂຄງ Next.js (admin + storefront). ແບ່ງເປັນ 4 sub-project ເຮັດຕາມລຳດັບ A → B → C → D, ແຕ່ລະອັນ commit ແຍກ.

## ການຕັດສິນໃຈ
* Login: email + ລະຫັດຜ່ານ (argon2), JWT access (15 ນາທີ) + refresh (7 ວັນ, httpOnly cookie, rotation).
* RBAC: Role ປັບແຕ່ງເອງໄດ້ໃນ UI; Permission ເປັນ string `module:action` ທີ່ກຳນົດໃນໂຄດ (`packages/shared`), ບໍ່ແມ່ນຕາຕະລາງ.
* ໃຊ້ zod ໃນ `packages/shared` ເປັນ validation ດຽວສຳລັບ API ແລະ admin.
* DB ເຂົ້າຜ່ານ `packages/database` ເທົ່ານັ້ນ (ADR 0001). Test ໃຊ້ Vitest.

## A. Tooling (`packages/config`, `packages/shared`)
* `packages/config`: `tsconfig.base.json`, `tsconfig.nest.json`, `tsconfig.next.json`, eslint flat config.
* `packages/shared`: `permissions.ts` (`as const`), `schemas/` (login, staff, role), `constants.ts`.

## B. Auth/RBAC schema ແລະ seed (`packages/database`)
Migration ໃໝ່ (ບໍ່ແກ້ `init`):
* `User`: id, email (unique), passwordHash, name, isActive, lastLoginAt, roleId.
* `Role`: id, name (unique), description, isSystem. Role ລະບົບ (OWNER) ລຶບ/ແກ້ permission ບໍ່ໄດ້.
* `RolePermission`: roleId + permission, unique ຄູ່ກັນ.
* `RefreshToken`: id, userId, tokenHash, familyId, expiresAt, revokedAt, userAgent, ip. ຖ້າ token ທີ່ໃຊ້ແລ້ວຖືກໃຊ້ຊ້ຳ ໃຫ້ revoke ທັງ family.
* `AuditLog`: id, userId?, action, entity, entityId, before/after (JSON), ip, createdAt; append-only. Phase 0 ບັນທຶກ login/logout ແລະ ການແກ້ user/role.

Seed (`prisma/seed.ts`, idempotent): role OWNER (ທຸກ permission) + MANAGER, CHAT_ADMIN, WAREHOUSE, ACCOUNTANT; OWNER ຄົນທຳອິດຈາກ `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` ໃນ `.env` (ເພີ່ມໃນ `.env.example`). Script `pnpm db:seed`.

## C. Backend
`apps/api` (NestJS):
* `main.ts`, `AppModule`, `PrismaModule`, ກວດ env ດ້ວຍ zod ຕອນເລີ່ມ.
* `auth`: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`; rate limit ທີ່ login.
* `JwtAuthGuard` (global) + `@Public()`; `@RequirePermissions()` + `PermissionsGuard`.
* `staff`: CRUD ພະນັກງານ ແລະ role/permission ພ້ອມຂຽນ AuditLog; ກັນປິດ/ລຶບ OWNER ຄົນສຸດທ້າຍ.
* ອີກ 11 module: `Module` ເປົ່າທີ່ລົງທະບຽນໃນ `AppModule`, ບໍ່ມີ logic.
* `GET /health` ກວດ DB + Redis.

`apps/worker`: NestJS standalone + BullMQ; queue `system.ping` ຕົວຢ່າງ 1 ອັນ.

ການທົດສອບ: unit (guard, token rotation); e2e (login → refresh → endpoint ມີສິດ/ບໍ່ມີສິດ) ກັບ Postgres ຈິງຈາກ docker-compose.

## D. Frontend
`apps/admin` (Next.js App Router, Tailwind v4, shadcn/ui, token ສີມ່ວງຕາມ DESIGN.md ໃນ `packages/ui`):
* ໜ້າ `/login`, layout shell, `/staff` (ລາຍການ/ສ້າງ/ແກ້/ປິດໃຊ້ງານ), `/roles` (ສ້າງ/ແກ້ພ້ອມ matrix permission).
* ເມນູ/ປຸ່ມຖືກຊ່ອນຕາມ permission; API ເປັນຜູ້ບັງຄັບສິດຈິງ.
* Form ໃຊ້ zod ຈາກ `packages/shared`.

`apps/storefront`: Next.js ເປົ່າ ໜ້າ placeholder ໜ້າດຽວ ໃຊ້ token ຈາກ `packages/ui`.

## ເກນສຳເລັດ
`pnpm install && pnpm infra:up && pnpm db:seed && pnpm dev` ເປີດ api + worker + admin + storefront ໄດ້; login ດ້ວຍ OWNER ເຂົ້າ `/staff` ແລະ `/roles` ໄດ້; ພະນັກງານທີ່ບໍ່ມີ `staff:write` ຖືກ API ຕອບ 403; `pnpm test` ຜ່ານ.

## ນອກຂອບເຂດ
2FA, ລືມລະຫັດທາງອີເມວ, social login, multi-tenant, logic ຂອງ 11 module ທີ່ເຫຼືອ.

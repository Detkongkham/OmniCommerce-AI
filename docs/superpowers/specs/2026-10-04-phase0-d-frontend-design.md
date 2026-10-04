# Phase 0-D: Frontend (admin + storefront) Design

ລາຍລະອຽດຂອງພາກ D ໃນ [phase0-foundation-design](2026-10-04-phase0-foundation-design.md). **ການອອກແບບ UI ທັງໝົດຕ້ອງເຮັດຕາມ [DESIGN.md](../../DESIGN.md)** (token ສີມ່ວງ, ແບນບໍ່ມີເງົາ, ພື້ນ 3 ຊັ້ນ, ມຸມມົນ, ຟອນ Noto Sans Lao, ໂຄງ shell §8, component §9, page pattern §11). ຖ້າ spec ນີ້ຂັດກັບ DESIGN.md ໃຫ້ DESIGN.md ຊະນະ.

## ການຕັດສິນໃຈ
* Admin ເອີ້ນ API ຜ່ານ Next rewrites: `/api/:path*` → `${API_URL}/:path*` (ຄ່າເລີ່ມຕົ້ນ `http://localhost:3001`). ບໍ່ມີ CORS.
* Access token ເກັບໃນ memory ເທົ່ານັ້ນ. Refresh token ເປັນ httpOnly cookie ທີ່ API ຕັ້ງ.
* Data fetching: TanStack Query. Form: react-hook-form + zodResolver ດ້ວຍ schema ຈາກ `@oca/shared`.
* ສອງພາສາ lo/en ດ້ວຍ dictionary ງ່າຍໆ (ບໍ່ໃຊ້ i18n library); ລາວເປັນຄ່າເລີ່ມຕົ້ນ.

## ການແກ້ `apps/api` (ຂະໜາດນ້ອຍ)
Cookie refresh ປັດຈຸບັນ `path=/auth` ([auth.controller.ts](../../../apps/api/src/auth/auth.controller.ts)). ຜ່ານ proxy browser ເອີ້ນ `/api/auth/refresh` ຈຶ່ງບໍ່ສົ່ງ cookie. ເພີ່ມ env `REFRESH_COOKIE_PATH` (ຄ່າເລີ່ມຕົ້ນ `/auth` ເພື່ອບໍ່ທຳລາຍເດີມ), admin ຕັ້ງເປັນ `/api/auth`. ມີ test ຢືນຢັນ path ທີ່ຕັ້ງ.

## `packages/ui`
* `globals.css` ຕາມ DESIGN.md §21 (token light + dark, ມີ toggle ບໍ່ຢູ່ໃນຂອບເຂດ).
* shadcn component ທີ່ໃຊ້ຮ່ວມ: Button, Input, Label, Card, Badge, Table, Dialog, Checkbox, Select, Toast. ປັບຕາມ DESIGN.md §9.
* Export ຜ່ານ `@oca/ui`; admin ແລະ storefront ໃຊ້ token ດຽວກັນ.

## `apps/admin`
* ໂຄງ: `app/(auth)/login`, `app/(app)/layout` (shell + ກັນໜ້າ), `app/(app)/staff`, `app/(app)/roles`.
* `lib/api.ts` `apiFetch`: ແນບ Bearer; ໄດ້ 401 → refresh ຄັ້ງດຽວແລ້ວລອງໃໝ່; ຍັງ 401 → ໄປ `/login`. Refresh ພ້ອມກັນຮວມເປັນ promise ດຽວ (refresh token ໃຊ້ໄດ້ຄັ້ງດຽວ).
* `AuthProvider`: ຕອນເປີດໜ້າເອີ້ນ `/auth/refresh` ແລ້ວ `/auth/me`; ເກັບ user + permissions. Hook `useCan(permission)` ຊ່ອນເມນູ/ປຸ່ມ; API ຍັງບັງຄັບສິດຈິງ.
* `/login`: `loginSchema`, ສະແດງ error ຈາກ API (401, 429).
* `/staff`: ຕາຕະລາງ (GET /staff), dialog ສ້າງ (POST) ແລະ ແກ້ (PATCH), ປິດ/ເປີດໃຊ້ງານດ້ວຍ PATCH `isActive`. ປຸ່ມຂຶ້ນກັບ `staff:write`.
* `/roles`: ລາຍການ, ສ້າງ/ແກ້ (POST/PUT) ພ້ອມ matrix permission ຈັດກຸ່ມຕາມ module ຈາກ `GET /permissions`, ລຶບ (DELETE). Role ລະບົບ (`isSystem`) ເປັນ read-only. ສະແດງ error ເມື່ອ API ປະຕິເສດ (ເຊັ່ນ ລຶບ role ທີ່ມີຄົນໃຊ້, ປິດ OWNER ຄົນສຸດທ້າຍ).

## `apps/storefront`
Next.js App Router ໜ້າດຽວ placeholder ໃຊ້ token ຈາກ `@oca/ui`. ບໍ່ມີ logic.

## ການທົດສອບ
* Vitest + Testing Library: `apiFetch` (attach, refresh+retry, refresh ພ້ອມກັນ, ໄປ login), `useCan`, form ຂອງ staff ແລະ role (validation ຈາກ zod).
* `next build` ຂອງ admin ແລະ storefront ຜ່ານ; lint ຜ່ານ.
* Smoke ຈິງ (infra + seed + api + admin): login ດ້ວຍ OWNER ເຂົ້າ `/staff` ແລະ `/roles` ໄດ້; refresh ໜ້າແລ້ວຍັງ login ຢູ່; user ທີ່ບໍ່ມີ `staff:write` ບໍ່ເຫັນປຸ່ມແກ້ ແລະ API ຕອບ 403.

## ນອກຂອບເຂດ
Dark mode toggle, i18n library, ໜ້າອື່ນນອກຈາກ login/staff/roles, logic ຂອງ storefront, ໜ້າ Design System.

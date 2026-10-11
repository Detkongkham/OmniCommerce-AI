# CF Engine 4a-2 (admin UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** ໃຫ້ແອດມິນຈັດການ Live/ໂພສ CF ໄດ້ຄົບຈາກໜ້າ `/live` (ສ້າງ/ແກ້ session, ລະຫັດ→variant, ເລີ່ມ/ຈົບ, ເບິ່ງ ledger ຄອມເມັ້ນ + ສົ່ງໃໝ່) ແລະ ຕັ້ງຂໍ້ມູນໂອນ (`paymentInstructions`) ໃນ `/settings`.

**Architecture:** ໃຊ້ API ຂອງ 4a-1 ທີ່ມີແລ້ວ (`/live-sessions`, `/live-sessions/:id/items`, `/live-sessions/:id/comments`, `PATCH /settings/store`). ບໍ່ແຕະ backend. ໜ້າ list ແລະ detail ເປັນ client component ຕາມແບບ `orders` (React Query + `apiFetch`, `PermissionGate`, `ServerPager`, ຟອມ react-hook-form + zod ໃນ Dialog). session ທີ່ LIVE poll ທຸກ 5 ວິ (ບໍ່ມີ SSE ໃນ 4a; realtime ເປັນ 4b).

**Tech Stack:** Next.js (App Router), React Query, react-hook-form + zod, `@oca/ui`, `@oca/shared` (schemas/ຄ່າຄົງທີ່ live-cf), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-10-07-phase1-c-cf-engine-design.md` §8. Backend: plan `2026-10-07-phase1-c1-cf-engine-backend.md`.

## ຜົນການປະຕິບັດ (2026-10-08)

- ສຳເລັດທຸກ task. ການປ່ຽນຈາກ plan: ຂະໜາດໜ້າ ledger = 30 (ຕົວເລືອກຂອງ pager ແມ່ນ 10/30/50); ລຶບລະຫັດລົ້ມ = toast error ແລ້ວປິດ dialog (ຕາມແບບ category/warehouse); ແກ້ schema `paymentInstructions` ຂອງ shared ໃຫ້ key ເປັນ optional ໃນ type ຂາອອກ (ກ່ອນນີ້ admin build ລົ້ມເທິງ branch 4a-1).
- Smoke ໃນ Chromium (Playwright) ກັບ API + admin + simulator + Graph ປອມ: login → `/settings` ມີຂໍ້ມູນໂອນ → ສ້າງ session → ເພີ່ມລະຫັດ `a1` (ເປັນ `A1`) → ເລີ່ມ → ຄອມເມັ້ນ `CF A1 2` + ຄອມເມັ້ນທົ່ວໄປ → ledger ອັບເດດເອງ (ORDERED + ລິ້ງບິນ, NO_MATCH, ຈອງ 2/5) → Private Reply ມີລາຍການ, ຍອດ, ເວລາໂອນ ແລະ ຂໍ້ມູນໂອນ → ເປີດບິນໄດ້ → ຈົບ session.

## ການຕັດສິນໃນ plan ນີ້

1. **ເສັ້ນທາງ:** `/live` (ລາຍການ + ປຸ່ມສ້າງ ເປີດ dialog → ສ້າງແລ້ວໄປ `/live/:id`) ແລະ `/live/:id` (ລາຍລະອຽດ: ຫົວ + ປຸ່ມ, card ລະຫັດ, card ledger). ແຍກໜ້າ detail ເພາະ ledger ຍາວ ແລະ ຕ້ອງ poll ສະເພາະ session ດຽວ.
2. **Nav:** ກຸ່ມໃໝ່ `live` ("ໄລຟ໌ ແລະ CF") ຫຼັງກຸ່ມ `chat` ດ້ວຍສິດ `live-cf:read`; ກຸ່ມນີ້ມາຫຼັງກຸ່ມເດີມ ຈຶ່ງບໍ່ປ່ຽນໜ້າຫຼັງ login ຂອງບົດບາດທີ່ມີຢູ່.
3. **Poll:** `useLiveSession` ແລະ `useCfComments` ຕັ້ງ `refetchInterval` 5 ວິ ເມື່ອ session `status === "LIVE"`; ສະຖານະອື່ນບໍ່ poll.
4. **ຈົບ session** ຖາມຢືນຢັນດ້ວຍ `ConfirmDialog` (ກັບຄືນບໍ່ໄດ້); **ເລີ່ມ** ບໍ່ຖາມ (ກວດ client: ຕ້ອງມີ `externalPostId` ແລະ ≥1 ລະຫັດ, ບອກເຫດຜົນເປັນ hint ແທນການກົດແລ້ວ error).
5. **ລະຫັດ:** ເພີ່ມ = dialog (ລະຫັດ + VariantPicker + limit ວ່າງໄດ້); ແກ້ = dialog ດຽວກັນແຕ່ລະຫັດອ່ານຢ່າງດຽວ (API ບໍ່ໃຫ້ປ່ຽນລະຫັດ) ແລະ ປ່ຽນສິນຄ້າບໍ່ໄດ້ເມື່ອ `claimed > 0`; ລຶບ = ConfirmDialog, ປິດເມື່ອ `claimed > 0`. session ENDED = ອ່ານຢ່າງດຽວ.
6. **ສະຖານະຂໍ້ຄວາມ:** `replyErrorCode` ແປດ້ວຍ `cfReplyErrorKey` (OUTSIDE_WINDOW ຂອງ Private Reply ໝາຍເຖິງ 7 ມື້/ຕອບແລ້ວ ຈຶ່ງມີຂໍ້ຄວາມສະເພາະ; ລະຫັດອື່ນໃຊ້ `sendErrorKey` ຂອງ inbox). ປຸ່ມ "ສົ່ງໃໝ່" ສະເພາະ `FAILED` + `live-cf:write`; ອ່ານ `replyStatus` ທີ່ API ຄືນ (SENT / FAILED / SENDING) ແລ້ວ toast ຕາມນັ້ນ.
7. **`paymentInstructions`:** textarea ໃນຟອມ `/settings` ເດີມ (≤500 ຕົວ, ວ່າງ = null ຕາມ schema ຂອງ API), ສະແດງຈຳນວນຕົວອັກສອນ.

## File map

**ສ້າງໃໝ່**
- `apps/admin/src/lib/live.ts` (+ `.test.ts`): `cfReplyErrorKey`, `canStartSession`.
- `apps/admin/src/components/live/live-status.tsx`: `LiveStatusPill`, `CfOutcomePill`, `CfReplyStatusPill`.
- `apps/admin/src/components/live/session-form-dialog.tsx` (+ test): ສ້າງ/ແກ້ session.
- `apps/admin/src/components/live/session-list.tsx` (+ test): ໜ້າ `/live`.
- `apps/admin/src/components/live/item-form-dialog.tsx` (+ test): ເພີ່ມ/ແກ້ລະຫັດ.
- `apps/admin/src/components/live/session-items-card.tsx` (+ test): ຕາຕະລາງລະຫັດ + ລຶບ.
- `apps/admin/src/components/live/comment-ledger-card.tsx` (+ test): ledger + ສົ່ງໃໝ່.
- `apps/admin/src/components/live/session-detail.tsx` (+ test): ໜ້າ `/live/:id`.
- `apps/admin/src/app/(app)/live/page.tsx`, `apps/admin/src/app/(app)/live/[id]/page.tsx`.

**ແກ້**
- `apps/admin/src/lib/types.ts`: `StoreSettingsDto.paymentInstructions`, DTO ຂອງ live-cf.
- `apps/admin/src/lib/queries.ts`: hooks ຂອງ live-cf.
- `apps/admin/src/lib/nav.ts` (+ test): ກຸ່ມ `live`.
- `apps/admin/src/lib/i18n/dictionary.ts`: ຂໍ້ຄວາມ `live.*`, `settings.paymentInstructions*`, `nav.*`.
- `apps/admin/src/components/settings/store-settings-form.tsx` (+ test).
- `docs/ROADMAP.md`, `README.md`.

## ຂໍ້ກຳນົດທົ່ວໄປ

- TDD: test ກ່ອນ ເຫັນ RED ແລ້ວຈຶ່ງຂຽນ. test ຂອງ component mock `apiFetch` ແລະ `useCan` ຕາມແບບ `store-settings-form.test.tsx`; render ດ້ວຍ `renderWithProviders` (ພາສາອັງກິດ).
- ຂໍ້ຄວາມ UI ທຸກອັນຜ່ານ `t()` ທັງ `lo` ແລະ `en` (type `Record<TranslationKey, string>` ບັງຄັບໃຫ້ຄົບ).
- ກວດກ່ອນ commit: `pnpm --filter @oca/admin lint`, `pnpm --filter @oca/admin exec tsc --noEmit`, `pnpm --filter @oca/admin test`.

---

### Task 1: `paymentInstructions` ໃນ `/settings`

**Files:** Modify `lib/types.ts`, `components/settings/store-settings-form.tsx`, `lib/i18n/dictionary.ts`; Test `components/settings/store-settings-form.test.tsx`.

- [x] test (RED): ໂຫຼດຄ່າເຂົ້າ textarea "Payment details for customers"; ບັນທຶກສົ່ງ `paymentInstructions` (trim); ລ້າງເປັນວ່າງ → ສົ່ງ `null`; ເກີນ 500 ຕົວ → error "Must be at most 500 characters" ແລະ ບໍ່ສົ່ງ; ບໍ່ມີ `inventory:write` → disabled.
- [x] ເພີ່ມ `paymentInstructions: string | null` ໃນ `StoreSettingsDto`; field ໃນ `formSchema` = `z.string().max(500)`; payload ສົ່ງ `value.trim() === "" ? null : value.trim()`; textarea + hint + ຕົວນັບ `{count}/500`.
- [x] test PASS → commit `feat(admin): payment instructions field in store settings`.

### Task 2: Data layer, i18n, nav

**Files:** Modify `lib/types.ts`, `lib/queries.ts`, `lib/nav.ts`, `lib/nav.test.ts`, `lib/i18n/dictionary.ts`; Create `lib/live.ts`, `lib/live.test.ts`.

- [x] types: `LiveSessionDto`, `LiveSessionDetailDto` (`items: LiveItemDto[]`), `LiveItemDto`, `CfCommentDto`, `CfLedgerLine` ກົງກັບ `apps/api/src/modules/live-cf/live-cf.mapper.ts` (Date → string).
- [x] queries: `queryKeys.liveSessions = ["live-sessions"]`; `useLiveSessions({status,page,pageSize})`; `useLiveSession(id)` (poll 5 ວິ ເມື່ອ LIVE); `useCfComments(id, {outcome,page,pageSize}, {live})` (poll 5 ວິ ເມື່ອ `live`); mutations `useCreateLiveSession`, `useUpdateLiveSession`, `useLiveSessionAction` (`start`|`end`, invalidate ທັງເມື່ອລົ້ມ), `useSaveLiveItem` (POST/PATCH), `useDeleteLiveItem`, `useResendCfReply`. ທຸກ mutation invalidate `liveSessions`; ລະຫັດ/ຈົບ invalidate `orders` ນຳ ບໍ່ຈຳເປັນ (ບໍ່ປ່ຽນບິນ).
- [x] `lib/live.ts` (RED→GREEN): `cfReplyErrorKey(code)` (OUTSIDE_WINDOW → `live.replyError.OUTSIDE_WINDOW`, ອື່ນ → `sendErrorKey`), `startBlocker(session)` → `"noPost" | "noItems" | null`.
- [x] nav (RED→GREEN): test "ຜູ້ມີ live-cf:read ເຫັນກຸ່ມ live (/live)" ແລະ "inbox:read + live-cf:read: ກຸ່ມ chat ມາກ່ອນ live, landing ຍັງ /inbox".
- [x] commit `feat(admin): live-cf data layer, nav entry and translations`.

### Task 3: status pills + session form dialog

- [x] `live-status.tsx`: tone ຂອງ status (DRAFT neutral, LIVE danger [ກຳລັງໄລຟ໌], ENDED neutral-success), outcome (ORDERED success, NO_MATCH neutral, OUT_OF_STOCK warning, LIMIT_REACHED warning, ERROR danger), reply (NONE neutral, SENDING info, SENT success, FAILED danger).
- [x] test dialog (RED): ສ້າງ → POST `/live-sessions` `{title, kind, externalPostId|null, publicReplyEnabled}` ແລ້ວເອີ້ນ `onSaved(session)`; ແກ້ → PATCH ສະເພາະ title/externalPostId/publicReplyEnabled (ບໍ່ສົ່ງ kind); session LIVE → ຊ່ອງ post id disabled; post id ຜິດຮູບ → error ແລະ ບໍ່ສົ່ງ; API error → alert.
- [x] implement ດ້ວຍ `createLiveSessionSchema.shape` ຂອງ shared. commit.

### Task 4: ໜ້າ `/live` (list)

- [x] test (RED): ຕາຕະລາງ (ຊື່ ລິ້ງໄປ `/live/:id`, ປະເພດ, ສະຖານະ, ລະຫັດ, ຄອມເມັ້ນ, ສ້າງເມື່ອ); filter ສະຖານະ → query `status=`; empty state; load error + Retry; ປຸ່ມ "New session" ສະເພາະ `live-cf:write`; ສ້າງສຳເລັດ → `router.push("/live/:id")`.
- [x] implement `session-list.tsx` + `app/(app)/live/page.tsx` (`PermissionGate live-cf:read`). commit.

### Task 5: card ລະຫັດ + dialog ລະຫັດ

- [x] test dialog (RED): ເພີ່ມ → POST `/live-sessions/:id/items` `{code, variantId, limit|null}` (ລະຫັດ normalize ໂດຍ API); ຕ້ອງເລືອກສິນຄ້າ; limit ຕ້ອງເປັນຈຳນວນເຕັມ ≥1 ຫຼື ວ່າງ; ແກ້ → PATCH `{variantId?, limit}` ລະຫັດອ່ານຢ່າງດຽວ; `claimed > 0` → ປ່ຽນສິນຄ້າບໍ່ໄດ້ (hint).
- [x] test card (RED): ຕາຕະລາງ (ລະຫັດ, ສິນຄ້າ/variant/SKU, ຈອງແລ້ວ/limit); ປຸ່ມເພີ່ມ/ແກ້/ລຶບ ສະເພາະ write ແລະ session ບໍ່ ENDED; ລຶບ claimed>0 disabled; ລຶບ → ConfirmDialog → DELETE; empty state ບອກໃຫ້ເພີ່ມລະຫັດ.
- [x] implement. commit.

### Task 6: card ledger ຄອມເມັ້ນ

- [x] test (RED): ຕາຕະລາງ (ເວລາ, ຜູ້ຄອມເມັ້ນ, ຂໍ້ຄວາມ, ຜົນ, ບິນ ລິ້ງ `/orders/:orderId`, ຂໍ້ຄວາມ + ເຫດຜົນລົ້ມ); filter outcome → `outcome=`; ປຸ່ມສົ່ງໃໝ່ສະເພາະ FAILED + write → POST `.../resend`; ຜົນ SENT → toast ສຳເລັດ, FAILED → toast error ພ້ອມເຫດຜົນ, SENDING → toast info; empty; error + Retry; ບໍ່ມີ `orders:read` → ເລກບິນບໍ່ເປັນລິ້ງ.
- [x] implement. commit.

### Task 7: ໜ້າ `/live/:id` (detail)

- [x] test (RED): loading; 404 → "not found" + ກັບຄືນ; ອື່ນ → error + Retry; ຫົວ (ຊື່, pill, ປະເພດ, post id, ເວລາເລີ່ມ/ຈົບ); DRAFT + write: ປຸ່ມເລີ່ມ (disabled + hint ເມື່ອບໍ່ມີ post id/ລະຫັດ) → POST `/start`; LIVE: ປຸ່ມຈົບ → ConfirmDialog → POST `/end`; error ຂອງ action → alert; ບໍ່ມີ write → ບໍ່ມີປຸ່ມ.
- [x] implement `session-detail.tsx` + `app/(app)/live/[id]/page.tsx` (id regex ຄື orders). commit.

### Task 8: Docs + verify + smoke

- [x] ROADMAP: 4a ສຳເລັດ (4a-1 + 4a-2), ເຫຼືອ 4b Host screen. README: ຫຍໍ້ໜ້າ `/live`.
- [x] `pnpm build`, `pnpm lint`, `pnpm test` ຜ່ານໝົດ.
- [x] Smoke ໃນ Chromium (Playwright) ກັບ API + admin + simulator ຢູ່ DB/ພອດແຍກ: ສ້າງ session → ເພີ່ມລະຫັດ → ເລີ່ມ → simulator ສົ່ງຄອມເມັ້ນ CF → ledger ສະແດງ ORDERED + ລິ້ງບິນ.
- [x] commit docs.

# Phase 1 ໂມດູນ 4: Live & Post CF Engine, sub-project 4b (Host screen)

ວັນທີ: 2026-10-08 · ສະຖານະ: ຜູ້ໃຊ້ອະນຸມັດການອອກແບບແລ້ວ · Branch: ຕໍ່ຈາກ 4a-2 (`claude/happy-darwin-rtw7v6`)

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ໜ້າຈໍສະແດງຜົນ realtime ສຳລັບຄົນທີ່ກຳລັງ Live (SYSTEM_BLUEPRINT §4 "Real-time Host Screen"): ເຫັນສິນຄ້າທີ່ກຳລັງນຳສະເໜີ, ຈຳນວນທີ່ຍັງຂາຍໄດ້ຕໍ່ລະຫັດ, ຍອດລວມ ແລະ ຊື່ຄົນທີ່ CF ລ່າສຸດ ໂດຍບໍ່ຕ້ອງ reload.

**ຢູ່ໃນ 4b:** ໜ້າ `/live/:id/host` (ໃນ admin, ຕ້ອງ login), ສິນຄ້າທີ່ກຳລັງນຳສະເໜີ (`featuredItemId`), snapshot API, event realtime ຜ່ານ Redis + SSE, ປຸ່ມ "ນຳສະເໜີ" ໃນ `/live/:id`.

**ບໍ່ຢູ່ໃນ 4b:** ຮູບ QR, ລິ້ງສາທາລະນະບໍ່ຕ້ອງ login, ສຽງ/ອະນິເມຊັນ, ນຳສະເໜີຫຼາຍກວ່າ 1 ສິນຄ້າພ້ອມກັນ.

## 2. ຂໍ້ມູນ (migration ເພີ່ມຢ່າງດຽວ)

- `LiveSession.featuredItemId String?` FK → `LiveSessionItem.id`, `onDelete: SetNull` (ລຶບລະຫັດ = ບໍ່ມີສິນຄ້ານຳສະເໜີ).
- ກວດໃນ service: item ຕ້ອງເປັນຂອງ session ດຽວກັນ (FK ບໍ່ກວດຂໍ້ນີ້).

## 3. API (`live-cf`)

- `PUT /live-sessions/:id/featured` body `{ itemId: string | null }` (`live-cf:write`). session ENDED → `LIVE_SESSION_INVALID_STATE`; item ບໍ່ພົບໃນ session → `LIVE_ITEM_NOT_FOUND`. ຄືນ `LiveSessionDetailDto` (ເພີ່ມ `featuredItemId`). ບັນທຶກ audit `live.feature`.
- `GET /live-sessions/:id/host` (`live-cf:read`) ຄືນ snapshot ດຽວ:
  - `session`: `id, title, kind, status, startedAt, endedAt, featuredItemId`.
  - `items[]`: `id, code, productName, variantName, sku, price` (string 2 ທົດສະນິຍົມ), `imageUrl` (ຮູບຂອງ variant ກ່ອນ ບໍ່ດັ່ງນັ້ນຮູບທຳອິດຂອງສິນຄ້າ ຕາມ `position`), `limit, claimed`, `stockAvailable` (onHand − reserved ໃນສາງຫຼັກທີ່ active = ສາງທີ່ບິນ CF ຈອງ; `null` ຖ້າບໍ່ມີສາງຫຼັກ), `remaining` = min(`limit − claimed` ຖ້າມີ limit, `stockAvailable`) ບໍ່ຕ່ຳກວ່າ 0 (`null` ຖ້າບໍ່ມີທັງສອງ), `level`: `SOLD_OUT` (remaining = 0) | `LOW` (1..3) | `OK`. ລຽງຕາມລຳດັບສ້າງ.
  - `totals`: `buyers` (ຈຳນວນ `authorExternalId` ບໍ່ຊ້ຳ ທີ່ outcome = ORDERED), `orders` (ບິນຂອງ session ທີ່ບໍ່ແມ່ນ CANCELLED/EXPIRED), `reservedAmount` (ລວມ total ຂອງ PENDING_PAYMENT), `paidAmount` (ລວມ total ຂອງ PAID, PACKING, SHIPPED, COMPLETED), `unitsClaimed` (ລວມ `claimed`), `comments` (ຈຳນວນຄອມເມັ້ນທັງໝົດ).
  - `recent[]`: 20 ຄອມເມັ້ນຫຼ້າສຸດທີ່ outcome ≠ NO_MATCH (ລົມທົ່ວໄປບໍ່ລົບກວນຜູ້ Live): `id, authorName, message, outcome, lines, createdAt`.
- `GET /live-sessions/:id/events` (SSE, `live-cf:read`): ຄືກັບ `/inbox/events` (guard subscribe Redis ກ່ອນ → 503 ຖ້າໃຊ້ບໍ່ໄດ້; `ready`, `ping` ທຸກ 25 ວິ, ຕັດຫຼັງ `ACCESS_TOKEN_TTL_SECONDS`) ແຕ່ສົ່ງສະເພາະ `live.updated` ທີ່ `sessionId` ກົງກັບ `:id`. session ບໍ່ພົບ → 404 ກ່ອນເປີດ stream.
- ເພີ່ມ route ໃໝ່ເຂົ້າ permission sweep.

## 4. Event realtime

- `@oca/shared`: `LIVE_EVENTS_CHANNEL = "oca:live:events"` ແລະ `LiveEvent = { type: "live.updated"; sessionId: string }` (API ແລະ worker ໃຊ້ຮ່ວມ).
- `LiveEventsService` (API) ຮູບແບບດຽວກັບ `InboxEventsService`: publisher/subscriber ແຍກ, timeout ~1 ວິ, publish ລົ້ມ = log warn ບໍ່ throw. ຢູ່ໃນ `LiveEventsModule` ນ້ອຍ ເພື່ອໃຫ້ `OrdersModule` ແລະ `LiveCfModule` import ໄດ້ໂດຍບໍ່ວົນ.
- ຜູ້ publish (ຫຼັງ commit ເທົ່ານັ້ນ):
  - `CfProcessorService.process` ເມື່ອບັນທຶກ ledger (ທຸກ outcome) ແລະ ຫຼັງ deliver.
  - `CfCommentsService.resend`.
  - `LiveSessionsService`: update, start, end, add/update/remove item, setFeatured.
  - `OrdersService.transition` ເມື່ອບິນມີ `liveSessionId` (pay/pack/ship/complete/cancel) ແລະ `appendItems`/ສ້າງບິນ CF ຖືກກວມໂດຍ processor ແລ້ວ.
  - Worker (`InventoryWorker`) ຫຼັງ job ໝົດເວລາຈອງທີ່ `expired > 0`: ຫາ `liveSessionId` ບໍ່ຊ້ຳຂອງບິນ EXPIRED ທີ່ `updatedAt >= ເວລາເລີ່ມ job` ແລ້ວ publish ຜ່ານ Redis connection ຂອງ worker (ລົ້ມ = log ບໍ່ throw).

## 5. Admin (4b-2)

- ໜ້າ `/live/:id/host` (`PermissionGate live-cf:read`): ເຕັມຈໍ ບໍ່ມີ sidebar/topbar (route ຢູ່ນອກ `(app)` layout ແຕ່ຍັງຢູ່ໃນ AuthProvider), ພື້ນມືດເປັນຄ່າເລີ່ມຕົ້ນ, ຕົວອັກສອນໃຫຍ່ (ອ່ານໄດ້ 2–3 ແມັດ), ປຸ່ມ "ອອກ" ກັບ `/live/:id`.
  - ສິນຄ້າທີ່ກຳລັງນຳສະເໜີ (ໃຫຍ່): ຮູບ, ລະຫັດ, ຊື່, ລາຄາ, ຍັງຂາຍໄດ້ + ປ້າຍ "ໃກ້ໝົດ"/"ໝົດແລ້ວ". ບໍ່ມີ = ຂໍ້ຄວາມແນະນຳໃຫ້ເລືອກ.
  - Grid card ທຸກລະຫັດ (ຈອງແລ້ວ/ຈຳກັດ/ສະຕ໋ອກ + ສີຕາມ `level`). ຜູ້ມີ `live-cf:write` ແຕະ card ເພື່ອນຳສະເໜີ (card ເປັນ `button` ທີ່ມີ `aria-pressed`).
  - ຍອດລວມ 4 ຕົວ: ຄົນ CF, ບິນ, ຍອດຈອງ, ຍອດຈ່າຍແລ້ວ.
  - ຟີດ CF ລ່າສຸດ (ຊື່ໃຫຍ່, ຄອມເມັ້ນ, ຜົນ); `aria-live="polite"` ສະເພາະລາຍການໃໝ່ສຸດ.
  - ແຖບສະຖານະ: ປ້າຍ LIVE + ເວລາທີ່ຜ່ານໄປ, ການເຊື່ອມຕໍ່ (ເຊື່ອມແລ້ວ / ກຳລັງເຊື່ອມຄືນ). DRAFT = "ຍັງບໍ່ເລີ່ມ"; ENDED = ປ້າຍ "ຈົບແລ້ວ" + ຍອດສຸດທ້າຍ (ບໍ່ເຊື່ອມ SSE).
  - refetch ລົ້ມ: ຄຳເຕືອນນ້ອຍ, ຂໍ້ມູນເກົ່າຍັງຢູ່. 404 = ບໍ່ພົບ + ກັບຄືນ.
- Realtime: ແຍກ `runInboxStream` ເປັນ `runEventStream({ url, events, ... })` (ເກັບ reconnect/refresh/backoff ເດີມ; `runInboxStream` ເອີ້ນຕົວໃໝ່ດ້ວຍ `["conversation.updated"]` ຈຶ່ງບໍ່ປ່ຽນພຶດຕິກຳ). `useLiveRealtime(sessionId, enabled)` invalidate snapshot (ລວມ event 250 ms) ແລະ poll ທຸກ 15 ວິ ຕອນບໍ່ໄດ້ເຊື່ອມ.
- `/live/:id`: ປຸ່ມ "Host screen" (ເປີດແທັບໃໝ່) ແລະ ປຸ່ມ "ນຳສະເໜີ" ຕໍ່ແຖວໃນຕາຕະລາງລະຫັດ (write + ບໍ່ ENDED; ແຖວທີ່ນຳສະເໜີຢູ່ມີປ້າຍ). ໜ້ານີ້ໃຊ້ SSE ດຽວກັນແທນ poll 5 ວິ ຕອນ LIVE (poll ສຳຮອງ 15 ວິ).
- i18n ລາວ/ອັງກິດ, a11y ຄື 4a-2.

## 6. ການທົດສອບ

- API e2e: snapshot (remaining = min ຂອງ limit/ສະຕ໋ອກ, ບໍ່ມີ limit, ບໍ່ມີສາງຫຼັກ, level, buyers ບໍ່ຊ້ຳ, ຍອດຈອງ vs ຈ່າຍ, recent ບໍ່ມີ NO_MATCH ແລະ ສູງສຸດ 20), featured (ສຳເລັດ, item ຂອງ session ອື່ນ = 404, ENDED = 409, ລຶບລະຫັດ → null, permission), SSE (ໄດ້ event ຂອງ session ຕົນ ບໍ່ໄດ້ຂອງ session ອື່ນ, 404 session ບໍ່ພົບ), publish ເກີດຈາກ CF/resend/start/item/featured/pay.
- Worker: ບິນ CF ໝົດເວລາ → publish sessionId; ບິນທີ່ບໍ່ແມ່ນ CF → ບໍ່ publish.
- Admin: Host screen (featured/grid/totals/feed/ENDED/DRAFT/read-only/ແຕະ card), `runEventStream` + test inbox stream ເດີມຜ່ານ, ປຸ່ມນຳສະເໜີ.
- Smoke ໃນ Chromium: CF ຈາກ simulator ຂຶ້ນ Host screen ພາຍໃນ ~1 ວິ ໂດຍບໍ່ reload; ແຕະ card ປ່ຽນສິນຄ້ານຳສະເໜີ.

## 7. ການແບ່ງ plan

- **4b-1** backend: migration + featured, snapshot, LiveEventsService + SSE + publishers, worker publish.
- **4b-2** admin: runEventStream, Host screen, ປຸ່ມນຳສະເໜີ/Host screen ໃນ `/live/:id`, smoke.

## 8. ຄວາມສ່ຽງ

- channel Redis ບໍ່ມີ prefix ແຍກຕາມສະພາບແວດລ້ອມ (ຄື inbox): test ແລະ dev ທີ່ໃຊ້ Redis ດຽວກັນອາດເຫັນ event ຂອງກັນ; ຜົນກະທົບມີແຕ່ refetch ເກີນ.
- CF ຫຼາຍພັນຕໍ່ນາທີ: ທຸກຄອມເມັ້ນ publish 1–2 event; client ລວມເປັນ refetch ຄັ້ງດຽວທຸກ 250 ms. snapshot query ຄວນເບົາ (ຈຳກັດ recent 20, ລວມຍອດດ້ວຍ aggregate).

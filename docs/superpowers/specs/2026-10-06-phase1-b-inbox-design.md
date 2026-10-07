# Phase 1 ໂມດູນ 2: Omnichannel Inbox, sub-project 2a (Messenger + ເປີດບິນໃນແຊັດ)

ວັນທີ: 2026-10-06 · ສະຖານະ: ລໍຜູ້ໃຊ້ກວດ · Branch: `phase1-inventory` (ຕໍ່ຈາກ 1a)

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ຮັບຂໍ້ຄວາມ Facebook Messenger ເຂົ້າ admin ແບບ realtime, ຕອບລູກຄ້າໄດ້, ລິ້ງເຄສກັບລູກຄ້າ, ແລະ ເປີດບິນຈາກແຊັດດ້ວຍ Orders ທີ່ມີຢູ່ (`channel=FACEBOOK`, `source=CHAT`).

**ຢູ່ໃນ 2a:** webhook ຮັບຂໍ້ຄວາມ, ເກັບ conversation/message, ຕອບຂໍ້ຄວາມຕົວອັກສອນ, SSE realtime, ໜ້າ `/inbox`, ມອບໝາຍເຄສດ້ວຍມື, ລິ້ງ/ສ້າງລູກຄ້າ, ເປີດບິນໃນແຊັດ ແລະ ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດ, simulator ສຳລັບ dev.

**ບໍ່ຢູ່ໃນ 2a:** ລິ້ງຊຳລະເງິນ (payment/slip ຢູ່ໂມດູນ 9; ສົ່ງສະຫຼຸບບິນເປັນຂໍ້ຄວາມເທົ່ານັ້ນ), ສົ່ງຮູບ/ໄຟລ໌ຂາອອກ, AI co-pilot, auto-routing, Instagram/TikTok/LINE, ຕາຕະລາງ ChannelAccount (ຮ້ານດຽວ ຕາມ ADR 0001).

**ສະພາບແວດລ້ອມ:** ຍັງບໍ່ມີ Meta App/Page ຈິງ. ສ້າງ adapter ຕາມ spec Messenger + simulator; ເຊື່ອມຈິງພາຍຫຼັງດ້ວຍການໃສ່ env ເທົ່ານັ້ນ.

## 2. ໂຄງສ້າງ

- `packages/channels`: interface `ChannelAdapter` { `verifySignature(rawBody, header)`, `parseWebhook(payload)` → `InboundEvent[]` (`message` | `echo`), `sendText(threadId, text)` }. `facebook/` ເຮັດ HMAC `X-Hub-Signature-256` (SHA-256, timing-safe) ແລະ ເອີ້ນ Graph API ທີ່ `FACEBOOK_GRAPH_BASE_URL` (ຕັ້ງຄ່າໄດ້ ເພື່ອຊີ້ໄປ simulator).
- Env ໃໝ່ (ໃນ api): `FACEBOOK_APP_SECRET`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (ມີໃນ .env.example ແລ້ວ), `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_BASE_URL` (ຊີ້ໄປ simulator). ຖ້າບໍ່ຕັ້ງ app secret/verify token webhook ຕອບ 503 CHANNEL_NOT_CONFIGURED (ບໍ່ crash ຕອນ boot); ບໍ່ຕັ້ງ page token = ຕອບບໍ່ໄດ້ (ຂໍ້ຄວາມ FAILED). Token ບໍ່ຖືກ log.
- `apps/api/src/modules/inbox`: `webhook.controller` (public, raw body), `conversations.controller/service`, `inbox-events` (SSE + Redis pub/sub).
- **Simulator** (dev only, ບໍ່ຢູ່ໃນ prod build): script ສົ່ງ webhook ທີ່ເຊັນຖືກຕ້ອງເຂົ້າ API + fake Graph server ທີ່ຮັບ `POST /me/messages` ແລະ ບັນທຶກຂໍ້ຄວາມຂາອອກ.

## 3. ຂໍ້ມູນ (migration ເພີ່ມຢ່າງດຽວ)

- `Conversation`: id, `channel` (SalesChannel), `externalThreadId` (PSID), `displayName`, `customerId?`, `assigneeId?`, `status` (OPEN | CLOSED), `lastMessageAt`, `lastMessagePreview`, `unreadCount`, timestamps. `@@unique([channel, externalThreadId])`, `@@index([status, lastMessageAt])`, `@@index([assigneeId])`.
- `Message`: id, `conversationId`, `direction` (IN | OUT), `externalId?` (Messenger `mid`), `text?`, `attachments` Json?, `sentByUserId?`, `status` (PENDING | SENT | FAILED), `errorCode?`, `createdAt`. `@@unique([conversationId, externalId])`, `@@index([conversationId, createdAt])`.
- `Order.conversationId?` (FK, `onDelete: SetNull`, index).
- Customer ບໍ່ປ່ຽນ; ລິ້ງດ້ວຍມື (ເລືອກລູກຄ້າເດີມ ຫຼື ສ້າງໃໝ່ຈາກແຊັດ).

## 4. ກະແສຂໍ້ຄວາມເຂົ້າ

`GET /webhooks/facebook` = handshake (`hub.verify_token`). `POST /webhooks/facebook`:
1. ກວດ signature ຈາກ raw body; ຜິດ/ຂາດ = 401, ບໍ່ອ່ານ payload.
2. `parseWebhook` → ເຫດການ; ປະເພດທີ່ບໍ່ຮູ້ (delivery, read ແລະ ອື່ນໆ) ຖືກຂ້າມ.
3. ແຕ່ລະເຫດການໃນ transaction: upsert Conversation (ເຄສ CLOSED ທີ່ມີຂໍ້ຄວາມໃໝ່ເຂົ້າ = ເປີດຄືນ), insert Message; `mid` ຊ້ຳ = ຂ້າມ (ບໍ່ເພີ່ມ unreadCount). `message` ເພີ່ມ unreadCount; `echo` (ແອດມິນຕອບຈາກແອັບ Facebook) ບັນທຶກເປັນ OUT ບໍ່ເພີ່ມ unread.
4. ຫຼັງ commit: publish ໄປ Redis, ແລ້ວຕອບ 200 ທັນທີ. ການດຶງຊື່ໂປຣໄຟລ໌ຈາກ Graph ເປັນ best-effort ແລະ ຄວາມລົ້ມເຫຼວບໍ່ກະທົບການຮັບຂໍ້ຄວາມ.

## 5. ກະແສຕອບ ແລະ ເຄສ

- `POST /conversations/:id/messages` (`inbox:write`): ບັນທຶກ OUT ກ່ອນ → `sendText` → ໝາຍ SENT ຫຼື FAILED ພ້ອມ `errorCode` (ຢ່າງນ້ອຍ: ເກີນໜ້າຕ່າງ 24 ຊມ ຂອງ Meta, token/ການຕັ້ງຄ່າບໍ່ຖືກ, ເຄືອຂ່າຍ). ໃຊ້ pattern error code → i18n ລາວ ຂອງ admin ເດີມ. ບໍ່ມີ retry ອັດຕະໂນມັດ; ແອດມິນສົ່ງໃໝ່ເອງ.
- `GET /conversations` (ກອງ status/ມອບໝາຍ/ບໍ່ມີຜູ້ຮັບ/ຄົ້ນຫາ, ແບ່ງໜ້າ), `GET /conversations/:id` (+ messages ແບ່ງໜ້າ), `PATCH /conversations/:id` (assign, status, customerId), `POST /conversations/:id/read` (ລ້າງ unread). ທຸກ id ອ້າງອີງບໍ່ພົບ = 404.
- ສ້າງລູກຄ້າຈາກແຊັດ = `POST /conversations/:id/customer` (ສ້າງ Customer + ລິ້ງໃນ transaction ດຽວ; ເບີຊ້ຳ = 409 DUPLICATE_VALUE; ເຄສທີ່ລິ້ງແລ້ວ = 409). GET messages ແບ່ງໜ້າດ້ວຍ cursor `beforeId` (ໃໝ່ສຸດກ່ອນ).

## 6. Realtime (SSE)

`GET /inbox/events` (`inbox:read`, Bearer). API subscribe Redis channel `oca:inbox:events` ດ້ວຍ connection ແຍກ ແລ້ວ fan-out ໄປ client; event ເບົາ `{type:"conversation.updated", conversationId}`. Heartbeat ທຸກ ~25 ວິ. Admin ໃຊ້ fetch-stream (EventSource ໃສ່ Authorization header ບໍ່ໄດ້), ເມື່ອ reconnect ຕ້ອງ refetch, ແລະ poll ສຳຮອງ 60 ວິ. ຕ້ອງປິດ subscription ເມື່ອ client ຕັດ ແລະ ເມື່ອ token ໝົດອາຍຸໃຫ້ client ຕໍ່ໃໝ່.

## 7. ສິດ

`inbox:read` ເບິ່ງລາຍການ/ຂໍ້ຄວາມ/SSE; `inbox:write` ຕອບ, ມອບໝາຍ, ປິດ/ເປີດ, ລິ້ງລູກຄ້າ. ເປີດບິນເອີ້ນ `POST /orders` ເດີມ ພ້ອມ `conversationId` ຈຶ່ງຕ້ອງ `orders:write` + `inventory:read` + `inbox:write` (API ບັງຄັບ `inbox:write` ເມື່ອມີ `conversationId`); ບໍ່ມີສິດ = ເຊື່ອງປຸ່ມ. `channel`/`source` ບໍ່ຮັບຈາກ client: server ຕັ້ງ channel ຕາມເຄສ + `source=CHAT`. ບິນບໍ່ແກ້ `Conversation.customerId` ອັດຕະໂນມັດ. `conversationId` ໃນ DTO ຂອງບິນເຫັນໄດ້ໂດຍ `orders:read` (ເປັນ id ທີ່ເປີດອ່ານເຄສບໍ່ໄດ້ຖ້າບໍ່ມີ `inbox:read`; ຍອມຮັບ). `GET /orders` ຂອງເຄສຕ້ອງ `orders:read`. ເພີ່ມ route ໃໝ່ເຂົ້າ permission sweep test ແລະ ກວດບົດບາດ seeded ວ່າໃຜມີ inbox ແນວໃດ.

## 8. Admin UI `/inbox`

3 ຖັນ: ລາຍການເຄສ (ກອງ, ຄົ້ນຫາ, badge unread) | ກະທູ້ + ຊ່ອງພິມ (Enter ສົ່ງ, ຄຳນຶງ IME composition ຄືເດີມ, ສະແດງ FAILED + ເຫດຜົນ) | ແຖບຂ້າງ (ລູກຄ້າທີ່ລິ້ງ, ຜູ້ຮັບຜິດຊອບ, ບິນຂອງເຄສ, ປຸ່ມເປີດບິນ). ເປີດບິນໃຊ້ order-form ເດີມແບບ prefill (ລູກຄ້າ, channel, source=CHAT, conversationId) ແລ້ວຫຼັງສຳເລັດສົ່ງສະຫຼຸບ (ລາຍການ, ຍອດ, ເວລາໝົດຈອງ) ເປັນຂໍ້ຄວາມເຂົ້າແຊັດ; ຖ້າສ້າງບິນສຳເລັດແຕ່ສົ່ງຂໍ້ຄວາມລົ້ມເຫຼວ ຕ້ອງບອກຊັດ ແລະ ບໍ່ສ້າງບິນຊ້ຳ. ເປີດບິນໃຊ້ route `/orders/new?conversationId=<id>` (ບໍ່ແມ່ນ dialog); ສະຫຼຸບບິນສົ່ງຫຼັງສ້າງບິນ ແລະ retry ໄດ້ໂດຍບໍ່ສ້າງບິນຊ້ຳ (retry ຢູ່ໃນ memory ຂອງໜ້າຜົນລັບເທົ່ານັ້ນ). ເພີ່ມ nav ຕາມສິດ `inbox:read`; mobile = ສະແດງທີລະຖັນ. ປະຕິບັດຕາມ DESIGN.md, i18n ລາວ, table/list semantics ແລະ a11y ຄືຂອງ 1a.

## 9. ການທົດສອບ

- Adapter: unit ດ້ວຍ fixture payload (message, echo, delivery, ຮູບ attachment, payload ຜິດຮູບແບບ), signature ຖືກ/ຜິດ/ຂາດ.
- API e2e: signature ຜິດ=401, handshake, `mid` ຊ້ຳ=ບໍ່ເພີ່ມ, thread ໃໝ່/ເດີມ, ເຄສ CLOSED ເປີດຄືນ, echo, ຕອບສຳເລັດ/FAILED, 404 ຂອງ id ບໍ່ພົບ, permission sweep ທຸກ route, SSE ໄດ້ event ຫຼັງ webhook.
- Admin: component test ລວມ load-error+Retry, read-only ເມື່ອບໍ່ມີ `inbox:write`, ປຸ່ມເປີດບິນຕາມສິດ.
- Smoke ໃນ Chrome ຈິງດ້ວຍ simulator ໃນ copy/ຖານ/ພອດແຍກ (ບໍ່ແຕະ dev server ຫຼື DB `oca` ຂອງຜູ້ໃຊ້): ຂໍ້ຄວາມເຂົ້າປາກົດທັນທີ, ຕອບ, ເປີດບິນ, ສະຫຼຸບບິນເຂົ້າແຊັດ.

## 10. ການແບ່ງ plan

- **2a-1** DB + `@oca/shared` schemas + channels adapter + webhook + conversations API + reply + SSE + simulator.
- **2a-2** ໜ້າ `/inbox` (ລາຍການ, ກະທູ້, ຕອບ, realtime, ມອບໝາຍ, ລິ້ງລູກຄ້າ).
- **2a-3** ເປີດບິນໃນແຊັດ + ສະຫຼຸບບິນເຂົ້າແຊັດ + smoke ຮວມ.

## 11. ຄວາມສ່ຽງ ແລະ ຂໍ້ສັງເກດ

- ຮູບແບບ payload/Graph ຍັງບໍ່ໄດ້ພິສູດກັບ Meta ຈິງ; ຕ້ອງຢືນຢັນເມື່ອມີ App (ບັນທຶກໃນ DEPLOYMENT-NOTES).
- ໜ້າຕ່າງ 24 ຊມ ຂອງ Meta ຈຳກັດການຕອບ; ສະແດງເປັນ FAILED ທີ່ອະທິບາຍໄດ້ ບໍ່ແມ່ນ error ທົ່ວໄປ.
- ລູກຄ້າໜຶ່ງຄົນຫຼາຍເຄສ (ຫຼາຍຊ່ອງທາງ) ຮອງຮັບໂດຍ `customerId` ນອກ Conversation; ການລວມ identity ອັດຕະໂນມັດເປັນຂອງ CRM (ໂມດູນ 11).

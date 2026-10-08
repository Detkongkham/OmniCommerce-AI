# Phase 1 ໂມດູນ 4: Live & Post CF Engine, sub-project 4a (ຄອມເມັ້ນ → ບິນ)

ວັນທີ: 2026-10-07 · ສະຖານະ: ລໍຜູ້ໃຊ້ກວດ · Branch: ຕໍ່ຈາກ `phase1-inventory` (1a + 2a)

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ດັກຄອມເມັ້ນ CF ໃນ Live/ໂພສ Facebook, ແປງເປັນລາຍການສັ່ງຊື້ຕາມລະຫັດຂອງ session, ຈອງສະຕ໋ອກ, ສ້າງ ຫຼື ເພີ່ມເຂົ້າບິນ, ແລ້ວສົ່ງສະຫຼຸບບິນ + ເວລາໝົດຈອງຫາລູກຄ້າທາງ Private Reply.

**ຢູ່ໃນ 4a:** session (Live/Post), ລະຫັດ→variant ຕໍ່ session, webhook ຄອມເມັ້ນ, queue + consumer, parser, ສ້າງ/merge ບິນ, Private Reply + ຕອບຄອມເມັ້ນສາທາລະນະ, ledger ຄອມເມັ້ນ, API + ໜ້າ admin ຂັ້ນຕ່ຳ, simulator ສົ່ງຄອມເມັ້ນ.

**ບໍ່ຢູ່ໃນ 4a:** Host screen realtime (4b), ຮູບ QR (ສະຫຼຸບເປັນຂໍ້ຄວາມ + ຂໍ້ມູນໂອນ; ຕ້ອງມີ outbound image ແລະ ໂມດູນ Slip ກ່ອນ), waitlist ເມື່ອສະຕ໋ອກໝົດ, ຊ່ອງທາງອື່ນນອກ Facebook, ຕັ້ງ session ອັດຕະໂນມັດຈາກ Graph (ແອດມິນໃສ່ `externalPostId` ເອງ).

**ສະພາບແວດລ້ອມ:** ຍັງບໍ່ມີ Meta App ຈິງ. ສ້າງຕາມ spec ຂອງ Meta + simulator; ເຊື່ອມຈິງພາຍຫຼັງດ້ວຍ env + permission `pages_read_engagement`, `pages_manage_engagement`, `pages_messaging` ແລະ subscribe field `feed`.

## 2. ກະແສຂໍ້ມູນ

1. `@oca/channels` FacebookAdapter ເພີ່ມເຫດການ `comment` (`entry.changes[].field=feed`, `value.item=comment`, `verb=add`): `postId`, `commentId`, `from{id,name}`, `message`, `createdAt`. ຄອມເມັ້ນຂອງ Page ເອງ (`from.id` = page id) ຖືກຂ້າມ.
2. `POST /webhooks/facebook` (ມີຢູ່ແລ້ວ): ກວດ signature ກ່ອນ; ຄອມເມັ້ນທີ່ `postId` ບໍ່ຢູ່ໃນ session ສະຖານະ LIVE ຖືກຂ້າມທັນທີ (cache ສັ້ນໃນ Redis ຫຼື query ເບົາ); ທີ່ເຫຼືອເຂົ້າ BullMQ queue `cf-comments` ດ້ວຍ `jobId = commentId` (ກັນຊ້ຳ) ແລ້ວຕອບ 200.
3. Consumer ໃນ API (concurrency ຈຳກັດ, lock Redis ຕໍ່ຜູ້ຄອມເມັ້ນ): parse → ຈອງສະຕ໋ອກ + ສ້າງ/ເພີ່ມບິນ → ບັນທຶກ ledger → ສົ່ງຂໍ້ຄວາມ.
4. ສົ່ງສະຫຼຸບ: ຖ້າມີເຄສ Messenger ຂອງລູກຄ້າທີ່ຢູ່ໃນໜ້າຕ່າງ 24 ຊມ ໃຊ້ `sendText` ເດີມ; ບໍ່ດັ່ງນັ້ນ Private Reply ຕໍ່ `commentId` (Meta ອະນຸຍາດ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ ພາຍໃນ 7 ວັນ). ຫຼັງຈາກນັ້ນຕອບຄອມເມັ້ນສາທາລະນະສັ້ນໆ (ເປີດ/ປິດຕໍ່ session).

## 3. ຂໍ້ມູນ (migration ເພີ່ມຢ່າງດຽວ)

- `LiveSession`: id, `title`, `kind` (LIVE | POST), `status` (DRAFT | LIVE | ENDED), `externalPostId?` (ຕ້ອງມີເມື່ອເປັນ LIVE), `publicReplyEnabled` (default true), `startedAt?`, `endedAt?`, `createdById`, timestamps. ຫ້າມ 2 session LIVE ມີ `externalPostId` ດຽວກັນ (partial unique index).
- `LiveSessionItem`: id, `sessionId`, `code` (normalized: ຕົວໃຫຍ່, ຍຸບຊ່ອງວ່າງ, ເລກ ASCII), `variantId`, `limit Int?`, `@@unique([sessionId, code])`. ແກ້/ລຶບໄດ້ສະເພາະ session ທີ່ບໍ່ແມ່ນ LIVE ຫຼື ລາຍການທີ່ຍັງບໍ່ມີ ledger ຜູກ.
- `CfComment` (ledger): id, `externalCommentId` unique, `sessionId`, `authorExternalId`, `authorName`, `message`, `outcome` (ORDERED | NO_MATCH | OUT_OF_STOCK | LIMIT_REACHED | ERROR), `lines Json?` (`[{itemId, code, quantity}]`), `orderId?`, `replyStatus` (NONE | SENT | FAILED), `replyErrorCode?`, `createdAt`. `@@index([sessionId, createdAt])`, `@@index([sessionId, authorExternalId])`.
- `Order.liveSessionId?` (FK, SetNull, index `[liveSessionId, customerId, status]`).
- `Customer.facebookUserId?` unique.
- `StoreSetting.paymentInstructions String?` (ຂໍ້ຄວາມຂໍ້ມູນໂອນ; ແກ້ໃນໜ້າ `/settings` ເດີມ).
- ສິດ: `live-cf:read`, `live-cf:write` (module `live-cf` ມີໃນ MODULES ແລະ role seed ແລ້ວ).

## 4. Parser (`@oca/shared`, function ບໍລິສຸດ)

`parseCf(message, codes[])` → `{ lines:[{code, quantity}] } | null`.
- Normalize: trim, ເລກລາວ/full-width → ASCII, ຕົວໃຫຍ່, ຍຸບຊ່ອງວ່າງ.
- ຮອງຮັບ `A1`, `CF A1`, `A1 2`, `A1 x2`, `ດຳ M 1`, ຫຼາຍລະຫັດ (`A1 B02 2`). ຈຳນວນຕົກລົງ = 1, ຊ່ວງ 1..99.
- ຈັບຄູ່ກັບລະຫັດຂອງ session ເທົ່ານັ້ນ, ລອງລະຫັດຍາວກ່ອນ (ລະຫັດມີຊ່ອງວ່າງໄດ້).
- ຂໍ້ຄວາມຕ້ອງເປັນ CF ທັງໝົດ (ມີ `CF` ນຳໜ້າໄດ້); ມີຄຳອື່ນປົນ = `null` (NO_MATCH). ລະຫັດຊ້ຳໃນຄອມເມັ້ນດຽວລວມຈຳນວນ.

## 5. ບິນ

ທັງໝົດໃນ lock ຕໍ່ຜູ້ຄອມເມັ້ນ:
- ຫາ/ສ້າງ Customer ດ້ວຍ `facebookUserId` (ສ້າງດ້ວຍຊື່ຜູ້ຄອມເມັ້ນ, ບໍ່ມີເບີ).
- ຫາບິນ `PENDING_PAYMENT` ຂອງ (session, ລູກຄ້າ) ທີ່ `reservedUntil` ຍັງບໍ່ໝົດ.
  - ບໍ່ມີ: `OrdersService.create` (`channel=FACEBOOK`, `source=LIVE_CF|POST_CF`, `liveSessionId`, idempotency key = `commentId`).
  - ມີ: `OrdersService.appendItems(orderId, lines, key)` ໃໝ່: ເພີ່ມ/ລວມແຖວ, ຈອງສະຕ໋ອກເພີ່ມ, ຄິດ subtotal/VAT/total ໃໝ່ ດ້ວຍ logic ດຽວກັບ create, **ຣີເຊັດ `reservedUntil`** ເປັນ now + ເວລາຈອງເລີ່ມຕົ້ນ, ໃນ transaction ດຽວ, ກັນຊ້ຳດ້ວຍ key.
- ຫຼາຍລະຫັດໃນຄອມເມັ້ນດຽວ = all-or-nothing: ລະຫັດໃດໝົດ/ຄົບ limit ທັງຄອມເມັ້ນບໍ່ຈອງຫຍັງ ແລະ ໄດ້ `OUT_OF_STOCK`/`LIMIT_REACHED`.
- `limit` ນັບຈາກ ledger (`outcome=ORDERED`) ຕໍ່ item ໃນ transaction ດຽວກັນເພື່ອກັນ race.
- ບິນ PAID/ໝົດເວລາ/ຍົກເລີກ ບໍ່ merge; CF ຖັດໄປໄດ້ບິນໃໝ່.
- ຂໍ້ຜິດພາດທີ່ບໍ່ຄາດ = `ERROR` ໃນ ledger, ບໍ່ retry ອັດຕະໂນມັດສ່ວນບິນ (ກັນຈອງຊ້ຳ).

- **ຂໍ້ສັງເກດ (limit):** `limit` ນັບທຸກບິນ CF ທີ່ເຄີຍເກີດໃນ session (`LiveSessionItem.claimed` ບໍ່ຖືກຫຼຸດເມື່ອບິນໝົດເວລາ/ຍົກເລີກ); ສະຕ໋ອກຖືກຄືນ ແຕ່ limit ບໍ່ຄືນ. ຜູ້ຂາຍເພີ່ມ limit (PATCH item) ເພື່ອເປີດຂາຍຕໍ່ໄດ້.

## 6. ຂໍ້ຄວາມ

- ສະຫຼຸບ: ລາຍການ, ຍອດ, "ກະລຸນາໂອນກ່ອນ HH:mm" (ເຂດເວລາລາວ), `paymentInstructions`; ໃຊ້ຕົວສ້າງຂໍ້ຄວາມຮ່ວມກັບ `buildOrderSummary` ຖ້າເຮັດໄດ້.
- OUT_OF_STOCK/LIMIT_REACHED: ຂໍ້ຄວາມຂໍໂທດສັ້ນ (ຜ່ານ Private Reply ຫຼື ຄອມເມັ້ນ).
- ສົ່ງລົ້ມ: ບິນຍັງຢູ່, `replyStatus=FAILED` + ລະຫັດ; ແອດມິນສົ່ງໃໝ່ຈາກໜ້າ ledger (`POST /live-sessions/:id/comments/:commentId/resend`) ຫຼື ຈາກ Inbox. ສ່ວນສົ່ງຂໍ້ຄວາມແຍກຈາກສ່ວນບິນ ຈຶ່ງ retry ໄດ້ໂດຍບໍ່ຈອງຊ້ຳ.
- Adapter ເພີ່ມ `sendPrivateReply(commentId, text)` ແລະ `replyToComment(commentId, text)` (ບໍ່ throw, ຄືນ `SendResult`); ໃຊ້ error code ຂອງ send ເດີມ ເພີ່ມ `COMMENT_REPLY_EXPIRED` ຖ້າຈຳເປັນ.

## 7. API ແລະ ສິດ

`apps/api/src/modules/live-cf` (ມີ module ເປົ່າຢູ່ແລ້ວ): `GET/POST /live-sessions`, `GET/PATCH /live-sessions/:id`, items CRUD, `POST /:id/start`, `POST /:id/end`, `GET /:id/comments` (ແບ່ງໜ້າ, ກອງ outcome), resend. `live-cf:read` ອ່ານ, `live-cf:write` ແກ້/ເລີ່ມ/ຈົບ/ສົ່ງໃໝ່. ເພີ່ມ route ເຂົ້າ permission sweep, ກວດບົດບາດ seeded, ແລະ error code ໃໝ່ເຂົ້າ `ERROR_CODES` + i18n. ທຸກ id ອ້າງອີງບໍ່ພົບ = 404. ການ start ຕ້ອງມີ `externalPostId` ແລະ ຢ່າງນ້ອຍ 1 ລະຫັດ; ຈົບ session ບໍ່ຍົກເລີກບິນທີ່ຈອງແລ້ວ.

## 8. Admin UI (4a-2)

ໜ້າ `/live`: ລາຍການ session; ສ້າງ/ແກ້ session; ຕາຕະລາງລະຫັດ→variant (ໃຊ້ VariantPicker ເດີມ); ປຸ່ມ start/end; ຕາຕະລາງຄອມເມັ້ນ (ledger) ພ້ອມ outcome, ລິ້ງໄປບິນ, ສະຖານະຂໍ້ຄວາມ + ສົ່ງໃໝ່; refetch ທຸກ ~5 ວິ ໃນ session LIVE (ບໍ່ມີ SSE ໃນ 4a). Nav ຕາມ `live-cf:read`; ປະຕິບັດຕາມ DESIGN.md, i18n ລາວ, a11y ຄືຂອງ 1a/2a.

## 9. ການທົດສອບ

- Parser: ຮູບແບບທັງໝົດ, ເລກລາວ, ລະຫັດມີຊ່ອງ, ຄຳທີ່ບໍ່ແມ່ນ CF, ຈຳນວນນອກຊ່ວງ, ລະຫັດຊ້ຳ.
- Adapter: fixture ຄອມເມັ້ນ (add, edit/remove ຖືກຂ້າມ, ຂອງ Page ເອງ), Private Reply/ຕອບຄອມເມັ້ນ ຖືກ/ຜິດ.
- API/e2e: `commentId` ຊ້ຳ, ສະຕ໋ອກບໍ່ພໍ, limit, merge + ຣີເຊັດເວລາ, all-or-nothing, CF ພ້ອມກັນຂອງຄົນດຽວບໍ່ຈອງເກີນ, ບິນໝົດເວລາ/PAID ບໍ່ merge, ສົ່ງລົ້ມ → resend ບໍ່ສ້າງບິນຊ້ຳ, post ທີ່ບໍ່ແມ່ນ session LIVE ຖືກຂ້າມ, permission sweep.
- Admin: component test ລວມ load-error+Retry, read-only ເມື່ອບໍ່ມີ `live-cf:write`.
- Smoke ໃນ Chrome ຈິງດ້ວຍ simulator ໃນ copy/ຖານ/ພອດແຍກ (ບໍ່ແຕະ dev server ຫຼື DB `oca` ຂອງຜູ້ໃຊ້): ຄອມເມັ້ນ → ບິນ → ຂໍ້ຄວາມຂາອອກ → ໝົດເວລາ worker ຄືນສະຕ໋ອກ.

## 10. ການແບ່ງ plan

- **4a-1** DB + shared (parser, schemas, error codes, ສິດ) + adapter + queue/consumer + `appendItems` + API session/ledger + simulator ຄອມເມັ້ນ.
- **4a-2** ໜ້າ `/live` + smoke ຮວມ.

## 11. ຄວາມສ່ຽງ ແລະ ຂໍ້ສັງເກດ

- `from.id` ຂອງຄອມເມັ້ນອາດບໍ່ຕົງ PSID ຂອງ Messenger → ເຄສແຊັດບໍ່ລິ້ງອັດຕະໂນມັດ; ແອດມິນລິ້ງດ້ວຍມື (ທາງເດີມຂອງ Inbox).
- Private Reply ຈຳກັດ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ ແລະ 7 ວັນ; payload/permission ຍັງບໍ່ໄດ້ພິສູດກັບ Meta ຈິງ (ບັນທຶກໃນ DEPLOYMENT-NOTES).
- ຄອມເມັ້ນຈຳນວນຫຼາຍ: webhook ເຮັດແຕ່ກອງ + enqueue; consumer ໃນ API ແບ່ງ CPU ກັບຜູ້ໃຊ້ (ຍອມຮັບໃນ 4a; ຍ້າຍໄປ worker ໄດ້ພາຍຫຼັງຖ້າຈຳເປັນ).
- ບໍ່ມີ waitlist; ບໍ່ມີ rate limit ຂອງ webhook (ຄືກັບ 2a).

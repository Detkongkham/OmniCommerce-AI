# Phase 3 ໂມດູນ 2: Social Posting, sub-project 2a (ໂພສ Facebook Page + ຕັ້ງເວລາ + ອັບໂຫຼດຮູບ)

ວັນທີ: 2026-10-08 · ສະຖານະ: 2a-1 (backend) ສຳເລັດ; 2a-2 (admin) ກຳລັງເຮັດ · Branch: ຕໍ່ຈາກ `main` (ຫຼັງ 8a)

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ໃຫ້ແອດມິນຂຽນໂພສ (ຂໍ້ຄວາມ + ຮູບ ≤10) ແລ້ວໂພສລົງ Facebook Page ທັນທີ ຫຼື ຕັ້ງເວລາ, ເບິ່ງເປັນລາຍການ/ປະຕິທິນ, ແລະ ຖ້າໂພສຂາຍແບບ CF ໃຫ້ຜູກກັບ session Post CF ເພື່ອເລີ່ມດັກຄອມເມັ້ນອັດຕະໂນມັດຫຼັງໂພສ.

**ຢູ່ໃນ 2a:** ບ່ອນເກັບໄຟລ໌ເທິງ disk (ໃຊ້ຮ່ວມກັນໄດ້), ອັບໂຫຼດຮູບ, ຮູບຈາກສິນຄ້າ/URL, ໂພສ/ຕັ້ງເວລາ/ຍົກເລີກ/ລອງໃໝ່, ເຊື່ອມ Post CF, ລາຍການ + ປະຕິທິນເດືອນ (ເບິ່ງຢ່າງດຽວ).

**ບໍ່ຢູ່ໃນ 2a:** ແພລັດຟອມອື່ນ (Instagram/TikTok), ວິດີໂອ/Reels, ປັບຂະໜາດຮູບ, AI ຂຽນແຄັບຊັນ, ປະຕິທິນ drag & drop, ແກ້/ລຶບໂພສທີ່ຂຶ້ນເພຈແລ້ວ, ລຶບໄຟລ໌ທີ່ບໍ່ມີໃຜໃຊ້ (orphan cleanup), S3.

## 2. ສະຖານະຂອງໂພສ

`DRAFT` → schedule → `SCHEDULED` (ມີ `scheduledAt`; "ໂພສທັນທີ" = `scheduledAt = now`) → ເຖິງເວລາ ຕົວໂພສ claim → `PUBLISHING` → `PUBLISHED` (ມີ `externalPostId`, `publishedAt`) ຫຼື `FAILED` (`errorCode`, `errorMessage`).

- cancel: `SCHEDULED` → `DRAFT`. retry: `FAILED` → `SCHEDULED` (now). ແກ້ໄຂ (PATCH) ໄດ້ໃນ `DRAFT | SCHEDULED | FAILED`; ລຶບໄດ້ໃນ `DRAFT | SCHEDULED | FAILED`. `PUBLISHING`/`PUBLISHED` ອ່ານຢ່າງດຽວ.
- ການແກ້ໂພສ `SCHEDULED` ບໍ່ປ່ຽນສະຖານະ (ຍັງໂພສຕາມເວລາ); ແກ້ `FAILED` → ກັບເປັນ `DRAFT` (ລ້າງ error).

## 3. ຂໍ້ມູນ (migration `20261008020000_social_posting`, ເພີ່ມຢ່າງດຽວ)

- `MediaFile`: `id`, `storageKey` (unique; `<32 hex>.<jpg|png|webp>`), `mimeType`, `size`, `originalName` (≤200), `createdById?` (FK SetNull), `createdAt`. ໃຊ້ຮ່ວມກັນ (Slip ໃຊ້ຕໍ່ໄດ້).
- `SocialPost`: `id`, `message` (text, ≤5000; ວ່າງໄດ້ຖ້າມີຮູບ), `status` (enum `SocialPostStatus`), `scheduledAt?`, `publishingAt?` (ເວລາ claim), `publishedAt?`, `externalPostId?`, `errorCode?`, `errorMessage?` (≤300), `liveSessionId?` (unique, FK SetNull), `cfLinkError?`, `createdById?`, `scheduledById?` (FK SetNull ທັງສອງ), timestamps. index `[status, scheduledAt]`.
- `SocialPostMedia`: `id`, `postId` (FK Cascade), `position`, `mediaFileId?` (FK Restrict), `url?` (https ≤2000). ຕ້ອງມີອັນໃດອັນໜຶ່ງ (CHECK). unique `[postId, position]`.

## 4. ບ່ອນເກັບໄຟລ໌ ແລະ Media API

- env ໃໝ່ `MEDIA_DIR` (default `./.data/media` ຂອງ process ຂອງ API). `StorageService` (`apps/api/src/common/storage`): `put(key, buffer)` (ຂຽນໄຟລ໌ຊົ່ວຄາວແລ້ວ rename), `read(key)`, `pathOf(key)`, `delete(key)`. key ກວດ regex ທຸກຄັ້ງ (ກັນ path traversal).
- `POST /media` (multipart field `file`, `posting:write`): ≤ 8 MB, ກວດ magic bytes ເປັນ JPEG/PNG/WebP (ບໍ່ເຊື່ອ mimetype/ນາມສະກຸນ) ບໍ່ດັ່ງນັ້ນ 400 `MEDIA_INVALID` (`{ reason: "TYPE" | "SIZE" | "MISSING" }`); ຄືນ `MediaFileDto { id, path, mimeType, size, originalName }` (`path = /media/files/<key>`).
- `GET /media/files/:key` (public): ສົ່ງໄຟລ໌ + `Content-Type` ຕາມນາມສະກຸນ, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin` (admin ຢູ່ຄົນລະ origin). key ຜິດ/ບໍ່ມີ → 404. key ສຸ່ມ 128 bit ເດົາບໍ່ໄດ້ ເໝາະກັບຮູບການຕະຫຼາດ; **ຂໍ້ມູນລັບ (ເຊັ່ນ ສະລິບ) ຕ້ອງເຮັດ route ທີ່ຕ້ອງ login ເອງ** ໂດຍໃຊ້ `StorageService` ດຽວກັນ.
- ຂໍ້ຈຳກັດ: server ດຽວ; ຕ້ອງ backup `MEDIA_DIR`.

## 5. ໂພສລົງ Facebook

- `FacebookAdapter.publishPost({ message, photos })` (ບໍ່ throw, ຄືນ `SendResult`): ແຕ່ລະຮູບ `POST /me/photos` `published=false` (ໄຟລ໌ = multipart `source`; URL = `url`) → id; ແລ້ວ `POST /me/feed` `{ message, attached_media: [{ media_fbid }] }` → `id` (`<pageId>_<postId>`, ຮູບດຽວກັບ `post_id` ໃນ webhook). ບໍ່ມີຮູບ = feed ຂໍ້ຄວາມຢ່າງດຽວ. error ແປດ້ວຍ `mapGraphFailure` ເດີມ.
- fake Graph ຮອງຮັບ `/me/photos` (JSON ຫຼື multipart) ແລະ `/me/feed`, ເກັບລາຍການໄວ້ກວດໃນ test (`photos`, `posts`).
- `PostPublisherService` ໃນ API: `runDue()` ແລ່ນທຸກ `POSTING_TICK_MS` (default 30000; `0` = ປິດ, ໃຊ້ໃນ test) ດ້ວຍ `setInterval` + ກັນແລ່ນຊ້ອນໃນ process. ຄວາມຖືກຕ້ອງຫຼາຍ instance ມາຈາກ claim ໃນ DB (ບໍ່ໃຊ້ BullMQ ເພາະບໍ່ມີຫຍັງເພີ່ມ):
  1. ໂພສ `PUBLISHING` ທີ່ `publishingAt` ເກົ່າກວ່າ 10 ນາທີ → `FAILED` `PUBLISH_UNCERTAIN` (ບໍ່ລອງໃໝ່ເອງ: ອາດຂຶ້ນເພຈແລ້ວ, ຄົນຕ້ອງກວດກ່ອນກົດລອງໃໝ່).
  2. ເລືອກ `SCHEDULED` ທີ່ `scheduledAt <= now` (ເກົ່າ→ໃໝ່, ສູງສຸດ 10 ຕໍ່ຮອບ); claim ທີລະອັນດ້ວຍ `updateMany where status=SCHEDULED` → `PUBLISHING`; count 0 = ຄົນອື່ນເອົາໄປແລ້ວ.
  3. ອ່ານໄຟລ໌ (ບໍ່ມີ → `FAILED` `MEDIA_MISSING`), ເອີ້ນ adapter; ສຳເລັດ → `PUBLISHED`; ລົ້ມ → `FAILED` + code ຂອງ channel (ບໍ່ retry ອັດຕະໂນມັດ).
- "ໂພສທັນທີ" ເອີ້ນ `runDue()` ແບບບໍ່ລໍ ຫຼັງ commit (ບໍ່ຕ້ອງລໍ tick).
- audit: `post.publish` / `post.publish_failed` (userId = `scheduledById`).

## 6. ເຊື່ອມ Post CF

- ເລືອກໄດ້ສະເພາະ session `kind = POST`, `status = DRAFT`, `externalPostId = null`, ບໍ່ຖືກໂພສອື່ນຜູກ (unique) → ບໍ່ດັ່ງນັ້ນ 409 `LIVE_SESSION_INVALID_STATE` / 404 `LIVE_SESSION_NOT_FOUND`. ຕອນ schedule ກວດຊ້ຳ ແລະ ຕ້ອງມີລະຫັດ CF ≥1 (409 `LIVE_SESSION_INVALID_STATE`).
- ຫຼັງໂພສສຳເລັດ: ໃສ່ `externalPostId` ໃຫ້ session (ຍັງ DRAFT) ແລ້ວ `LiveSessionsService.start` (actor = ຜູ້ schedule). ລົ້ມ → ໂພສຍັງ `PUBLISHED` ແຕ່ `cfLinkError` = code (ເຊັ່ນ `LIVE_SESSION_INVALID_STATE`, `DUPLICATE_VALUE`) ໃຫ້ admin ເຫັນ ແລະ ໄປ start ເອງໄດ້ (externalPostId ໃສ່ແລ້ວ).

## 7. Posts API (`posting`)

ສິດ: ອ່ານ `posting:read`, ຂຽນ `posting:write`. role `CHAT_ADMIN` ໄດ້ `posting` read/write (seed). ທຸກ route ເຂົ້າ permission sweep.

- `GET /posts?status&from&to&page&pageSize`: `from/to` (ISO) ກອງດ້ວຍ `scheduledAt` ຫຼື `publishedAt` ຢູ່ໃນຊ່ວງ (ໃຊ້ໃນປະຕິທິນ); ລຽງ `createdAt` ໃໝ່→ເກົ່າ (ປະຕິທິນຈັດລຽງເອງ). ແຖວ = `SocialPostDto`.
- `GET /posts/:id`, `POST /posts` (`{ message, media: [{ mediaFileId } | { url }], liveSessionId? }` → DRAFT), `PATCH /posts/:id` (field ດຽວກັນ, optional; media ແທນທັງຊຸດ), `POST /posts/:id/schedule` (`{ scheduledAt? }`; ບໍ່ສົ່ງ = ທັນທີ; ຕ້ອງ > now−1 ນາທີ ແລະ ≤ 180 ວັນ; ໄດ້ຈາກ DRAFT ຫຼື SCHEDULED (ປ່ຽນເວລາ)), `POST /posts/:id/cancel`, `POST /posts/:id/retry`, `DELETE /posts/:id` (204).
- ກົດ: ຂໍ້ຄວາມ trim ຫຼື ຮູບ ຕ້ອງມີຢ່າງໜ້ອຍອັນດຽວ; ຮູບ ≤ 10; `mediaFileId` ຕ້ອງມີ (404 `MEDIA_NOT_FOUND`); URL ຕ້ອງ https.
- `SocialPostDto`: `id, message, status, scheduledAt, publishedAt, externalPostId, permalinkUrl` (`https://www.facebook.com/<externalPostId>`), `errorCode, errorMessage, cfLinkError, liveSession {id,title,status}|null, media [{ id, position, mediaFileId, url }]` (`url` = path ຂອງໄຟລ໌ ຫຼື URL ພາຍນອກ), `createdBy {id,name}|null, createdAt, updatedAt`.
- error codes ໃໝ່: `POST_NOT_FOUND` (404), `POST_INVALID_STATE` (409), `MEDIA_NOT_FOUND` (404), `MEDIA_INVALID` (400) (+ i18n admin). audit: `post.create/update/schedule/cancel/retry/delete`.

## 8. Admin (2a-2)

- nav "ໂພສ" (`posting:read`). `/posts`: ແຖບ "ລາຍການ" (ຕາຕະລາງ + ກອງສະຖານະ, pill: ຮ່າງ/ຕັ້ງເວລາ/ກຳລັງໂພສ/ໂພສແລ້ວ/ລົ້ມເຫຼວ) ແລະ "ປະຕິທິນ" (ເດືອນ, ເວລາລາວ, ຄລິກໂພສ → ໜ້າໂພສ). ປຸ່ມ "ສ້າງໂພສ".
- `/posts/new`, `/posts/:id`: ຟອມເຕັມໜ້າ (§11.4): ຂໍ້ຄວາມ + ຕົວນັບ, ຮູບ (ອັບໂຫຼດຫຼາຍໄຟລ໌, ເລືອກຈາກຮູບສິນຄ້າ, ວາງ URL; ເລື່ອນລຳດັບ/ລຶບ), session Post CF (ເລືອກຈາກ DRAFT/POST), ໂພສທັນທີ / ຕັ້ງເວລາ, ຕົວຢ່າງແບບ Facebook. ໂພສ FAILED ສະແດງ error + ປຸ່ມລອງໃໝ່; PUBLISHED ສະແດງລິ້ງໂພສ + `cfLinkError`.

## 9. ການທົດສອບ

- shared: schema ຂອງ post (ຂໍ້ຄວາມ/ຮູບ/URL/ເວລາ).
- API e2e: media (ຖືກ, ປະເພດປອມ, ໃຫຍ່ເກີນ, ບໍ່ມີໄຟລ໌, ສິດ, ດຶງໄຟລ໌ + header, key ຜິດ); posts CRUD/ສະຖານະ/ກອງ/ສິດ; ເຊື່ອມ session (ປະເພດຜິດ, ບໍ່ແມ່ນ DRAFT, ຊ້ຳ, ບໍ່ມີລະຫັດ); publisher ກັບ fake Graph (ມີຮູບ upload + URL, ບໍ່ມີຮູບ, Graph error → FAILED, ໄຟລ໌ຫາຍ, PUBLISHING ຄ້າງ → PUBLISH_UNCERTAIN, claim ຊ້ອນ = ໂພສຄັ້ງດຽວ, CF start ສຳເລັດ/ລົ້ມ); permission sweep.
- adapter unit: ລຳດັບ photos → feed, multipart, error mapping.
- Admin: ລາຍການ, ປະຕິທິນ, ຟອມ (validation, ອັບໂຫຼດ, ສ້າງ/ຕັ້ງເວລາ), smoke ໃນ Chromium.

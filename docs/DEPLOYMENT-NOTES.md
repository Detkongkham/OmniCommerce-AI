# ໝາຍເຫດການ deploy

ສິ່ງທີ່ຕ້ອງກວດກ່ອນ deploy ຂຶ້ນ production.

## 1. TRUST_PROXY (API)
- ຄ່າ default `false` (ບໍ່ເຊື່ອ header `X-Forwarded-For`). ຖ້າ API ຢູ່ຫຼັງ reverse proxy / load balancer ໃຫ້ຕັ້ງເປັນ **ຈຳນວນ proxy hop** ເຊັ່ນ `TRUST_PROXY=1`.
- ຫ້າມໃຊ້ `true` (ລະບົບຈະປະຕິເສດຄ່ານີ້): ການເຊື່ອທຸກ proxy ເຮັດໃຫ້ຜູ້ໂຈມຕີປອມ IP ດ້ວຍ `X-Forwarded-For` ໄດ້ ແລະ ຫຼົບ rate limit / ເຮັດໃຫ້ audit log ຜິດ.
- ຕັ້ງຈຳນວນ hop ໃຫ້ກົງກັບຕົວຈິງ: ຕັ້ງຫຼາຍກວ່າຕົວຈິງ = ເຊື່ອ header ທີ່ client ສົ່ງມາ.
- Admin ເອີ້ນ API ຜ່ານ proxy `/api` ຂອງ Next.js ນັ້ນນັບເປັນ 1 hop: ຖ້າບໍ່ຕັ້ງ `TRUST_PROXY` IP ທີ່ rate limit ແລະ AuditLog ເຫັນຈະເປັນ IP ຂອງ admin server ທຸກຄົນ (ທຸກ client ແບ່ງ quota login ດຽວກັນ). ຕັ້ງ `TRUST_PROXY=1` ເມື່ອມີແຕ່ proxy ຂອງ admin, ແລະ +1 ຕໍ່ reverse proxy / load balancer ທີ່ຢູ່ໜ້າ admin. ກວດໄດ້ວ່າ header ປອມຖືກປະຕິເສດ: ສົ່ງ `X-Forwarded-For` ເອງຕອນ `TRUST_PROXY=false` ແລ້ວ IP ໃນ AuditLog ຕ້ອງບໍ່ປ່ຽນ.

## 2. Rate limit ຕໍ່ IP
- throttler ຂອງ `/auth/login` (`LOGIN_RATE_LIMIT` ຕໍ່ນາທີ) ໃຊ້ **memory ໃນ process** ດັ່ງນັ້ນນັບແຍກຕໍ່ແຕ່ລະ instance.
- ຖ້າລັນ API ຫຼາຍກວ່າ 1 instance ໃຫ້ຍ້າຍ storage ຂອງ throttler ໄປ Redis, ບໍ່ດັ່ງນັ້ນຂີດຈຳກັດຈິງຈະເປັນ N ເທົ່າ.

## 3. ລັອກຕໍ່ email (LOGIN_EMAIL_MAX_FAILURES / LOGIN_EMAIL_WINDOW_MINUTES)
- default: ຜິດ 10 ຄັ້ງໃນ 15 ນາທີ ຕໍ່ email → ຕອບ 429 ແມ່ນແຕ່ໃສ່ລະຫັດຖືກ. ນັບຈາກ AuditLog (ເກັບສະເພາະ hash ຂອງ email).
- ຂໍ້ແລກປ່ຽນ: ຜູ້ໂຈມຕີທີ່ຮູ້ email ຂອງໃຜຜູ້ໜຶ່ງ ສາມາດ **ລັອກບັນຊີນັ້ນຊົ່ວຄາວ** ໄດ້ (DoS). ຍອມຮັບເພື່ອກັນການເດົາລະຫັດຈາກຫຼາຍ IP. ປັບສອງຄ່ານີ້ຕາມຄວາມເໝາະສົມ.

## 4. Refresh cookie ແລະ SameSite
- cookie `oca_rt` ເປັນ `HttpOnly; SameSite=Lax; Path=/auth` ແລະ `Secure` ໃນ production.
- ໜ້າ admin ແລະ API ຕ້ອງຢູ່ **site ດຽວກັນ** (registrable domain ດຽວກັນ ເຊັ່ນ `admin.example.com` ແລະ `api.example.com`), ບໍ່ດັ່ງນັ້ນ browser ຈະບໍ່ສົ່ງ cookie ໃນ request ຂ້າມ site.
- ຖ້າຕ້ອງແຍກ domain: ປ່ຽນເປັນ `SameSite=None; Secure` (ຕ້ອງ HTTPS) ແລະ ກວດ CSRF/CORS ຄືນໃໝ່.
- `CORS_ORIGIN` ຕ້ອງເປັນ origin ຂອງ admin ແທ້ໆ (ແຍກດ້ວຍ comma ໄດ້).

## 5. JWT_ACCESS_SECRET
- ຕ້ອງສຸ່ມ ແລະ ຍາວ ≥ 32 ຕົວອັກສອນ (ເຊັ່ນ `openssl rand -base64 48`).
- production ປະຕິເສດຄ່າ placeholder ທີ່ຂຶ້ນຕົ້ນດ້ວຍ `dev-only` ຫຼື `test-secret`.
- ປ່ຽນ secret = access token ທັງໝົດທີ່ອອກໄປແລ້ວໃຊ້ບໍ່ໄດ້ (ຜູ້ໃຊ້ຕ້ອງ refresh).

## 6. ເວີຊັນ Postgres / Redis
- docker-compose ໃຊ້ Postgres 16, ແຕ່ການພັດທະນາຖືກທົດສອບເທິງ Postgres 18.4. **ກ່ອນ deploy ໃຫ້ຣັນ migration + test ເທິງ Postgres 16 ອີກຄັ້ງ** (`pnpm --filter @oca/database db:deploy`).
- Redis ໃຊ້ເປັນ queue (BullMQ) ແລະ health check; ໃຊ້ຕົວທີ່ຮອງຮັບ BullMQ (Redis ≥ 6.2).

## 7. ລຶບ refresh token ເກົ່າ
- worker ມີ job `cleanup-refresh-tokens` ໃນ queue `maintenance` ຣັນທຸກວັນ 03:00 (cron `0 3 * * *`, ເວລາຂອງເຄື່ອງ worker).
- ລຶບ token ທີ່ໝົດອາຍຸເກີນ 1 ມື້ ຫຼື ຖືກ revoke ເກີນ 7 ມື້. ຕ້ອງມີ worker ຢ່າງໜ້ອຍ 1 ໂຕຣັນຢູ່ ແລະ ຕັ້ງ `DATABASE_URL` ໃຫ້ worker.

## ພອດຂອງ Postgres / Redis ໃນ Docker

`docker-compose.yml` ເປີດພອດຝັ່ງເຄື່ອງຜ່ານ `POSTGRES_PORT` (ຄ່າເລີ່ມຕົ້ນ 5432) ແລະ `REDIS_PORT` (ຄ່າເລີ່ມຕົ້ນ 6379); ພອດໃນ container ບໍ່ປ່ຽນ. ຖ້າເຄື່ອງມີ Postgres/Redis ອື່ນໃຊ້ພອດນັ້ນຢູ່ ໃຫ້ຕັ້ງ `POSTGRES_PORT`/`REDIS_PORT` ໃນ `.env` ແລະ ແກ້ `DATABASE_URL`/`REDIS_URL` ໃຫ້ກົງກັນ. Container ທີ່ຕິດຕໍ່ກັນເອງໃນ compose network ໃຊ້ຊື່ service ກັບພອດ container (`postgres:5432`) ບໍ່ກະທົບ.

## 8. ຕົວຣັນ infra ໃນເຄື່ອງ (ບໍ່ໃຊ້ Docker)

- `pnpm infra:local` (`packages/dev-infra`) ໃຊ້ embedded Postgres 18 (package beta `embedded-postgres@18.4.0-beta.*`) ແລະ Redis ໃນໜ່ວຍຄວາມຈຳ (`redis-memory-server`, pin Redis 7.4.1; ຂໍ້ມູນ queue ຈະຫາຍເມື່ອຢຸດ) → **ໃຊ້ສຳລັບການພັດທະນາເທົ່ານັ້ນ**.
- docker-compose ໃຊ້ Postgres 16 / Redis 7. production ຄວນໃຊ້ Postgres + Redis ແບບ managed ຫຼື ຕົວຈິງ; ກວດ migration ຄືນເທິງເວີຊັນ Postgres ຂອງ production.

## 9. ຄືນສະຕ໋ອກຂອງບິນທີ່ໝົດເວລາຈອງ
- worker ມີ job `expire-reservations` ໃນ queue `inventory` ຣັນທຸກ 60 ວິນາທີ: ບິນ `PENDING_PAYMENT` ທີ່ເກີນ `reservedUntil` ຖືກປ່ຽນເປັນ `EXPIRED` ແລະ ຄືນສະຕ໋ອກທີ່ຈອງ. **ຕ້ອງມີ worker ຢ່າງໜ້ອຍ 1 ໂຕຣັນຢູ່** ບໍ່ດັ່ງນັ້ນສະຕ໋ອກຈະຄ້າງຈອງ (ບິນທີ່ໝົດເວລາຍັງກົດ "ຊຳລະ" ບໍ່ໄດ້ ເພາະ API ກວດ `reservedUntil` ເອງ).
- ຫຼາຍ worker ພ້ອມກັນໄດ້ (scheduler upsert; ການຄືນສະຕ໋ອກມີ guard ໃນ SQL ຈຶ່ງບໍ່ຄືນຊ້ຳ).
- Migration `20261005000000_inventory` ເພີ່ມ `StoreSetting.reservationMinutes` ແລະ sequence ເລກບິນ. ກວດເທິງ Postgres 16 ແລ້ວ (2026-10-05, ບໍ່ມີ drift); ຄວນກວດຊ້ຳກ່ອນ deploy ຈິງ (ຄືກັບຂໍ້ 6). ຫຼັງ deploy ຕ້ອງຣັນ `pnpm db:seed` ເພື່ອສ້າງສາງ default `MAIN` (ແລະແຖວ `StoreSetting` ຖ້າຍັງບໍ່ມີ; API ກໍສ້າງແຖວ `StoreSetting` ໃຫ້ອັດຕະໂນມັດຄັ້ງທຳອິດທີ່ໃຊ້) ແລະ ຕັ້ງຊື່ຮ້ານດ້ວຍ `SEED_STORE_NAME`; ຮັນຊ້ຳໄດ້ປອດໄພ.

## 10. ສິດຂອງບິນ / ຊຳລະ / ຕົ້ນທຶນ (role ໃໝ່)
- ເພີ່ມ module ສິດ `orders`, `payments`, `costs` (ລວມ 15 module / 30 ສິດ). ບິນບໍ່ໄດ້ໃຊ້ `inventory:*` ອີກ: ອ່ານ/ສ້າງ/ຍົກເລີກ = `orders:*`, ຢືນຢັນຊຳລະ = `payments:write`, ແພັກ/ສົ່ງ/ປິດ = `logistics:write`, ເຫັນ/ຕັ້ງຕົ້ນທຶນ = `costs:read|write` (ເບິ່ງ spec Phase 1-A §6.1).
- `pnpm db:seed` ອັບເດດ role ລະບົບ (OWNER) ໃຫ້ມີສິດໃໝ່ ແຕ່ **ບໍ່ຂຽນທັບ role ທີ່ບໍ່ແມ່ນລະບົບ** (MANAGER/CHAT_ADMIN/WAREHOUSE/ACCOUNTANT) ທີ່ມີຢູ່ແລ້ວ. Deployment ທີ່ມີ role ເຫຼົ່ານີ້ຢູ່ແລ້ວ ຕ້ອງເຂົ້າ `/roles` ແລ້ວຕິກສິດໃໝ່ເອງ ບໍ່ດັ່ງນັ້ນຜູ້ໃຊ້ເດີມທີ່ເຄີຍເຫັນບິນດ້ວຍ `inventory:read` ຈະເຫັນບິນບໍ່ໄດ້ ແລະ ຜູ້ທີ່ເຄີຍຢືນຢັນຊຳລະດ້ວຍ `inventory:write` ຈະຢືນຢັນບໍ່ໄດ້ (ຕ້ອງໃຫ້ `payments:write`). ຜູ້ໃຊ້ທີ່ບໍ່ມີ `costs:read` ຈະບໍ່ເຫັນ `costPrice`/`unitCost` ໃນ API ເລີຍ.
- Error ຂອງ API ມີ `code` ຄົງທີ່ (spec §6.2) ແລະ id ອ້າງອີງທີ່ບໍ່ພົບຕອບ `404` ແທນ `400` ໃນ endpoint ທີ່ເຄີຍຕອບ `400`: client ທີ່ຂຽນເອງຕ້ອງປັບ. `vatRate` ຂອງ `/settings/store` ເປັນ string. `to` ຂອງ filter ວັນທີເປັນ exclusive ແລະ date-only ຖືເວລາ UTC+7.
- Migration `20261005010000_order_idempotency_key` ເພີ່ມ `Order.idempotencyKey` (unique, nullable) ແລະ `idempotencyHash`; ກວດເທິງ Postgres 16 ແລ້ວ. `POST /orders` ຮັບ header `Idempotency-Key` (1-128 ອັກສອນ ASCII ພິມໄດ້, ບໍ່ມີຍະຫວ່າງ): key ຊ້ຳ + body ຄືເກົ່າ = ຄືນບິນເດີມ; key ຊ້ຳ + body ຕ່າງ = 409 `CONFLICT`. key ເປັນ unique ທົ່ວລະບົບ (ບໍ່ແຍກຕາມຜູ້ໃຊ້) ຈຶ່ງໃຫ້ client ໃຊ້ UUID. ຍັງບໍ່ມີ TTL ລຶບ key ເກົ່າ.

## 11. Inbox / Facebook Messenger

- ຕັ້ງ env: `FACEBOOK_APP_SECRET` (ກວດລາຍເຊັນ), `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (ຄ່າໃດກໍໄດ້ ແຕ່ຕ້ອງຕົງກັບທີ່ໃສ່ໃນ Meta), `FACEBOOK_PAGE_ACCESS_TOKEN` (long-lived Page token). ບໍ່ຕັ້ງ app secret/verify token = webhook ຕອບ `503 CHANNEL_NOT_CONFIGURED`.
- Meta App → Messenger → Webhooks: Callback URL = `https://<host>/webhooks/facebook` (ຖ້າຜ່ານ proxy `/api` ຂອງ admin ໃຫ້ເປັນ `/api/webhooks/facebook` ແລະ ຕ້ອງເປີດໃຫ້ internet ເຂົ້າເຖິງໂດຍບໍ່ຕ້ອງ login). Subscribe fields: `messages` ແລະ `message_echoes` (echo ໃຊ້ບັນທຶກຂໍ້ຄວາມທີ່ແອດມິນຕອບຈາກແອັບ Facebook ແລະ ກັນຂໍ້ຄວາມຕອບຈາກ API ຊ້ຳ). ສິດທີ່ຕ້ອງການ: `pages_messaging` (ແລະ `pages_read_engagement` ຖ້າຢາກດຶງຊື່ລູກຄ້າ).
- Webhook ຕອບ `{received, failed}`: event ທີ່ເສຍຖາວອນ (ລອງໃໝ່ກໍບໍ່ຜ່ານ) ຖືກຂ້າມ ແລະ log ສະເພາະ `mid` + ຊື່ error ບໍ່ໃຫ້ກີດ event ອື່ນ; ຂໍ້ຜິດພາດຊົ່ວຄາວ (DB/ເຄືອຂ່າຍ) ຕອບ `500` ເພື່ອໃຫ້ Meta ສົ່ງຊ້ຳ (dedupe ດ້ວຍ `mid`). JSON body ຈຳກັດ 1mb.
- Meta ຈຳກັດການຕອບພາຍໃນ 24 ຊົ່ວໂມງຫຼັງລູກຄ້າທັກຄັ້ງລ່າສຸດ; ເກີນນັ້ນຂໍ້ຄວາມຂາອອກຖືກບັນທຶກເປັນ `FAILED` ພ້ອມ `errorCode=OUTSIDE_WINDOW` (ບໍ່ມີ retry ອັດຕະໂນມັດ).
- ຂໍ້ຄວາມຂາອອກຖືກບັນທຶກເປັນ `PENDING` ກ່ອນເອີ້ນ Meta: ຖ້າ API ຕາຍກາງທາງ ແຖວຈະຄ້າງ `PENDING` (ຍັງບໍ່ມີ job ກວາດ; ຕ້ອງກວດເອງດ້ວຍ `SELECT * FROM "Message" WHERE status='PENDING' AND "createdAt" < now() - interval '5 minutes'`).
- Realtime ໃຊ້ Redis pub/sub channel `oca:inbox:events` (ຕ້ອງມີ Redis; ຖ້າ Redis ລົ້ມ ການບັນທຶກຂໍ້ຄວາມຍັງສຳເລັດ ແຕ່ admin ຈະເຫັນຊ້າສຸດ 60 ວິ ຕາມ poll ສຳຮອງ). SSE `GET /inbox/events` ຕອບ `503` ເມື່ອ Redis ໃຊ້ບໍ່ໄດ້, ຖືກຕັດຫຼັງ `ACCESS_TOKEN_TTL_SECONDS` (ຄ່າເລີ່ມຕົ້ນ 900 ວິ) ແລະ ຕອນ API shutdown: client ຕ້ອງ reconnect ດ້ວຍ access token ໃໝ່. ຜ່ານ reverse proxy ຕ້ອງປິດ response buffering (nginx: `proxy_buffering off`) ແລະ ຕັ້ງ read timeout > 25 ວິ (heartbeat).
- ຂໍ້ຈຳກັດທີ່ຮູ້ແລ້ວ: (1) ການຕອບ (`POST /conversations/:id/messages`) ບໍ່ມີ idempotency key: ຖ້າ client retry ຫຼັງ timeout ອາດສົ່ງຊ້ຳສອງຄັ້ງ; (2) ການຕອບບໍ່ເປີດເຄສ `CLOSED` ຄືນ ແລະ ບໍ່ມອບໝາຍເຄສໃຫ້ຜູ້ຕອບອັດຕະໂນມັດ.
- ຍັງບໍ່ໄດ້ພິສູດກັບ Meta ຈິງ (ພັດທະນາດ້ວຍ simulator `pnpm --filter @oca/channels simulate`): ຮູບແບບ payload/ລະຫັດ error ອາງອີງຕາມເອກະສານ Meta; ຕ້ອງທົດສອບຄືນເມື່ອມີ Meta App ແລະ ບັນທຶກຜົນ.
- Migration `20261006000000_inbox` ເພີ່ມຕາຕະລາງ `Conversation`, `Message` ແລະ `Order.conversationId` (ເພີ່ມຢ່າງດຽວ); ກວດເທິງ Postgres 16 ກ່ອນ deploy ຈິງ (ຄືກັບຂໍ້ 6). Role `CHAT_ADMIN`/`MANAGER`/`OWNER` ມີ `inbox:*` ຢູ່ແລ້ວ; role ອື່ນທີ່ປັບແຕ່ງເອງຕ້ອງຕິກສິດ `inbox` ເອງ.
- ເປີດບິນຈາກແຊັດ (`POST /orders` ພ້ອມ `conversationId`): API ບັງຄັບ `inbox:write` ເພີ່ມຈາກ `orders:write` (ກວດກ່ອນຫາເຄສ); `channel` ຕາມເຄສ + `source=CHAT` ກຳນົດຝັ່ງ server (client ສົ່ງ `channel`/`source` ບໍ່ໄດ້); `GET /orders?conversationId=` ກອງບິນຂອງເຄສ (ຕ້ອງ `orders:read`). ໜ້າ `/orders/new?conversationId=` ຕ້ອງ `orders:write` + `inventory:read` + `inbox:write`. ຫຼັງສ້າງບິນ admin ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດ; ສົ່ງບໍ່ໄດ້ = ບິນຍັງຢູ່ ແລະ ກົດສົ່ງຄືນໄດ້ (ຂໍ້ຄວາມຕອບບໍ່ມີ idempotency key ຈຶ່ງອາດຊ້ຳຖ້າການສົ່ງຄັ້ງກ່ອນ timeout ແຕ່ຝັ່ງ Meta ໄດ້ຮັບແລ້ວ).
- SSE ຜ່ານ proxy `/api` ຂອງ admin (Next): ໃນ smoke test ດ້ວຍ `next build && next start` ຂໍ້ຄວາມເຂົ້າ admin ພາຍໃນ ~1 ວິ (ບໍ່ຖືກ buffer). ແຕ່ຖ້າມີ gzip/CDN ຢູ່ກາງ ໃຫ້ຢືນຢັນດ້ວຍ `curl -N .../api/inbox/events`; ແນະນຳໃຫ້ route `/webhooks/facebook` ແລະ `/inbox/events` ຕົງໄປ API ທີ່ reverse proxy. SSE ອາດຢູ່ຕໍ່ຫຼັງ token ໝົດສິດໄດ້ຫຼາຍສຸດ ~`ACCESS_TOKEN_TTL_SECONDS` (event ມີແຕ່ id; endpoint ຂໍ້ມູນກວດສິດທຸກຄັ້ງ).
- `FACEBOOK_GRAPH_BASE_URL` ໃຊ້ກັບ simulator/dev ເທົ່ານັ້ນ (ຢ່າຕັ້ງໃນ production); `FACEBOOK_APP_ID` ສຳຮອງໄວ້ ຍັງບໍ່ຖືກອ່ານ.

## 12. CF Engine

- **Meta App**: ນອກຈາກ webhook field `messages` ຕ້ອງ subscribe field `feed` ແລະ ມີສິດ `pages_read_engagement`, `pages_manage_engagement`, `pages_messaging`.
- **`externalPostId`** ຂອງ LiveSession ຕ້ອງເປັນ `post_id` ຕາມທີ່ webhook ສົ່ງມາ (ຮູບ `<pageId>_<postOrVideoId>`). ກວດຈາກ log/ledger ຂອງ webhook ຕອນທົດລອງຈິງຄັ້ງທຳອິດ ກ່ອນເປີດໃຊ້.
- **Private Reply**: ຕອບສ່ວນຕົວໄດ້ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ ແລະ ພາຍໃນ 7 ວັນ. ຂໍ້ຄວາມ Messenger ຈຳກັດ 2000 ຕົວອັກສອນ.
- **`from.id` ອາດບໍ່ຕົງ PSID** ຂອງ Messenger: ເຄສຈາກຄອມເມັ້ນຈຶ່ງອາດບໍ່ລິ້ງກັບແຊັດ (conversation) ອັດຕະໂນມັດ.
- **ຄອມເມັ້ນທີ່ເປັນ reply ຂອງຄອມເມັ້ນ** ຖືກນັບເປັນ CF ເໝືອນຄອມເມັ້ນປົກກະຕິ.
- **`QUEUE_PREFIX`** (env ຂອງ API): ຢ່າໃຊ້ prefix ດຽວກັນລະຫວ່າງ instance ທີ່ບໍ່ຕ້ອງການແບ່ງ job ກັນ (ໃນ Redis ດຽວກັນ). Test ໃຊ້ prefix ຕໍ່ pid ແລະ `OCA_TEST_DB_NAME` ແຍກຖານ test.
- **Consumer ຢູ່ໃນ process ຂອງ API**: concurrency 4, serialize ຕໍ່ session ດ້ວຍ Postgres advisory lock, retry 3 ຄັ້ງແບບ backoff, ຖ້າຄັ້ງສຸດທ້າຍຍັງລົ້ມບັນທຶກ ledger ເປັນ ERROR.
- **Migration**: `20261007000000_cf_engine` ມີ partial unique index ແລະ CHECK ທີ່ບໍ່ຢູ່ໃນ `schema.prisma` (ຕ້ອງແກ້ migration ທີ່ generate ດ້ວຍມື, ຢ່າ drop ເມື່ອ `migrate dev`), ແລະ `20261007010000_cf_reply_claim`. ຕ້ອງ `pnpm --filter @oca/database db:deploy`.
- **Reply claim**: ສະຖານະ SENDING ຖືວ່າ stale ຫຼັງ 2 ນາທີ; ຖ້າ process ຕາຍກາງທາງ ການສົ່ງເປັນ at-least-once (ອາດສົ່ງຊ້ຳໄດ້).
- **ຂໍ້ຈຳກັດ**: cache ຢູ່ໃນ API instance ດຽວ (ຍັງບໍ່ຮອງຮັບຫຼາຍ instance), ບໍ່ມີ waitlist, ບໍ່ໃສ່ QR ໃນຂໍ້ຄວາມ, ຍັງບໍ່ພິສູດກັບ Meta ຈິງ (ພັດທະນາດ້ວຍ simulator: `simulate comment ...`).
- ຕັ້ງຂໍ້ມູນໂອນເງິນທີ່ໃສ່ໃນຂໍ້ຄວາມບິນ ຜ່ານ `PATCH /settings/store` field `paymentInstructions` (ສູງສຸດ 500 ຕົວ; ຊ່ອງໃນໜ້າ admin ມາກັບ 4a-2).

### CF Engine: ຂໍ້ສັງເກດເພີ່ມເຕີມ

- **ຄວາມໝາຍຂອງ limit**: `limit` ນັບຈຳນວນ CF ທີ່ "ຍັງຄ້າງຢູ່" (`LiveSessionItem.claimed`). ເມື່ອບິນ CF ໝົດເວລາ (EXPIRED) ຫຼື ຖືກຍົກເລີກ (CANCELLED) ລະບົບຄືນທັງສະຕ໋ອກ ແລະ ຈຳນວນທີ່ນັບໄວ້ (ລວມທຸກຄອມເມັ້ນທີ່ merge ເຂົ້າບິນດຽວກັນ, ບໍ່ຕ່ຳກວ່າ 0) ໃນ transaction ດຽວກັນ ຈຶ່ງເປີດຂາຍຕໍ່ໄດ້ເອງ. ບິນທີ່ຊຳລະ/ແພັກ/ຈັດສົ່ງ/ສຳເລັດແລ້ວ ຍັງນັບຢູ່ (ບໍ່ຄືນ). ການຄືນເກີດຄັ້ງດຽວຕໍ່ບິນ (ຜູ້ຊະນະ guard ຂອງການປ່ຽນສະຖານະ).
- **ກໍລະນີ comment ຫາຍແບບງຽບ (ຮູ້ແລ້ວ 2 ກໍລະນີ)**: (ກ) comment ທີ່ເຂົ້າຄິວກ່ອນ session ຈົບ ແຕ່ຖືກປະມວນຜົນຫຼັງຈົບ ຖືກຂ້າມໂດຍບໍ່ມີແຖວ ledger; (ຂ) ຖ້າ attempt ສຸດທ້າຍລົ້ມ ແລະ ການຂຽນ ledger ກໍລົ້ມນຳ (ເຊັ່ນ DB ລົ່ມ) job BullMQ ທີ່ລົ້ມ (jobId = commentId, ຢູ່ໃນ failed set) ຈະເຮັດໃຫ້ Meta retry ຖືກ dedupe ແລະ comment ຫາຍ. ໂອກາດເກີດຕ່ຳ.
- **Retry**: processor retry ຄວາມຜິດພາດຊົ່ວຄາວ 3 ຄັ້ງແບບ backoff ແລະຂຽນ ERROR ໃນ ledger ສະເພາະ attempt ສຸດທ້າຍ (ຕ່າງຈາກ spec ທີ່ວ່າ "ບໍ່ retry").
- **Connection pool**: ແຕ່ລະ transaction ຂອງ processor ຖື DB connection ໃນລະຫວ່າງລໍ advisory lock ຕໍ່ session; concurrency 4 ອາດຄ້າງ connection ໄດ້ເຖິງ 4 ໃນ session ທີ່ຮ້ອນ.

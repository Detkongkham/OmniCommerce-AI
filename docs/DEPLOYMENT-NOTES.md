# ໝາຍເຫດການ deploy

ສິ່ງທີ່ຕ້ອງກວດກ່ອນ deploy ຂຶ້ນ production.

## 1. TRUST_PROXY (API)
- ຄ່າ default `false` (ບໍ່ເຊື່ອ header `X-Forwarded-For`). ຖ້າ API ຢູ່ຫຼັງ reverse proxy / load balancer ໃຫ້ຕັ້ງເປັນ **ຈຳນວນ proxy hop** ເຊັ່ນ `TRUST_PROXY=1`.
- ຫ້າມໃຊ້ `true` (ລະບົບຈະປະຕິເສດຄ່ານີ້): ການເຊື່ອທຸກ proxy ເຮັດໃຫ້ຜູ້ໂຈມຕີປອມ IP ດ້ວຍ `X-Forwarded-For` ໄດ້ ແລະ ຫຼົບ rate limit / ເຮັດໃຫ້ audit log ຜິດ.
- ຕັ້ງຈຳນວນ hop ໃຫ້ກົງກັບຕົວຈິງ: ຕັ້ງຫຼາຍກວ່າຕົວຈິງ = ເຊື່ອ header ທີ່ client ສົ່ງມາ.

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

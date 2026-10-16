# Phase 3 ໂມດູນ 11: CRM & Customer Loyalty, sub-project 3d

ວັນທີ: 2026-10-12 · ສະຖານະ: D1, D2, D3 ສຳເລັດ (D1, D2: 2026-10-12; D3: 2026-10-16) · Branch: `phase3-crm`

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

| ສ່ວນ | ເນື້ອຫາ |
|---|---|
| **D1 Customer 360 + RFM** | ໜ້າລູກຄ້າໃນ admin: ລາຍຊື່, ລາຍລະອຽດ (ບິນທຸກຊ່ອງທາງ, ແຊັດ, ສະຖິຕິ), ກຸ່ມ RFM, ລວມລູກຄ້າຊ້ຳ |
| **D2 ແຕ້ມ + ລະດັບສະມາຊິກ** | ໄດ້ແຕ້ມເມື່ອບິນຈ່າຍແລ້ວ, ແລກແຕ້ມຫັກເປັນເງິນໃນບິນ, ລະດັບຈາກຍອດຊື້ 12 ເດືອນ (ຕົວຄູນແຕ້ມ), ປັບແຕ້ມດ້ວຍມື |
| **D3 ສະມາຊິກເທິງເວັບ** | ເບີ + PIN, ໜ້າ `/account`, ແລກແຕ້ມຕອນ checkout |

ການຕັດສິນຂອງຜູ້ໃຊ້ (2026-10-12): ຕົວຕົນ = ເບີໂທ + PIN (ບໍ່ມີ SMS OTP); ແຕ້ມຫັກເປັນເງິນໃນບິນ; ລະດັບ = ຍອດຊື້ 12 ເດືອນ → ຕົວຄູນແຕ້ມ; ລູກຄ້າທຸກຄົນ ທຸກຊ່ອງທາງ ໄດ້ແຕ້ມໂດຍບໍ່ຕ້ອງສະໝັກ.

**ບໍ່ຢູ່ໃນ 3d:** ແຕ້ມໝົດອາຍຸ, ແຕ້ມວັນເກີດ/ແນະນຳໝູ່, ສ່ວນຫຼຸດຕາມລະດັບ, ລາງວັນແລກເປັນໂຄດ, Broadcast ຕາມກຸ່ມ (ໂມດູນ 9), OTP, ລູກຄ້າປ່ຽນ PIN ເອງ, ແລກແຕ້ມໃນບິນ CF, ແທັກລູກຄ້າແບບກຳນົດເອງ.

ສິດ: ໃຊ້ໂມດູນ `crm` ທີ່ມີຢູ່ແລ້ວ (`crm:read`, `crm:write`).

## 2. D1 Customer 360 + RFM

### ຂໍ້ມູນ

`Customer.note String?` (migration `20261012000000_crm`). ສະຖິຕິ ແລະ RFM ບໍ່ເກັບລົງຕາຕະລາງ: ຄິດສົດຈາກ `Order`.

"ບິນທີ່ນັບ" ໃນເອກະສານນີ້ = ສະຖານະ `PAID`, `PACKING`, `SHIPPED`, `COMPLETED`. ມູນຄ່າຂອງບິນ = `subtotal` (ຄ່າສິນຄ້າຫຼັງສ່ວນຫຼຸດທັງໝົດ, ບໍ່ລວມຄ່າສົ່ງ).

### ສະຖິຕິຕໍ່ລູກຄ້າ

`orderCount`, `totalSpent`, `averageOrder`, `firstPaidAt`, `lastPaidAt` (ຈາກບິນທີ່ນັບ), `openOrderCount` (`PENDING_PAYMENT`).

### RFM

ຄິດໃນ SQL (CTE ດຽວ ທີ່ໃຊ້ທັງລາຍຊື່, ການກັ່ນຕອງ ແລະ ການນັບ) ສຳລັບລູກຄ້າທີ່ມີບິນທີ່ນັບ ≥ 1; ຄົນອື່ນ `segment = null`.

| ຄະແນນ | R (ມື້ນັບຈາກ `lastPaidAt`) | F (ຈຳນວນບິນ) | M (`totalSpent`) |
|---|---|---|---|
| 5 | ≤ 30 | ≥ 10 | `ceil(CUME_DIST × 5)` |
| 4 | ≤ 60 | 5–9 | |
| 3 | ≤ 90 | 3–4 | |
| 2 | ≤ 180 | 2 | |
| 1 | > 180 | 1 | (ທຽບກັບລູກຄ້າຄົນອື່ນ; ຍອດເທົ່າກັນ = ຄະແນນເທົ່າກັນ) |

ກຸ່ມ (ກົດທຳອິດທີ່ກົງ):

1. `CHAMPION` (ຊັ້ນຍອດ): R ≥ 4, F ≥ 4, M ≥ 4
2. `LOYAL` (ຂາປະຈຳ): R ≥ 3, F ≥ 3
3. `NEW` (ລູກຄ້າໃໝ່): R ≥ 4, F = 1
4. `AT_RISK` (ສ່ຽງຫາຍ): R ≤ 2 ແລະ (F ≥ 3 ຫຼື M ≥ 4)
5. `LOST` (ຫາຍໄປ): R = 1
6. `REGULAR` (ທົ່ວໄປ): ທີ່ເຫຼືອ

### ລວມລູກຄ້າ

`POST /crm/customers/:id/merge { sourceId }` ລວມ source ເຂົ້າ target (`:id`) ໃນ transaction ດຽວ:

- ຍ້າຍ `Order`, `Conversation`, `PointEntry` ຂອງ source ໄປ target; `target.pointsBalance += source.pointsBalance`.
- `phone`, `email`, `facebookUserId`, `note`: target ຮັບຄ່າຂອງ source ສະເພາະຊ່ອງທີ່ target ຍັງຫວ່າງ. ຖ້າທັງສອງມີເບີຕ່າງກັນ ເບີຂອງ source ຖືກຖິ້ມ (UI ເຕືອນກ່ອນຢືນຢັນ).
- PIN: ຖ້າ target ບໍ່ມີ PIN ແລະ ຮັບເບີຈາກ source ກໍຮັບ `pinHash` ນຳ; ກໍລະນີອື່ນ PIN ຂອງ source ຖືກຖິ້ມ.
- ລຶບ source; ຄິດລະດັບຂອງ target ໃໝ່; ບັນທຶກ audit (`customer.merge`, ຂໍ້ມູນ source ທັງໝົດໃນ `before`).
- `sourceId = :id` ຫຼື ບໍ່ພົບ → `400`/`404`.

### API (`crm:read` / `crm:write`)

ຢູ່ໃຕ້ `/crm/customers` ເພາະ `GET /customers` ມີຢູ່ແລ້ວ ເປັນຕົວຄົ້ນລູກຄ້າຂອງຟອມເປີດບິນ (`orders:read`) ແລະ ບໍ່ຖືກແຕະ.

- `GET /crm/customers?q&tier&segment&sort&page&pageSize`: `q` ຄົ້ນຊື່/ເບີ; `sort` = `spent` \| `lastOrder` \| `points` \| `created` (ຄ່າເລີ່ມ `lastOrder`). ແຖວ: ຂໍ້ມູນ + ສະຖິຕິ + `segment` + `tier` + `pointsBalance`.
- `GET /crm/customers/segments`: ຈຳນວນລູກຄ້າຕໍ່ກຸ່ມ ແລະ ຕໍ່ລະດັບ.
- `GET /crm/customers/:id`: ຂໍ້ມູນ + ສະຖິຕິ + ຄະແນນ R/F/M + `segment` + `tier` + `spend12m` + `nextTier { tier, remaining } | null` + `hasPin`.
- `GET /crm/customers/:id/orders`, `GET /crm/customers/:id/conversations`, `GET /crm/customers/:id/points` (ແບ່ງໜ້າ, ໃໝ່ສຸດກ່ອນ).
- `PATCH /crm/customers/:id { name?, phone?, email?, note? }`: ເບີຊ້ຳ → `409 CUSTOMER_PHONE_TAKEN` (ພ້ອມ `customerId` ຂອງເຈົ້າຂອງເບີ ເພື່ອສະເໜີລວມ).
- `POST /crm/customers/:id/merge`.

### UI admin

- ເມນູ "ລູກຄ້າ" (ເຫັນເມື່ອມີ `crm:read`).
- `/customers`: ແຖບນັບຕໍ່ກຸ່ມ (ກົດເພື່ອກັ່ນຕອງ), ຄົ້ນຫາ, ກັ່ນຕອງລະດັບ, ຕາຕະລາງ (ຊື່, ເບີ, ລະດັບ, ກຸ່ມ, ບິນ, ຍອດຊື້, ບິນຫຼ້າສຸດ, ແຕ້ມ).
- `/customers/[id]`: ບັດຂໍ້ມູນ (ແກ້ໄຂ), ບັດສະຖິຕິ, ບັດລະດັບ + ແຕ້ມ, ແຖບ "ບິນ" / "ແຊັດ" / "ແຕ້ມ", ປຸ່ມ "ລວມລູກຄ້າ" (ຄົ້ນຫາ source + ໜ້າຢືນຢັນທີ່ສະແດງສິ່ງທີ່ຈະຍ້າຍ).
- ໜ້າບິນ: ຊື່ລູກຄ້າເປັນລິ້ງໄປ `/customers/[id]`.

## 3. D2 ແຕ້ມ + ລະດັບ

### ຂໍ້ມູນ (migration `20261012010000_loyalty`)

- `enum MemberTier { BRONZE SILVER GOLD PLATINUM }`, `enum PointEntryType { EARN EARN_REVERSAL REDEEM REDEEM_REFUND ADJUST }`.
- `Customer`: `pointsBalance Int @default(0)`, `tier MemberTier @default(BRONZE)`.
- `PointEntry`: `customerId` (Cascade), `orderId?` (SetNull), `type`, `points Int` (ມີເຄື່ອງໝາຍ), `balanceAfter Int`, `note?`, `actorId?`, `createdAt`. `@@unique([orderId, type])` (ກັນບັນທຶກຊ້ຳຕໍ່ບິນ; `orderId` null ບໍ່ຕິດ), `@@index([customerId, createdAt])`.
- `Order`: `pointsRedeemed Int @default(0)`, `pointsDiscount Decimal @default(0)`, `pointsEarned Int @default(0)`.
- `StoreSetting`: `loyaltyEnabled Boolean @default(false)`, `pointsEarnPer Decimal @default(10000)` (ກີບຕໍ່ 1 ແຕ້ມ), `pointValue Decimal @default(100)` (ກີບຕໍ່ 1 ແຕ້ມຕອນແລກ), `pointsMaxRedeemPercent Int @default(50)` (1–100), `tierRules Json` ຄ່າເລີ່ມ:

| ລະດັບ | ຍອດຊື້ 12 ເດືອນຂັ້ນຕ່ຳ | ຕົວຄູນ |
|---|---|---|
| BRONZE | 0 | 1 |
| SILVER | 2,000,000 | 1.25 |
| GOLD | 5,000,000 | 1.5 |
| PLATINUM | 10,000,000 | 2 |

ກວດ `tierRules`: ຄົບ 4 ລະດັບ, BRONZE = 0, ເກນເພີ່ມຂຶ້ນເຄັ່ງຄັດ, ຕົວຄູນ 1–10.

### ຈຸດດຽວຂອງເຫດຜົນ

ເຫດຜົນແຕ້ມທັງໝົດຢູ່ `packages/database/src/loyalty` (ເພາະ worker ກໍຕ້ອງໃຊ້ຕອນບິນ `EXPIRED`); ສູດບໍລິສຸດ (`pointsForAmount`, `maxRedeemablePoints`, `tierForSpend`, schema ຂອງ `tierRules`) ຢູ່ `@oca/shared`. ທຸກການປ່ຽນຍອດແຕ້ມ: ລັອກແຖວລູກຄ້າ (`SELECT … FOR UPDATE`) → ຂຽນ `PointEntry` → ອັບເດດ `pointsBalance`, ໃນ transaction ຂອງຜູ້ເອີ້ນ.

### ໄດ້ແຕ້ມ

- ເມື່ອບິນປ່ຽນເປັນ `PAID` (ທັງ `pay` ແລະ ການຢືນຢັນສະລິບ) ໃນ transaction ດຽວກັນ; ສະເພາະເມື່ອ `loyaltyEnabled` ແລະ ບິນມີ `customerId`.
- `points = floor(order.subtotal / pointsEarnPer × ຕົວຄູນຂອງລະດັບກ່ອນບິນນີ້)`. ບັນທຶກ `EARN` + `Order.pointsEarned`. 0 ແຕ້ມ = ບໍ່ບັນທຶກ.
- ບິນ `PAID`/`PACKING` ຖືກຍົກເລີກ → `EARN_REVERSAL = −min(pointsEarned, ຍອດຄົງເຫຼືອ)` (ຍອດບໍ່ຕິດລົບ).

### ແລກແຕ້ມ

- ຄຳຂໍສ້າງບິນມີ `pointsToRedeem?` (ຈຳນວນເຕັມ > 0). `pointsDiscount = pointsToRedeem × pointValue`.
- ເພດານ: `pointsDiscount ≤ floor(ຍອດຫຼັງໂຄດ × pointsMaxRedeemPercent / 100)` ໂດຍ ຍອດຫຼັງໂຄດ = ຜົນລວມລາຍການ − `couponDiscount`. ໃຊ້ຮ່ວມກັບໂຄດ ແລະ Flash Sale ໄດ້.
- ເງິນໃນບິນ: `orderDiscount = couponDiscount + pointsDiscount`; `subtotal` ແລະ `discountTotal` ຕາມສູດເດີມ (invariant ຂອງ Analytics ບໍ່ປ່ຽນ). ບ່ອນທີ່ຄິດຍອດໃໝ່ (`appendItemsInTx`) ຕ້ອງລວມ `pointsDiscount`.
- ຫັກແຕ້ມຕອນສ້າງບິນ (`REDEEM`, ລົບ) ພາຍໃຕ້ການລັອກແຖວລູກຄ້າ: ສອງບິນແຂ່ງກັນໃຊ້ແຕ້ມເກີນຍອດ = ສຳເລັດດຽວ.
- ຄືນແຕ້ມ (`REDEEM_REFUND`) ເມື່ອບິນ `CANCELLED` ຫຼື `EXPIRED`, ບໍ່ຂຶ້ນກັບ `loyaltyEnabled`. `@@unique([orderId, type])` ກັນຄືນຊ້ຳ.
- ປະຕິເສດ = `409 POINTS_INVALID` ພ້ອມ `reason`: `DISABLED`, `NO_CUSTOMER`, `INSUFFICIENT` (+ `balance`), `OVER_CAP` (+ `maxPoints`). ບໍ່ສ້າງບິນ.
- ບິນ CF: ໄດ້ແຕ້ມ, ແລກບໍ່ໄດ້.

### ລະດັບ

- `spend12m` = ຜົນລວມ `subtotal` ຂອງບິນທີ່ນັບ ທີ່ `paidAt ≥ now − 365 ມື້`. ລະດັບ = ຂັ້ນສູງສຸດທີ່ເກນ ≤ `spend12m`.
- ຄິດໃໝ່ຕໍ່ລູກຄ້າ ຫຼັງບິນຈ່າຍ/ຍົກເລີກ (ໃນ transaction ດຽວກັນ) ແລະ ຫຼັງລວມລູກຄ້າ.
- Worker job `recompute-member-tiers` ທຸກວັນ 03:30: ຄິດໃໝ່ທຸກລູກຄ້າທີ່ `tier ≠ BRONZE` ຫຼື ມີບິນທີ່ນັບໃນ 12 ເດືອນ (ຫຼຸດລະດັບຄົນທີ່ຍອດຕົກ). ຂ້າມເມື່ອ `loyaltyEnabled = false`.
- ການແກ້ `tierRules` ມີຜົນຕອນ job ຄືນຕໍ່ໄປ ຫຼື ບິນຕໍ່ໄປຂອງລູກຄ້າ.

### API

- ການຕັ້ງຄ່າຮ້ານ (endpoint ເດີມ): ເພີ່ມ 5 ຊ່ອງຂ້າງເທິງ.
- `POST /crm/customers/:id/points/adjust { points, note }` (`crm:write`): `points` ≠ 0, `note` ບັງຄັບ; ຍອດຈະຕິດລົບ → `409 POINTS_INVALID (INSUFFICIENT)`; ບັນທຶກ audit.
- `POST /orders`: ຮັບ `pointsToRedeem?`. `GET /orders/:id`: `pointsRedeemed`, `pointsDiscount`, `pointsEarned`.

### UI admin

- `/settings`: ບັດ "ແຕ້ມ ແລະ ລະດັບສະມາຊິກ" (ເປີດ/ປິດ, ອັດຕາ, ເພດານ, ຕາຕະລາງ 4 ລະດັບ).
- `/customers/[id]`: ປຸ່ມ "ປັບແຕ້ມ"; ແຖບ "ແຕ້ມ" ສະແດງສະໝຸດ.
- ຟອມເປີດບິນ: ເມື່ອເລືອກລູກຄ້າທີ່ມີແຕ້ມ ສະແດງຍອດແຕ້ມ + ຊ່ອງ "ໃຊ້ແຕ້ມ" (ຈຳກັດດ້ວຍ `maxRedeemablePoints`). ໜ້າບິນ: ແຕ້ມທີ່ໃຊ້/ສ່ວນຫຼຸດ/ແຕ້ມທີ່ໄດ້.

## 4. D3 ສະມາຊິກເທິງເວັບ

### ຂໍ້ມູນ (migration `20261012020000_member_pin`)

`Customer`: `pinHash String?` (argon2id), `pinFailedCount Int @default(0)`, `pinLockedUntil DateTime?`, `pinVersion Int @default(0)`; ແລະ `pinResetAt DateTime?` (migration `20261016000000_member_pin_reset`, ເບິ່ງການຕັດສິນລຸ່ມນີ້).

### ກົດ

- PIN = ຕົວເລກ 6 ຕົວ.
- **ຕັ້ງ PIN ໄດ້ສະເພາະຜ່ານລິ້ງລັບຂອງບິນເວັບທີ່ຈ່າຍແລ້ວ** (`PAID` ຂຶ້ນໄປ) ຂອງລູກຄ້າຄົນນັ້ນ ແລະ ສະເພາະເມື່ອຍັງບໍ່ມີ PIN. ການຮູ້ເບີຢ່າງດຽວຕັ້ງ PIN ບໍ່ໄດ້. ລູກຄ້າທີ່ຊື້ຜ່ານແຊັດຢ່າງດຽວ ຕ້ອງສັ່ງເວັບ 1 ບິນກ່ອນຈຶ່ງມີບັນຊີ (ແຕ້ມສະສົມຢູ່ແລ້ວ ເພາະຜູກດ້ວຍເບີ).
- ເຂົ້າລະບົບຜິດ 5 ຄັ້ງຕິດກັນ → ລັອກ 15 ນາທີ (`429 MEMBER_LOCKED` + `retryAfterSeconds`). ສຳເລັດ = ລ້າງຕົວນັບ. ເບີບໍ່ມີ/ບໍ່ມີ PIN/PIN ຜິດ ຕອບຄືກັນ (`401 MEMBER_LOGIN_FAILED`). ມີ `StoreRateLimiter` ຕໍ່ IP ຕື່ມ.
- Session: JWT (HS256, `MEMBER_JWT_SECRET`, 30 ວັນ) `{ sub: customerId, pv: pinVersion }`. API ກວດ `pv` ກັບຄ່າປັດຈຸບັນ. Route handler ຂອງ storefront ເກັບເປັນ cookie `oca_member` (httpOnly, SameSite=Lax, Secure ໃນ production) ແລະ ແນບເປັນ `Authorization: Bearer` ຕອນສົ່ງຕໍ່ຫາ API; browser ບໍ່ເຫັນ token.
- ແອດມິນ reset PIN (`POST /crm/customers/:id/pin/reset`, `crm:write`): ລ້າງ `pinHash` + ຕົວນັບ/ລັອກ, `pinVersion + 1` (session ເກົ່າໃຊ້ບໍ່ໄດ້), `pinResetAt = now()`, ບັນທຶກ audit. ລູກຄ້າຕັ້ງໃໝ່ໄດ້ສະເພາະຈາກບິນເວັບທີ່ **ຈ່າຍຫຼັງ reset** (ບິນເກົ່າໃຊ້ບໍ່ໄດ້).
- ແລກແຕ້ມເທິງເວັບ: ຕ້ອງມີ session ແລະ ເບີໃນຟອມ checkout ຕ້ອງກົງກັບເບີຂອງສະມາຊິກ (ບໍ່ກົງ → `POINTS_INVALID (PHONE_MISMATCH)`; ບໍ່ມີ session → `401`).

### API `/store/*`

- `GET /store/config`: ເພີ່ມ `loyalty { enabled, pointsEarnPer, pointValue, maxRedeemPercent }`.
- `POST /store/orders/:token/pin { pin }`: ຕັ້ງ PIN + ເປີດ session. ມີ PIN ແລ້ວ → `409 PIN_ALREADY_SET`; ລູກຄ້າບໍ່ມີເບີ → `409`.
- `POST /store/member/login { phone, pin }`, `POST /store/member/logout`.
- `GET /store/member/me`: ຊື່, ເບີ, `pointsBalance`, `tier`, `spend12m`, `nextTier`, ທີ່ຢູ່ສົ່ງຫຼ້າສຸດ (ຊື່/ທີ່ຢູ່/courier/ສາຂາ ຈາກບິນເວັບຫຼ້າສຸດ) ສຳລັບເຕີມຟອມ.
- `GET /store/member/orders` (ບິນທຸກຊ່ອງທາງຂອງລູກຄ້າ; ມີ `token` ສະເພາະບິນເວັບ), `GET /store/member/points`.
- `POST /store/cart/check`: ຮັບ `pointsToRedeem?` (ມີ session) → `points { redeemed, discount, maxPoints } | null`, `pointsError`. ບໍ່ສົ່ງ `pointsToRedeem` + session ໃຊ້ບໍ່ໄດ້ (ຜິດ/ໝົດອາຍຸ/ຖືກ reset) = ກວດແບບ guest (`points: null`) ຄືກັບ `POST /store/orders`; ສົ່ງ `pointsToRedeem` ໂດຍບໍ່ມີ session ທີ່ໃຊ້ໄດ້ → `401 MEMBER_REQUIRED`.
- `POST /store/orders`: ຮັບ `pointsToRedeem?`.
- `GET /store/orders/:token`: ເພີ່ມ `points { redeemed, discount } | null`, `pointsEarned`, `pinSetup` (`AVAILABLE` = ຕັ້ງໄດ້ດຽວນີ້, `AFTER_PAYMENT` = ບິນລໍຈ່າຍ, `NONE`).

### UI storefront

- Header: ລິ້ງ "ບັນຊີ" (ໄອຄອນ; ມືຖືສະແດງແຕ່ໄອຄອນ). ບໍ່ສະແດງແຕ້ມໃນ header (header ບໍ່ອ່ານ session; ແຕ້ມເບິ່ງໄດ້ທີ່ `/account` ແລະ checkout).
- `/account`: ບໍ່ມີ session = ຟອມເບີ + PIN ພ້ອມຄຳອະທິບາຍວິທີໄດ້ບັນຊີ; ມີ session = ບັດແຕ້ມ + ລະດັບ + ແຖບຄວາມຄືບໜ້າຫາລະດັບຕໍ່ໄປ, ປະຫວັດບິນ, ປະຫວັດແຕ້ມ, ອອກຈາກລະບົບ.
- ໜ້າບິນ: ບັດຕັ້ງ PIN ເມື່ອ `pinSetup = AVAILABLE` (ຕັ້ງສຳເລັດ = ເຂົ້າລະບົບທັນທີ), ຂໍ້ຄວາມ "ຕັ້ງ PIN ໄດ້ຫຼັງຊຳລະເງິນ" ເມື່ອ `AFTER_PAYMENT`; ແຖວສ່ວນຫຼຸດຈາກແຕ້ມ; "ໄດ້ຮັບ N ແຕ້ມ" ຫຼັງຈ່າຍ.
- `/checkout`: ມີ session = ເຕີມຟອມ + ຊ່ອງ "ໃຊ້ແຕ້ມ" (ປຸ່ມ "ໃຊ້ສູງສຸດ"), ສະຫຼຸບສະແດງສ່ວນຫຼຸດ. ບໍ່ມີ session = guest checkout ຄືເກົ່າ.

### ການຕັດສິນລະຫວ່າງລົງມື D3 (2026-10-16)

- **ຕັ້ງ PIN ໄດ້ຈາກບິນເວັບທີ່ຈ່າຍແລ້ວເທົ່ານັ້ນ.** guest checkout ຮັບເບີໃດກໍໄດ້ (ບໍ່ມີ OTP) ຖ້າໃຫ້ຕັ້ງ PIN ຈາກບິນທີ່ຍັງບໍ່ຈ່າຍ ໃຜກໍສ້າງບິນດ້ວຍເບີຂອງຄົນອື່ນແລ້ວຍຶດບັນຊີ (ແຕ້ມ + ປະຫວັດ) ໄດ້ທັນທີ. ຄວາມສ່ຽງທີ່ເຫຼືອ (ຮັບໄດ້): ຄົນທີ່ຍອມຈ່າຍເງິນບິນໜຶ່ງພາຍໃຕ້ເບີຂອງຄົນອື່ນທີ່ຍັງບໍ່ມີ PIN ຍັງຍຶດບັນຊີນັ້ນໄດ້. ທາງແກ້ຈົນກວ່າຈະມີ SMS OTP: ເຈົ້າຂອງເບີແຈ້ງຮ້ານ → ແອດມິນ reset PIN (ມີ audit `customer.pin.reset`) → ເຈົ້າຂອງຕັ້ງໃໝ່ຈາກບິນທີ່ຈ່າຍແລ້ວຂອງຕົນ.
- **ກູ້ບັນຊີຫຼັງ reset ຕ້ອງໃຊ້ບິນໃໝ່ (`pinResetAt`).** ຖ້າຕັ້ງ PIN ໄດ້ຈາກບິນທີ່ຈ່າຍແລ້ວໃດກໍໄດ້ ຜູ້ຍຶດບັນຊີທີ່ຖືລິ້ງບິນເກົ່າ (ລວມທັງບິນທີ່ເຂົາຈ່າຍເອງພາຍໃຕ້ເບີຂອງເຈົ້າຂອງ) ຈະຕັ້ງ PIN ຄືນໄດ້ທັນທີຫຼັງແອດມິນ reset. ສະນັ້ນ ທຸກເຫດການທີ່ພະນັກງານເຮັດໃຫ້ PIN ໃຊ້ບໍ່ໄດ້ — reset PIN, ປ່ຽນ/ລ້າງເບີ, ລວມລູກຄ້າທີ່ຖິ້ມ PIN ຂອງ target — ຕັ້ງ `Customer.pinResetAt = now()` ໃນການບັນທຶກດຽວກັນ (ລວມລູກຄ້າເກັບຄ່າຫຼ້າສຸດຂອງທັງສອງຄົນ ເພາະບິນຂອງ source ຍ້າຍມາ). ຫຼັງຈາກນັ້ນ `POST /store/orders/:token/pin` ແລະ `pinSetup` ຮັບສະເພາະບິນທີ່ **`paidAt` ຫຼັງ `pinResetAt`** (ບິນທີ່ສ້າງກ່ອນແຕ່ຈ່າຍຫຼັງ reset ກໍໃຊ້ໄດ້; ບິນທີ່ບໍ່ມີ `paidAt` ໃຊ້ບໍ່ໄດ້); ບິນເກົ່າ → `409 ORDER_INVALID_STATE` ແລະ `pinSetup: "NONE"`. ເງື່ອນໄຂຢູ່ໃນ UPDATE ດຽວກັບການຕັ້ງ PIN ຈຶ່ງ reset ທີ່ເກີດພ້ອມກັນກໍຊະນະ. ຜົນ: **ເຈົ້າຂອງຕ້ອງສັ່ງ ແລະ ຈ່າຍບິນເວັບໃໝ່** ຈຶ່ງຕັ້ງ PIN ໄດ້. `pinResetAt` ບໍ່ຖືກສົ່ງໃຫ້ storefront ຫຼື CRM (ມີໃນ audit `customer.pin.reset`).
- **ຜິດ 5 ຄັ້ງຕິດກັນ → ລັອກ 15 ນາທີ** ຕໍ່ລູກຄ້າ (ເສີມດ້ວຍ rate limit ຕໍ່ IP `STORE_LOGIN_RATE_LIMIT`, ຄ່າເລີ່ມຕົ້ນ 20 ຕໍ່ 10 ນາທີ). ຂໍ້ແລກປ່ຽນທີ່ຮັບໄດ້: ຄຳຕອບ `429 MEMBER_LOCKED` ເປີດເຜີຍວ່າເບີນັ້ນມີ PIN, ແລະ ໃຜຮູ້ເບີຂອງສະມາຊິກກໍລັອກເຂົາໄດ້ 15 ນາທີ (ບໍ່ກະທົບການສັ່ງຊື້ແບບ guest ແລະ session ທີ່ເຂົ້າຢູ່ແລ້ວ). ການລັອກ **ບໍ່ເພີ່ມຂຶ້ນເລື້ອຍໆ**: ຕົວນັບກັບເປັນ 0 ຫຼັງລັອກແຕ່ລະເທື່ອ → ປະມານ 5 ຄັ້ງ / 15 ນາທີ ≈ 480 ຄັ້ງ/ວັນ ຕໍ່ເບີ (ຈາກຫຼາຍ IP) ທຽບກັບ PIN 10^6 ແບບ — ຮັບໄດ້ໃນຕອນນີ້, ທົບທວນເມື່ອມີ SMS OTP.
- **ກະແຈ session**: `MEMBER_JWT_SECRET` ບໍ່ບັງຄັບ. ບໍ່ຕັ້ງ = derive ຈາກ `JWT_ACCESS_SECRET` (HMAC-SHA256 ກັບ `"oca-member-session"`) ຈຶ່ງບໍ່ມີ env ໃໝ່ທີ່ບັງຄັບຕອນ deploy; ຕັ້ງ = ຕ້ອງຕ່າງຈາກ `JWT_ACCESS_SECRET`. token ສະມາຊິກມີ audience `member` ແລະ ໃຊ້ກະແຈຕ່າງຈາກ token ພະນັກງານ ຈຶ່ງໃຊ້ແທນກັນບໍ່ໄດ້. ຜົນຂ້າງຄຽງ: rotate `JWT_ACCESS_SECRET` = ສະມາຊິກທຸກຄົນອອກຈາກລະບົບ.
- **PIN ເປັນຂອງເບີ**: ພະນັກງານປ່ຽນເບີຂອງລູກຄ້າ → ລ້າງ PIN + `pinVersion + 1` + `pinResetAt` (ຟອມແກ້ໄຂເຕືອນກ່ອນ). ລວມລູກຄ້າ → PIN ທີ່ເຫຼືອຕ້ອງຖືກຕັ້ງພາຍໃຕ້ເບີທີ່ເຫຼືອ: target ຮັກສາ PIN ຂອງຕົນເມື່ອມີເບີ; ຮັບ PIN ຂອງ source ສະເພາະເມື່ອ target ບໍ່ມີທັງ PIN ແລະ ເບີ; ນອກນັ້ນ PIN ຖືກລ້າງ/ຖິ້ມ.
- **ແຕ້ມຕອນ checkout ຖືກປັດລົງເປັນສູງສຸດຂອງບິນ** (`maxPoints` ຈາກ `cart/check`, ຂຶ້ນກັບເພດານ % ແລະ ຍອດຫຼັງໂຄດ/Flash Sale) ພ້ອມຂໍ້ຄວາມ "ປັບເປັນ N (ສູງສຸດຂອງບິນນີ້)"; ຍອດປ່ຽນຈົນເກີນເພດານ → ປັດລົງອັດຕະໂນມັດ. ຕ້ອງກົດ "ໃຊ້" ໃຫ້ server ຢືນຢັນກ່ອນຈຶ່ງສົ່ງຄຳສັ່ງຊື້ໄດ້. ເບີໃນຟອມຕ້ອງກົງກັບເບີຂອງສະມາຊິກ.
- ອອກຈາກລະບົບເຮັດຢູ່ route ຂອງເວັບ (ລຶບ cookie, ບໍ່ເອີ້ນ API) ແລະ ປະຕິເສດຄຳຂໍຂ້າມ site (`Sec-Fetch-Site`, ຫຼື `Origin` ທຽບ `Host`). token ບໍ່ຖືກ revoke ຝັ່ງ server (ໝົດອາຍຸ 30 ວັນ ຫຼື ເມື່ອ `pinVersion` ປ່ຽນ).

## 5. ທົດສອບ

- shared: `pointsForAmount`, `maxRedeemablePoints`, `tierForSpend`, schema `tierRules`, `calculateOrderTotals` ກັບໂຄດ + ແຕ້ມ.
- database/api: ໄດ້ແຕ້ມຕາມຕົວຄູນ, ບໍ່ໄດ້ຊ້ຳ (pay ສອງເສັ້ນທາງ), ດຶງຄືນເມື່ອຍົກເລີກ, ແລກ + ເພດານ + ແຕ່ລະເຫດຜົນປະຕິເສດ, **ສອງບິນແຂ່ງໃຊ້ແຕ້ມ**, ຄືນແຕ້ມເມື່ອ `CANCELLED`/`EXPIRED` ຄັ້ງດຽວ, ລະດັບຂຶ້ນ/ລົງ + job, RFM (ຂອບຂອງແຕ່ລະຄະແນນ ແລະ ກຸ່ມ), ລວມລູກຄ້າ (ຍ້າຍຄົບ, ເບີຊ້ອນ, PIN), ສິດ, PIN (ຕັ້ງ, ຕັ້ງຊ້ຳ, ລັອກ, reset → session ເກົ່າຕາຍ), ເວັບແລກແຕ້ມ (ບໍ່ມີ session, ເບີບໍ່ກົງ).
- admin + storefront: component test; ກວດຈິງໃນ Chrome ທັງສອງແອັບ.

## 6. ການແບ່ງແຜນ

ການລວມລູກຄ້າຂອງ D1 ຍ້າຍສະເພາະບິນ ແລະ ແຊັດ; D2 ເພີ່ມການຍ້າຍແຕ້ມ + ຄິດລະດັບໃໝ່, D3 ເພີ່ມກົດ PIN. ແຖບ "ແຕ້ມ" ແລະ ບັດລະດັບຂອງໜ້າລູກຄ້າມາໃນ D2; `hasPin` ແລະ ປຸ່ມ reset PIN ມາໃນ D3.

D1 (schema + API + admin `/customers`) → D2 (loyalty engine + API + settings + ຟອມເປີດບິນ + worker job) → D3 (PIN/session + API ເວັບ + UI ເວັບ) → ອັບເດດ `ROADMAP.md`, `DATABASE.md`, `DEPLOYMENT-NOTES.md` (`MEMBER_JWT_SECRET`).

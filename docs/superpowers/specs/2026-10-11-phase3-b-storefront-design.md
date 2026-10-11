# Phase 3 ໂມດູນ 7: E-Commerce Storefront, sub-project 3b (ໜ້າຮ້ານສາທາລະນະ)

ວັນທີ: 2026-10-11 · ສະຖານະ: ສຳເລັດ (B1–B4). ຍັງບໍ່ໄດ້ smoke ໜ້າ admin ໃນ browser ຈິງ (ມີ test ຂອງ component + e2e ຂອງ API) · Branch: `phase3-storefront`

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ໃຫ້ລູກຄ້າເປີດເວັບຮ້ານ, ເລືອກສິນຄ້າ, ສັ່ງຊື້ໂດຍບໍ່ຕ້ອງສະໝັກ, ໂອນເງິນ ແລະ ອັບໂຫຼດສະລິບ, ແລ້ວຕິດຕາມບິນດ້ວຍລິ້ງລັບ. ບິນຈາກເວັບຕັດສະຕ໋ອກສູນກາງດຽວກັບແຊັດ ແລະ Live.

**ຢູ່ໃນ 3b**
- ໜ້າຫຼັກ, ລາຍການສິນຄ້າ (ໝວດໝູ່, ຄົ້ນຫາດ້ວຍຊື່, ແບ່ງໜ້າ), ໜ້າລາຍລະອຽດ (ເລືອກ variant, ສະຖານະສະຕ໋ອກ).
- ກະຕ່າໃນ browser, checkout ແບບ guest (ຊື່ + ເບີໂທ + ທີ່ຢູ່ + ບໍລິສັດຂົນສົ່ງ + ສາຂາປາຍທາງ).
- ໜ້າບິນ: ບັນຊີຮັບເງິນ, ໂມງນັບຖອຍຫຼັງ, ອັບໂຫຼດສະລິບ, ສະຖານະ, tracking.
- API ສາທາລະນະ `/store/*` ພ້ອມຈຳກັດຄວາມຖີ່ ແລະ ກັນການຈອງສະຕ໋ອກຖິ້ມ.
- SEO ພື້ນຖານ: metadata, Open Graph, `sitemap.xml`, `robots.txt`.
- Admin: ປ້າຍຊ່ອງທາງ "ເວັບ", ສະແດງ courier/ສາຂາທີ່ລູກຄ້າເລືອກ, ປ້າຍສະລິບ "ລູກຄ້າອັບໂຫຼດ".

**ບໍ່ຢູ່ໃນ 3b (ຕັດສິນແລ້ວ)**
- ບັນຊີສະມາຊິກ, ປະຫວັດບິນ, OTP → 3d CRM.
- ໂຄດສ່ວນຫຼຸດ, Flash Sale, ເຕືອນກະຕ່າຄ້າງ → 3c Promotion.
- ພາສາອື່ນນອກຈາກລາວ; ສະກຸນອື່ນນອກຈາກ LAK.
- COD (ຢູ່ກັບໂມດູນ Logistics), payment gateway, ຢືນຢັນ PAID ອັດຕະໂນມັດ.
- ຄິດຄ່າຂົນສົ່ງ: ລູກຄ້າຈ່າຍເອງຕອນຮັບ, `shippingFee = 0`.
- ຣີວິວ, ລາຍການທີ່ມັກ, ແຊັດໃນເວັບ, ແຈ້ງເຕືອນ SMS/ອີເມວ.

## 2. ຂໍ້ມູນ

Migration ໃໝ່ແບບເພີ່ມຢ່າງດຽວ:

| ບ່ອນ | ປ່ຽນ | ໝາຍເຫດ |
|---|---|---|
| `Order.publicToken` | `String? @unique` | 32 byte ສຸ່ມ (base64url), ສ້າງສະເພາະບິນຈາກເວັບ; ບິນເກົ່າ = null |
| `Order.shippingCourierId` | `String?` → `Courier` (`onDelete: SetNull`) | ທີ່ລູກຄ້າເລືອກ; ບໍ່ແມ່ນ `Shipment.courierId` (ທີ່ສົ່ງຈິງ) |
| `Order.shippingBranch` | `String?` (≤ 200) | ສາຂາປາຍທາງ, ຂໍ້ຄວາມອິດສະຫຼະ |
| `SlipSource` | ເພີ່ມ `STOREFRONT` | ສະລິບທີ່ລູກຄ້າອັບໂຫຼດຈາກໜ້າບິນ |

**ລູກຄ້າ:** ຊອກ `Customer` ດ້ວຍເບີໂທທີ່ normalize ແລ້ວ (ໃຊ້ກົດດຽວກັບ `createOrderSchema`). ບໍ່ພົບ = ສ້າງໃໝ່ດ້ວຍຊື່ທີ່ພິມ. ພົບ = ຜູກບິນ ແຕ່ **ບໍ່ແກ້ `Customer.name`**. ຊື່/ເບີ/ທີ່ຢູ່ທີ່ພິມເກັບໃນ `Order.shippingName/Phone/Address`.

**ສາງ:** ລາຍການໃຊ້ສາງ default ຄືກັບ `POST /orders` ທີ່ບໍ່ສົ່ງ `warehouseId`.

**ສະຕ໋ອກທີ່ຂາຍໄດ້** ຂອງ variant = `StockLevel.onHand - reserved` ໃນສາງ `isDefault` ທີ່ `isActive` (ສາງດຽວກັບທີ່ການສ້າງບິນຈອງ). ບໍ່ມີສາງ default = ທຸກສິນຄ້າເປັນ `OUT`. API ສາທາລະນະຄືນເປັນ 3 ຄ່າ: `IN_STOCK`, `LOW` (ພ້ອມຈຳນວນ ເມື່ອ ≤ 5), `OUT`.

## 3. API ສາທາລະນະ (ໂມດູນ `storefront`)

ທຸກເສັ້ນທາງ `@Public()`; `POST` ຖືກຈຳກັດຄວາມຖີ່ຕໍ່ IP (§6). DTO ແຍກຈາກ admin: **ຫ້າມມີ** `costPrice`, `unitCost`, SKU/ບາໂຄດ, ສະຕ໋ອກດິບ/ລາຍສາງ, `createdBy`, id ພາຍໃນຂອງລູກຄ້າ, `readRaw` ຂອງສະລິບ.

| Route | ໜ້າທີ່ |
|---|---|
| `GET /store/config` | ຊື່ຮ້ານ, `receivingAccounts`, `paymentInstructions`, `reservationMinutes`, courier ທີ່ `isActive` (id, name) |
| `GET /store/categories` | ຕົ້ນໄມ້ໝວດໝູ່ທີ່ມີສິນຄ້າ ACTIVE |
| `GET /store/products` | `?category=<slug>&q=&page=`; ສະເພາະ `Product.status=ACTIVE` ທີ່ມີ variant `isActive`; ຄືນ ຊື່, slug, ຮູບທຳອິດ, ລາຄາຕ່ຳສຸດ–ສູງສຸດ, `compareAtPrice`, ສະຖານະສະຕ໋ອກລວມ |
| `GET /store/products/:slug` | ລາຍລະອຽດ, options, variants (id, ຊື່, ລາຄາ, `compareAtPrice`, ສະຖານະສະຕ໋ອກ), ຮູບ; 404 ຖ້າບໍ່ ACTIVE |
| `POST /store/cart/check` | `{ items: [{ variantId, quantity }] }` → ລາຄາ, ຊື່, ຮູບ, ສະຖານະສະຕ໋ອກປັດຈຸບັນຕໍ່ລາຍການ + ຍອດລວມ; ລາຍການທີ່ຂາຍບໍ່ໄດ້ແລ້ວມີ `unavailable: true` |
| `POST /store/orders` | header `Idempotency-Key` (ບັງຄັບ); body ລຸ່ມນີ້ → `{ orderNumber, token }` |
| `GET /store/orders/:token` | ເລກບິນ, ສະຖານະ (`EXPIRED` ທັນທີເມື່ອເກີນເວລາຈອງ), ລາຍການ, ຍອດ, `reservedUntil`, ຂໍ້ມູນຈັດສົ່ງ, ສະລິບ (ສະຖານະ `REVIEWING`/`CONFIRMED`/`REJECTED` + ເວລາ; ບໍ່ມີ id), tracking (ຊື່ courier, ເລກ, URL) |
| `POST /store/orders/:token/slips` | multipart ຮູບ 1 ໄຟລ໌; ກວດ MIME/ຂະໜາດ/magic bytes ດ້ວຍ code ເດີມ; ສ້າງ `PaymentSlip` (`source=STOREFRONT`) ເຂົ້າຄິວ `slips`; ຕອບ `{ status: "REVIEWING" }` |

**Body ຂອງ `POST /store/orders`:** `items[]` (`variantId`, `quantity`), `name`, `phone`, `address`, `courierId`, `branch`, `note?`, `expectedTotal`. Server ຄິດລາຄາເອງ; ຖ້າຍອດບໍ່ຕົງ `expectedTotal` → `409 PRICE_CHANGED` ພ້ອມຍອດໃໝ່ (ບໍ່ສ້າງບິນ).

**ການສ້າງບິນ:** `StoreOrdersService` ເອີ້ນ `OrdersService.createFromStorefront` ໂດຍ `createdById = null`, `channel=STOREFRONT`, `source=WEB_CHECKOUT`, `currency=LAK`, `shippingFee=0`, `discount=0`. ການປ່ຽນໃນ `OrdersService`: ແຍກສ່ວນ "ສ້າງໃນ transaction" ໃຫ້ຮັບ actor ທີ່ເປັນ null ໄດ້ (audit `userId = null`, action `order.create`, ບັນທຶກ ip). ບໍ່ປ່ຽນພຶດຕິກຳຂອງ `POST /orders`.

**ສະລິບ:** ຮັບໄດ້ເມື່ອບິນ `PENDING_PAYMENT` ເທົ່ານັ້ນ; ສູງສຸດ 3 ໃບທີ່ບໍ່ຖືກ `REJECTED` ຕໍ່ບິນ. ບໍ່ມີເສັ້ນທາງສາທາລະນະສຳລັບຮູບສະລິບ.

## 4. ໜ້າເວັບ (`apps/storefront`)

| Path | ເນື້ອຫາ | Render |
|---|---|---|
| `/` | ສິນຄ້າໃໝ່, ໝວດໝູ່ | server ຕອນມີຄຳຂໍ, ຂໍ້ມູນ cache 60 ວິ |
| `/products` | ລາຍການ + ຕົວກັ່ນຕອງໝວດໝູ່ + ຄົ້ນຫາ + ແບ່ງໜ້າ | server ຕອນມີຄຳຂໍ, ຂໍ້ມູນ cache 60 ວິ |
| `/products/[slug]` | ຮູບ, ເລືອກ variant, ລາຄາ, ສະຖານະສະຕ໋ອກ, ໃສ່ກະຕ່າ | server (ຂໍ້ມູນສິນຄ້າ) + client (ສະຕ໋ອກສົດ) |
| `/cart` | ແກ້ຈຳນວນ/ລຶບ, ຍອດຈາກ `cart/check` | client |
| `/checkout` | ຟອມ + ສະຫຼຸບ + ຢືນຢັນ | client |
| `/orders/[token]` | ໜ້າບິນ | server, ບໍ່ cache, `noindex` |

- ການເອີ້ນ API: ຝັ່ງ server ໃຊ້ `API_URL`; ຝັ່ງ client ຜ່ານ route handler `/api/store/*` ຂອງເວັບ ທີ່ສົ່ງຕໍ່ພ້ອມ `X-Forwarded-For` (rewrite ຂອງ Next ບໍ່ແນບ IP ລູກຄ້າ ຈຶ່ງໃຊ້ກັບ rate limit ບໍ່ໄດ້). ຮູບ `/media/*` ຍັງໃຊ້ rewrite.
- ກະຕ່າ: `localStorage` ເກັບ `[{ variantId, quantity }]` ເທົ່ານັ້ນ; ຂໍ້ມູນສະແດງມາຈາກ `cart/check`. ຖ້າອ່ານ `localStorage` ບໍ່ໄດ້ ກະຕ່າຢູ່ໃນ memory ຂອງ session ນັ້ນ.
- `Idempotency-Key` ສ້າງຕອນເປີດໜ້າ checkout ແລະ ໃຊ້ຄືເກົ່າຈົນສັ່ງສຳເລັດ.
- ໃຊ້ component ຈາກ `@oca/ui`; ມືຖືກ່ອນ (ຈໍ 360 px ໃຊ້ໄດ້ຄົບ).
- ໜ້າບິນ poll ສະຖານະທຸກ 15 ວິ ຕອນ `PENDING_PAYMENT`.

## 5. ກໍລະນີຜິດພາດ

| ເຫດການ | ພຶດຕິກຳ |
|---|---|
| ສະຕ໋ອກບໍ່ພໍຕອນສັ່ງ | `409 INSUFFICIENT_STOCK` ພ້ອມ `shortages: [{ variantId, requested, available }]`; ບໍ່ສ້າງບິນ; ໜ້າ checkout ໃຫ້ປັບກະຕ່າ |
| ລາຄາປ່ຽນ | `409 PRICE_CHANGED`; ສະແດງຍອດໃໝ່ ແລ້ວລູກຄ້າຢືນຢັນອີກຄັ້ງ |
| ສິນຄ້າຖືກປິດຂາຍ | `cart/check` ໝາຍ `unavailable`; ກົດສັ່ງບໍ່ໄດ້ຈົນກວ່າລຶບອອກ |
| ສັ່ງຊ້ຳ / ເນັດຫຼຸດ | key ເດີມ + payload ເດີມ = ຄືນບິນເດີມ |
| ບິນໝົດເວລາ | ໜ້າບິນສະແດງ "ໝົດອາຍຸ", ປິດອັບໂຫຼດ, ປຸ່ມ "ສັ່ງໃໝ່" ເຕີມກະຕ່າຈາກລາຍການເດີມ |
| ອັບໂຫຼດສະລິບລົ້ມ | ຂໍ້ຄວາມຕາມສາເຫດ (ປະເພດໄຟລ໌, ຂະໜາດ, ເກີນ 3 ໃບ, ບິນບໍ່ຢູ່ສະຖານະລໍຈ່າຍ); ລອງໃໝ່ໄດ້ |
| ສະລິບຖືກປະຕິເສດ | ໜ້າບິນບອກ ແລະ ເປີດໃຫ້ອັບໂຫຼດໃໝ່ |
| token ບໍ່ມີ | 404 ແບບດຽວກັນທຸກກໍລະນີ |
| ເກີນຄວາມຖີ່ | `429`; ເວັບສະແດງ "ກະລຸນາລອງໃໝ່ພາຍຫຼັງ" |

## 6. ຄວາມປອດໄພ ແລະ ຂໍ້ຈຳກັດ

- ຈຳກັດຄວາມຖີ່ຕໍ່ IP (ໃນ memory, ຕັ້ງໄດ້ດ້ວຍ env `STORE_*_RATE_LIMIT`): ສ້າງບິນ 5 ຄັ້ງ/10 ນາທີ; ອັບໂຫຼດສະລິບ 10 ຄັ້ງ/10 ນາທີ; ກວດກະຕ່າ 60 ຄັ້ງ/ນາທີ. `GET` ບໍ່ຖືກຈຳກັດທີ່ API ເພາະເວັບ render ຝັ່ງ server (ທຸກຄຳຂໍອ່ານມາຈາກ IP ຂອງ Next ເຄື່ອງດຽວ) ແລະ ມີ cache. ອີງ `TRUST_PROXY` ທີ່ມີຢູ່ ເພື່ອໄດ້ IP ຈິງ.
- ກັນຈອງສະຕ໋ອກຖິ້ມ: ສູງສຸດ 2 ບິນ `PENDING_PAYMENT` ຈາກເວັບຕໍ່ເບີໂທ (`409 TOO_MANY_OPEN_ORDERS`); ສູງສຸດ 20 ລາຍການ ແລະ 20 ອັນຕໍ່ລາຍການ.
- `publicToken` 256 bit; ປຽບທຽບຜ່ານ unique lookup; ບໍ່ log token.
- ຂໍ້ຄວາມຈາກລູກຄ້າ (ຊື່, ທີ່ຢູ່, ໝາຍເຫດ) ເປັນ untrusted: ຈຳກັດຄວາມຍາວ, render ເປັນ text ເທົ່ານັ້ນ ທັງໃນເວັບ ແລະ admin.
- CORS: ບໍ່ເປີດ; ເວັບເອີ້ນຜ່ານ rewrite ຂອງຕົນ.
- ຂໍ້ຈຳກັດທີ່ຍອມຮັບ: ຜູ້ມີລິ້ງບິນເຫັນຊື່/ທີ່ຢູ່/ລາຍການຂອງບິນນັ້ນ; ເບີໂທບໍ່ຖືກຢືນຢັນ (ບິນປອມໝົດອາຍຸເອງ); ຈຳກັດຕໍ່ IP ຫຼົບໄດ້ດ້ວຍຫຼາຍ IP; cache 60 ວິ ເຮັດໃຫ້ລາຄາໃນໜ້າລາຍການຊ້າໄດ້ (checkout ກວດສົດ).

## 7. Admin

- ລາຍການບິນ ແລະ ໜ້າບິນ: ປ້າຍຊ່ອງທາງ "ເວັບ" ສຳລັບ `STOREFRONT`.
- ໜ້າບິນ: ສະແດງ courier + ສາຂາທີ່ລູກຄ້າເລືອກ; dialog ສົ່ງອອກຕື່ມ courier ນັ້ນໄວ້ກ່ອນ (ແກ້ໄດ້).
- ໃບປະໜ້າ: ເພີ່ມ courier + ສາຂາປາຍທາງທີ່ລູກຄ້າເລືອກ ຖ້າມີ. API ຂອງ admin (`GET /orders/:id`, `GET /fulfillment/:orderId`) ຄືນ `preferredCourier` ແລະ `shippingBranch`.
- Slip panel: ປ້າຍ "ລູກຄ້າອັບໂຫຼດ" ສຳລັບ `source=STOREFRONT`.
- ບໍ່ມີສິດໃໝ່: ໃຊ້ `orders:*`, `payments:*`, `logistics:*` ທີ່ມີ.

## 8. ທົດສອບ

- shared: schema ຂອງ `/store/*` (ຂອບເຂດ, phone, ຄວາມຍາວ).
- api: ທຸກ route; ບໍ່ມີ field ຕ້ອງຫ້າມໃນ DTO (ກວດດ້ວຍ sweep ຂອງ key); ສິນຄ້າ DRAFT/ARCHIVED ບໍ່ອອກ; `PRICE_CHANGED`; `INSUFFICIENT_STOCK`; ສອງ request ແຂ່ງຊື້ອັນສຸດທ້າຍ = ສຳເລັດດຽວ; idempotency replay; ເພດານບິນຄ້າງຕໍ່ເບີ; ສະລິບ (ສະຖານະບິນ, ເພດານ 3 ໃບ, ໄຟລ໌ຜິດ); token ຜິດ = 404; throttle.
- storefront: component ກະຕ່າ, ຟອມ checkout, ໜ້າບິນ (ແຕ່ລະສະຖານະ), ຕົວເລືອກ variant, `localStorage` ໃຊ້ບໍ່ໄດ້.
- admin: ປ້າຍຊ່ອງທາງ, courier ທີ່ຕື່ມໄວ້, ປ້າຍສະລິບ.
- smoke ໃນ Chrome ຈິງ ດ້ວຍຖານແຍກ ແລະ `API_URL` ທີ່ຕັ້ງຕອນ build (ຕາມບົດຮຽນຈາກ slip): ເບິ່ງສິນຄ້າ → ສັ່ງ → ອັບໂຫຼດສະລິບ → ແອດມິນຢືນຢັນ → ໜ້າບິນເປັນ "ຈ່າຍແລ້ວ" → ສົ່ງອອກ → ເຫັນ tracking.

## 9. ການແບ່ງແຜນ

| ແຜນ | ເນື້ອຫາ |
|---|---|
| B1 | migration, schema ໃນ `@oca/shared`, ໂມດູນ `storefront` (ທຸກ route), ການປ່ຽນ `OrdersService`, throttle |
| B2 | ໂຄງ storefront (layout, API client, rewrite), `/`, `/products`, `/products/[slug]`, SEO |
| B3 | ກະຕ່າ, `/cart`, `/checkout`, `/orders/[token]` + ອັບໂຫຼດສະລິບ |
| B4 | ສ່ວນ admin, ໃບປະໜ້າ, smoke, ອັບເດດ ROADMAP + DEPLOYMENT-NOTES |

## 10. ການຕັດສິນໃຈທີ່ບັນທຶກ (2026-10-11)

| ຫົວຂໍ້ | ຕັດສິນ |
|---|---|
| ຕົວຕົນລູກຄ້າ | guest checkout; ຈັບຄູ່ `Customer` ດ້ວຍເບີ; ບັນຊີສະມາຊິກຕໍ່ຍອດໃນ 3d |
| ຄ່າຂົນສົ່ງ | ລູກຄ້າເລືອກ courier + ສາຂາ, ຈ່າຍເອງຕອນຮັບ; ບິນມີແຕ່ຄ່າສິນຄ້າ |
| ການຈ່າຍເງິນ | ໂອນ + ອັບໂຫຼດສະລິບ; ແອດມິນຢືນຢັນ |
| ພາສາ / ສະກຸນ | ລາວ / LAK ເທົ່ານັ້ນ |
| ໂດເມນ | ຍັງບໍ່ມີ; ພັດທະນາ ແລະ ທົດສອບໃນເຄື່ອງ, ຕັ້ງຕອນ deploy |

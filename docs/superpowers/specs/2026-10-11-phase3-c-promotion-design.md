# Phase 3 ໂມດູນ 5: Promotion & Marketing, sub-project 3c

ວັນທີ: 2026-10-11 · ສະຖານະ: ອະນຸມັດແລ້ວ, ກຳລັງລົງມື C1 · Branch: `phase3-promotion`

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

| ສ່ວນ | ເນື້ອຫາ |
|---|---|
| **C1 ໂຄດສ່ວນຫຼຸດ** | ແອດມິນສ້າງໂຄດ; ໃຊ້ໄດ້ໃນ checkout ຂອງເວັບ ແລະ ຟອມເປີດບິນຂອງ admin |
| **C2 Flash Sale** | ແຄມເປນຕາມເວລາ + ລາຄາພິເສດຕໍ່ variant, ມີຜົນທຸກຊ່ອງທາງ (ເວັບ, ແຊັດ, CF) |
| **C3 ເຕືອນບິນຄ້າງຈ່າຍ** | ຂໍ້ຄວາມ Messenger ເທື່ອດຽວກ່ອນໝົດເວລາຈອງ ສຳລັບບິນທີ່ຜູກກັບແຊັດ |

**ບໍ່ຢູ່ໃນ 3c (ຕັດສິນແລ້ວ):** Bundle / 1 ແຖມ 1, ໂຄດສະເພາະສິນຄ້າ/ໝວດໝູ່, ໂຄດສົ່ງຟຣີ, ໂຄຕ້າຈຳນວນຕໍ່ສິນຄ້າໃນ Flash Sale, ເຕືອນບິນຈາກເວັບ (ບໍ່ມີຊ່ອງທາງ: ບໍ່ມີ SMS), ກະຕ່າຄ້າງຂອງເວັບ, ໂຄດໃນບິນ CF.

## 2. C1 ໂຄດສ່ວນຫຼຸດ

### ຂໍ້ມູນ (migration ເພີ່ມຢ່າງດຽວ)

`Coupon`: `code` (unique, ເກັບເປັນຕົວພິມໃຫຍ່), `type` (`PERCENT` \| `FIXED`), `value` (% 1–100 ຫຼື ຈຳນວນເງິນ), `maxDiscount?` (ເພດານຂອງ %), `minSubtotal` (0 = ບໍ່ມີ), `startsAt?`, `endsAt?`, `usageLimit?` (ລວມ), `perPhoneLimit?`, `isActive`, `note?`.

`Order`: `couponId?` (→ `Coupon`, `Restrict`), `couponCode?` (snapshot), `couponDiscount` (default 0).

### ກົດ

- ບິນໜຶ່ງໃຊ້ໄດ້ໂຄດດຽວ. ໂຄດຫຼຸດຈາກຍອດຄ່າສິນຄ້າ (ຜົນລວມລາຍການຫຼັງສ່ວນຫຼຸດລາຍການ); ບໍ່ກ່ຽວກັບຄ່າສົ່ງ. ໃຊ້ຮ່ວມກັບລາຄາ Flash Sale ໄດ້.
- `PERCENT`: `floor(ຍອດ × value / 100)` (ປັດລົງເປັນໜ່ວຍເຕັມ ເພື່ອບໍ່ໃຫ້ຍອດໂອນມີເສດ) ແລ້ວບີບດ້ວຍ `maxDiscount`. `FIXED`: `min(value, ຍອດ)`.
- ເງິນໃນບິນ: `subtotal = ຜົນລວມລາຍການ − couponDiscount`; `discountTotal = ສ່ວນຫຼຸດລາຍການ + couponDiscount`. ສູດຂອງ Analytics (`gross = subtotal + discountTotal`, `revenue = total − VAT`) ຈຶ່ງຖືກໂດຍບໍ່ຕ້ອງແກ້. ຂໍ້ຈຳກັດ: ລາຍງານ "ສິນຄ້າຂາຍດີ" ຄິດຈາກ `lineTotal` ຈຶ່ງບໍ່ຫັກສ່ວນຫຼຸດຂອງໂຄດ.
- ການນັບ: ຈຳນວນບິນທີ່ມີ `couponId` ນີ້ ແລະ ສະຖານະບໍ່ແມ່ນ `CANCELLED`/`EXPIRED` (ສິດຄືນເອງ). `perPhoneLimit` ນັບຕາມເບີຂອງລູກຄ້າໃນບິນ; ບິນທີ່ບໍ່ມີເບີ ໃຊ້ໂຄດທີ່ມີ `perPhoneLimit` ບໍ່ໄດ້.
- ກວດ ແລະ ນັບພາຍໃນ transaction ຂອງການສ້າງບິນ ພາຍໃຕ້ advisory lock ຕໍ່ໂຄດ (ສອງຄຳຂໍແຂ່ງສິດສຸດທ້າຍ = ສຳເລັດດຽວ).
- ປະຕິເສດ = `409 COUPON_INVALID` ພ້ອມ `reason`: `NOT_FOUND`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `MIN_SUBTOTAL` (+ `minSubtotal`), `USAGE_LIMIT`, `PHONE_LIMIT`, `PHONE_REQUIRED`. ບໍ່ສ້າງບິນ.
- ໂຄດບໍ່ຖືກລຶບ (ປິດດ້ວຍ `isActive`); ແກ້ `code`/`type`/`value` ບໍ່ໄດ້ຫຼັງຖືກໃຊ້ແລ້ວ.

### API

- Admin (`promotion:read`/`promotion:write`): `GET /coupons` (ພ້ອມ `usedCount`), `POST /coupons`, `PATCH /coupons/:id`, `POST /coupons/preview` (`{ code, subtotal, phone? }` → `{ code, discount }` ຫຼື `COUPON_INVALID`).
- `POST /orders`: ຮັບ `couponCode?`. `GET /orders/:id`: ມີ `couponCode`, `couponDiscount`.
- ເວັບ: `POST /store/cart/check` ຮັບ `couponCode?` → `coupon: { code, discount } | null`, `couponError: reason | null` (ບໍ່ກວດ `perPhoneLimit` ເພາະຍັງບໍ່ຮູ້ເບີ); `POST /store/orders` ຮັບ `couponCode?`; `GET /store/orders/:token` ມີ `coupon: { code, discount } | null`.

### UI

- Admin `/promotions` (ແຖບ "ໂຄດສ່ວນຫຼຸດ"): ຕາຕະລາງ (ລະຫັດ, ສ່ວນຫຼຸດ, ເງື່ອນໄຂ, ໄລຍະ, ໃຊ້ແລ້ວ/ຈຳກັດ, ສະຖານະ), dialog ສ້າງ/ແກ້, ປຸ່ມເປີດ/ປິດ. ຟອມເປີດບິນ: ຊ່ອງໂຄດ + ປຸ່ມ "ໃຊ້" (preview). ໜ້າບິນ: ໂຄດ + ຍອດທີ່ຫຼຸດ.
- ເວັບ `/checkout`: ຊ່ອງໂຄດ + ປຸ່ມ "ໃຊ້"; ສະຫຼຸບສະແດງສ່ວນຫຼຸດ ແລະ ຍອດໃໝ່; ເຫດຜົນເມື່ອໃຊ້ບໍ່ໄດ້. ໜ້າບິນສະແດງສ່ວນຫຼຸດ.

## 3. C2 Flash Sale

### ຂໍ້ມູນ

`FlashSale`: `name`, `startsAt`, `endsAt`, `isActive`. `FlashSaleItem`: `flashSaleId`, `variantId`, `salePrice`; `@@unique([flashSaleId, variantId])`. `OrderItem.flashSaleId?` (ບັນທຶກວ່າຂາຍໃນແຄມເປນໃດ).

### ກົດ

- ແຄມເປນ "ກຳລັງດຳເນີນ" = `isActive` ແລະ `startsAt <= now < endsAt`.
- variant ດຽວຢູ່ໃນແຄມເປນທີ່ເວລາຊ້ອນກັນບໍ່ໄດ້ (ກວດຕອນບັນທຶກ → `409`).
- `salePrice` ຕ້ອງ `> 0` ແລະ `<` ລາຄາປົກກະຕິ ຕອນບັນທຶກ. ຖ້າລາຄາປົກກະຕິຖືກແກ້ພາຍຫຼັງຈົນຕ່ຳກວ່າ `salePrice` ຈະໃຊ້ລາຄາທີ່ຕ່ຳກວ່າ.
- **ຈຸດດຽວຂອງລາຄາ:** ຟັງຊັນ `effectivePrices(db, variantIds, now)` ໃນ `@oca/database` ຄືນ `{ price, regularPrice, flashSaleId, saleEndsAt }`. ທຸກບ່ອນທີ່ອ່ານລາຄາຂາຍຕ້ອງໃຊ້ຟັງຊັນນີ້: ການສ້າງບິນ (`POST /orders`, ເວັບ, CF), ການເພີ່ມລາຍການ CF, ຄົ້ນ variant ຂອງຟອມເປີດບິນ, API ສາທາລະນະຂອງເວັບ.
- ລາຄາລັອກຕອນສ້າງບິນ (`OrderItem.unitPrice`).

### API ແລະ UI

- Admin: `GET/POST /flash-sales`, `PATCH /flash-sales/:id` (ລວມລາຍການ). `/promotions` ແຖບ "Flash Sale": ລາຍການ + ສະຖານະ (ຍັງບໍ່ເລີ່ມ/ກຳລັງດຳເນີນ/ຈົບແລ້ວ/ປິດ), dialog ພ້ອມຕົວເລືອກ variant ແລະ ລາຄາພິເສດ.
- ເວັບ: DTO ສິນຄ້າມີ `saleEndsAt`; `compareAtPrice` ເປັນລາຄາປົກກະຕິລະຫວ່າງແຄມເປນ. ບັດສິນຄ້າມີປ້າຍ "Flash Sale"; ໜ້າລາຍລະອຽດມີໂມງນັບຖອຍຫຼັງ.
- cache 60 ວິ ຂອງເວັບ: ຂອບເວລາເລີ່ມ/ຈົບຊ້າໄດ້ເຖິງ 1 ນາທີໃນໜ້າລາຍການ; checkout ໃຊ້ລາຄາຈິງ ແລະ ໃຊ້ກົນໄກ `PRICE_CHANGED` ທີ່ມີຢູ່.

## 4. C3 ເຕືອນບິນຄ້າງຈ່າຍ

- `StoreSetting.paymentReminderMinutes Int?` (null = ປິດ; 1–1440). `Order.paymentReminderStatus` (`NONE` \| `SENT` \| `FAILED`), `paymentReminderAt?`.
- ຕົວກວດຕາມເວລາໃນ API (ແບບດຽວກັບຕົວລົງໂພສ): ບິນ `PENDING_PAYMENT` ທີ່ມີ `conversationId`, `paymentReminderStatus = NONE` ແລະ `now >= reservedUntil − N ນາທີ` ແລະ `now < reservedUntil` → ອ້າງສິດດ້ວຍ `UPDATE ... WHERE status = NONE` ກ່ອນສົ່ງ (ກັນສົ່ງຊ້ຳ) → ສົ່ງຂໍ້ຄວາມ → ບັນທຶກ `SENT`/`FAILED`. ບໍ່ລອງຊ້ຳ.
- ຂໍ້ຄວາມ: ເລກບິນ, ຍອດ, ນາທີທີ່ເຫຼືອ, `paymentInstructions`.
- `/settings`: ເປີດ/ປິດ + ນາທີ. ໜ້າບິນ: ສະຖານະການເຕືອນ.
- ຂໍ້ຈຳກັດ: ນອກ 24 ຊມ ຂອງ Messenger ສົ່ງບໍ່ໄດ້ (ບັນທຶກ `FAILED`); ການແກ້ເວລາຈອງ ຫຼື CF ທີ່ເພີ່ມລາຍການ (ຣີເຊັດເວລາຈອງ) ບໍ່ສົ່ງເຕືອນຊ້ຳ.

## 5. ທົດສອບ

- shared: schema, `computeCouponDiscount`, `calculateOrderTotals` ກັບ `orderDiscount`.
- api: ແຕ່ລະເຫດຜົນປະຕິເສດ, ການນັບ + ຄືນສິດ, ການແຂ່ງສິດສຸດທ້າຍ, ເງິນໃນບິນ + analytics invariant, ສິດ, ເວັບ (preview/ສັ່ງ/ໜ້າບິນ); Flash Sale: ຂອບເວລາ, ຊ້ອນກັນ, ທຸກເສັ້ນທາງສ້າງບິນໃຊ້ລາຄາດຽວກັນ; reminder: ເງື່ອນໄຂເວລາ, ສົ່ງຄັ້ງດຽວ, FAILED.
- admin + storefront: component test; ກວດຈິງໃນ Chrome ສຳລັບເວັບ.

## 6. ການແບ່ງແຜນ

C1a (schema + shared + API) → C1b (admin + ເວັບ) → C2a (API + ຈຸດດຽວຂອງລາຄາ) → C2b (admin + ເວັບ) → C3.

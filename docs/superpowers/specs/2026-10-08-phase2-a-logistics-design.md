# Phase 2 ໂມດູນ 8: Smart Logistics Hub, sub-project 8a (ແພັກ → ສົ່ງ → ແຈ້ງລູກຄ້າ)

ວັນທີ: 2026-10-08 · ສະຖານະ: ສຳເລັດ (8a-1 + 8a-2) · Branch: ຕໍ່ຈາກ `main` (Phase 1 ຂໍ້ 1–3)

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ໃຫ້ພະນັກງານສາງແພັກບິນທີ່ຈ່າຍແລ້ວໂດຍຍິງບາໂຄດກວດກ່ອນປິດກ່ອງ, ພິມໃບປະໜ້າ 100×150 mm, ໃສ່ບໍລິສັດຂົນສົ່ງ + ເລກ tracking ແລ້ວສົ່ງອອກ, ແລະ ແຈ້ງລູກຄ້າທາງແຊັດອັດຕະໂນມັດ.

**ຢູ່ໃນ 8a:** Courier (ຕັ້ງເອງ), Shipment ຕໍ່ບິນ, ລາຍການລໍແພັກ, Scan-to-Pack (ເຄື່ອງຍິງ + ກ້ອງ), override ດ້ວຍເຫດຜົນ, ແກ້ຂໍ້ມູນຜູ້ຮັບ, ໃບປະໜ້າ (ພິມທີລະໃບ/ຫຼາຍໃບ), ສົ່ງອອກພ້ອມ tracking, ແຈ້ງ tracking ທາງ Messenger + ສົ່ງໃໝ່/copy.

**ບໍ່ຢູ່ໃນ 8a:** API ຂອງບໍລິສັດຂົນສົ່ງ (ອອກແບບໃຫ້ເພີ່ມພາຍຫຼັງ: `Courier.code` ເປັນຈຸດຜູກ adapter), ເລືອກສາງອັດຕະໂນມັດ, COD, ຕິດຕາມສະຖານະພັດສະດຸ, ບັນທຶກການພິມໃບປະໜ້າ.

## 2. ກະແສ (ໃຊ້ສະຖານະບິນເດີມ)

`PAID` → ເລີ່ມແພັກ (`PACKING`, ສ້າງ Shipment) → ຍິງກວດຄົບ (`verifiedAt`) ຫຼື override → ໃບປະໜ້າ → ສົ່ງອອກ (courier + tracking; `SHIPPED` + ຕັດສະຕ໋ອກ ໃນ transaction ດຽວກັບການບັນທຶກ Shipment) → ແຈ້ງລູກຄ້າ (ຫຼັງ commit, ລົ້ມບໍ່ກະທົບການສົ່ງ).

ປຸ່ມ ship ເດີມໃນໜ້າລາຍລະອຽດບິນ (admin) ປ່ຽນເປັນລິ້ງໄປໜ້າແພັກ; endpoint `POST /orders/:id/ship` ເດີມຍັງຢູ່ (ບໍ່ສ້າງ Shipment) ເພື່ອບໍ່ທຳລາຍ client ເກົ່າ.

## 3. ຂໍ້ມູນ (migration ເພີ່ມຢ່າງດຽວ)

- `Courier`: `id`, `code` (unique, ຕົວໃຫຍ່ A–Z0–9_-, ≤20), `name` (≤100), `trackingUrlTemplate?` (https ແລະ ຕ້ອງມີ `{tracking}`), `isActive` (default true), timestamps.
- `Shipment`: `id`, `orderId` unique (FK Cascade), `courierId?` (FK Restrict), `trackingNumber?` (≤100), `packedById?`/`packedAt?`, `verifiedAt?`, `verifyOverrideReason?` (≤300), `verifiedById?`, `shippedById?`/`shippedAt?`, `notifyStatus` (`NONE | SENT | FAILED | MANUAL`, default NONE), `notifyErrorCode?`, `notifiedAt?`, timestamps. index `[courierId]`.
- ບໍ່ແຕະ `Order` (ໃຊ້ `shippingName/Phone/Address` ເດີມ).

## 4. API (`logistics`)

ສິດ: ອ່ານ `logistics:read`, ຂຽນ `logistics:write`; override ການກວດຕ້ອງມີ `orders:write` ນຳ (WAREHOUSE ບໍ່ມີ → ຕ້ອງໃຫ້ຜູ້ຈັດການ). ທຸກ route ເຂົ້າ permission sweep.

- **Couriers:** `GET /couriers` (ລວມທີ່ປິດ), `POST /couriers`, `PATCH /couriers/:id`. code ຊ້ຳ → `DUPLICATE_VALUE`.
- `GET /fulfillment?status=PAID|PACKING&warehouseId&q&page&pageSize`: ບິນ PAID/PACKING (ລຽງ `paidAt` ເກົ່າ→ໃໝ່), `q` ຄົ້ນເລກບິນ/ຊື່/ເບີ ລູກຄ້າ; ແຖວ: ເລກບິນ, ສະຖານະ, ລູກຄ້າ, ຈຳນວນຊິ້ນ, `paidAt`, ມີທີ່ຢູ່ບໍ່, ກວດຄົບແລ້ວບໍ່.
- `GET /fulfillment/:orderId`: ບິນ (ເລກ, ສະຖານະ, ລູກຄ້າ, ຜູ້ຮັບ, ໝາຍເຫດ), ລາຍການ (`sku`, `barcode`, ຊື່, ຈຳນວນ, ສາງ), shipment (courier, tracking, ລິ້ງຕິດຕາມ, ກວດ/override, ຜູ້ແພັກ/ຜູ້ສົ່ງ + ເວລາ, ສະຖານະແຈ້ງ), `notifyText` (ເມື່ອ SHIPPED), `storeName` (ໃບປະໜ້າ). ບິນທີ່ບໍ່ມີ shipment ແລະ ບໍ່ແມ່ນ PAID/PACKING ກໍອ່ານໄດ້ (ໃບປະໜ້າຊ້ຳ).
- `POST /fulfillment/:orderId/start`: PAID → PACKING (ຜ່ານ `OrdersService.pack`) + ສ້າງ Shipment (`packedBy/At`). PACKING ຢູ່ແລ້ວ = idempotent.
- `POST /fulfillment/:orderId/verify` body `{ scans: [{ code, quantity }] }`: ຕ້ອງ PACKING; `code` ຈັບຄູ່ barcode ຫຼື SKU (ບໍ່ສົນຕົວໃຫຍ່/ນ້ອຍ) ຂອງ variant ໃນບິນ; ຜົນລວມຕໍ່ variant ຕ້ອງເທົ່າກັບຈຳນວນໃນບິນທຸກແຖວ ແລະ ບໍ່ມີ code ນອກບິນ → `verifiedAt`. ບໍ່ກົງ → 409 `PACK_MISMATCH` ພ້ອມ `{ missing:[{sku, expected, scanned}], extra:[code] }`.
- `POST /fulfillment/:orderId/override` body `{ reason }` (3..300): `logistics:write` + `orders:write`; ຕັ້ງ `verifiedAt` + ເຫດຜົນ + ຜູ້ override; audit `fulfillment.override`.
- `PATCH /fulfillment/:orderId/shipping` body `{ shippingName?, shippingPhone?, shippingAddress? }` (null = ລ້າງ): ໄດ້ສະເພາະ PAID/PACKING; audit.
- `POST /fulfillment/:orderId/ship` body `{ courierId, trackingNumber }`: ຕ້ອງ PACKING + `verifiedAt` (ບໍ່ດັ່ງນັ້ນ 409 `PACK_NOT_VERIFIED`); courier ຕ້ອງ active (`COURIER_NOT_FOUND`/`COURIER_INACTIVE`); ຕ້ອງມີຊື່ + ເບີ ຜູ້ຮັບ (`SHIPPING_INFO_REQUIRED`). `OrdersService.ship` + ບັນທຶກ Shipment ໃນ transaction ດຽວ; ແລ້ວແຈ້ງລູກຄ້າ.
- `POST /fulfillment/:orderId/notify`: ສົ່ງແຈ້ງຄືນ (ຕ້ອງ SHIPPED ຂຶ້ນໄປ ແລະ notifyStatus ≠ SENT ຫຼື ສົ່ງຊ້ຳໂດຍເຈດຕະນາດ້ວຍ `{ force: true }`).
- `OrderDetailDto` ເພີ່ມ `shipment` (courier ຊື່, tracking, ລິ້ງ, notifyStatus) ຫຼື null.
- error codes ໃໝ່: `COURIER_NOT_FOUND`, `COURIER_INACTIVE`, `PACK_MISMATCH`, `PACK_NOT_VERIFIED`, `SHIPPING_INFO_REQUIRED` (+ i18n admin).

## 5. ແຈ້ງ tracking

- ຫາເຄສ: `order.conversationId` ກ່ອນ; ບໍ່ມີ → ເຄສ FACEBOOK ຫຼ້າສຸດ (`lastMessageAt`) ຂອງ `order.customerId`. ບໍ່ພົບ → `MANUAL`.
- ສົ່ງດ້ວຍ `ConversationsService.sendMessage` (ບັນທຶກເຂົ້າ Inbox, ກັນຊ້ຳຕາມເດີມ, ຜູ້ສົ່ງ = ຜູ້ກົດສົ່ງອອກ). ຜົນ SENT → `SENT`; FAILED → `FAILED` + `errorCode` (ເຊັ່ນ OUTSIDE_WINDOW).
- ຂໍ້ຄວາມ (ລາວ, ຟັງຊັນບໍລິສຸດ): ເລກບິນ, ບໍລິສັດຂົນສົ່ງ, ເລກ tracking, ລິ້ງຕິດຕາມ (ຖ້າມີ template).

## 6. Admin (8a-2)

- `/fulfillment` (nav ກຸ່ມ "ສາງ" ຕາມ `logistics:read`): ຕາຕະລາງ + ກອງສະຖານະ/ສາງ, ຊ່ອງຄົ້ນຫາທີ່ຮັບການຍິງເລກບິນ (Enter = ເປີດບິນທີ່ກົງທັນທີ), ເລືອກຫຼາຍບິນ → ພິມໃບປະໜ້າ.
- `/fulfillment/:orderId`: ປຸ່ມເລີ່ມແພັກ; ຊ່ອງຍິງ (focus ສະເໝີ, ຮັບ Enter ຈາກເຄື່ອງຍິງ) + ປຸ່ມກ້ອງ (BarcodeDetector; ບໍ່ຮອງຮັບ → library ສະແກນ ທີ່ໂຫຼດຕອນກົດ); ຕົວນັບຕໍ່ແຖວ, ຖືກ = ຂຽວ/ສຽງສັ້ນ, ຜິດ = ແດງ/ສຽງເຕືອນ (Web Audio, ບໍ່ມີໄຟລ໌), ຄົບ → ສົ່ງ verify ອັດຕະໂນມັດ; override dialog (ສະເພາະຜູ້ມີສິດ); ຟອມຜູ້ຮັບ; ປຸ່ມພິມໃບປະໜ້າ; dialog ສົ່ງອອກ (courier + tracking, ຊ່ອງ tracking ຮັບການຍິງ); ຫຼັງສົ່ງ: ສະຖານະແຈ້ງ + copy/ສົ່ງໃໝ່.
- ໃບປະໜ້າ `/fulfillment/labels?ids=…`: `@page { size: 100mm 150mm; margin: 0 }`, Code128 ຂອງເລກບິນ (ແລະ tracking ຖ້າມີ) ເປັນ SVG, ເປີດ print ອັດຕະໂນມັດ.
- `/settings/couriers`: ຕາຕະລາງ + dialog ສ້າງ/ແກ້/ເປີດປິດ.
- ໜ້າລາຍລະອຽດບິນ: card ການສົ່ງ (courier, tracking + ລິ້ງ, ສະຖານະແຈ້ງ); ປຸ່ມ ship → ລິ້ງໄປໜ້າແພັກ.

## 7. ການທົດສອບ

- API e2e: courier CRUD/validation/ສິດ; queue (ກອງ/ຄົ້ນ/ລຽງ); start (idempotent); verify (ຖືກ, ຂາດ, ເກີນ, code ນອກບິນ, SKU ຕົວນ້ອຍ, barcode); override (ສິດ orders:write, ເຫດຜົນ); shipping patch (ສະຖານະ); ship (ບໍ່ verify, courier ປິດ, ບໍ່ມີຜູ້ຮັບ, ສຳເລັດ → SHIPPED + ສະຕ໋ອກຕັດ + shipment ຄົບ ໃນ transaction ດຽວ); notify (conversationId, ເຄສຂອງລູກຄ້າ, ບໍ່ມີ = MANUAL, OUTSIDE_WINDOW = FAILED, resend); order detail shipment; permission sweep.
- Admin: queue, scan-to-pack (ເຄື່ອງຍິງ: ຖືກ/ຜິດ/ຄົບ → verify), override, ship dialog, ໃບປະໜ້າ, couriers, card ໃນລາຍລະອຽດບິນ.
- Smoke ໃນ Chromium: ບິນຈ່າຍແລ້ວ → ເລີ່ມແພັກ → ຍິງ SKU → ພິມໃບປະໜ້າ (ກວດ layout) → ສົ່ງອອກ → ຂໍ້ຄວາມ tracking ໄປຮອດ Graph ປອມ ແລະ ຢູ່ໃນ Inbox.

## 8. ການແບ່ງ plan

- **8a-1** backend (§3–§5). **8a-2** admin (§6) + smoke.

## 9. ຜົນການປະຕິບັດ (2026-10-08)

- ການປ່ຽນຈາກ spec: ໜ້າຕັ້ງຄ່າບໍລິສັດຂົນສົ່ງຢູ່ `/couriers` (ບໍ່ແມ່ນ `/settings/couriers`) ເພື່ອບໍ່ໃຫ້ເມນູ "ຕັ້ງຄ່າຮ້ານ" ສະຫວ່າງນຳ (sidebar ຈັບຄູ່ຕາມ prefix); ບໍ່ບັນທຶກເວລາພິມໃບປະໜ້າ (YAGNI, ຕາມ §1). ບາໂຄດ Code128 ຂຽນເອງ (ບໍ່ມີ dependency); ກ້ອງໃຊ້ `@zxing/browser` ເປັນ fallback.
- Smoke ໃນ Chromium (API + admin build + simulator + Graph ປອມ): ລູກຄ້າທັກແຊັດ → ເປີດບິນຈາກແຊັດ + ຈ່າຍ → ເພີ່ມ courier ທີ່ `/couriers` → ຍິງເລກບິນ (ຕົວນ້ອຍ) ໃນລາຍການ → ໜ້າແພັກ → ເລີ່ມແພັກ → ຍິງ code ຜິດ (ຖືກປະຕິເສດ) + SKU 2 ເທື່ອ → server verify → ໃບປະໜ້າ 378×567 px (= 100×150 mm) + ພິມອັດຕະໂນມັດ → ສົ່ງອອກ (courier + tracking) → ຂໍ້ຄວາມ tracking + ລິ້ງໄປຮອດ Graph ປອມ (Messenger ຂອງລູກຄ້າ) → ລາຍລະອຽດບິນສະແດງ courier + tracking.


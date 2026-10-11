# Storefront 3b-B3 (ກະຕ່າ, checkout, ໜ້າບິນ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** ລູກຄ້າໃສ່ສິນຄ້າລົງກະຕ່າ, ສັ່ງຊື້ແບບ guest, ເຫັນບັນຊີໂອນ + ໂມງນັບຖອຍຫຼັງ, ອັບໂຫຼດສະລິບ ແລະ ຕິດຕາມບິນດ້ວຍລິ້ງລັບ.

**Architecture:** ກະຕ່າເປັນ store ຝັ່ງ browser (`localStorage`, ມີ memory ສຳຮອງ) ເກັບສະເພາະ `{ variantId, quantity }`; ລາຄາ/ສະຕ໋ອກ/ຍອດມາຈາກ `POST /store/cart/check` ສະເໝີ. ຄຳຂໍຝັ່ງ browser ຜ່ານ rewrite `/api/store/*`. `Idempotency-Key` ສ້າງຄັ້ງດຽວຕໍ່ການເປີດຟອມ checkout ແລະ ໃຊ້ຊ້ຳເມື່ອລອງໃໝ່. ໜ້າບິນ render ຝັ່ງ server (ບໍ່ cache, `noindex`, `no-referrer`) ແລ້ວ client poll ທຸກ 15 ວິ ຕອນລໍຈ່າຍ. Spec §4–§5.

**Tech Stack:** Next.js 16.3, React 19 (`useSyncExternalStore`), Vitest + Testing Library.

## File map

**API (ແກ້)**: `storefront.mapper.ts` + e2e: ລາຍການຂອງບິນມີ `variantId` (ໃຊ້ກັບປຸ່ມ "ສັ່ງໃໝ່").

**Storefront ສ້າງໃໝ່**
- `src/lib/cart.ts` (+ test), `src/lib/client-api.ts` (+ test), `src/lib/order-status.ts` (+ test), `src/lib/phone.ts` (+ test)
- `src/components/`: `add-to-cart.tsx` (+ test), `cart-link.tsx`, `quantity-stepper.tsx`, `cart-view.tsx` (+ test), `checkout-form.tsx` (+ test), `order-view.tsx` (+ test), `countdown.tsx` (+ test), `slip-upload.tsx` (+ test)
- `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/orders/[token]/page.tsx`

**Storefront ແກ້**: `variant-picker.tsx` (ໃສ່ `AddToCart`), `site-header.tsx` (ໃສ່ `CartLink`), `types.ts`.

### Task 1: API + lib
- [x] e2e (RED→GREEN): `GET /store/orders/:token` items ມີ `variantId`.
- [x] `cart.test.ts` (RED→GREEN): add ລວມຈຳນວນ variant ເດີມ, ເພດານ 20 ອັນ/20 ລາຍການ (ຄືນ `false` ເມື່ອເຕັມ), setQuantity/remove/clear, ເກັບລົງ `localStorage`, ຂໍ້ມູນເສຍ/`localStorage` throw → ກະຕ່າຫວ່າງ ແລະ ຍັງໃຊ້ໄດ້ໃນ memory, ແຈ້ງ subscriber.
- [x] `client-api.test.ts` (RED→GREEN): path `/api/store/*`, header `Idempotency-Key`, error ເປັນ `ClientApiError { status, code, body }`, ເຄືອຂ່າຍລົ້ມ → `code: "NETWORK"`.
- [x] `phone.test.ts`, `order-status.test.ts` (ຂັ້ນຕອນ + ປ້າຍຂອງແຕ່ລະສະຖານະ). commit.

### Task 2: ໃສ່ກະຕ່າ + ໜ້າກະຕ່າ
- [x] `add-to-cart.test.tsx` (RED→GREEN): ເພີ່ມຕາມຈຳນວນ, ປິດເມື່ອ OUT ຫຼື ບໍ່ໄດ້ເລືອກ variant, ຈຳກັດຕາມ `remaining`, ຂໍ້ຄວາມຢືນຢັນ + ລິ້ງກະຕ່າ, ແຈ້ງເມື່ອກະຕ່າເຕັມ.
- [x] `cart-view.test.tsx` (RED→GREEN): ກະຕ່າຫວ່າງ, ສະແດງລາຍການ + ຍອດຈາກ server, ປ່ຽນຈຳນວນ → ກວດໃໝ່, ລຶບ, `unavailable`/`insufficient` ປິດປຸ່ມສັ່ງ ພ້ອມເຫດຜົນ, ໂຫຼດລົ້ມ → ລອງໃໝ່.
- [x] `cart-link`, `/cart`. commit.

### Task 3: checkout
- [x] `checkout-form.test.tsx` (RED→GREEN): validate ຟອມ (ຂໍ້ຄວາມຕໍ່ field, focus field ທຳອິດທີ່ຜິດ), ສົ່ງ body ຖືກ (ເບີ normalize, `expectedTotal` ຈາກ check), ສຳເລັດ → ລ້າງກະຕ່າ + ໄປ `/orders/<token>`, ລອງໃໝ່ໃຊ້ key ເດີມ, `PRICE_CHANGED` → ສະແດງຍອດໃໝ່ໃຫ້ຢືນຢັນ, `INSUFFICIENT_STOCK`/`VARIANT_NOT_AVAILABLE` → ລິ້ງກັບກະຕ່າ, `TOO_MANY_OPEN_ORDERS`, 429, ປຸ່ມ loading ກັນກົດຊ້ຳ.
- [x] `/checkout` (ກະຕ່າຫວ່າງ → ລິ້ງໄປສິນຄ້າ; ບໍ່ມີ courier → ແຈ້ງ). commit.

### Task 4: ໜ້າບິນ
- [x] `countdown.test.tsx`, `slip-upload.test.tsx`, `order-view.test.tsx` (RED→GREEN): ແຕ່ລະສະຖານະ (ລໍຈ່າຍ: ບັນຊີ + ນັບຖອຍຫຼັງ + ອັບໂຫຼດ; ມີສະລິບກຳລັງກວດ; ຖືກປະຕິເສດ → ອັບໂຫຼດໃໝ່; ຈ່າຍແລ້ວ/ແພັກ/ສົ່ງ + tracking; ໝົດອາຍຸ → "ສັ່ງໃໝ່" ເຕີມກະຕ່າ; ຍົກເລີກ), poll 15 ວິ ສະເພາະລໍຈ່າຍ, error ຂອງການອັບໂຫຼດຕາມ code, ຄົບ 3 ໃບປິດການອັບໂຫຼດ.
- [x] `/orders/[token]` (`notFound()`, `robots: noindex`, `referrer: no-referrer`).
- [x] test + typecheck + lint + build; ກວດຈິງໃນ Chrome ກັບ API smoke: ສັ່ງ → ໜ້າບິນ → ອັບໂຫຼດສະລິບ. commit.

## ສິ່ງທີ່ພົບຕອນກວດຈິງ (ເພີ່ມຫຼັງ)

- rewrite ຂອງ Next ບໍ່ແນບ `X-Forwarded-For` → API ເຫັນລູກຄ້າທຸກຄົນເປັນ IP ດຽວ. ແກ້ໂດຍເພີ່ມ `src/app/api/store/[...path]/route.ts` (+ test) ແທນ rewrite `/api/*`; ຢືນຢັນດ້ວຍ audit `ip` ຂອງບິນທົດສອບ.
- ເພີ່ມ `src/app/icon.png` (favicon ເຄີຍ 404).

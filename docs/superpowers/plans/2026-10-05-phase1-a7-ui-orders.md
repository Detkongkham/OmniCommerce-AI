# Phase 1-A7: Admin UI ຄຳສັ່ງຊື້ (`/orders`, `/orders/new`, `/orders/[id]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ໜ້າຄຳສັ່ງຊື້ຄົບວົງຈອນ: ລາຍການ (filter ສະຖານະ/ຄົ້ນຫາ/ວັນທີ), ສ້າງບິນດ້ວຍມື (ຄົ້ນຫາ variant, ສາງ, ສ່ວນຫຼຸດ, ລູກຄ້າ, ສະຫຼຸບເງິນຝັ່ງ client, ເຕືອນສະຕ໋ອກ), ແລະ ລາຍລະອຽດບິນ (ນັບຖອຍຫຼັງການຈອງ, ເສັ້ນເວລາ, ປຸ່ມຂັ້ນຕໍ່ໄປຕາມສະຖານະ **ແລະ ສິດ**, ຍົກເລີກພ້ອມເຫດຜົນ, ປະຫວັດ movement).

**Architecture:** ໃຊ້ `VariantPicker` / `ServerPager` / hooks ຈາກ plan ກ່ອນໜ້າ. Logic ບໍລິສຸດ (ສະຫຼຸບເງິນ, ສະຕ໋ອກຕໍ່ແຖວ, ແປງ state → payload, ແມັບ shortage ໃສ່ແຖວ) ຢູ່ `lib/order-form.ts`; ສະຫຼຸບເງິນໃຊ້ `calculateOrderTotals` ຂອງ `@oca/shared` (ສູດດຽວກັບ API ແຕ່ API ເປັນຄ່າຈິງ). ປຸ່ມຂັ້ນຕໍ່ໄປແຍກສິດຕາມ spec §6.1: ຢືນຢັນຊຳລະ = `payments:write`, ແພັກ/ສົ່ງ/ປິດ = `logistics:write`, ສ້າງ/ຍົກເລີກ = `orders:write`; ຕົ້ນທຶນ (`unitCost`) ມາເມື່ອມີ `costs:read` ເທົ່ານັ້ນ.

**Tech Stack:** ຄືກັບ Plan A4.

**ອ້າງອີງ:** spec [Phase 1-A §7 (ບິນ), §6.1 (ສິດ), §10](../specs/2026-10-04-phase1-a-inventory-design.md); [DESIGN.md](../../DESIGN.md) ຊະນະເມື່ອຂັດ.

**ກ່ອນເລີ່ມ:** Plan A4, A5, A6 ສຳເລັດແລ້ວ (ໃຊ້ `VariantPicker`, `ServerPager`, `shortageLines`/`extractShortages`, `useWarehouses`, `useStoreSettings`, `formatMoney`, `formatDateTime`, `useDebounced`, `VariantSearchItemDto`, `Page`). ອ່ານ "ຂໍ້ຕົກລົງສຳຄັນ" ຂອງ A4 (branch, commit trailer, ຫ້າມ `git add -A`, ວິທີເພີ່ມ key dictionary, ຫ້າມແຕະ 5432/6379).

## ຂໍ້ຕົກລົງສະເພາະ plan ນີ້

* **ສັນຍາ API:** `GET /orders?status&channel&q&from&to&page&pageSize` → `Page<OrderListItemDto>`; `GET /orders/:id` → `OrderDetailDto` (ມີ `secondsUntilExpiry`, `movements[]`); `POST /orders` (201 + detail); `POST /orders/:id/{pay,pack,ship,complete}` (200 + detail, ບໍ່ມີ body); `POST /orders/:id/cancel` `{reason?}`; `GET /customers?q&page&pageSize` → `Page<{id,name,phone,email}>` (ຕ້ອງ `orders:read`). `409` ມີ code `ORDER_INVALID_STATE` (+`status`), `RESERVATION_EXPIRED`, `INSUFFICIENT_STOCK` (+`shortages[]`), `VARIANT_NOT_AVAILABLE`, `NO_DEFAULT_WAREHOUSE`, `WAREHOUSE_INACTIVE`; `404` `CUSTOMER_NOT_FOUND`, `WAREHOUSE_NOT_FOUND`, `VARIANT_NOT_FOUND`.
* **ສິດຕໍ່ປຸ່ມ** (UI ຊ່ອນ; API ບັງຄັບຈິງ): `pay` ← `payments:write`; `pack|ship|complete` ← `logistics:write`; `cancel` ← `orders:write`; ປຸ່ມ "ສ້າງບິນ" ແລະ ໜ້າ `/orders/new` ← `orders:write`; ໜ້າ/ເມນູ/ລາຍການ ← `orders:read`. ຫຼັງ action ທີ່ລົ້ມດ້ວຍ `ORDER_INVALID_STATE`/`RESERVATION_EXPIRED` ຕ້ອງ refetch ບິນ ເພື່ອສະແດງສະຖານະຫຼ້າສຸດ (ອາດຖືກຄົນອື່ນ/worker ປ່ຽນໄປແລ້ວ).
* **ການນັບຖອຍ:** ເລີ່ມຈາກ `secondsUntilExpiry` ທີ່ API ຄືນ ແລ້ວນັບລົງທີ່ client ທຸກວິນາທີ (ບໍ່ອີງນາຬິກາເຄື່ອງ client). ເມື່ອຮອດ 0 ແລະບິນຍັງ `PENDING_PAYMENT` (worker ຍັງບໍ່ໄດ້ expire) ໃຫ້ poll ທຸກ 15 ວິ ຈົນສະຖານະປ່ຽນເປັນ `EXPIRED`; ປຸ່ມຢືນຢັນຊຳລະຖືກປິດເມື່ອເຫຼືອ 0.
* **ສະຫຼຸບເງິນຝັ່ງ client ເປັນພຽງການຄາດຄະເນ** (ໃຊ້ `vatRate`/`pricesIncludeVat` ຈາກ `GET /settings/store`); ບິນທີ່ສ້າງແລ້ວສະແດງຄ່າຈິງຈາກ API. ເງິນທັງໝົດເປັນ string, ບໍ່ໃຊ້ `number` ຄຳນວນ.
* **ສາງຂອງແຖວ:** ຄ່າເລີ່ມຕົ້ນ "ສາງຫຼັກ" (ບໍ່ສົ່ງ `warehouseId` → API ໃຊ້ສາງ default); ເລືອກສາງອື່ນກໍ່ສົ່ງ `warehouseId`. ສະຕ໋ອກຂາຍໄດ້ຂອງແຖວອ່ານຈາກ `stock[]` ຂອງຜົນ `GET /variants` (ບໍ່ມີ = 0).
* **ບິນດຽວກັນເລືອກ variant ຊ້ຳບໍ່ໄດ້** (picker ຕັດ variant ທີ່ເລືອກແລ້ວ) ເພື່ອກັນ `400` ຂອງ (variant, ສາງ) ຊ້ຳ.
* **Idempotency (ອັບເດດຫຼັງ commit 9fd1f51):** `POST /orders` ຮອງຮັບ header `Idempotency-Key` (1–128 ຕົວ ASCII ທີ່ພິມໄດ້): key ຊ້ຳ + body ເດີມ = ຄືນບິນເດີມ (201), key ຊ້ຳ + body ຕ່າງ = 409 `CONFLICT`, ຄັ້ງທີ່ສະຕ໋ອກບໍ່ພໍບໍ່ຖືກຈື່. ຟອມສ້າງບິນ (Task 5) ສ້າງ key ຕໍ່ payload ແລະໃຊ້ຊ້ຳເມື່ອ retry payload ເດີມ; ປຸ່ມຍັງຖືກປິດຂະນະ submit ດ້ວຍ.

## ໂຄງສ້າງໄຟລ໌

```
apps/admin/src/
  lib/types.ts                    [ແກ້] OrderListItemDto, OrderDetailDto, CustomerDto
  lib/queries.ts                  [ແກ້] useOrders, useOrder, useCreateOrder, useOrderAction, useCustomers
  lib/use-countdown.ts (+test)    [ໃໝ່] ນັບຖອຍ + formatCountdown
  lib/order-form.ts (+test)       [ໃໝ່] computeTotals, lineAvailable, toCreateOrderInput, shortageKeys
  lib/nav.ts (+test)              [ແກ້] /orders
  lib/i18n/dictionary.ts          [ແກ້] orders.*, nav.orders
  components/orders/order-status.tsx             [ໃໝ່]
  components/orders/order-list.tsx (+test)       [ໃໝ່]
  components/orders/customer-picker.tsx (+test)  [ໃໝ່]
  components/orders/order-form.tsx (+test)       [ໃໝ່]
  components/orders/cancel-order-dialog.tsx      [ໃໝ່] (ທົດສອບໃນ order-detail.test)
  components/orders/order-detail.tsx (+test)     [ໃໝ່]
  app/(app)/orders/page.tsx, new/page.tsx, [id]/page.tsx   [ໃໝ່]
```

---

### Task 1: ປະເພດ, hooks, ແລະ dictionary ຂອງບິນ

**Files:**
- Modify: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/queries.ts`, `apps/admin/src/lib/i18n/dictionary.ts`
- Create: `apps/admin/src/lib/queries.orders.test.tsx`

- [ ] **Step 1: dictionary** (ແຊກຕາມ "ຂໍ້ຕົກລົງສຳຄັນ" ຂອງ A4; ໃຊ້ໂດຍ Task 1–8)

`lo`:
```ts
  "nav.orders": "ຄຳສັ່ງຊື້",
  "orders.title": "ຄຳສັ່ງຊື້",
  "orders.description": "ສ້າງບິນ, ຢືນຢັນຊຳລະ ແລະ ຕິດຕາມການແພັກ/ສົ່ງ",
  "orders.count": "{count} ບິນ",
  "orders.add": "ສ້າງບິນ",
  "orders.search": "ຄົ້ນຫາເລກບິນ, ຊື່ ຫຼື ໂທລະສັບ...",
  "orders.filter.status": "ສະຖານະ",
  "orders.filter.allStatuses": "ທຸກສະຖານະ",
  "orders.filter.from": "ຈາກວັນທີ",
  "orders.filter.to": "ຮອດວັນທີ",
  "orders.col.number": "ເລກບິນ",
  "orders.col.customer": "ລູກຄ້າ",
  "orders.col.channel": "ຊ່ອງທາງ",
  "orders.col.status": "ສະຖານະ",
  "orders.col.total": "ຍອດລວມ",
  "orders.col.created": "ເວລາສ້າງ",
  "orders.itemCount": "{count} ລາຍການ",
  "orders.walkIn": "ລູກຄ້າໜ້າຮ້ານ",
  "orders.empty.title": "ຍັງບໍ່ມີຄຳສັ່ງຊື້",
  "orders.empty.noResults": "ບໍ່ພົບບິນທີ່ຄົ້ນຫາ",
  "orders.status.PENDING_PAYMENT": "ລໍຖ້າຊຳລະ",
  "orders.status.PAID": "ຊຳລະແລ້ວ",
  "orders.status.PACKING": "ກຳລັງແພັກ",
  "orders.status.SHIPPED": "ສົ່ງແລ້ວ",
  "orders.status.COMPLETED": "ສຳເລັດ",
  "orders.status.CANCELLED": "ຍົກເລີກ",
  "orders.status.EXPIRED": "ໝົດເວລາຈອງ",
  "orders.channel.OFFLINE": "ໜ້າຮ້ານ",
  "orders.channel.STOREFRONT": "ເວັບໄຊ",
  "orders.channel.FACEBOOK": "Facebook",
  "orders.channel.INSTAGRAM": "Instagram",
  "orders.channel.TIKTOK": "TikTok",
  "orders.channel.LINE": "LINE",
  "orders.form.title": "ສ້າງບິນ",
  "orders.form.description": "ເລືອກສິນຄ້າ ແລະ ລູກຄ້າ ລະບົບຈະຈອງສະຕ໋ອກໃຫ້ທັນທີ",
  "orders.section.items": "ລາຍການສິນຄ້າ",
  "orders.section.customer": "ລູກຄ້າ",
  "orders.section.shipping": "ການຈັດສົ່ງ ແລະ ອື່ນໆ",
  "orders.section.summary": "ສະຫຼຸບເງິນ",
  "orders.items.add": "ເພີ່ມສິນຄ້າ (ຄົ້ນຫາ SKU/ຊື່)",
  "orders.items.empty": "ຍັງບໍ່ໄດ້ເພີ່ມສິນຄ້າ",
  "orders.items.product": "ສິນຄ້າ",
  "orders.items.warehouse": "ສາງ",
  "orders.items.defaultWarehouse": "ສາງຫຼັກ ({code})",
  "orders.items.noDefaultWarehouse": "ຍັງບໍ່ມີສາງຫຼັກທີ່ເປີດໃຊ້ງານ ກະລຸນາເລືອກສາງຂອງແຕ່ລະແຖວ",
  "orders.items.quantity": "ຈຳນວນ",
  "orders.items.discount": "ສ່ວນຫຼຸດ",
  "orders.items.unitPrice": "ລາຄາ",
  "orders.items.lineTotal": "ລວມ",
  "orders.items.available": "ຂາຍໄດ້ {count}",
  "orders.items.exceeds": "ເກີນສະຕ໋ອກທີ່ຂາຍໄດ້ ({count})",
  "orders.items.shortage": "ສະຕ໋ອກບໍ່ພໍ: ຕ້ອງການ {requested} ແຕ່ຂາຍໄດ້ {available}",
  "orders.items.remove": "ລຶບແຖວ",
  "orders.customer.none": "ລູກຄ້າໜ້າຮ້ານ (ບໍ່ບັນທຶກ)",
  "orders.customer.existing": "ເລືອກລູກຄ້າທີ່ມີ",
  "orders.customer.new": "ລູກຄ້າໃໝ່",
  "orders.customer.search": "ຄົ້ນຫາຊື່ ຫຼື ໂທລະສັບ",
  "orders.customer.none.found": "ບໍ່ພົບລູກຄ້າ",
  "orders.customer.change": "ປ່ຽນ",
  "orders.customer.name": "ຊື່ລູກຄ້າ",
  "orders.customer.phone": "ໂທລະສັບ",
  "orders.customer.email": "ອີເມວ",
  "orders.shipping.fee": "ຄ່າສົ່ງ",
  "orders.shipping.name": "ຊື່ຜູ້ຮັບ",
  "orders.shipping.phone": "ໂທລະສັບຜູ້ຮັບ",
  "orders.shipping.address": "ທີ່ຢູ່ຈັດສົ່ງ",
  "orders.note": "ໝາຍເຫດ",
  "orders.reservation": "ເວລາຈອງ (ນາທີ)",
  "orders.reservationHint": "ເວັ້ນໄວ້ = {minutes} ນາທີ (ຕາມຕັ້ງຄ່າຮ້ານ)",
  "orders.summary.subtotal": "ລວມລາຍການ",
  "orders.summary.discount": "ສ່ວນຫຼຸດ",
  "orders.summary.shipping": "ຄ່າສົ່ງ",
  "orders.summary.vat": "VAT {rate}%",
  "orders.summary.vatIncluded": "(ລວມໃນລາຄາແລ້ວ)",
  "orders.summary.total": "ຍອດລວມ",
  "orders.summary.estimate": "ຍອດນີ້ເປັນການຄາດຄະເນ ລະບົບຈະຄຳນວນຄ່າຈິງຕອນບັນທຶກ",
  "orders.submit": "ສ້າງບິນ ແລະ ຈອງສະຕ໋ອກ",
  "orders.form.issues": "ກະລຸນາແກ້ຂໍ້ມູນຕໍ່ໄປນີ້",
  "orders.toast.created": "ສ້າງບິນ {number} ແລ້ວ",
  "orders.detail.notFound": "ບໍ່ພົບບິນນີ້",
  "orders.detail.expiresIn": "ໝົດເວລາຈອງໃນ {time}",
  "orders.detail.expired": "ໝົດເວລາຈອງແລ້ວ",
  "orders.detail.items": "ລາຍການ",
  "orders.detail.customer": "ລູກຄ້າ",
  "orders.detail.shipping": "ຈັດສົ່ງ",
  "orders.detail.timeline": "ເສັ້ນເວລາ",
  "orders.detail.movements": "ການເຄື່ອນໄຫວສະຕ໋ອກຂອງບິນນີ້",
  "orders.detail.unitCost": "ຕົ້ນທຶນ/ຫົວໜ່ວຍ",
  "orders.detail.createdAt": "ສ້າງບິນ",
  "orders.detail.paidAt": "ຊຳລະແລ້ວ",
  "orders.detail.shippedAt": "ສົ່ງແລ້ວ",
  "orders.detail.completedAt": "ສຳເລັດ",
  "orders.detail.cancelledAt": "ຍົກເລີກ",
  "orders.detail.noMovements": "ຍັງບໍ່ມີການເຄື່ອນໄຫວ",
  "orders.action.pay": "ຢືນຢັນຊຳລະ",
  "orders.action.pack": "ເລີ່ມແພັກ",
  "orders.action.ship": "ສົ່ງ",
  "orders.action.complete": "ປິດບິນ (ສຳເລັດ)",
  "orders.action.cancel": "ຍົກເລີກບິນ",
  "orders.action.payExpired": "ໝົດເວລາຈອງແລ້ວ ຢືນຢັນຊຳລະບໍ່ໄດ້",
  "orders.cancel.title": "ຍົກເລີກບິນນີ້?",
  "orders.cancel.description": "ສະຕ໋ອກທີ່ຈອງຈະຖືກຄືນເຂົ້າສາງ ການຍົກເລີກບໍ່ສາມາດກູ້ຄືນໄດ້.",
  "orders.cancel.reason": "ເຫດຜົນ (ບໍ່ບັງຄັບ)",
  "orders.cancel.confirm": "ຍົກເລີກບິນ",
  "orders.cancel.keep": "ບໍ່ຍົກເລີກ",
  "orders.toast.pay": "ຢືນຢັນຊຳລະແລ້ວ",
  "orders.toast.pack": "ເລີ່ມແພັກແລ້ວ",
  "orders.toast.ship": "ສົ່ງແລ້ວ (ຕັດສະຕ໋ອກອອກ)",
  "orders.toast.complete": "ປິດບິນແລ້ວ",
  "orders.toast.cancel": "ຍົກເລີກບິນແລ້ວ",
```
`en`:
```ts
  "nav.orders": "Orders",
  "orders.title": "Orders",
  "orders.description": "Create orders, confirm payment and track packing/shipping",
  "orders.count": "{count} orders",
  "orders.add": "Create order",
  "orders.search": "Search order no., name or phone...",
  "orders.filter.status": "Status",
  "orders.filter.allStatuses": "All statuses",
  "orders.filter.from": "From date",
  "orders.filter.to": "To date",
  "orders.col.number": "Order no.",
  "orders.col.customer": "Customer",
  "orders.col.channel": "Channel",
  "orders.col.status": "Status",
  "orders.col.total": "Total",
  "orders.col.created": "Created",
  "orders.itemCount": "{count} items",
  "orders.walkIn": "Walk-in customer",
  "orders.empty.title": "No orders yet",
  "orders.empty.noResults": "No orders match your search",
  "orders.status.PENDING_PAYMENT": "Awaiting payment",
  "orders.status.PAID": "Paid",
  "orders.status.PACKING": "Packing",
  "orders.status.SHIPPED": "Shipped",
  "orders.status.COMPLETED": "Completed",
  "orders.status.CANCELLED": "Cancelled",
  "orders.status.EXPIRED": "Reservation expired",
  "orders.channel.OFFLINE": "In store",
  "orders.channel.STOREFRONT": "Website",
  "orders.channel.FACEBOOK": "Facebook",
  "orders.channel.INSTAGRAM": "Instagram",
  "orders.channel.TIKTOK": "TikTok",
  "orders.channel.LINE": "LINE",
  "orders.form.title": "Create order",
  "orders.form.description": "Pick items and a customer. Stock is reserved immediately",
  "orders.section.items": "Items",
  "orders.section.customer": "Customer",
  "orders.section.shipping": "Shipping and other",
  "orders.section.summary": "Summary",
  "orders.items.add": "Add item (search SKU/name)",
  "orders.items.empty": "No items added yet",
  "orders.items.product": "Item",
  "orders.items.warehouse": "Warehouse",
  "orders.items.defaultWarehouse": "Default ({code})",
  "orders.items.noDefaultWarehouse": "There is no active default warehouse. Please pick a warehouse on each row",
  "orders.items.quantity": "Qty",
  "orders.items.discount": "Discount",
  "orders.items.unitPrice": "Price",
  "orders.items.lineTotal": "Total",
  "orders.items.available": "Available {count}",
  "orders.items.exceeds": "Exceeds available stock ({count})",
  "orders.items.shortage": "Not enough stock: needs {requested} but only {available} available",
  "orders.items.remove": "Remove row",
  "orders.customer.none": "Walk-in customer (not saved)",
  "orders.customer.existing": "Pick an existing customer",
  "orders.customer.new": "New customer",
  "orders.customer.search": "Search name or phone",
  "orders.customer.none.found": "No customers found",
  "orders.customer.change": "Change",
  "orders.customer.name": "Customer name",
  "orders.customer.phone": "Phone",
  "orders.customer.email": "Email",
  "orders.shipping.fee": "Shipping fee",
  "orders.shipping.name": "Recipient name",
  "orders.shipping.phone": "Recipient phone",
  "orders.shipping.address": "Shipping address",
  "orders.note": "Note",
  "orders.reservation": "Reservation time (minutes)",
  "orders.reservationHint": "Empty = {minutes} minutes (store setting)",
  "orders.summary.subtotal": "Subtotal",
  "orders.summary.discount": "Discount",
  "orders.summary.shipping": "Shipping",
  "orders.summary.vat": "VAT {rate}%",
  "orders.summary.vatIncluded": "(included in prices)",
  "orders.summary.total": "Total",
  "orders.summary.estimate": "This is an estimate. The system calculates the real amount when saving",
  "orders.submit": "Create order and reserve stock",
  "orders.form.issues": "Please fix the following",
  "orders.toast.created": "Order {number} created",
  "orders.detail.notFound": "This order was not found",
  "orders.detail.expiresIn": "Reservation expires in {time}",
  "orders.detail.expired": "Reservation expired",
  "orders.detail.items": "Items",
  "orders.detail.customer": "Customer",
  "orders.detail.shipping": "Shipping",
  "orders.detail.timeline": "Timeline",
  "orders.detail.movements": "Stock movements of this order",
  "orders.detail.unitCost": "Unit cost",
  "orders.detail.createdAt": "Created",
  "orders.detail.paidAt": "Paid",
  "orders.detail.shippedAt": "Shipped",
  "orders.detail.completedAt": "Completed",
  "orders.detail.cancelledAt": "Cancelled",
  "orders.detail.noMovements": "No movements yet",
  "orders.action.pay": "Confirm payment",
  "orders.action.pack": "Start packing",
  "orders.action.ship": "Ship",
  "orders.action.complete": "Complete order",
  "orders.action.cancel": "Cancel order",
  "orders.action.payExpired": "The reservation expired; payment can no longer be confirmed",
  "orders.cancel.title": "Cancel this order?",
  "orders.cancel.description": "Reserved stock is returned to the warehouse. This cannot be undone.",
  "orders.cancel.reason": "Reason (optional)",
  "orders.cancel.confirm": "Cancel order",
  "orders.cancel.keep": "Keep order",
  "orders.toast.pay": "Payment confirmed",
  "orders.toast.pack": "Packing started",
  "orders.toast.ship": "Shipped (stock deducted)",
  "orders.toast.complete": "Order completed",
  "orders.toast.cancel": "Order cancelled",
```

- [ ] **Step 2: ເພີ່ມປະເພດ** ຕໍ່ທ້າຍ `apps/admin/src/lib/types.ts` (ເພີ່ມ `OrderStatus, SalesChannel` ໃນ import ເທິງສຸດຈາກ `@oca/shared`):

```ts
export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: SalesChannel;
  source: string;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
  reservedUntil: string | null;
  createdAt: string;
}

export interface OrderItemDto {
  id: string;
  variantId: string;
  warehouseId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  unitPrice: string;
  /** ບໍ່ມີເມື່ອຜູ້ໃຊ້ບໍ່ມີ costs:read */
  unitCost?: string;
  quantity: number;
  discount: string;
  lineTotal: string;
}

export interface OrderMovementDto {
  id: string;
  type: StockMovementType;
  quantity: number;
  variantId: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  createdAt: string;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: SalesChannel;
  source: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
  exchangeRate: string;
  subtotal: string;
  discountTotal: string;
  shippingFee: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  reservedUntil: string | null;
  secondsUntilExpiry: number | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItemDto[];
  movements: OrderMovementDto[];
}
```

- [ ] **Step 3: ຂຽນ test hooks ທີ່ຈະລົ້ມ** `apps/admin/src/lib/queries.orders.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useCreateOrder, useCustomers, useOrder, useOrderAction, useOrders } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("order hooks", () => {
  it("useOrders ສົ່ງ filter ເປັນ query (ຂ້າມຄ່າຫວ່າງ; ວັນທີເປັນ date-only)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const { Wrapper } = wrapper();
    renderHook(() => useOrders({ q: "SO-1", status: "PAID", from: "2026-10-01", to: "", page: 1, pageSize: 10 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders?q=SO-1&status=PAID&from=2026-10-01&page=1&pageSize=10"));
  });

  it("useOrder poll ທຸກ 15 ວິ ເມື່ອ PENDING_PAYMENT ແລະ secondsUntilExpiry = 0 ເທົ່ານັ້ນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: "PENDING_PAYMENT", secondsUntilExpiry: 0 });
    const { client, Wrapper } = wrapper();
    renderHook(() => useOrder("o1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders/o1"));
    const query = client.getQueryCache().find({ queryKey: ["orders", "detail", "o1"] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval as (q: unknown) => number | false;
    expect(interval({ state: { data: { status: "PENDING_PAYMENT", secondsUntilExpiry: 0 } } })).toBe(15_000);
    expect(interval({ state: { data: { status: "PENDING_PAYMENT", secondsUntilExpiry: 120 } } })).toBe(false);
    expect(interval({ state: { data: { status: "PAID", secondsUntilExpiry: null } } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
  });

  it("useOrderAction: pay/pack/ship/complete ບໍ່ມີ body; cancel ສົ່ງ { reason }; invalidate orders/stock/products/variants", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useOrderAction(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ id: "o1", action: "pay" }));
    await act(() => result.current.mutateAsync({ id: "o1", action: "cancel", reason: "dup" }));
    await act(() => result.current.mutateAsync({ id: "o1", action: "cancel" }));
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/pay", { method: "POST" });
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/cancel", { method: "POST", body: { reason: "dup" } });
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/cancel", { method: "POST", body: {} });
    for (const key of ["orders", "stock", "products", "variants"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("useCreateOrder POST /orders; useCustomers ບໍ່ຍິງເມື່ອ q ເປົ່າ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "o1" });
    const { Wrapper } = wrapper();
    const create = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    await act(() => create.result.current.mutateAsync({ items: [{ variantId: "v", quantity: 1, discount: "0" }], shippingFee: "0" }));
    expect(apiFetch).toHaveBeenCalledWith("/orders", expect.objectContaining({ method: "POST" }));

    vi.mocked(apiFetch).mockClear();
    renderHook(() => useCustomers({ q: "" }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    renderHook(() => useCustomers({ q: "020" }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/customers?q=020&page=1&pageSize=8"));
  });
});
```

- [ ] **Step 4: ຣັນໃຫ້ລົ້ມ** — `pnpm --filter @oca/admin exec vitest run src/lib/queries.orders.test.tsx` → FAIL.

- [ ] **Step 5: ແກ້ `apps/admin/src/lib/queries.ts`**

ເພີ່ມ import `CreateOrderInput` ຈາກ `@oca/shared`; `CustomerDto, OrderDetailDto, OrderListItemDto` ຈາກ `./types`. ເພີ່ມໃນ `queryKeys`: `orders: ["orders"] as const,`. ຕໍ່ທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// ຄຳສັ່ງຊື້
// ---------------------------------------------------------------------------
export interface OrderListParams {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: [...queryKeys.orders, "list", params],
    queryFn: () => apiFetch<Page<OrderListItemDto>>(`/orders${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * ບິນທີ່ຍັງ PENDING_PAYMENT ແຕ່ນັບຖອຍຮອດ 0 (worker ຍັງບໍ່ໄດ້ expire) → poll ທຸກ 15 ວິ ຈົນສະຖານະປ່ຽນ.
 */
export function useOrder(id: string) {
  return useQuery({
    queryKey: [...queryKeys.orders, "detail", id],
    queryFn: () => apiFetch<OrderDetailDto>(`/orders/${id}`),
    refetchInterval: (query) => {
      const order = query.state.data;
      return order?.status === "PENDING_PAYMENT" && order.secondsUntilExpiry === 0 ? 15_000 : false;
    },
  });
}

export function useCreateOrder() {
  const invalidate = useInvalidate(queryKeys.orders, queryKeys.stock, queryKeys.products, queryKeys.variants);
  return useMutation({
    mutationFn: (input: CreateOrderInput) => apiFetch<OrderDetailDto>("/orders", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export type OrderAction = "pay" | "pack" | "ship" | "complete" | "cancel";

export function useOrderAction() {
  const invalidate = useInvalidate(queryKeys.orders, queryKeys.stock, queryKeys.products, queryKeys.variants);
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: OrderAction; reason?: string }) =>
      apiFetch<OrderDetailDto>(
        `/orders/${id}/${action}`,
        action === "cancel"
          ? { method: "POST", body: reason ? { reason } : {} }
          : { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

/** ຄົ້ນຫາລູກຄ້າ (ຟອມບິນ): ບໍ່ຍິງເມື່ອ q ເປົ່າ */
export function useCustomers(params: { q: string }) {
  const q = params.q.trim();
  return useQuery({
    queryKey: ["customers", q],
    queryFn: () => apiFetch<Page<CustomerDto>>(`/customers${toQueryString({ q, page: 1, pageSize: 8 })}`),
    enabled: q !== "",
  });
}
```

- [ ] **Step 6: ຣັນໃຫ້ຜ່ານ + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib
git commit -m "feat(admin): order types, hooks and strings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib
```

---

### Task 2: `use-countdown` ແລະ `order-form` (logic ບໍລິສຸດ)

**Files:** Create `apps/admin/src/lib/use-countdown.ts`, `use-countdown.test.ts`, `apps/admin/src/lib/order-form.ts`, `order-form.test.ts`

- [ ] **Step 1: ຂຽນ test `use-countdown.test.ts` ທີ່ຈະລົ້ມ**

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, useCountdown } from "./use-countdown";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("formatCountdown", () => {
  it("mm:ss ເມື່ອ < 1 ຊົ່ວໂມງ; H:MM:SS ເມື່ອເກີນ", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(36000 + 61)).toBe("10:01:01");
  });
});

describe("useCountdown", () => {
  it("null ຄົງເປັນ null", () => {
    const { result } = renderHook(() => useCountdown(null, "a"));
    expect(result.current).toBeNull();
  });

  it("ນັບລົງທຸກວິນາທີ ແລະ ຢຸດທີ່ 0", () => {
    const { result } = renderHook(() => useCountdown(3, "a"));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it("ຮີເຊັດເມື່ອຄ່າຈາກ server ຫຼື resetKey ປ່ຽນ (ຫຼັງ refetch)", () => {
    const { result, rerender } = renderHook(({ seconds, key }) => useCountdown(seconds, key), {
      initialProps: { seconds: 10, key: "t1" },
    });
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toBe(6);
    rerender({ seconds: 10, key: "t2" });
    expect(result.current).toBe(10);
    rerender({ seconds: 3, key: "t2" });
    expect(result.current).toBe(3);
  });
});
```

- [ ] **Step 2: ຂຽນ test `order-form.test.ts` ທີ່ຈະລົ້ມ**

```ts
import { createOrderSchema } from "@oca/shared";
import { describe, expect, it } from "vitest";
import type { VariantSearchItemDto } from "./types";
import {
  type OrderFormState,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  shortageKeys,
  toCreateOrderInput,
} from "./order-form";

const variant = (patch: Partial<VariantSearchItemDto> = {}): VariantSearchItemDto => ({
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }, { warehouseId: "w2", onHand: 1, reserved: 0, available: 1 }],
  ...patch,
});
const settings = { vatRate: "10.00", pricesIncludeVat: true };

const form = (patch: Partial<OrderFormState> = {}): OrderFormState => ({
  ...emptyOrderForm(),
  lines: [{ variant: variant(), warehouseId: "", quantity: "2", discount: "10" }],
  ...patch,
});

describe("computeTotals", () => {
  it("ໃຊ້ສູດດຽວກັບ API (ລວມ VAT): subtotal 190, ຄ່າສົ່ງ 5 → total 195, VAT 17.73", () => {
    const totals = computeTotals(form({ shippingFee: "5" }), settings);
    expect(totals).toMatchObject({ subtotal: "190.00", discountTotal: "10.00", vatAmount: "17.73", total: "195.00" });
  });

  it("ບໍ່ລວມ VAT: ບວກ VAT ເພີ່ມ", () => {
    const totals = computeTotals(form({ shippingFee: "0" }), { vatRate: "10", pricesIncludeVat: false });
    expect(totals).toMatchObject({ subtotal: "190.00", vatAmount: "19.00", total: "209.00" });
  });

  it("ຂໍ້ມູນຍັງບໍ່ຄົບ/ຜິດ (ຈຳນວນເປົ່າ, ສ່ວນຫຼຸດເກີນ, ເງິນບໍ່ແມ່ນຕົວເລກ) → null ແທນ throw", () => {
    expect(computeTotals(form({ lines: [{ variant: variant(), warehouseId: "", quantity: "", discount: "" }] }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [{ variant: variant(), warehouseId: "", quantity: "1", discount: "999" }] }), settings)).toBeNull();
    expect(computeTotals(form({ shippingFee: "abc" }), settings)).toBeNull();
    expect(computeTotals(form({ lines: [] }), settings)).toBeNull();
  });
});

describe("lineAvailable", () => {
  it("ໃຊ້ສາງທີ່ເລືອກ; ບໍ່ເລືອກ → ສາງຫຼັກ; ບໍ່ມີແຖວສະຕ໋ອກ = 0", () => {
    const line = { variant: variant(), warehouseId: "", quantity: "1", discount: "" };
    expect(lineAvailable(line, "w1")).toBe(8);
    expect(lineAvailable({ ...line, warehouseId: "w2" }, "w1")).toBe(1);
    expect(lineAvailable({ ...line, warehouseId: "w9" }, "w1")).toBe(0);
    expect(lineAvailable(line, null)).toBe(0);
  });
});

describe("toCreateOrderInput", () => {
  it("ລູກຄ້າໜ້າຮ້ານ: ຂ້າມ field ເປົ່າ ແລະ ບໍ່ສົ່ງ warehouseId ເມື່ອໃຊ້ສາງຫຼັກ", () => {
    const input = toCreateOrderInput(form());
    expect(input).toEqual({ items: [{ variantId: "v1", quantity: 2, discount: "10" }] });
    expect(createOrderSchema.safeParse(input).success).toBe(true);
  });

  it("ລູກຄ້າທີ່ມີ → customerId; ລູກຄ້າໃໝ່ → customer; ສາງທີ່ເລືອກ ແລະ field ຈັດສົ່ງ", () => {
    const existing = toCreateOrderInput(
      form({
        customerMode: "existing",
        customer: { id: "c1", name: "A", phone: "020", email: null },
        shippingFee: "5",
        shippingName: "Recipient",
        shippingPhone: "020555",
        shippingAddress: "Vientiane",
        note: "gift",
        reservationMinutes: "45",
        lines: [{ variant: variant(), warehouseId: "w2", quantity: "1", discount: "" }],
      }),
    );
    expect(existing).toEqual({
      customerId: "c1",
      items: [{ variantId: "v1", warehouseId: "w2", quantity: 1, discount: "0" }],
      shippingFee: "5",
      shippingName: "Recipient",
      shippingPhone: "020555",
      shippingAddress: "Vientiane",
      note: "gift",
      reservationMinutes: 45,
    });

    const created = toCreateOrderInput(
      form({ customerMode: "new", newCustomer: { name: "New", phone: "02055551111", email: "n@x.com" } }),
    );
    expect(created).toMatchObject({ customer: { name: "New", phone: "02055551111", email: "n@x.com" } });
    expect(created).not.toHaveProperty("customerId");
    expect(createOrderSchema.safeParse(created).success).toBe(true);
  });

  it("ຈຳນວນເປົ່າ → 0 (schema ຈະປະຕິເສດ)", () => {
    const input = toCreateOrderInput(form({ lines: [{ variant: variant(), warehouseId: "", quantity: "", discount: "" }] }));
    expect(createOrderSchema.safeParse(input).success).toBe(false);
  });
});

describe("shortageKeys", () => {
  it("ແມັບ shortage ຂອງ API ເປັນ key `variantId|warehouseId` ເພື່ອໝາຍແຖວ", () => {
    const keys = shortageKeys([{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 2 }]);
    expect(keys.get("v1|w1")).toMatchObject({ requested: 9, available: 2 });
  });
});
```

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 4: ຂຽນ `use-countdown.ts`**

```ts
import { useEffect, useState } from "react";

/** mm:ss ເມື່ອ < 1 ຊົ່ວໂມງ, H:MM:SS ເມື່ອເກີນ (ເວລາຈອງສູງສຸດ 7 ວັນ) */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/**
 * ນັບລົງທຸກວິນາທີຈາກ `initialSeconds` (ຄ່າທີ່ API ຄືນ ບໍ່ອີງນາຬິກາ client); null = ບໍ່ມີ.
 * ຮີເຊັດເມື່ອ `initialSeconds` ຫຼື `resetKey` ປ່ຽນ (ເຊັ່ນ ຫຼັງ refetch ໄດ້ເວລາໃໝ່).
 */
export function useCountdown(initialSeconds: number | null, resetKey: unknown): number | null {
  const [remaining, setRemaining] = useState<number | null>(initialSeconds);

  useEffect(() => {
    setRemaining(initialSeconds);
    if (initialSeconds === null) return;
    const id = setInterval(() => setRemaining((current) => (current === null ? null : Math.max(0, current - 1))), 1000);
    return () => clearInterval(id);
  }, [initialSeconds, resetKey]);

  return remaining;
}
```

ໝາຍເຫດ: `resetKey` ຢູ່ໃນ dependency ຕັ້ງໃຈ ເພື່ອໃຊ້ເປັນ trigger ຮີເຊັດ (ESLint ຂອງ repo ບໍ່ມີກົດ exhaustive-deps).

- [ ] **Step 5: ຂຽນ `order-form.ts`**

```ts
import { type OrderTotals, calculateOrderTotals } from "@oca/shared";
import type { CustomerDto, Shortage, VariantSearchItemDto } from "./types";

export interface OrderLineDraft {
  variant: VariantSearchItemDto;
  /** "" = ສາງຫຼັກ (ບໍ່ສົ່ງ warehouseId) */
  warehouseId: string;
  quantity: string;
  discount: string;
}

export type CustomerMode = "none" | "existing" | "new";

export interface OrderFormState {
  lines: OrderLineDraft[];
  customerMode: CustomerMode;
  customer: CustomerDto | null;
  newCustomer: { name: string; phone: string; email: string };
  shippingFee: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  note: string;
  reservationMinutes: string;
}

export function emptyOrderForm(): OrderFormState {
  return {
    lines: [],
    customerMode: "none",
    customer: null,
    newCustomer: { name: "", phone: "", email: "" },
    shippingFee: "",
    shippingName: "",
    shippingPhone: "",
    shippingAddress: "",
    note: "",
    reservationMinutes: "",
  };
}

/** ສະຕ໋ອກຂາຍໄດ້ຂອງແຖວ: ສາງທີ່ເລືອກ ຫຼື ສາງຫຼັກ; ບໍ່ມີແຖວສະຕ໋ອກ = 0 */
export function lineAvailable(line: OrderLineDraft, defaultWarehouseId: string | null): number {
  const warehouseId = line.warehouseId || defaultWarehouseId;
  if (!warehouseId) return 0;
  return line.variant.stock.find((level) => level.warehouseId === warehouseId)?.available ?? 0;
}

/**
 * ສະຫຼຸບເງິນຝັ່ງ client (ຄາດຄະເນ): ສູດດຽວກັບ API ຜ່ານ `calculateOrderTotals`.
 * ຂໍ້ມູນຍັງບໍ່ຄົບ/ຜິດ (ຈຳນວນເປົ່າ, ສ່ວນຫຼຸດເກີນ, ບໍ່ແມ່ນຕົວເລກ) → null ແທນທີ່ຈະ throw ຂະນະພິມ.
 */
export function computeTotals(
  state: OrderFormState,
  settings: { vatRate: string; pricesIncludeVat: boolean },
): OrderTotals | null {
  if (state.lines.length === 0) return null;
  try {
    const lines = state.lines.map((line) => {
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError("quantity");
      return { unitPrice: line.variant.price, quantity, discount: line.discount.trim() || "0" };
    });
    return calculateOrderTotals({
      lines,
      shippingFee: state.shippingFee.trim() || "0",
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
    });
  } catch {
    return null;
  }
}

/** state → body ຂອງ POST /orders (ຍັງບໍ່ validate; ສົ່ງຕໍ່ໃຫ້ `createOrderSchema.safeParse`) */
export function toCreateOrderInput(state: OrderFormState): unknown {
  const customer =
    state.customerMode === "existing" && state.customer
      ? { customerId: state.customer.id }
      : state.customerMode === "new"
        ? {
            customer: {
              name: state.newCustomer.name.trim(),
              phone: state.newCustomer.phone.trim(),
              ...(state.newCustomer.email.trim() ? { email: state.newCustomer.email.trim() } : {}),
            },
          }
        : {};
  const minutes = state.reservationMinutes.trim();
  return {
    ...customer,
    items: state.lines.map((line) => ({
      variantId: line.variant.id,
      ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
      quantity: line.quantity.trim() === "" ? 0 : Number(line.quantity),
      discount: line.discount.trim() || "0",
    })),
    ...(state.shippingFee.trim() ? { shippingFee: state.shippingFee.trim() } : {}),
    ...(state.shippingName.trim() ? { shippingName: state.shippingName.trim() } : {}),
    ...(state.shippingPhone.trim() ? { shippingPhone: state.shippingPhone.trim() } : {}),
    ...(state.shippingAddress.trim() ? { shippingAddress: state.shippingAddress.trim() } : {}),
    ...(state.note.trim() ? { note: state.note.trim() } : {}),
    ...(minutes ? { reservationMinutes: Number(minutes) } : {}),
  };
}

/** `variantId|warehouseId` → shortage ເພື່ອໝາຍແຖວທີ່ສະຕ໋ອກບໍ່ພໍຫຼັງ API ຕອບ 409 */
export function shortageKeys(shortages: readonly Shortage[]): Map<string, Shortage> {
  return new Map(shortages.map((shortage) => [`${shortage.variantId}|${shortage.warehouseId}`, shortage]));
}
```

- [ ] **Step 6: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/use-countdown.test.ts src/lib/order-form.test.ts && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

```bash
git add apps/admin/src/lib/use-countdown.ts apps/admin/src/lib/use-countdown.test.ts apps/admin/src/lib/order-form.ts apps/admin/src/lib/order-form.test.ts
git commit -m "feat(admin): countdown hook and order form logic" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/use-countdown.ts apps/admin/src/lib/use-countdown.test.ts apps/admin/src/lib/order-form.ts apps/admin/src/lib/order-form.test.ts
```

---

### Task 3: `OrderStatusPill` ແລະ ໜ້າລາຍການ `/orders`

**Files:**
- Create: `apps/admin/src/components/orders/order-status.tsx`
- Create: `apps/admin/src/components/orders/order-list.tsx`, `order-list.test.tsx`
- Create: `apps/admin/src/app/(app)/orders/page.tsx`
- Modify: `apps/admin/src/lib/nav.ts`, `apps/admin/src/lib/nav.test.ts`

- [ ] **Step 1: `order-status.tsx`**

```tsx
"use client";

import type { OrderStatus } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

const TONES: Record<OrderStatus, StatusTone> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PACKING: "brand",
  SHIPPED: "brand",
  COMPLETED: "success",
  CANCELLED: "neutral",
  EXPIRED: "danger",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { t } = useT();
  return <StatusPill tone={TONES[status]}>{t(`orders.status.${status}`)}</StatusPill>;
}
```

- [ ] **Step 2: ຂຽນ test ລາຍການ ທີ່ຈະລົ້ມ** `order-list.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { OrderListItemDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderList } from "./order-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: OrderListItemDto[] = [
  { id: "o1", orderNumber: "SO-000001", status: "PENDING_PAYMENT", channel: "OFFLINE", source: "MANUAL", customer: { id: "c1", name: "Mali", phone: "02055550001" }, total: "195.00", itemCount: 2, reservedUntil: null, createdAt: "2026-10-05T05:30:00.000Z" },
  { id: "o2", orderNumber: "SO-000002", status: "PAID", channel: "FACEBOOK", source: "MANUAL", customer: null, total: "1250000.50", itemCount: 1, reservedUntil: null, createdAt: "2026-10-04T18:00:00.000Z" },
];

function mockApi(page: Page<OrderListItemDto> = { items, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async () => page) as typeof apiFetch);
}
const lastUrl = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).at(-1);

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderList", () => {
  it("ສະແດງເລກບິນ (ລິ້ງ), ລູກຄ້າ/ລູກຄ້າໜ້າຮ້ານ, ຊ່ອງທາງ, ສະຖານະ, ຍອດ (comma) ແລະ ເວລາລາວ", async () => {
    renderWithProviders(<OrderList />);
    const first = await screen.findByTestId("row-order-o1");
    expect(within(first).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(within(first).getByText("Mali")).toBeInTheDocument();
    expect(within(first).getByText("In store")).toBeInTheDocument();
    expect(within(first).getByText("Awaiting payment")).toBeInTheDocument();
    expect(within(first).getByText("195.00")).toBeInTheDocument();
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    const second = screen.getByTestId("row-order-o2");
    expect(within(second).getByText("Walk-in customer")).toBeInTheDocument();
    expect(within(second).getByText("1,250,000.50")).toBeInTheDocument();
    expect(within(second).getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("2 orders")).toBeInTheDocument();
  });

  it("filter ສະຖານະ/ຄົ້ນຫາ/ວັນທີ ຖືກສົ່ງ (ວັນທີ date-only)", async () => {
    const { user } = renderWithProviders(<OrderList />);
    await screen.findByTestId("row-order-o1");
    await user.selectOptions(screen.getByLabelText("Status"), "PAID");
    await waitFor(() => expect(lastUrl()).toContain("status=PAID"));
    await user.type(screen.getByPlaceholderText("Search order no., name or phone..."), "mali");
    await waitFor(() => expect(lastUrl()).toContain("q=mali"));
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toContain("from=2026-10-01"));
    expect(lastUrl()).toContain("to=2026-10-05");
  });

  it("ປຸ່ມ 'ສ້າງບິນ' ເປັນລິ້ງໄປ /orders/new ສະເພາະຜູ້ທີ່ມີ orders:write", async () => {
    renderWithProviders(<OrderList />);
    await screen.findByTestId("row-order-o1");
    expect(screen.getByRole("link", { name: "Create order" })).toHaveAttribute("href", "/orders/new");
  });

  it("ບໍ່ມີ orders:write: ບໍ່ມີປຸ່ມສ້າງບິນ", async () => {
    auth.canWrite = false;
    renderWithProviders(<OrderList />);
    await screen.findByTestId("row-order-o1");
    expect(screen.queryByRole("link", { name: "Create order" })).toBeNull();
  });

  it("ວ່າງ: empty state; ມີ filter: ບໍ່ພົບ; ປ່ຽນໜ້າ: page=2", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const first = renderWithProviders(<OrderList />);
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    await first.user.type(screen.getByPlaceholderText("Search order no., name or phone..."), "zzz");
    expect(await screen.findByText("No orders match your search")).toBeInTheDocument();
  });

  it("ປ່ຽນໜ້າ: ສົ່ງ page=2", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<OrderList />);
    await screen.findByTestId("row-order-o1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
  });
});
```

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 4: ຂຽນ `order-list.tsx`**

```tsx
"use client";

import { ORDER_STATUSES } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, ClipboardList, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useOrders } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { OrderStatusPill } from "./order-status";

const COLUMNS = 6;

export function OrderList() {
  const { t } = useT();
  const canWrite = useCan("orders:write");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useDebounced(search.trim(), 300);

  const query = useOrders({ q, status, from, to, page, pageSize });
  const rows = query.data?.items ?? [];
  const filtered = q !== "" || status !== "" || from !== "" || to !== "";

  const reset = () => setPage(1);

  const addButton = canWrite ? (
    <Link href="/orders/new" className={cn(buttonVariants(), "rounded-xl")}>
      <Plus aria-hidden="true" />
      {t("orders.add")}
    </Link>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title")]}
        title={t("orders.title")}
        badge={query.data ? t("orders.count", { count: query.data.total }) : undefined}
        description={t("orders.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  reset();
                }}
                placeholder={t("orders.search")}
                aria-label={t("orders.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("orders.filter.status")}
              className="w-48"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                reset();
              }}
            >
              <option value="">{t("orders.filter.allStatuses")}</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`orders.status.${value}`)}
                </option>
              ))}
            </Select>
            <label className="text-xs font-semibold text-ink-secondary">
              {t("orders.filter.from")}
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  reset();
                }}
                className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink"
              />
            </label>
            <label className="text-xs font-semibold text-ink-secondary">
              {t("orders.filter.to")}
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  reset();
                }}
                className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink"
              />
            </label>
          </div>

          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("orders.col.number")}</TableHead>
                    <TableHead>{t("orders.col.customer")}</TableHead>
                    <TableHead>{t("orders.col.channel")}</TableHead>
                    <TableHead>{t("orders.col.status")}</TableHead>
                    <TableHead className="text-right">{t("orders.col.total")}</TableHead>
                    <TableHead>{t("orders.col.created")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((order) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell>
                        <Link href={`/orders/${order.id}`} className="font-mono font-semibold text-brand-ink hover:underline">
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-ink-muted">{t("orders.itemCount", { count: order.itemCount })}</p>
                      </TableCell>
                      <TableCell className="text-ink">
                        {order.customer ? (
                          <>
                            <p>{order.customer.name}</p>
                            {order.customer.phone ? <p className="text-xs text-ink-muted">{order.customer.phone}</p> : null}
                          </>
                        ) : (
                          <span className="text-ink-secondary">{t("orders.walkIn")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-ink-secondary">{t(`orders.channel.${order.channel}`)}</TableCell>
                      <TableCell>
                        <OrderStatusPill status={order.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(order.total)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(order.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={filtered ? t("orders.empty.noResults") : t("orders.empty.title")}
                  action={
                    filtered ? (
                      <Button
                        variant="outlinePrimary"
                        className="rounded-lg"
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                          setFrom("");
                          setTo("");
                          setPage(1);
                        }}
                      >
                        {t("common.clearSearch")}
                      </Button>
                    ) : (
                      addButton
                    )
                  }
                />
              ) : null}
              <ServerPager
                page={page}
                pageSize={pageSize}
                total={query.data?.total ?? 0}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: ໜ້າ** `apps/admin/src/app/(app)/orders/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderList } from "@/components/orders/order-list";

export default function OrdersPage() {
  return (
    <PermissionGate permission="orders:read">
      <OrderList />
    </PermissionGate>
  );
}
```

- [ ] **Step 6: nav** — ໃນ `nav.ts` ເພີ່ມ `ClipboardList` ໃນ import icon ແລະ ແຊກ **ຖັດຈາກ `/stock`**:

```ts
      { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "orders:read" },
```
ແກ້ `nav.test.ts`: ກໍລະນີ `inventory:read` ເປັນ `["/products", "/stock", "/warehouses", "/categories"]` ຍັງຄືເກົ່າ (ບໍ່ມີ orders:read); ເພີ່ມກໍລະນີໃໝ່:

```ts
  it("ຜູ້ມີ orders:read ເຫັນ /orders ໃນກຸ່ມສະຕ໊ອກ (ແມ່ນບໍ່ມີ inventory:read ກໍເຫັນ)", () => {
    const groups = visibleNavGroups(["orders:read"]);
    expect(groups.map((group) => group.id)).toEqual(["inventory"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/orders"]);
  });
```
ແລະ ກໍລະນີທີ່ມີທັງ `inventory:read` + `orders:read`: `["/products", "/stock", "/orders", "/warehouses", "/categories"]`.

- [ ] **Step 7: ຣັນ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders src/lib/nav.test.ts && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

```bash
git add apps/admin/src/components/orders/order-status.tsx apps/admin/src/components/orders/order-list.tsx apps/admin/src/components/orders/order-list.test.tsx "apps/admin/src/app/(app)/orders" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts
git commit -m "feat(admin): orders list page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/orders/order-status.tsx apps/admin/src/components/orders/order-list.tsx apps/admin/src/components/orders/order-list.test.tsx "apps/admin/src/app/(app)/orders" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts
```

---

### Task 4: `CustomerPicker`

**Files:** Create `apps/admin/src/components/orders/customer-picker.tsx`, `customer-picker.test.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { CustomerPicker } from "./customer-picker";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const mali = { id: "c1", name: "Mali", phone: "02055550001", email: null };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ items: [mali], total: 1, page: 1, pageSize: 8 });
});

describe("CustomerPicker", () => {
  it("ຄົ້ນຫາ → ສະແດງຊື່ + ໂທ → ເລືອກແລ້ວ onSelect", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={onSelect} />);
    await user.type(screen.getByLabelText("Search name or phone"), "020");
    const option = await screen.findByRole("option", { name: /Mali/ });
    expect(option).toHaveTextContent("02055550001");
    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(mali);
  });

  it("ບໍ່ພົບ: ສະແດງຂໍ້ຄວາມ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "zzz");
    expect(await screen.findByText("No customers found")).toBeInTheDocument();
  });

  it("ເລືອກແລ້ວ (value): ສະແດງລູກຄ້າ ແລະ ປຸ່ມປ່ຽນ → onSelect(null)", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={mali} onSelect={onSelect} />);
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByText("02055550001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `customer-picker.tsx`**

```tsx
"use client";

import { Button, Field, Input } from "@oca/ui";
import { useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { useCustomers } from "@/lib/queries";
import type { CustomerDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

export interface CustomerPickerProps {
  value: CustomerDto | null;
  onSelect: (customer: CustomerDto | null) => void;
}

/** ຄົ້ນຫາລູກຄ້າທີ່ມີຢູ່ຕາມຊື່/ໂທລະສັບ/ອີເມວ ຜ່ານ GET /customers (ຕ້ອງ orders:read) */
export function CustomerPicker({ value, onSelect }: CustomerPickerProps) {
  const { t } = useT();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const search = useCustomers({ q });
  const showList = q !== "" && text.trim() === q && !search.isPending;

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
        <div>
          <p className="text-sm font-medium text-ink">{value.name}</p>
          {value.phone ? <p className="text-xs text-ink-secondary">{value.phone}</p> : null}
        </div>
        <Button type="button" variant="ghost" className="rounded-lg" onClick={() => onSelect(null)}>
          {t("orders.customer.change")}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Field label={t("orders.customer.search")} htmlFor="customer-search">
        <Input id="customer-search" value={text} autoComplete="off" onChange={(event) => setText(event.target.value)} />
      </Field>
      {showList ? (
        <ul role="listbox" aria-label={t("orders.customer.search")} className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
          {(search.data?.items ?? []).length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{t("orders.customer.none.found")}</li>
          ) : (
            (search.data?.items ?? []).map((customer) => (
              <li key={customer.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle focus:bg-subtle focus:outline-none"
                  onClick={() => {
                    onSelect(customer);
                    setText("");
                  }}
                >
                  <span className="font-medium text-ink">{customer.name}</span>
                  <span className="text-xs text-ink-secondary">{customer.phone ?? customer.email ?? ""}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/customer-picker.test.tsx && pnpm --filter @oca/admin typecheck` → PASS.

```bash
git add apps/admin/src/components/orders/customer-picker.tsx apps/admin/src/components/orders/customer-picker.test.tsx
git commit -m "feat(admin): customer picker" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/orders/customer-picker.tsx apps/admin/src/components/orders/customer-picker.test.tsx
```

---

### Task 5: ຟອມສ້າງບິນ `/orders/new`

**Files:** Create `apps/admin/src/components/orders/order-form.tsx`, `order-form.test.tsx`, `apps/admin/src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderForm } from "./order-form";

vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => true }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }, { warehouseId: "w2", onHand: 1, reserved: 0, available: 1 }],
};
const warehouses = [
  { id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path in overrides) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path === "/warehouses") return warehouses;
    if (path === "/settings/store") return settings;
    if (path.startsWith("/variants")) return { items: [tee], total: 1, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return { id: "new-order", orderNumber: "SO-000001" };
    return { items: [], total: 0, page: 1, pageSize: 8 };
  }) as typeof apiFetch);
}

async function addTee(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.type(screen.getByLabelText("Add item (search SKU/name)"), "tee");
  await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
}

beforeEach(() => {
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderForm", () => {
  it("ເພີ່ມສິນຄ້າ: ສະແດງແຖວ (ລາຄາ, ສາງຫຼັກ, ຂາຍໄດ້) ແລະ ສະຫຼຸບເງິນຄາດຄະເນຈາກ VAT ໃນຕັ້ງຄ່າຮ້ານ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    expect(within(row).getByText("Tee — Red")).toBeInTheDocument();
    expect(within(row).getByText("Available 8")).toBeInTheDocument();
    expect(within(row).getByLabelText("Warehouse")).toHaveValue("");
    expect(within(row).getByRole("option", { name: "Default (MAIN)" })).toBeInTheDocument();
    await user.clear(within(row).getByLabelText("Qty"));
    await user.type(within(row).getByLabelText("Qty"), "2");
    await user.type(within(row).getByLabelText("Discount"), "10");
    // 2×100 − 10 = 190 ; VAT 10% ລວມໃນລາຄາ = 17.27
    expect(await screen.findByTestId("summary-total")).toHaveTextContent("190.00");
    expect(screen.getByTestId("summary-vat")).toHaveTextContent("17.27");
    expect(screen.getByText("This is an estimate. The system calculates the real amount when saving")).toBeInTheDocument();
  });

  it("ຈຳນວນເກີນສະຕ໋ອກທີ່ຂາຍໄດ້: ເຕືອນ (ແຕ່ຍັງສົ່ງໄດ້); ປ່ຽນສາງເປັນ B2 ປ່ຽນຕົວເລກຂາຍໄດ້", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    await user.clear(within(row).getByLabelText("Qty"));
    await user.type(within(row).getByLabelText("Qty"), "9");
    expect(within(row).getByText("Exceeds available stock (8)")).toBeInTheDocument();
    await user.selectOptions(within(row).getByLabelText("Warehouse"), "w2");
    expect(within(row).getByText("Available 1")).toBeInTheDocument();
    expect(within(row).getByText("Exceeds available stock (1)")).toBeInTheDocument();
  });

  it("ສ້າງບິນ (ລູກຄ້າໜ້າຮ້ານ): POST /orders ແລ້ວໄປໜ້າລາຍລະອຽດ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    await user.clear(within(row).getByLabelText("Qty"));
    await user.type(within(row).getByLabelText("Qty"), "2");
    await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/orders", {
        method: "POST",
        body: { items: [{ variantId: "v1", quantity: 2, discount: "0" }] },
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/orders/new-order"));
  });

  it("ລູກຄ້າໃໝ່: ສົ່ງ customer { name, phone } ພ້ອມຄ່າສົ່ງ ແລະ ເວລາຈອງ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(screen.getByRole("radio", { name: "New customer" }));
    await user.type(screen.getByLabelText("Customer name"), "Mali");
    await user.type(screen.getByLabelText("Phone"), "02055550001");
    await user.type(screen.getByLabelText("Shipping fee"), "5");
    await user.type(screen.getByLabelText("Reservation time (minutes)"), "45");
    await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
    await waitFor(() => {
      const call = vi.mocked(apiFetch).mock.calls.find((c) => c[0] === "/orders");
      expect(call?.[1]).toEqual({
        method: "POST",
        body: {
          customer: { name: "Mali", phone: "02055550001" },
          items: [{ variantId: "v1", quantity: 1, discount: "0" }],
          shippingFee: "5",
          reservationMinutes: 45,
        },
      });
    });
  });

  it("ບໍ່ມີສິນຄ້າ ຫຼື ຂໍ້ມູນຜິດ: ສະແດງ issue ແລະ ບໍ່ສົ່ງ API", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
    expect(await screen.findByText("Please fix the following")).toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.some((c) => c[0] === "/orders")).toBe(false);
  });

  it("API ຕອບ INSUFFICIENT_STOCK: ໝາຍແຖວທີ່ບໍ່ພໍ ແລະ ບໍ່ໄປໜ້າອື່ນ", async () => {
    mockApi({
      "/orders": new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
        shortages: [{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 8 }],
      }),
    });
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    await user.clear(within(row).getByLabelText("Qty"));
    await user.type(within(row).getByLabelText("Qty"), "9");
    await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
    expect(await within(row).findByText("Not enough stock: needs 9 but only 8 available")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough stock");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ລຶບແຖວ; ບໍ່ມີສາງຫຼັກທີ່ເປີດ: ສະແດງຄຳເຕືອນ", async () => {
    mockApi({ "/warehouses": [{ ...warehouses[0], isDefault: false }] });
    const { user } = renderWithProviders(<OrderForm />);
    expect(await screen.findByText("There is no active default warehouse. Please pick a warehouse on each row")).toBeInTheDocument();
    await addTee(user);
    await user.click(screen.getByRole("button", { name: "Remove row" }));
    expect(screen.queryByTestId("order-line-0")).toBeNull();
  });
});
```

ໝາຍເຫດ: VAT ລວມ 10% ຂອງ 190.00 = `190 × 10 / 110` = 17.27 (ປັດ 17.2727). (ຕົວຢ່າງ 195 ໃນ test ຂອງ lib/order-form ມີຄ່າສົ່ງ 5 ຈຶ່ງໄດ້ 17.73.)

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `order-form.tsx`**

```tsx
"use client";

import { createOrderSchema } from "@oca/shared";
import { Button, Card, Field, Input, PageHeader, Select, toast } from "@oca/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage, extractShortages, shortageLines } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import {
  type CustomerMode,
  type OrderFormState,
  computeTotals,
  emptyOrderForm,
  lineAvailable,
  shortageKeys,
  toCreateOrderInput,
} from "@/lib/order-form";
import { formatIssues } from "@/lib/product-form";
import { useCreateOrder, useStoreSettings, useWarehouses } from "@/lib/queries";
import type { Shortage, VariantSearchItemDto } from "@/lib/types";
import { CustomerPicker } from "./customer-picker";

export function OrderForm() {
  const { t } = useT();
  const router = useRouter();
  const create = useCreateOrder();
  const warehouses = useWarehouses();
  const settings = useStoreSettings();

  const [form, setForm] = useState<OrderFormState>(emptyOrderForm);
  const [issues, setIssues] = useState<string[]>([]);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [saving, setSaving] = useState(false);

  const activeWarehouses = (warehouses.data ?? []).filter((warehouse) => warehouse.isActive);
  const defaultWarehouse = activeWarehouses.find((warehouse) => warehouse.isDefault) ?? null;
  const shortageByLine = useMemo(() => shortageKeys(shortages), [shortages]);
  const totals = settings.data ? computeTotals(form, settings.data) : null;

  const patch = (change: Partial<OrderFormState>) => setForm((current) => ({ ...current, ...change }));
  const patchLine = (index: number, change: Partial<OrderFormState["lines"][number]>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
    }));

  function addVariant(variant: VariantSearchItemDto) {
    setShortages([]);
    setForm((current) => ({
      ...current,
      lines: [...current.lines, { variant, warehouseId: "", quantity: "1", discount: "" }],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setShortages([]);
    const parsed = createOrderSchema.safeParse(toCreateOrderInput(form));
    if (!parsed.success) {
      setIssues(formatIssues(parsed.error.issues));
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      const order = await create.mutateAsync(parsed.data);
      toast.success(t("orders.toast.created", { number: order.orderNumber }));
      router.push(`/orders/${order.id}`);
    } catch (error) {
      setShortages(extractShortages(error));
      setIssues([errorMessage(error, t), ...shortageLines(error, t)]);
    } finally {
      setSaving(false);
    }
  }

  const modeOptions: { value: CustomerMode; label: string }[] = [
    { value: "none", label: t("orders.customer.none") },
    { value: "existing", label: t("orders.customer.existing") },
    { value: "new", label: t("orders.customer.new") },
  ];

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title"), t("orders.form.title")]}
        title={t("orders.form.title")}
        description={t("orders.form.description")}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => router.push("/orders")}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="rounded-xl font-bold" loading={saving}>
              {t("orders.submit")}
            </Button>
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {issues.length > 0 ? (
          <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            <p className="font-semibold">{t("orders.form.issues")}</p>
            <ul className="mt-1 list-inside list-disc">
              {issues.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.items")}</h2>
          {warehouses.data && !defaultWarehouse ? (
            <p className="mb-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
              {t("orders.items.noDefaultWarehouse")}
            </p>
          ) : null}
          <div className="max-w-xl">
            <VariantPicker
              id="order-variant"
              label={t("orders.items.add")}
              excludeIds={form.lines.map((line) => line.variant.id)}
              onSelect={addVariant}
            />
          </div>
          {form.lines.length === 0 ? <p className="mt-4 text-sm text-ink-muted">{t("orders.items.empty")}</p> : null}
          <div className="mt-4 space-y-3">
            {form.lines.map((line, index) => {
              const available = lineAvailable(line, defaultWarehouse?.id ?? null);
              const quantity = Number(line.quantity);
              const effectiveWarehouse = line.warehouseId || defaultWarehouse?.id || "";
              const shortage = shortageByLine.get(`${line.variant.id}|${effectiveWarehouse}`);
              const exceeds = Number.isInteger(quantity) && quantity > available;
              return (
                <div key={line.variant.id} data-testid={`order-line-${index}`} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        {line.variant.productName}
                        {line.variant.name ? ` — ${line.variant.name}` : ""}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">
                        {line.variant.sku} · {formatMoney(line.variant.price)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-lg"
                      aria-label={t("orders.items.remove")}
                      title={t("orders.items.remove")}
                      onClick={() =>
                        setForm((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-4">
                    <Field label={t("orders.items.warehouse")} htmlFor={`line-wh-${index}`}>
                      <Select
                        id={`line-wh-${index}`}
                        value={line.warehouseId}
                        onChange={(event) => patchLine(index, { warehouseId: event.target.value })}
                      >
                        <option value="">
                          {defaultWarehouse
                            ? t("orders.items.defaultWarehouse", { code: defaultWarehouse.code })
                            : t("orders.items.defaultWarehouse", { code: "—" })}
                        </option>
                        {activeWarehouses
                          .filter((warehouse) => warehouse.id !== defaultWarehouse?.id)
                          .map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {`${warehouse.code} — ${warehouse.name}`}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label={t("orders.items.quantity")} htmlFor={`line-qty-${index}`}>
                      <Input
                        id={`line-qty-${index}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) => patchLine(index, { quantity: event.target.value })}
                      />
                    </Field>
                    <Field label={t("orders.items.discount")} htmlFor={`line-discount-${index}`}>
                      <Input
                        id={`line-discount-${index}`}
                        inputMode="decimal"
                        value={line.discount}
                        onChange={(event) => patchLine(index, { discount: event.target.value })}
                      />
                    </Field>
                    <p className="pb-2 text-sm text-ink-secondary">{t("orders.items.available", { count: available })}</p>
                  </div>
                  {shortage ? (
                    <p role="status" className="mt-2 text-sm font-semibold text-danger">
                      {t("orders.items.shortage", { requested: shortage.requested, available: shortage.available })}
                    </p>
                  ) : exceeds ? (
                    <p role="status" className="mt-2 text-sm text-warning-ink">
                      {t("orders.items.exceeds", { count: available })}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.customer")}</h2>
          <div role="radiogroup" aria-label={t("orders.section.customer")} className="mb-4 flex flex-wrap gap-4">
            {modeOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="customer-mode"
                  className="accent-[var(--color-brand)]"
                  checked={form.customerMode === option.value}
                  onChange={() => patch({ customerMode: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
          {form.customerMode === "existing" ? (
            <div className="max-w-md">
              <CustomerPicker value={form.customer} onSelect={(customer) => patch({ customer })} />
            </div>
          ) : null}
          {form.customerMode === "new" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t("orders.customer.name")} htmlFor="new-customer-name" required>
                <Input
                  id="new-customer-name"
                  value={form.newCustomer.name}
                  onChange={(event) => patch({ newCustomer: { ...form.newCustomer, name: event.target.value } })}
                />
              </Field>
              <Field label={t("orders.customer.phone")} htmlFor="new-customer-phone" required>
                <Input
                  id="new-customer-phone"
                  inputMode="tel"
                  value={form.newCustomer.phone}
                  onChange={(event) => patch({ newCustomer: { ...form.newCustomer, phone: event.target.value } })}
                />
              </Field>
              <Field label={t("orders.customer.email")} htmlFor="new-customer-email">
                <Input
                  id="new-customer-email"
                  type="email"
                  value={form.newCustomer.email}
                  onChange={(event) => patch({ newCustomer: { ...form.newCustomer, email: event.target.value } })}
                />
              </Field>
            </div>
          ) : null}
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.shipping")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("orders.shipping.fee")} htmlFor="order-shipping-fee">
              <Input
                id="order-shipping-fee"
                inputMode="decimal"
                value={form.shippingFee}
                onChange={(event) => patch({ shippingFee: event.target.value })}
              />
            </Field>
            <Field label={t("orders.reservation")} htmlFor="order-reservation">
              <Input
                id="order-reservation"
                type="number"
                min={1}
                value={form.reservationMinutes}
                onChange={(event) => patch({ reservationMinutes: event.target.value })}
              />
              {settings.data ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("orders.reservationHint", { minutes: settings.data.reservationMinutes })}
                </p>
              ) : null}
            </Field>
            <Field label={t("orders.shipping.name")} htmlFor="order-shipping-name">
              <Input id="order-shipping-name" value={form.shippingName} onChange={(event) => patch({ shippingName: event.target.value })} />
            </Field>
            <Field label={t("orders.shipping.phone")} htmlFor="order-shipping-phone">
              <Input id="order-shipping-phone" inputMode="tel" value={form.shippingPhone} onChange={(event) => patch({ shippingPhone: event.target.value })} />
            </Field>
            <Field label={t("orders.shipping.address")} htmlFor="order-shipping-address" className="sm:col-span-2">
              <Input id="order-shipping-address" value={form.shippingAddress} onChange={(event) => patch({ shippingAddress: event.target.value })} />
            </Field>
            <Field label={t("orders.note")} htmlFor="order-note" className="sm:col-span-2">
              <Input id="order-note" value={form.note} onChange={(event) => patch({ note: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="max-w-md rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("orders.section.summary")}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.subtotal")}</dt>
              <dd className="tabular-nums">{totals ? formatMoney(totals.subtotal) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.discount")}</dt>
              <dd className="tabular-nums">{totals ? formatMoney(totals.discountTotal) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.shipping")}</dt>
              <dd className="tabular-nums">{formatMoney(form.shippingFee.trim() || "0")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">
                {t("orders.summary.vat", { rate: settings.data ? formatMoney(settings.data.vatRate) : "—" })}{" "}
                {settings.data?.pricesIncludeVat ? t("orders.summary.vatIncluded") : null}
              </dt>
              <dd className="tabular-nums" data-testid="summary-vat">
                {totals ? formatMoney(totals.vatAmount) : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
              <dt>{t("orders.summary.total")}</dt>
              <dd className="tabular-nums" data-testid="summary-total">
                {totals ? formatMoney(totals.total) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">{t("orders.summary.estimate")}</p>
        </Card>
      </div>
    </form>
  );
}
```

ຂໍ້ສັງເກດ test: ໃນ test "ເພີ່ມສິນຄ້າ" ຈຳນວນ 2 ແລະສ່ວນຫຼຸດ 10 → subtotal 190.00; ຄ່າສົ່ງ 0; VAT ລວມ 10%: `190 × 10 / 110 = 17.27`; total ລວມ VAT = 190.00 ✓ (`summary-total`). `summary-vat` ມີຕົວອັກສອນ "17.27" ✓.

- [ ] **Step 4: ໜ້າ** `apps/admin/src/app/(app)/orders/new/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderForm } from "@/components/orders/order-form";

export default function NewOrderPage() {
  return (
    <PermissionGate permission="orders:write">
      <OrderForm />
    </PermissionGate>
  );
}
```

- [ ] **Step 5: ຣັນ + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/order-form.test.tsx && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. (ຖ້າ `getByRole("radio", { name: "New customer" })` ບໍ່ພົບ ໃຫ້ກວດວ່າ `<label>` ຫໍ່ `<input type="radio">` — ຊື່ accessible ມາຈາກ label.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/orders/order-form.tsx apps/admin/src/components/orders/order-form.test.tsx "apps/admin/src/app/(app)/orders/new"
git commit -m "feat(admin): create order form with stock warnings and totals" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/orders/order-form.tsx apps/admin/src/components/orders/order-form.test.tsx "apps/admin/src/app/(app)/orders/new"
```

---

### Task 6: ໜ້າລາຍລະອຽດບິນ `/orders/[id]`

**Files:**
- Create: `apps/admin/src/components/orders/cancel-order-dialog.tsx`
- Create: `apps/admin/src/components/orders/order-detail.tsx`, `order-detail.test.tsx`
- Create: `apps/admin/src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ** `order-detail.test.tsx`:

```tsx
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderDetail } from "./order-detail";

const auth = vi.hoisted(() => ({ perms: new Set(["orders:read", "orders:write", "payments:write", "logistics:write", "costs:read"]) }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const base: OrderDetailDto = {
  id: "o1", orderNumber: "SO-000001", status: "PENDING_PAYMENT", channel: "OFFLINE", source: "MANUAL",
  customer: { id: "c1", name: "Mali", phone: "02055550001", email: null },
  currency: "LAK", exchangeRate: "1.000000", subtotal: "190.00", discountTotal: "10.00", shippingFee: "5.00",
  vatRate: "10.00", vatAmount: "17.73", total: "195.00", shippingName: "Mali", shippingPhone: "02055550001",
  shippingAddress: "Vientiane", note: "gift", reservedUntil: "2026-10-05T06:00:00.000Z", secondsUntilExpiry: 120,
  paidAt: null, shippedAt: null, completedAt: null, cancelledAt: null, createdAt: "2026-10-05T05:30:00.000Z",
  items: [{ id: "i1", variantId: "v1", warehouseId: "w1", productName: "Tee", variantName: "Red", sku: "TEE-R", unitPrice: "100.00", unitCost: "60.00", quantity: 2, discount: "10.00", lineTotal: "190.00" }],
  movements: [{ id: "m1", type: "RESERVE", quantity: 2, variantId: "v1", sku: "TEE-R", warehouseId: "w1", warehouseCode: "MAIN", createdAt: "2026-10-05T05:30:00.000Z" }],
};
const withStatus = (status: OrderDetailDto["status"], patch: Partial<OrderDetailDto> = {}): OrderDetailDto => ({
  ...base, status, secondsUntilExpiry: null, ...patch,
});

function mockOrder(order: OrderDetailDto) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/orders/o1" && !options?.method) return order;
    return order;
  }) as typeof apiFetch);
}
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");

beforeEach(() => {
  auth.perms = new Set(["orders:read", "orders:write", "payments:write", "logistics:write", "costs:read"]);
  vi.mocked(apiFetch).mockReset();
  mockOrder(base);
});
afterEach(() => vi.useRealTimers());

describe("OrderDetail", () => {
  it("ສະແດງເລກບິນ, ສະຖານະ, ລາຍການ (ລວມຕົ້ນທຶນເມື່ອມີ costs:read), ສະຫຼຸບເງິນ, ລູກຄ້າ, ທີ່ຢູ່, ເສັ້ນເວລາ ແລະ movement", async () => {
    renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByRole("heading", { name: "SO-000001" })).toBeInTheDocument();
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    const line = screen.getByTestId("order-item-i1");
    expect(within(line).getByText("TEE-R")).toBeInTheDocument();
    expect(within(line).getByText("100.00")).toBeInTheDocument();
    expect(within(line).getByText("60.00")).toBeInTheDocument(); // unitCost
    expect(screen.getByTestId("detail-total")).toHaveTextContent("195.00");
    expect(screen.getByText("Vientiane")).toBeInTheDocument();
    expect(screen.getByText("05/10/2026 12:30")).toBeInTheDocument(); // createdAt
    expect(screen.getByTestId("order-movement-m1")).toHaveTextContent("Reserve");
  });

  it("ບໍ່ມີ unitCost ໃນ response (ບໍ່ມີ costs:read): ບໍ່ມີຄອລຳຕົ້ນທຶນ", async () => {
    const noCost = { ...base, items: base.items.map(({ unitCost: _omit, ...item }) => item) };
    mockOrder(noCost);
    renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    expect(screen.queryByText("Unit cost")).toBeNull();
  });

  it("ນັບຖອຍ: ສະແດງເວລາທີ່ເຫຼືອ ແລະ ນັບລົງທຸກວິນາທີ", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByText("Reservation expires in 02:00")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Reservation expires in 01:55")).toBeInTheDocument();
  });

  it("ນັບຖອຍຮອດ 0: ສະແດງ 'ໝົດເວລາຈອງແລ້ວ' ແລະ ປິດປຸ່ມຢືນຢັນຊຳລະ", async () => {
    mockOrder({ ...base, secondsUntilExpiry: 0 });
    renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByText("Reservation expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });

  it("PENDING_PAYMENT: ຢືນຢັນຊຳລະ → POST /pay; ຍົກເລີກມີ", async () => {
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start packing" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(posts()).toContainEqual(["/orders/o1/pay", { method: "POST" }]));
  });

  it.each([
    ["PAID", "Start packing", "pack"],
    ["PACKING", "Ship", "ship"],
    ["SHIPPED", "Complete order", "complete"],
  ] as const)("%s: ປຸ່ມຂັ້ນຕໍ່ໄປຄື '%s' (POST /%s)", async (status, label, action) => {
    mockOrder(withStatus(status));
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(posts()).toContainEqual([`/orders/o1/${action}`, { method: "POST" }]));
    // ຂັ້ນອື່ນບໍ່ປາກົດ
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
  });

  it("SHIPPED ຍົກເລີກບໍ່ໄດ້ (ບໍ່ມີປຸ່ມ); COMPLETED/CANCELLED/EXPIRED ບໍ່ມີປຸ່ມຂັ້ນຕອນເລີຍ", async () => {
    mockOrder(withStatus("SHIPPED"));
    const first = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    first.unmount();

    for (const status of ["COMPLETED", "CANCELLED", "EXPIRED"] as const) {
      mockOrder(withStatus(status));
      const view = renderWithProviders(<OrderDetail id="o1" />);
      await screen.findByRole("heading", { name: "SO-000001" });
      expect(screen.queryAllByRole("button").filter((b) => /pay|pack|ship|complete|cancel/i.test(b.textContent ?? ""))).toHaveLength(0);
      view.unmount();
    }
  });

  it("ປຸ່ມຕາມສິດ: ມີແຕ່ logistics:write ເຫັນແພັກແຕ່ບໍ່ເຫັນຢືນຢັນຊຳລະ/ຍົກເລີກ; ມີແຕ່ orders:read ບໍ່ເຫັນປຸ່ມເລີຍ", async () => {
    auth.perms = new Set(["orders:read", "logistics:write"]);
    mockOrder(withStatus("PAID"));
    const first = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    expect(screen.getByRole("button", { name: "Start packing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    first.unmount();

    auth.perms = new Set(["orders:read"]);
    mockOrder(base);
    renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  it("ຍົກເລີກ: dialog ມີຊ່ອງເຫດຜົນ → POST /cancel { reason }", async () => {
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.type(await screen.findByLabelText("Reason (optional)"), "customer changed mind");
    // ປຸ່ມ confirm ຂອງ dialog ຊື່ "Cancel order" ເຊັ່ນກັນ (ອັນສຸດທ້າຍໃນ DOM)
    const confirm = screen.getAllByRole("button", { name: "Cancel order" }).at(-1) as HTMLElement;
    await user.click(confirm);
    await waitFor(() =>
      expect(posts()).toContainEqual(["/orders/o1/cancel", { method: "POST", body: { reason: "customer changed mind" } }]),
    );
  });

  it("action ລົ້ມດ້ວຍ ORDER_INVALID_STATE: refetch ບິນ (ສະຖານະອາດປ່ຽນແລ້ວ)", async () => {
    let fetches = 0;
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new ApiError(409, "x", [], "ORDER_INVALID_STATE", { status: "PAID" });
      if (path === "/orders/o1") {
        fetches += 1;
        return fetches === 1 ? base : withStatus("PAID");
      }
      return base;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderDetail id="o1" />);
    await screen.findByRole("heading", { name: "SO-000001" });
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByText("Paid")).toBeInTheDocument();
  });

  it("ບໍ່ພົບບິນ (404): ສະແດງຂໍ້ຄວາມ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "Order not found", [], "ORDER_NOT_FOUND"));
    renderWithProviders(<OrderDetail id="o1" />);
    expect(await screen.findByText("This order was not found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `cancel-order-dialog.tsx`**

```tsx
"use client";

import { cancelOrderSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input } from "@oca/ui";
import { useState } from "react";
import { useT } from "@/lib/i18n/language-provider";

export interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

/** ຢືນຢັນຍົກເລີກບິນ ພ້ອມເຫດຜົນ (optional, ≤200 ໂຕ) */
export function CancelOrderDialog({ open, onOpenChange, busy, onConfirm }: CancelOrderDialogProps) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const parsed = cancelOrderSchema.safeParse({ reason: reason.trim() === "" ? undefined : reason.trim() });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        <DialogHeader title={t("orders.cancel.title")} description={t("orders.cancel.description")} />
        <DialogBody>
          <Field
            label={t("orders.cancel.reason")}
            htmlFor="cancel-reason"
            error={parsed.success ? undefined : t("validation.required")}
          >
            <Input id="cancel-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("orders.cancel.keep")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 rounded-xl px-6 font-bold"
            loading={busy}
            disabled={!parsed.success}
            onClick={() => void onConfirm(reason.trim())}
          >
            {t("orders.cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: ຂຽນ `order-detail.tsx`**

```tsx
"use client";

import { Button, Card, EmptyState, PageHeader, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from "@oca/ui";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney, formatMovementQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { type OrderAction, useOrder, useOrderAction } from "@/lib/queries";
import type { OrderDetailDto } from "@/lib/types";
import { formatCountdown, useCountdown } from "@/lib/use-countdown";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { OrderStatusPill } from "./order-status";

export function OrderDetail({ id }: { id: string }) {
  const { t } = useT();
  const query = useOrder(id);

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title={notFound ? t("orders.detail.notFound") : t("common.error.load")}
          action={
            notFound ? null : (
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <OrderDetailBody order={query.data} fetchedAt={query.dataUpdatedAt} refetch={() => void query.refetch()} />;
}

const NEXT_STEP: Partial<Record<OrderDetailDto["status"], { action: OrderAction; permission: "payments:write" | "logistics:write" }>> = {
  PENDING_PAYMENT: { action: "pay", permission: "payments:write" },
  PAID: { action: "pack", permission: "logistics:write" },
  PACKING: { action: "ship", permission: "logistics:write" },
  SHIPPED: { action: "complete", permission: "logistics:write" },
};
const CANCELLABLE = new Set<OrderDetailDto["status"]>(["PENDING_PAYMENT", "PAID", "PACKING"]);
/** code ທີ່ບອກວ່າສະຖານະຂອງບິນບໍ່ຕົງກັບທີ່ເຫັນ → ໂຫຼດໃໝ່ */
const STALE_CODES = new Set(["ORDER_INVALID_STATE", "RESERVATION_EXPIRED"]);

function OrderDetailBody({ order, fetchedAt, refetch }: { order: OrderDetailDto; fetchedAt: number; refetch: () => void }) {
  const { t } = useT();
  const canPay = useCan("payments:write");
  const canLogistics = useCan("logistics:write");
  const canCancel = useCan("orders:write");
  const act = useOrderAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const remaining = useCountdown(order.secondsUntilExpiry, fetchedAt);

  // ນັບຖອຍຮອດ 0 ໃນຂະນະທີ່ API ຍັງບອກ PENDING: ໂຫຼດໃໝ່ເທື່ອດຽວ (useOrder poll ຕໍ່ເອງທຸກ 15 ວິ)
  useEffect(() => {
    if (remaining === 0 && order.status === "PENDING_PAYMENT" && order.secondsUntilExpiry !== 0) refetch();
  }, [remaining, order.status, order.secondsUntilExpiry, refetch]);

  const step = NEXT_STEP[order.status];
  const stepAllowed = step ? (step.permission === "payments:write" ? canPay : canLogistics) : false;
  const expired = order.status === "PENDING_PAYMENT" && remaining === 0;

  async function run(action: OrderAction, reason?: string) {
    try {
      await act.mutateAsync({ id: order.id, action, reason });
      toast.success(t(`orders.toast.${action}`));
    } catch (error) {
      toast.error(errorMessage(error, t));
      if (error instanceof ApiError && error.code && STALE_CODES.has(error.code)) refetch();
    } finally {
      setCancelOpen(false);
    }
  }

  const showCost = order.items.some((item) => item.unitCost !== undefined);
  const timeline: { label: string; at: string | null }[] = [
    { label: t("orders.detail.createdAt"), at: order.createdAt },
    { label: t("orders.detail.paidAt"), at: order.paidAt },
    { label: t("orders.detail.shippedAt"), at: order.shippedAt },
    { label: t("orders.detail.completedAt"), at: order.completedAt },
    { label: t("orders.detail.cancelledAt"), at: order.cancelledAt },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title"), order.orderNumber]}
        title={order.orderNumber}
        badge={t(`orders.status.${order.status}`)}
        description={
          order.status === "PENDING_PAYMENT" && remaining !== null
            ? remaining === 0
              ? t("orders.detail.expired")
              : t("orders.detail.expiresIn", { time: formatCountdown(remaining) })
            : undefined
        }
        actions={
          <>
            {step && stepAllowed ? (
              <Button
                className="rounded-xl font-bold"
                loading={act.isPending && act.variables?.action === step.action}
                disabled={act.isPending || (step.action === "pay" && expired)}
                title={step.action === "pay" && expired ? t("orders.action.payExpired") : undefined}
                onClick={() => void run(step.action)}
              >
                {t(`orders.action.${step.action}`)}
              </Button>
            ) : null}
            {CANCELLABLE.has(order.status) && canCancel ? (
              <Button variant="outlineDanger" className="rounded-xl" disabled={act.isPending} onClick={() => setCancelOpen(true)}>
                {t("orders.action.cancel")}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <h2 className="px-6 pt-5 text-base font-bold text-ink">{t("orders.detail.items")}</h2>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("orders.items.product")}</TableHead>
                <TableHead className="text-right">{t("orders.items.unitPrice")}</TableHead>
                {showCost ? <TableHead className="text-right">{t("orders.detail.unitCost")}</TableHead> : null}
                <TableHead className="text-right">{t("orders.items.quantity")}</TableHead>
                <TableHead className="text-right">{t("orders.items.discount")}</TableHead>
                <TableHead className="text-right">{t("orders.items.lineTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id} data-testid={`order-item-${item.id}`}>
                  <TableCell>
                    <p className="font-medium text-ink">
                      {item.productName}
                      {item.variantName ? ` — ${item.variantName}` : ""}
                    </p>
                    <p className="font-mono text-xs text-ink-muted">{item.sku}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.unitPrice)}</TableCell>
                  {showCost ? <TableCell className="text-right tabular-nums text-ink-secondary">{formatMoney(item.unitCost)}</TableCell> : null}
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink-secondary">{formatMoney(item.discount)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <dl className="ml-auto max-w-xs space-y-1 px-6 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.subtotal")}</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.discount")}</dt>
              <dd className="tabular-nums">{formatMoney(order.discountTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.shipping")}</dt>
              <dd className="tabular-nums">{formatMoney(order.shippingFee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">{t("orders.summary.vat", { rate: formatMoney(order.vatRate) })}</dt>
              <dd className="tabular-nums">{formatMoney(order.vatAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
              <dt>{t("orders.summary.total")}</dt>
              <dd className="tabular-nums" data-testid="detail-total">
                {formatMoney(order.total)} {order.currency}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="rounded-[20px] p-6">
            <h2 className="mb-3 text-base font-bold text-ink">{t("orders.detail.customer")}</h2>
            {order.customer ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-ink">{order.customer.name}</p>
                {order.customer.phone ? <p className="text-ink-secondary">{order.customer.phone}</p> : null}
                {order.customer.email ? <p className="text-ink-secondary">{order.customer.email}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-ink-secondary">{t("orders.walkIn")}</p>
            )}
            <div className="mt-3">
              <OrderStatusPill status={order.status} />
            </div>
          </Card>
          <Card className="rounded-[20px] p-6">
            <h2 className="mb-3 text-base font-bold text-ink">{t("orders.detail.shipping")}</h2>
            <div className="space-y-1 text-sm text-ink-secondary">
              {order.shippingName ? <p className="font-medium text-ink">{order.shippingName}</p> : null}
              {order.shippingPhone ? <p>{order.shippingPhone}</p> : null}
              {order.shippingAddress ? <p>{order.shippingAddress}</p> : null}
              {!order.shippingName && !order.shippingPhone && !order.shippingAddress ? <p>—</p> : null}
              {order.note ? <p className="mt-2 whitespace-pre-line border-t border-line pt-2">{order.note}</p> : null}
            </div>
          </Card>
          <Card className="rounded-[20px] p-6">
            <h2 className="mb-3 text-base font-bold text-ink">{t("orders.detail.timeline")}</h2>
            <ol className="space-y-2 text-sm">
              {timeline
                .filter((entry) => entry.at !== null)
                .map((entry) => (
                  <li key={entry.label} className="flex justify-between gap-3">
                    <span className="text-ink-secondary">{entry.label}</span>
                    <span className="tabular-nums text-ink">{formatDateTime(entry.at)}</span>
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <Card className="overflow-hidden rounded-[20px]">
          <h2 className="px-6 pt-5 text-base font-bold text-ink">{t("orders.detail.movements")}</h2>
          {order.movements.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-muted">{t("orders.detail.noMovements")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("stock.mov.col.time")}</TableHead>
                  <TableHead>{t("stock.mov.col.type")}</TableHead>
                  <TableHead>{t("stock.mov.col.item")}</TableHead>
                  <TableHead>{t("stock.mov.col.warehouse")}</TableHead>
                  <TableHead className="text-right">{t("stock.mov.col.quantity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.movements.map((movement) => (
                  <TableRow key={movement.id} data-testid={`order-movement-${movement.id}`}>
                    <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(movement.createdAt)}</TableCell>
                    <TableCell>{t(`stock.type.${movement.type}`)}</TableCell>
                    <TableCell className="font-mono text-xs">{movement.sku}</TableCell>
                    <TableCell className="font-mono text-sm">{movement.warehouseCode}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMovementQuantity(movement.type, movement.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <CancelOrderDialog
        key={cancelOpen ? "open" : "closed"}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        busy={act.isPending}
        onConfirm={(reason) => run("cancel", reason || undefined)}
      />
    </div>
  );
}
```

ໝາຍເຫດ:
- `key={cancelOpen ? "open" : "closed"}` ຮີເຊັດຊ່ອງເຫດຜົນທຸກຄັ້ງທີ່ເປີດ.
- `useOrder` ມີ `dataUpdatedAt` (ເວລາ refetch ຄັ້ງຫຼ້າສຸດ) ເປັນ `resetKey` ຂອງ `useCountdown` ຈຶ່ງຮີເຊັດຕາມ response ໃໝ່.
- ຖ້າ test "ຂັ້ນຕໍ່ໄປ" ກວດ `screen.queryByRole("button", { name: "Confirm payment" })` ຫຼັງ `PAID` ແລ້ວມີ `Ship`... ບໍ່ຂັດ.
- `Ship` ໃນ test ໃຊ້ `getByRole("button", { name: "Ship" })` — ກວດໃຫ້ແນ່ໃຈວ່າມີປຸ່ມດຽວທີ່ຊື່ກົງ (regex ເຕັມ `^Ship$` ເປັນຄ່າເລີ່ມຕົ້ນຂອງ string name = exact match) ✓.

- [ ] **Step 5: ໜ້າ** `apps/admin/src/app/(app)/orders/[id]/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderDetail } from "@/components/orders/order-detail";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="orders:read">
      <OrderDetail id={id} />
    </PermissionGate>
  );
}
```

- [ ] **Step 6: ຣັນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. ຖ້າ test ນັບຖອຍລົ້ມເພາະ fake timers ກັບ TanStack Query ໃຫ້ໃຊ້ `vi.useFakeTimers({ shouldAdvanceTime: true })` ຕາມທີ່ຂຽນ ແລະ `await screen.findBy...` ກ່ອນ advance (ຕາມ test).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/orders/cancel-order-dialog.tsx apps/admin/src/components/orders/order-detail.tsx apps/admin/src/components/orders/order-detail.test.tsx "apps/admin/src/app/(app)/orders/[id]"
git commit -m "feat(admin): order detail with countdown, permission-aware actions and cancel" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/orders/cancel-order-dialog.tsx apps/admin/src/components/orders/order-detail.tsx apps/admin/src/components/orders/order-detail.test.tsx "apps/admin/src/app/(app)/orders/[id]"
```

---

### Task 7: ກວດທັງ repo + smoke ຂ້າມບົດບາດ

- [ ] **Step 1:** `pnpm lint && pnpm build && pnpm test` → ຂຽວທັງໝົດ.
- [ ] **Step 2: smoke ດ້ວຍ browser** (ເປີດ API :3002 + admin :3100 ຕາມ A4 Task 11; **worker ຂອງຜູ້ໃຊ້ຍັງແລ່ນຢູ່ (ຢ່າ kill)** ຈຶ່ງເຫັນການ expire ໄດ້ຈິງ; ຫ້າມແຕະ 5432/6379). ເຕັມວົງຈອນດ້ວຍ OWNER:
  1. ກຽມ: ມີສິນຄ້າ ACTIVE ທີ່ມີສະຕ໋ອກ ≥ 5 ໃນສາງຫຼັກ (A5/A6).
  2. `/orders/new`: ຄົ້ນຫາ SKU ແລ້ວເພີ່ມ; ໃສ່ຈຳນວນເກີນຍອດຂາຍໄດ້ → ເຫັນຄຳເຕືອນສີເຫຼືອງ; ກົດສ້າງບິນ → ເຫັນ 409 "ສະຕ໋ອກບໍ່ພໍ" ພ້ອມຂໍ້ຄວາມໃນແຖວ; ແກ້ເປັນຈຳນວນທີ່ພໍ → ສ້າງສຳເລັດ ແລະໄປໜ້າລາຍລະອຽດ; ເຫັນນັບຖອຍ.
  3. ຢືນຢັນຊຳລະ → ເລີ່ມແພັກ → ສົ່ງ → ປິດບິນ; ແຕ່ລະຂັ້ນສະຖານະ/ເສັ້ນເວລາ/movement ປ່ຽນ; ກວດ `/stock` ວ່າ `reserved` ແລະ `onHand` ຖືກ.
  4. ສ້າງບິນອີກໃບ ຕັ້ງ "ເວລາຈອງ" = 1 ນາທີ ແລ້ວລໍ → ຫຼັງຮອດ 0 ໜ້າສະແດງ "ໝົດເວລາຈອງແລ້ວ" ແລະປຸ່ມຢືນຢັນຊຳລະຖືກປິດ; ຫຼັງ worker ຮັນ (≤ 60 ວິ) ສະຖານະເປັນ "ໝົດເວລາຈອງ" ເອງ; ສະຕ໋ອກຖືກຄືນ.
  5. ຍົກເລີກບິນ PAID ພ້ອມເຫດຜົນ → ສະຕ໋ອກຄືນ; ເຫດຜົນປາກົດໃນໝາຍເຫດຂອງບິນ.
  6. ບົດບາດ: ສ້າງຜູ້ໃຊ້ CHAT_ADMIN, WAREHOUSE, ACCOUNTANT ຜ່ານ `/staff` (ໃຊ້ role ຕາມ seed ຈິງ; ຖ້າ DB ເດີມຍັງບໍ່ມີສິດໃໝ່ ໃຫ້ແກ້ role ຜ່ານ `/roles` ຕາມ DEPLOYMENT-NOTES §10 ກ່ອນ):
     * CHAT_ADMIN: ສ້າງບິນໄດ້; ບໍ່ເຫັນຄອລຳຕົ້ນທຶນ; ບໍ່ເຫັນປຸ່ມຢືນຢັນຊຳລະ; ເຫັນປຸ່ມຍົກເລີກ.
     * WAREHOUSE: ເຫັນບິນ; ບໍ່ເຫັນ "ສ້າງບິນ"; ບິນ PAID ເຫັນ "ເລີ່ມແພັກ" ແຕ່ບໍ່ເຫັນຢືນຢັນຊຳລະ/ຍົກເລີກ.
     * ACCOUNTANT: ເຫັນບິນ + ຕົ້ນທຶນ; ບໍ່ມີປຸ່ມຂັ້ນຕອນເລີຍ.
- [ ] **Step 3:** ກວາດຂໍ້ມູນທົດສອບ (ບິນທີ່ສ້າງ → ຍົກເລີກ/ປິດ), ລຶບຜູ້ໃຊ້ທົດສອບ, ຢຸດ process ທີ່ເຮົາເປີດເອງ.
- [ ] **Step 4:** ອັບເດດ memory `phase1-progress` (1a-ui ຄົບ A4–A7; ຕໍ່ໄປ: final review ຂອງ 1a, ເປີດ PR, ແລ້ວ sub-project Inbox/CF/Slip) ແລະ `README.md`/`docs/ROADMAP.md` ໝາຍ 1a ສຳເລັດ (spec §12).

---

## Self-review

* **Spec §10 `/orders`, `/orders/new`, `/orders/[id]`:** ລາຍການ + filter ສະຖານະ/ຄົ້ນຫາ/ວັນທີ (Task 3); ຟອມສ້າງບິນ: autocomplete variant, ສາງ, ຈຳນວນ, ສ່ວນຫຼຸດ, ສະຕ໋ອກຂາຍໄດ້ຂ້າງແຖວ + ເຕືອນເກີນ, ລູກຄ້າ (ຄົ້ນຫາ/ໃໝ່/ໜ້າຮ້ານ), ຄ່າສົ່ງ/ທີ່ຢູ່/ໝາຍເຫດ/ນາທີຈອງ, ສະຫຼຸບເງິນຝັ່ງ client, `shortages` ຕໍ່ແຖວ (Task 5); ລາຍລະອຽດ: ສ່ວນຫົວ + ນັບຖອຍ, ລາຍການ snapshot, ສະຫຼຸບເງິນ, ລູກຄ້າ/ທີ່ຢູ່, ເສັ້ນເວລາ, ປຸ່ມຂັ້ນຕໍ່ໄປ + ຍົກເລີກ (dialog), ປະຫວັດ movement (Task 6).
* **Role model (§6.1):** ທຸກປຸ່ມຜູກສິດຖືກ (pay=`payments:write`, pack/ship/complete=`logistics:write`, create/cancel=`orders:write`), ໜ້າ/ເມນູ=`orders:read`, ຄອລຳຕົ້ນທຶນມາຈາກ response (Task 6 test ກວດທັງສອງກໍລະນີ).
* **Contract ຂອງ API ທີ່ແກ້ແລ້ວ:** date-only (Task 3), `vatRate` string (Task 5 ໃຊ້ `formatMoney` ແລະ `calculateOrderTotals` ກັບ string), `code` ຄົງທີ່ (ORDER_INVALID_STATE/RESERVATION_EXPIRED → refetch; INSUFFICIENT_STOCK → ແຖວ), `GET /customers` ແລະ `GET /variants` (Task 4, 5), 404 ຂອງ id ໃນ body ສະແດງຜ່ານ `errorMessage`.
* **ຊື່ສອດຄ່ອງ:** `OrderFormState`/`OrderLineDraft` (order-form.ts) ໃຊ້ໃນ Task 5; `useOrderAction`+`OrderAction` (Task 1) ໃຊ້ໃນ Task 6; `useCountdown`/`formatCountdown` (Task 2) ໃຊ້ໃນ Task 6; `shortageKeys` + `extractShortages`/`shortageLines` (A6) ໃຊ້ໃນ Task 5.
* **ສິ່ງທີ່ຍັງເປັນຂໍ້ຈຳກັດ:** key ຂອງ `Idempotency-Key` ຢູ່ໃນ ref ຂອງຟອມ ຈຶ່ງເສຍເມື່ອ reload/remount ຫຼັງ request ທີ່ໝົດເວລາ (ບັນທຶກໄວ້ໃນໂຄດ); ການຮັບຄືນຜູກບິນຍັງບໍ່ມີ UI (A6).

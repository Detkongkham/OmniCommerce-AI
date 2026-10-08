# Phase 2: ໂມດູນ 12 (Staff KPI & Audit Trail) ແລະ ໂມດູນ 10 (Analytics & Financial Reports)

ວັນທີ: 2026-10-08 · ສະຖານະ: ສຳເລັດ · Branch: `claude/epic-rubin-e7lska`

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

SYSTEM_BLUEPRINT §12 ແລະ §10 ສຳລັບຮ້ານດຽວ ໂດຍໃຊ້ຂໍ້ມູນທີ່ລະບົບມີແລ້ວ (ບິນ, ຂໍ້ຄວາມ, AuditLog, StockMovement).

**ຢູ່ໃນຂອບເຂດ**
- 12: KPI ຕໍ່ພະນັກງານ (ເວລາຕອບແຊັດສະເລ່ຍ, ຍອດປິດການຂາຍ, ຈຳນວນກ່ອງທີ່ແພັກ, ຍົກເລີກບິນ, ປັບສະຕ໋ອກ) + ລາຍວັນ; ໜ້າເບິ່ງ Audit Trail (ກັ່ນຕອງ ຜູ້ໃຊ້/ການກະທຳ/entity/ວັນທີ, ເບິ່ງ before/after).
- 10: P&L ຂັ້ນຕົ້ນ (ຍອດຂາຍ, ສ່ວນຫຼຸດ, ຄ່າສົ່ງທີ່ເກັບ, VAT, ລາຍຮັບສຸທິ, COGS, ກຳໄລຂັ້ນຕົ້ນ), ຍອດລາຍວັນ, ປຽບທຽບຊ່ອງທາງ/ແຫຼ່ງບິນ, ສິນຄ້າຂາຍດີ, ສິນຄ້າຄ້າງສະຕ໋ອກ (deadstock), ສົ່ງອອກ CSV ສຳລັບບັນຊີ.

**ບໍ່ຢູ່ໃນຂອບເຂດ**: ຕົ້ນທຶນຂົນສົ່ງ ແລະ ຄ່າທຳນຽມ payment (ຍັງບໍ່ມີຂໍ້ມູນ, ລໍໂມດູນ 8/9) ຈຶ່ງເປັນ "ກຳໄລຂັ້ນຕົ້ນ" ບໍ່ແມ່ນກຳໄລສຸທິ; ໄຟລ໌ .xlsx (CSV ມີ BOM UTF-8 ເປີດໃນ Excel ໄດ້ ລວມພາສາລາວ); ສິດລະອຽດໃໝ່ (ໃຊ້ permission ທີ່ມີ); ການແຈ້ງເຕືອນທຸຈະລິດອັດຕະໂນມັດ.

## 2. ຂໍ້ມູນ (migration `staff_kpi_analytics`, ເພີ່ມຢ່າງດຽວ)

- `Order.createdById String?` FK → `User`, `onDelete: SetNull`: ພະນັກງານທີ່ເປີດບິນ (ບິນ CF = null = ລະບົບ). Backfill ຈາກ `AuditLog` (`action = 'order.create'`, `entityId = Order.id`).
- Index: `Order(createdById, createdAt)`, `Order(paidAt)`, `AuditLog(action, createdAt)`, `AuditLog(createdAt)`, `Message(sentByUserId, createdAt)`, `StockMovement(actorId, createdAt)`.

## 3. ກົດການນັບ

- ຊ່ວງວັນທີຂອງລາຍງານ: `from`, `to` ເປັນ date-only (ເວລາຮ້ານ UTC+7), `to` ຮວມມື້ສຸດທ້າຍ, ສູງສຸດ 366 ມື້ (ເກີນ = 400). ແບ່ງມື້ດ້ວຍ `AT TIME ZONE 'Asia/Vientiane'`.
- **ບິນທີ່ນັບເປັນຍອດຂາຍ** = ສະຖານະ PAID, PACKING, SHIPPED, COMPLETED ແລະ ນັບຕາມ `paidAt` ໃນຊ່ວງ (ເກນເງິນສົດ). ບິນທີ່ຍົກເລີກຫຼັງຈ່າຍ ບໍ່ນັບ.
- P&L: `grossSales = Σ(subtotal + discountTotal)`, `discounts = Σ discountTotal`, `shippingIncome = Σ shippingFee`, `vat = Σ vatAmount`, `revenue = Σ(total − vatAmount)` (ລາຍຮັບກ່ອນ VAT ລວມຄ່າສົ່ງ), `cogs = Σ(unitCost × quantity)`, `grossProfit = revenue − cogs`, `grossMargin = grossProfit / revenue × 100` (null ຖ້າ revenue = 0). ເງິນເປັນ string 2 ທົດສະນິຍົມ.
- KPI ພະນັກງານ (ຕໍ່ user ທີ່ active ຫຼື ມີກິດຈະກຳໃນຊ່ວງ):
  - `ordersCreated`: ບິນທີ່ `createdById` = user, `createdAt` ໃນຊ່ວງ. `salesClosed`/`salesAmount`: ໃນນັ້ນ ສະຖານະ PAID..COMPLETED (ລວມ `total`).
  - `ordersPacked`, `ordersShipped`, `ordersCancelled`: ນັບ AuditLog `order.pack`/`order.ship`/`order.cancel` ຂອງ user ໃນຊ່ວງ.
  - `stockAdjustments`: StockMovement `ADJUST` ທີ່ `actorId` = user.
  - `messagesSent`: Message OUT ທີ່ `sentByUserId` = user, ບໍ່ FAILED.
  - `avgResponseSeconds`/`responses`: "ຮອບຂອງລູກຄ້າ" = ຂໍ້ຄວາມ IN ທີ່ຂໍ້ຄວາມກ່ອນໜ້າໃນເຄສບໍ່ແມ່ນ IN (ຫຼື ບໍ່ມີ). ຄຳຕອບ = ຂໍ້ຄວາມ OUT ທີ່ບໍ່ FAILED ອັນທຳອິດຫຼັງຈາກນັ້ນ; ນັບໃຫ້ຜູ້ສົ່ງຖ້າມີ `sentByUserId` (OUT ຂອງລະບົບບໍ່ນັບ). ຮອບນັບຕາມເວລາຂໍ້ຄວາມ IN ໃນຊ່ວງ. ສະເລ່ຍເປັນວິນາທີ (ເລກເຕັມ), null ຖ້າບໍ່ມີ.

## 4. API

ທຸກ endpoint ກວດ zod ແລະ ເຂົ້າ permission sweep.

**Staff (`staff:read`)**
- `GET /staff-kpi?from&to` → `{ from, to, rows: StaffKpiRow[] }` ລຽງ `salesAmount` ຫຼາຍ→ໜ້ອຍ. `StaffKpiRow = { user: {id,name,email,isActive,roleName}, ordersCreated, salesClosed, salesAmount, ordersPacked, ordersShipped, ordersCancelled, stockAdjustments, messagesSent, responses, avgResponseSeconds }`.
- `GET /staff-kpi/:userId/daily?from&to` → `{ user, days: [{ date, ...ຕົວເລກດຽວກັນ }] }` ຄົບທຸກມື້ (ມື້ບໍ່ມີກິດຈະກຳ = 0). user ບໍ່ພົບ → 404 `STAFF_NOT_FOUND`.
- `GET /audit-logs?userId&action&entity&entityId&from&to&page&pageSize` → Page ຂອງ `{ id, createdAt, action, entity, entityId, ip, user: {id,name,email}|null, before, after }` ລຽງໃໝ່→ເກົ່າ. `action` ກົງທັງໝົດ ຫຼື ລົງທ້າຍ `.*` = prefix (ເຊັ່ນ `order.*`). `from`/`to` ໃຊ້ `dateBound` ເດີມ.
- `GET /audit-logs/facets` → `{ actions: string[], entities: string[] }` (distinct, ສຳລັບ dropdown).

**Analytics (`analytics:read`)**
- `GET /analytics/summary?from&to` → P&L (§3) + `orders`, `units`, `avgOrderValue`, `customers` (ບໍ່ຊ້ຳ), `cancelled` (ບິນ `cancelledAt` ໃນຊ່ວງ), `pendingAmount` (ລວມ total ຂອງ PENDING_PAYMENT ທີ່ສ້າງໃນຊ່ວງ).
- `GET /analytics/daily?from&to` → `{ days: [{ date, orders, revenue, cogs, grossProfit }] }` ຄົບທຸກມື້.
- `GET /analytics/channels?from&to` → `{ channels: [{ channel, orders, revenue, share, cogs, grossProfit }], sources: [{ source, ... }] }` (share = % ຂອງ revenue, 1 ທົດສະນິຍົມ).
- `GET /analytics/top-products?from&to&limit(1..50, 10)` → `[{ variantId, sku, productName, variantName, units, revenue, cogs, grossProfit }]` ຕາມ units (ເທົ່າກັນ → revenue). revenue ຕໍ່ລາຍການ = `lineTotal` (ກ່ອນແຍກ VAT ລະດັບບິນ).
- `GET /analytics/deadstock?days(7..365, 60)&page&pageSize` → Page ຂອງ variant ທີ່ `onHand` ລວມທຸກສາງ > 0 ແລະ ບໍ່ມີບິນ (PAID..COMPLETED ຕາມ paidAt) ໃນ `days` ມື້ຫຼ້າສຸດ: `{ variantId, sku, productName, variantName, onHand, stockValue, lastSoldAt }` ລຽງ `stockValue` ຫຼາຍ→ໜ້ອຍ. `stockValue = onHand × costPrice`.
- `GET /analytics/export.csv?from&to` → CSV (UTF-8 BOM, `Content-Disposition: attachment; filename="sales-<from>-<to>.csv"`) ໜຶ່ງແຖວຕໍ່ບິນທີ່ນັບເປັນຍອດຂາຍ: orderNumber, paidAt (ເວລາຮ້ານ), status, channel, source, customer, phone, subtotal, discount, shipping, vat, total, revenue, ແລະ cogs, grossProfit ສະເພາະຜູ້ມີ `costs:read`. ຄ່າທີ່ຂຶ້ນຕົ້ນ `= + - @` ໃສ່ `'` ນຳໜ້າ (ກັນ CSV injection).

**ຕົ້ນທຶນ**: ເພີ່ມ `cogs`, `grossProfit`, `grossMargin`, `stockValue` ເຂົ້າ `COST_FIELDS` ຂອງ `CostRedactionInterceptor` → ຜູ້ບໍ່ມີ `costs:read` ໄດ້ລາຍງານໂດຍບໍ່ມີ field ເຫຼົ່ານີ້ (ລວມ before/after ຂອງ audit ທີ່ມີ `costPrice`). CSV ບໍ່ຜ່ານ interceptor ຈຶ່ງກວດສິດໃນ service.

`createdById` ຖືກຕັ້ງໃນ `OrdersService.create` (ບິນ CF = null).

## 5. Admin

- ກຸ່ມເມນູໃໝ່ "ລາຍງານ" (ກ່ອນ "ຕັ້ງຄ່າ"): `/analytics` (`analytics:read`), `/staff-kpi` ແລະ `/audit` (`staff:read`).
- ຕົວເລືອກຊ່ວງວັນທີຮ່ວມ: ປຸ່ມ 7 ມື້ / 30 ມື້ / ເດືອນນີ້ / ເດືອນກ່ອນ + input ວັນທີ from/to (ຄ່າເລີ່ມ 30 ມື້).
- `/analytics`: stat tiles (ລາຍຮັບ, ບິນ, ສະເລ່ຍຕໍ່ບິນ, ກຳໄລຂັ້ນຕົ້ນ + margin ຖ້າມີ costs:read), ກາຟແທ່ງລາຍຮັບລາຍວັນ (recharts, ສີ brand, ຄວາມສູງ 280), ຕາຕະລາງ P&L, ຊ່ອງທາງ (ແທ່ງແນວນອນ + ຕາຕະລາງ), ແຫຼ່ງບິນ, ສິນຄ້າຂາຍດີ, deadstock (ເລືອກ 30/60/90 ມື້, ແບ່ງໜ້າ), ປຸ່ມ "ສົ່ງອອກ CSV".
- `/staff-kpi`: ຕາຕະລາງ KPI (ເວລາຕອບເປັນ ນ:ວ); ກົດແຖວ → dialog ລາຍວັນ (ກາຟແທ່ງ ຍອດປິດການຂາຍ + ຕາຕະລາງ).
- `/audit`: ຕາຕະລາງ (ເວລາ, ຜູ້ໃຊ້, ການກະທຳ, entity + ລິ້ງໄປ order/product ຖ້າຮູ້ຈັກ, IP) + filter (ພະນັກງານ, ການກະທຳ, entity, ວັນທີ); ກົດ "ລາຍລະອຽດ" → dialog ສະແດງ field ທີ່ປ່ຽນ (before → after).
- i18n ລາວ/ອັງກິດ, ສີ chart ຕາມ DESIGN §15, ມີ label/ຕາຕະລາງຄູ່ກັບກາຟ.

## 6. ການທົດສອບ

- API e2e: KPI (ບິນ/pack/cancel/adjust/ຂໍ້ຄວາມ ຖືກນັບໃຫ້ຄົນຖືກ, ເວລາຕອບ: OUT ຂອງລະບົບບໍ່ນັບ, ຮອບທີ່ IN ຕິດກັນນັບຄັ້ງດຽວ, FAILED ບໍ່ນັບ), daily ຄົບມື້, audit (filter, prefix, ແບ່ງໜ້າ, redaction ຕົ້ນທຶນ), analytics (ເກນ paidAt, ບິນຍົກເລີກ/ຄ້າງຈ່າຍບໍ່ນັບ, COGS, ຊ່ອງທາງ, top, deadstock, CSV + ສິດ costs), ຊ່ວງວັນທີຜິດ/ເກີນ 366 = 400, permission sweep, migration backfill.
- Admin: component tests ຂອງ 3 ໜ້າ + ຕົວເລືອກວັນທີ + nav.

## 7. ຄວາມສ່ຽງ

- Query ລາຍງານເປັນ raw SQL ເທິງຕາຕະລາງຈິງ (ບໍ່ມີ rollup): ພຽງພໍສຳລັບຮ້ານດຽວ (ຫຼັກໝື່ນບິນ/ປີ). ຖ້າຊ້າ ເພີ່ມ materialized view ພາຍຫຼັງ.
- ຂໍ້ມູນ KPI ການແພັກມາຈາກ AuditLog: ຖ້າ audit ບັນທຶກລົ້ມ (ຫຼັງ commit) ຈະບໍ່ຖືກນັບ.
- ເວລາຕອບແຊັດບໍ່ຫັກເວລານອກໂມງເຮັດວຽກ.

# Phase 1 Inbox 2a-3 (ເປີດບິນຈາກແຊັດ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ເປີດບິນຈາກແຖບຂ້າງຂອງ `/inbox`: ສ້າງບິນດ້ວຍ Orders ເດີມ (`channel=FACEBOOK`, `source=CHAT`, ຜູກກັບການສົນທະນາ), ເຫັນບິນຂອງເຄສໃນແຖບຂ້າງ ແລະ ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດ (ຖ້າສົ່ງບໍ່ໄດ້ ບິນບໍ່ຖືກສ້າງຊ້ຳ ແລະ ລອງສົ່ງໃໝ່ໄດ້). ບໍ່ລວມ: payment link, AI, auto-routing, channel ອື່ນ.

**Architecture:** Backend ຂະຫຍາຍ `POST /orders` ໃຫ້ຮັບ `conversationId` ທາງເລືອກ (server ກຳນົດ `channel`/`source` ຈາກເຄສເອງ ບໍ່ຮັບຈາກ client) ແລະ `GET /orders?conversationId=`. Admin ໃຊ້ route ເດີມ `/orders/new?conversationId=<id>`: `OrderForm` ໄດ້ prop `chat` (prefill ລູກຄ້າ + ຕິດ `conversationId` ໃສ່ payload + checkbox "ສົ່ງສະຫຼຸບ") ຫໍ່ດ້ວຍ `ChatOrderPage` ທີ່ຮັບຜິດຊອບການສົ່ງສະຫຼຸບ (`buildOrderSummary` ເປັນ pure function) ຫຼັງບິນຖືກສ້າງ ແລະ ໜ້າຜົນລັບ (retry ໂດຍບໍ່ສ້າງບິນໃໝ່). `SidePanel` ໄດ້ສ່ວນ "ບິນ" (`ConversationOrders`) + ປຸ່ມ "ເປີດບິນ".

**Tech Stack:** NestJS 11, Prisma 7, zod 4, vitest + supertest (API); Next.js 16 (App Router), React 19, TanStack Query 5, `@oca/ui`, vitest + Testing Library (admin).

Spec: `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md` §5 (Order.conversationId), §7 (ສິດ), §8 (ເປີດບິນ). Backend ທີ່ plan ນີ້ຕໍ່ຍອດ: `2026-10-06-phase1-b1-inbox-api.md`, `2026-10-07-phase1-b2-inbox-ui.md` (ເຮັດແລ້ວ).

## ການຕັດສິນໃຈຂອງ plan ນີ້ (ອັບເດດ spec ໃນ Task 5)

1. **`channel`/`source` ບໍ່ຮັບຈາກ client**: `createOrderSchema` ເປັນ `strictObject` ແລະ ບໍ່ມີ field ທັງສອງ. ເມື່ອມີ `conversationId` server ຕັ້ງ `channel = conversation.channel` (ປັດຈຸບັນມີ FACEBOOK ຢ່າງດຽວ) ແລະ `source = CHAT`; ບໍ່ມີ `conversationId` = `OFFLINE/MANUAL` ຄືເດີມ. ເຫດຜົນ: ບໍ່ມີທາງສົ່ງຄູ່ທີ່ຂັດກັນ ຈຶ່ງບໍ່ຕ້ອງມີ error code ໃໝ່ ແລະ ເພີ່ມ channel (Instagram...) ໃນອະນາຄົດບໍ່ຕ້ອງແກ້ API. ການສົ່ງ `channel`/`source` ມາເອງ = 400 `VALIDATION_FAILED` (strict).
2. **ສິດຝັ່ງ API**: ຖ້າມີ `conversationId` ຜູ້ເອີ້ນຕ້ອງມີ `inbox:write` ເພີ່ມຈາກ `orders:write` (ບໍ່ຢ່າງນັ້ນຄົນທີ່ບໍ່ມີ inbox ເດົາ id ເຄສເພື່ອຜູກບິນ/ກວດວ່າເຄສມີຢູ່ໄດ້). ກວດກ່ອນຫາເຄສ ຈຶ່ງບໍ່ຮົ່ວ 404 vs 403. ຜິດ = 403 `FORBIDDEN`. ປຸ່ມຢູ່ UI ຕ້ອງ `inbox:write` + `orders:write` + `inventory:read` ຕາມກັນ.
3. **ບໍ່ແກ້ `Conversation.customerId` ອັດຕະໂນມັດ**: ບິນເລືອກລູກຄ້າຄົນໃດກໍ່ໄດ້ (ແມ່ນແຕ່ຄົນອື່ນທີ່ບໍ່ແມ່ນຄົນທີ່ລິ້ງກັບເຄສ); ການລິ້ງເຄສກັບລູກຄ້າເປັນການກະທຳແຍກຂອງແຖບຂ້າງ (ມີຢູ່ແລ້ວ). ຟອມ prefill ລູກຄ້າຈາກເຄສເມື່ອມີ; ຖ້າເຄສຍັງບໍ່ລິ້ງ ຜູ້ໃຊ້ເລືອກ/ສ້າງລູກຄ້າເອງໃນຟອມ ແລະ ມີຄຳບອກວ່າຈະບໍ່ລິ້ງເຄສໃຫ້.
4. **ແຖບຂ້າງທີ່ບໍ່ມີ `orders:read`**: ເຊື່ອງລາຍການບິນ (API 403); ປຸ່ມ "ເປີດບິນ" ຍັງສະແດງຖ້າມີ `orders:write`+`inventory:read`+`inbox:write`.
5. **ໃຊ້ route ໜ້າເຕັມ `/orders/new?conversationId=`** ແທນ dialog: ຟອມບິນເປັນໜ້າໃຫຍ່ (ຕາຕະລາງລາຍການ min-w-720, ຄົ້ນຫາ variant, ສະຕ໋ອກ) ບໍ່ເໝາະກັບ dialog 320px; ຫຼັງສຳເລັດກັບໄປ `/inbox?c=<id>`.
6. **ການສົ່ງສະຫຼຸບ**: ສົ່ງຫຼັງບິນຖືກສ້າງແລ້ວ ຜ່ານ `useSendMessage` ເດີມ ເປັນຂໍ້ຄວາມພາສາລາວ (ຂໍ້ຄວາມຫາລູກຄ້າ ບໍ່ຜ່ານ i18n). ການສົ່ງ "ລົ້ມ" ມີສອງແບບ: API ຕອບ 201 ແຕ່ `status=FAILED` (ເຊັ່ນ `OUTSIDE_WINDOW`) ແລະ request ເອງ throw; ທັງສອງ = ບິນຍັງຢູ່, ສະແດງຂໍ້ຄວາມຊັດ + ປຸ່ມ "ສົ່ງສະຫຼຸບອີກຄັ້ງ" ທີ່ສົ່ງສະເພາະຂໍ້ຄວາມ (ບໍ່ເອີ້ນ `POST /orders` ອີກ). ແຖວ FAILED ເກົ່າຍັງຢູ່ໃນ thread ຄືການຕອບທົ່ວໄປ.
7. **ຂໍ້ຈຳກັດທີ່ຍອມຮັບ**: ໜ້າຜົນລັບ (retry) ຢູ່ໃນ memory ຂອງໜ້າ; ຖ້າຜູ້ໃຊ້ reload/ອອກກ່ອນ retry ຈະບໍ່ມີປຸ່ມ retry ອີກ (ບິນຍັງຢູ່ ເຫັນໃນແຖບຂ້າງ ແລະ ພິມຕອບດ້ວຍມືໄດ້).

## ຂໍ້ຄວນລະວັງຂອງ repo (ອ່ານກ່ອນເລີ່ມ)

- **Next.js ໃນ repo ນີ້ບໍ່ແມ່ນ Next ທີ່ຮູ້ຈັກ** (`apps/admin/AGENTS.md`): ກ່ອນເຮັດ Task 4 (route) ໃຫ້ອ່ານ `apps/admin/node_modules/next/dist/docs/` ສ່ວນ App Router page/`searchParams`; ເຮັດຕາມ `apps/admin/src/app/(app)/inbox/page.tsx` (`searchParams: Promise<...>`), ຢ່າໃຊ້ API ທີ່ບໍ່ໄດ້ຢືນຢັນ.
- **ມີງານຂອງຄົນອື່ນຄ້າງໃນ working tree** (`apps/admin/src/components/orders/order-list*.tsx`, `stock-movements*.tsx`, `src/test/render.tsx`, `src/components/common/date-field.tsx`, `apps/*/next.config.ts`, `.next-prod/`): ຫ້າມແກ້/stage/commit. ທຸກ commit ຕ້ອງ `git add` ໄຟລ໌ຂອງຕົນແບບລະບຸຊື່. ເພາະເຫດນັ້ນ `conversationId` ໃນ `OrderListItemDto`/`OrderDetailDto` (ຝັ່ງ admin) ເປັນ **optional** (`conversationId?: string | null`) ເພື່ອບໍ່ໃຫ້ຕ້ອງແກ້ fixture ໃນ `order-list.test.tsx` ທີ່ເປັນຂອງຄົນອື່ນ. ກ່ອນແກ້ `dictionary.ts` ໃຫ້ `git status` ເບິ່ງວ່າຍັງບໍ່ມີຄົນແກ້ຄ້າງ (ຖ້າມີ ຢຸດ ແລ້ວຖາມ). ຢ່າແຕະ `render.tsx` (ໃຊ້ `renderWithProviders` ທີ່ມີຢູ່).
- Dev infra: Postgres `:5433`, Redis `:6380`; ຫ້າມແຕະ 5432/6379 ແລະ ຖານ `oca` ຂອງຜູ້ໃຊ້. API test ໃຊ້ `oca_test`. ຢ່າແຕະ process ທີ່ :3000/:3001/:3002/:3100.
- ຫຼັງແກ້ `@oca/shared` ຕ້ອງ `pnpm --filter @oca/shared build` ກ່ອນ test ຂອງ api/admin.
- ແບບ test ຂອງ admin: `vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal()), apiFetch: vi.fn() }))`, `renderWithProviders` ຈາກ `@/test/render` (ພາສາອັງກິດ), mock `@/components/auth/auth-provider` ເມື່ອ component ໃຊ້ `useCan`. ຢ່າຂຽນ `beforeEach(() => mock.mockReset())` ໂດຍບໍ່ໃສ່ວົງເລັບ `{ }`. ຂຽນ RED ກ່ອນສະເໝີ ແລ້ວເບິ່ງມັນລົ້ມຈິງ.
- ທຸກ key ໃນ `dictionary.ts` ຕ້ອງມີທັງ lo ແລະ en (compiler ກວດ: `en: Record<TranslationKey, string>`).
- Commit ລົງທ້າຍດ້ວຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File map

| ໄຟລ໌ | ໜ້າທີ່ດຽວ |
|---|---|
| `packages/shared/src/schemas/inventory.ts` (ແກ້) | `conversationId` ໃນ `createOrderSchema` ແລະ `orderListQuerySchema` |
| `packages/shared/src/schemas/inventory.test.ts` (ແກ້) | test ຂອງສອງ schema |
| `apps/api/src/modules/orders/orders.service.ts` (ແກ້) | ກວດສິດ + ເຄສ, ຕັ້ງ channel/source/conversationId, filter ລາຍການ, audit |
| `apps/api/src/modules/orders/orders.mapper.ts` (ແກ້) | `conversationId` ໃນ DTO ລາຍການ + ລາຍລະອຽດ |
| `apps/api/test/orders.e2e.test.ts` (ແກ້) | e2e ບິນຈາກແຊັດ |
| `apps/api/test/permissions.e2e.test.ts` (ແກ້) | sweep ຕາມ role ຈິງ |
| `apps/admin/src/lib/types.ts` (ແກ້) | `conversationId?` ໃນ DTO ບິນ |
| `apps/admin/src/lib/queries.ts` (ແກ້) | `OrderListParams.conversationId` |
| `apps/admin/src/lib/queries.orders.test.tsx` (ແກ້) | test query string |
| `apps/admin/src/lib/order-form.ts` (ແກ້) + `order-form.test.ts` | `orderFormForConversation` (prefill) |
| `apps/admin/src/lib/order-summary.ts` + `order-summary.test.ts` (ໃໝ່) | `buildOrderSummary` (pure, ພາສາລາວ, ≤ 2000 ໂຕ) |
| `apps/admin/src/components/inbox/conversation-orders.tsx` + test (ໃໝ່) | ລາຍການບິນຂອງເຄສ |
| `apps/admin/src/components/inbox/side-panel.tsx` (ແກ້) + `side-panel-orders.test.tsx` (ໃໝ່) | ສ່ວນ "ບິນ" + ປຸ່ມ "ເປີດບິນ" ຕາມສິດ |
| `apps/admin/src/components/orders/order-form.tsx` (ແກ້) + `order-form.chat.test.tsx` (ໃໝ່) | prop `chat` |
| `apps/admin/src/components/orders/chat-order-page.tsx` + test (ໃໝ່) | ໂຫຼດເຄສ, ຟອມ, ສົ່ງສະຫຼຸບ, ໜ້າຜົນລັບ + retry |
| `apps/admin/src/app/(app)/orders/new/page.tsx` (ແກ້) | ຮັບ `?conversationId=` |
| `apps/admin/src/lib/i18n/dictionary.ts` (ແກ້) | ຂໍ້ຄວາມ `inbox.panel.*` ແລະ `orders.chat.*` (lo+en) |
| `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md`, `docs/ROADMAP.md` (ແກ້) | ບັນທຶກການຕັດສິນໃຈ + ສະຖານະ |

ຄູ່ກັບ task ທີ່ຕົກລົງກັບຜູ້ໃຊ້: (1) backend = Task 1; (2) ປຸ່ມ + ລາຍການບິນ + ຟອມ = Task 2-4 (ຊັ້ນຂໍ້ມູນ/pure function ຢູ່ Task 2, ແຖບຂ້າງ Task 3, ຟອມ+ໜ້າ Task 4); (3) ສະຫຼຸບບິນ = pure function Task 2 + ການສົ່ງ/retry ຢູ່ Task 4; (4) ກວດສຸດທ້າຍ = Task 5.

---

### Task 1: Backend: `conversationId` ຂອງບິນ (schema, service, mapper, filter, e2e, sweep)

**Files:**
- Modify: `packages/shared/src/schemas/inventory.ts`, `packages/shared/src/schemas/inventory.test.ts`, `apps/api/src/modules/orders/orders.service.ts`, `apps/api/src/modules/orders/orders.mapper.ts`, `apps/api/test/orders.e2e.test.ts`, `apps/api/test/permissions.e2e.test.ts`

- [ ] **Step 1: test ຂອງ schema (RED)**

ເພີ່ມທ້າຍ `packages/shared/src/schemas/inventory.test.ts` (import `createOrderSchema`, `orderListQuerySchema` ມີຢູ່ແລ້ວ):

```ts
describe("conversationId ຂອງບິນຈາກແຊັດ", () => {
  const item = { variantId: "v1", quantity: 1 };

  it("createOrderSchema ຮັບ conversationId ທາງເລືອກ ແລະ ປະຕິເສດຄ່າວ່າງ", () => {
    expect(createOrderSchema.parse({ items: [item], conversationId: "c1" }).conversationId).toBe("c1");
    expect(createOrderSchema.parse({ items: [item] }).conversationId).toBeUndefined();
    expect(createOrderSchema.safeParse({ items: [item], conversationId: "" }).success).toBe(false);
  });

  it("channel/source ສົ່ງມາເອງບໍ່ໄດ້ (strict): server ກຳນົດຈາກເຄສ", () => {
    expect(createOrderSchema.safeParse({ items: [item], conversationId: "c1", channel: "FACEBOOK" }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: [item], conversationId: "c1", source: "CHAT" }).success).toBe(false);
  });

  it("orderListQuerySchema ຮັບ conversationId", () => {
    expect(orderListQuerySchema.parse({ conversationId: "c1" }).conversationId).toBe("c1");
    expect(orderListQuerySchema.parse({}).conversationId).toBeUndefined();
  });
});
```

Run: `pnpm --filter @oca/shared test` → Expected: FAIL (ສອງ test ທຳອິດ/ທີສາມ: `conversationId` ຖືກປະຕິເສດ/ຖືກຕັດອອກ)

- [ ] **Step 2: schema (GREEN)**

ໃນ `packages/shared/src/schemas/inventory.ts` ແກ້ `createOrderSchema`:

old:
```ts
    customerId: idSchema.optional(),
    customer: orderCustomerInputSchema.optional(),
```
new:
```ts
    customerId: idSchema.optional(),
    customer: orderCustomerInputSchema.optional(),
    /** ບິນທີ່ເປີດຈາກແຊັດ: server ຕັ້ງ channel ຕາມເຄສ + source=CHAT (ບໍ່ຮັບ channel/source ຈາກ client) */
    conversationId: idSchema.optional(),
```

ແກ້ `orderListQuerySchema`:

old:
```ts
  status: z.enum(ORDER_STATUSES).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
```
new:
```ts
  status: z.enum(ORDER_STATUSES).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
  conversationId: idSchema.optional(),
```

Run: `pnpm --filter @oca/shared test && pnpm --filter @oca/shared build` → Expected: PASS

- [ ] **Step 3: e2e ຂອງ API (RED)**

ໃນ `apps/api/test/orders.e2e.test.ts` ແກ້ import:

old: `import { bearerFor, createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";`
new:
```ts
import {
  bearerFor,
  createTestApp,
  expectLedgerMatches,
  resetDb,
  seedCatalog,
  seedConversation,
  seedInventoryUsers,
  seedRoleUsers,
} from "./helpers";
```

ແລ້ວເພີ່ມ `describe` ໃໝ່ເປັນລູກຂອງ `describe("orders (e2e)")` ໂດຍແທນທ້າຍໄຟລ໌:

old:
```ts
    it("key ຮູບແບບຜິດ = 400", async () => {
      await withKey("has space").expect(400);
      await withKey("x".repeat(129)).expect(400);
    });
  });
});
```
new:
```ts
    it("key ຮູບແບບຜິດ = 400", async () => {
      await withKey("has space").expect(400);
      await withKey("x".repeat(129)).expect(400);
    });
  });

  describe("ບິນຈາກແຊັດ (conversationId)", () => {
    let chat: { Authorization: string };
    const body = (conversationId?: string, extra: object = {}) => ({
      items: [{ variantId: f.v1.id, quantity: 1 }],
      ...(conversationId ? { conversationId } : {}),
      ...extra,
    });

    beforeEach(async () => {
      // CHAT_ADMIN ຕາມ seed ຈິງ: orders:write + inbox:write + inventory:read
      await seedRoleUsers(db);
      chat = await bearerFor(app, "chat_admin@role.test");
    });

    it("ຕັ້ງ channel=FACEBOOK, source=CHAT, ເກັບ conversationId; ຢູ່ໃນ detail, list ແລະ audit", async () => {
      const conversation = await seedConversation(db);
      const res = await createOrder(body(conversation.id), chat).expect(201);
      expect(res.body).toMatchObject({ channel: "FACEBOOK", source: "CHAT", conversationId: conversation.id });

      const stored = await db.order.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored).toMatchObject({ channel: "FACEBOOK", source: "CHAT", conversationId: conversation.id });

      const detail = await request(server()).get(`/orders/${res.body.id}`).set(chat).expect(200);
      expect(detail.body.conversationId).toBe(conversation.id);
      const list = await request(server()).get("/orders").set(chat).expect(200);
      expect(list.body.items[0]).toMatchObject({ channel: "FACEBOOK", source: "CHAT", conversationId: conversation.id });

      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "order.create", entityId: res.body.id } });
      expect(audit.after).toMatchObject({ conversationId: conversation.id });
    });

    it("ບິນທົ່ວໄປຍັງເປັນ OFFLINE/MANUAL ແລະ conversationId = null", async () => {
      const res = await createOrder(body(), chat).expect(201);
      expect(res.body).toMatchObject({ channel: "OFFLINE", source: "MANUAL", conversationId: null });
    });

    it("ສົ່ງ channel/source ມາເອງ → 400 (server ກຳນົດຈາກເຄສ)", async () => {
      const conversation = await seedConversation(db);
      await createOrder(body(conversation.id, { channel: "OFFLINE" }), chat).expect(400);
      await createOrder(body(conversation.id, { source: "MANUAL" }), chat).expect(400);
      expect(await db.order.count()).toBe(0);
    });

    it("ເຄສບໍ່ມີ → 404 CONVERSATION_NOT_FOUND ແລະ ບໍ່ມີ Order/ການຈອງສະຕ໋ອກຄ້າງ", async () => {
      const res = await createOrder(body("missing"), chat).expect(404);
      expect(res.body.code).toBe("CONVERSATION_NOT_FOUND");
      expect(await db.order.count()).toBe(0);
      expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(0);
      expect(await level()).toEqual({ onHand: 10, reserved: 0 });
    });

    it("ມີ orders:write ແຕ່ບໍ່ມີ inbox:write → 403 FORBIDDEN (ກວດກ່ອນຫາເຄສ: ເຄສບໍ່ມີ ກໍ່ 403 ຄືກັນ)", async () => {
      const conversation = await seedConversation(db);
      const real = await createOrder(body(conversation.id), writer).expect(403);
      expect(real.body.code).toBe("FORBIDDEN");
      const missing = await createOrder(body("missing"), writer).expect(403);
      expect(missing.body.code).toBe("FORBIDDEN");
      expect(await db.order.count()).toBe(0);
      // ບິນທົ່ວໄປຂອງຄົນນີ້ຍັງສ້າງໄດ້
      await createOrder(body(), writer).expect(201);
    });

    it("ບໍ່ແກ້ລູກຄ້າຂອງເຄສ: ເຄສທີ່ບໍ່ມີລູກຄ້າຍັງບໍ່ມີ, ເຄສທີ່ລິ້ງລູກຄ້າ A ຍັງເປັນ A ເມື່ອບິນເລືອກ B", async () => {
      const a = await db.customer.create({ data: { name: "A", phone: "020111111" } });
      const b = await db.customer.create({ data: { name: "B", phone: "020222222" } });
      const unlinked = await seedConversation(db);
      const linked = await seedConversation(db, { customerId: a.id });

      const first = await createOrder(body(unlinked.id, { customerId: b.id }), chat).expect(201);
      expect(first.body.customer).toMatchObject({ id: b.id });
      expect((await db.conversation.findUniqueOrThrow({ where: { id: unlinked.id } })).customerId).toBeNull();

      await createOrder(body(linked.id, { customerId: b.id }), chat).expect(201);
      expect((await db.conversation.findUniqueOrThrow({ where: { id: linked.id } })).customerId).toBe(a.id);
    });

    it("Idempotency-Key: ເຄສດຽວກັນ = ບິນເດີມ; ເຄສຕ່າງກັນດ້ວຍ key ເດີມ = 409", async () => {
      const one = await seedConversation(db);
      const two = await seedConversation(db);
      const send = (conversationId: string) =>
        request(server()).post("/orders").set(chat).set("Idempotency-Key", "chat-key").send(body(conversationId));
      const first = await send(one.id).expect(201);
      const replay = await send(one.id).expect(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(await db.order.count()).toBe(1);
      const clash = await send(two.id).expect(409);
      expect(clash.body.code).toBe("CONFLICT");
    });

    it("GET /orders?conversationId=: ສະເພາະບິນຂອງເຄສນັ້ນ; ເຄສບໍ່ມີ = ລາຍການວ່າງ (ບໍ່ແມ່ນ 404); ຕ້ອງ orders:read", async () => {
      const one = await seedConversation(db);
      const two = await seedConversation(db);
      const mine = await createOrder(body(one.id), chat).expect(201);
      await createOrder(body(two.id), chat).expect(201);
      await createOrder(body(), chat).expect(201);

      const res = await request(server()).get(`/orders?conversationId=${one.id}`).set(chat).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([mine.body.id]);

      const none = await request(server()).get("/orders?conversationId=missing").set(chat).expect(200);
      expect(none.body).toMatchObject({ total: 0, items: [] });

      const noOrdersRead = await bearerFor(app, "noinv@test.local");
      await request(server()).get(`/orders?conversationId=${one.id}`).set(noOrdersRead).expect(403);
    });
  });
});
```

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/api exec vitest run test/orders.e2e.test.ts -t "ບິນຈາກແຊັດ"` → Expected: FAIL (ບິນຍັງເປັນ OFFLINE/MANUAL, ບໍ່ມີ `conversationId`, filter ບໍ່ເຮັດວຽກ)

- [ ] **Step 4: mapper**

ໃນ `apps/api/src/modules/orders/orders.mapper.ts`:

(ກ) `OrderListItemDto`: old
```ts
  source: string;
  customer: { id: string; name: string; phone: string | null } | null;
```
new
```ts
  source: string;
  /** ບິນທີ່ເປີດຈາກແຊັດ; null = ບໍ່ໄດ້ມາຈາກແຊັດ */
  conversationId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
```

(ຂ) `toOrderListItem`: old
```ts
    source: row.source,
    customer: row.customer,
```
new
```ts
    source: row.source,
    conversationId: row.conversationId,
    customer: row.customer,
```

(ຄ) `OrderDetailDto`: old
```ts
  source: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
```
new
```ts
  source: string;
  conversationId: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
```

(ງ) `toOrderDetail`: old
```ts
    source: row.source,
    customer: row.customer
```
new
```ts
    source: row.source,
    conversationId: row.conversationId,
    customer: row.customer
```

- [ ] **Step 5: service (GREEN)**

ໃນ `apps/api/src/modules/orders/orders.service.ts`:

(ກ) import: old
```ts
  calculateOrderTotals,
} from "@oca/shared";
```
new
```ts
  calculateOrderTotals,
  hasPermission,
} from "@oca/shared";
```

(ຂ) `list`: old
```ts
      ...(query.channel ? { channel: query.channel } : {}),
```
new
```ts
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
```

(ຄ) ຕົ້ນ `create`: old
```ts
    const idempotencyHash = idempotencyKey ? hashInput(input) : undefined;
```
new
```ts
    // ຜູກບິນກັບເຄສ = ເຮັດວຽກແຊັດ: ຕ້ອງມີ inbox:write ເພີ່ມ. ກວດກ່ອນຫາເຄສ (ບໍ່ຮົ່ວວ່າເຄສມີ/ບໍ່ມີ ໃຫ້ຜູ້ທີ່ບໍ່ມີສິດ inbox)
    if (input.conversationId !== undefined && !hasPermission(actor.permissions, "inbox:write")) {
      throw apiError("FORBIDDEN", "Opening an order from a conversation requires inbox:write");
    }
    const idempotencyHash = idempotencyKey ? hashInput(input) : undefined;
```

(ງ) audit: old
```ts
        itemCount: created.items.length,
      },
```
new
```ts
        itemCount: created.items.length,
        conversationId: created.conversationId,
      },
```

(ຈ) ໃນ `createInTransaction` ກ່ອນຂັ້ນ "1) ສາງ": old
```ts
      // 1) ສາງ
```
new
```ts
      // 0) ເຄສ (ຖ້າເປີດຈາກແຊັດ): channel ຕາມເຄສ, source = CHAT. ບໍ່ພົບ → 404 ກ່ອນຈອງສະຕ໋ອກ
      let conversation: { id: string; channel: SalesChannel } | null = null;
      if (input.conversationId !== undefined) {
        conversation = await tx.conversation.findUnique({
          where: { id: input.conversationId },
          select: { id: true, channel: true },
        });
        if (!conversation) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
      }

      // 1) ສາງ
```

(ສ) ຕອນສ້າງ order: old
```ts
          channel: "OFFLINE",
          source: "MANUAL",
```
new
```ts
          channel: conversation?.channel ?? "OFFLINE",
          source: conversation ? "CHAT" : "MANUAL",
          conversationId: conversation?.id,
```

(ຊ) import ປະເພດ `SalesChannel`: ແກ້ບັນທັດ import ຈາກ `@oca/shared` ເພີ່ມ `type SalesChannel,` ຕໍ່ຈາກ `type OrderStatus,`. (ຖ້າ `tsc` ບອກວ່າ `conversation.channel` ກັບ `SalesChannel` ຂອງ shared ບໍ່ກົງ ໃຫ້ໃຊ້ `import type { SalesChannel } from "@oca/database"` ແທນ; ສອງຊຸດມີຄ່າຄືກັນ.)

Run: `pnpm --filter @oca/api exec vitest run test/orders.e2e.test.ts` → Expected: PASS ທັງໄຟລ໌ (ລວມ test ເກົ່າ; ຖ້າ test ເກົ່າໃດ `toEqual` ຮູບແຖວ list/detail ແບບເຕັມ ໃຫ້ເພີ່ມ `conversationId: null` ໃສ່ expectation ນັ້ນ)

- [ ] **Step 6: sweep ຕາມ role ຈິງ (RED → GREEN)**

ໃນ `apps/api/test/permissions.e2e.test.ts` ເພີ່ມ `it` ໃໝ່ທ້າຍ `describe("role model ຕາມ seed ຈິງ ...")`:

old:
```ts
      await request(server()).patch(`/conversations/${conversation.id}`).set(headers).send({ status: "OPEN" }).expect(403);
    }
  });
});
```
new:
```ts
      await request(server()).patch(`/conversations/${conversation.id}`).set(headers).send({ status: "OPEN" }).expect(403);
    }
  });

  it("ບິນຈາກແຊັດ: CHAT_ADMIN/MANAGER/OWNER ເປີດໄດ້ ແລະ ເຫັນໃນລາຍການຂອງເຄສ; ACCOUNTANT/WAREHOUSE/ຜູ້ມີ orders:write ແຕ່ບໍ່ມີ inbox:write ບໍ່ໄດ້", async () => {
    const conversation = await seedConversation(db);
    for (const name of ["CHAT_ADMIN", "MANAGER", "OWNER"]) {
      const headers = await as(name);
      const created = await request(server())
        .post("/orders")
        .set(headers)
        .send({ ...body(), conversationId: conversation.id })
        .expect(201);
      expect(created.body).toMatchObject({ channel: "FACEBOOK", source: "CHAT", conversationId: conversation.id });
      const list = await request(server()).get(`/orders?conversationId=${conversation.id}`).set(headers).expect(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
    }
    for (const name of ["ACCOUNTANT", "WAREHOUSE"]) {
      const headers = await as(name);
      await request(server()).post("/orders").set(headers).send({ ...body(), conversationId: conversation.id }).expect(403);
    }

    // orders:write + inventory:read ແຕ່ບໍ່ມີ inbox:write: ສ້າງບິນທົ່ວໄປໄດ້ ແຕ່ຜູກກັບເຄສບໍ່ໄດ້
    const { passwordHash } = await db.user.findFirstOrThrow({ where: { email: "owner@role.test" } });
    const role = await db.role.create({
      data: {
        name: "ORDERS_NO_INBOX",
        permissions: { create: [{ permission: "orders:read" }, { permission: "orders:write" }, { permission: "inventory:read" }] },
      },
    });
    await db.user.create({ data: { email: "orders-no-inbox@test.local", name: "Orders No Inbox", passwordHash, roleId: role.id } });
    const noInbox = await bearerFor(app, "orders-no-inbox@test.local");
    await request(server()).post("/orders").set(noInbox).send({ ...body(), conversationId: conversation.id }).expect(403);
    await request(server()).post("/orders").set(noInbox).send(body()).expect(201);
  });
});
```

Run: `pnpm --filter @oca/api exec vitest run test/permissions.e2e.test.ts` → Expected: PASS (ຖ້າລັນກ່ອນ Step 5 ຈະ FAIL; ໃນລຳດັບນີ້ຜ່ານເລີຍ ເພາະ Step 5 ແລ້ວ). ຍັງບໍ່ເພີ່ມ route ໃໝ່ (ເປັນ query param ເທົ່ານັ້ນ) ຈຶ່ງ sweep ຂອງ route ບໍ່ຕ້ອງແກ້.

- [ ] **Step 7: ກວດທັງ package + commit**

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/api test && pnpm --filter @oca/api lint && pnpm --filter @oca/api build && pnpm --filter @oca/shared lint` → Expected: ຂຽວທັງໝົດ

```bash
git add packages/shared/src/schemas/inventory.ts packages/shared/src/schemas/inventory.test.ts apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.mapper.ts apps/api/test/orders.e2e.test.ts apps/api/test/permissions.e2e.test.ts
git commit -m "feat(api): open orders from a conversation (conversationId, channel/source derived, list filter)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Admin: ຊັ້ນຂໍ້ມູນ + `orderFormForConversation` + `buildOrderSummary`

**Files:**
- Modify: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/queries.ts`, `apps/admin/src/lib/queries.orders.test.tsx`, `apps/admin/src/lib/order-form.ts`, `apps/admin/src/lib/order-form.test.ts`
- Create: `apps/admin/src/lib/order-summary.ts`, `apps/admin/src/lib/order-summary.test.ts`

- [ ] **Step 1: test ຂອງ query string (RED)**

ໃນ `apps/admin/src/lib/queries.orders.test.tsx` ເພີ່ມ test ຕໍ່ຈາກ test `useOrders ສົ່ງ filter ເປັນ query` (ພາຍໃນ `describe("order hooks")`):

old:
```ts
  it("useOrder poll ທຸກ 15 ວິ ເມື່ອ PENDING_PAYMENT ແລະ secondsUntilExpiry = 0 ເທົ່ານັ້ນ", async () => {
```
new:
```ts
  it("useOrders ສົ່ງ conversationId ເປັນ query (ບິນຂອງເຄສ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const { Wrapper } = wrapper();
    renderHook(() => useOrders({ conversationId: "c1", page: 1, pageSize: 20 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20"));
  });

  it("useOrder poll ທຸກ 15 ວິ ເມື່ອ PENDING_PAYMENT ແລະ secondsUntilExpiry = 0 ເທົ່ານັ້ນ", async () => {
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries.orders.test.tsx` → Expected: FAIL (typecheck/ຄ່າ: `conversationId` ບໍ່ຢູ່ໃນ `OrderListParams`; ຖ້າ vitest ບໍ່ກວດ type ກໍ່ຍັງ pass ໄດ້ ເພາະ `toQueryString({...params})` ສົ່ງຜ່ານ — ໃນກໍລະນີນັ້ນ Step ຖັດໄປແກ້ type ແລະ `pnpm --filter @oca/admin typecheck` ຈະເປັນຕົວຢືນຢັນ RED ຂອງ type)

- [ ] **Step 2: types + query params (GREEN)**

`apps/admin/src/lib/types.ts`: ໃນ `OrderListItemDto` old
```ts
  channel: SalesChannel;
  source: string;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
```
new
```ts
  channel: SalesChannel;
  source: string;
  /** ບິນທີ່ເປີດຈາກແຊັດ (optional ເພື່ອບໍ່ແຕະ fixture ເກົ່າ; API ສົ່ງສະເໝີ) */
  conversationId?: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
```
ແລະ `OrderDetailDto` old
```ts
  channel: SalesChannel;
  source: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
```
new
```ts
  channel: SalesChannel;
  source: string;
  conversationId?: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
```

`apps/admin/src/lib/queries.ts`: old
```ts
export interface OrderListParams {
  q?: string;
  status?: string;
```
new
```ts
export interface OrderListParams {
  q?: string;
  status?: string;
  /** ສະເພາະບິນທີ່ເປີດຈາກເຄສນີ້ (ຕ້ອງ orders:read) */
  conversationId?: string;
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries.orders.test.tsx && pnpm --filter @oca/admin typecheck` → Expected: PASS

- [ ] **Step 3: test ຂອງ `orderFormForConversation` (RED)**

ໃນ `apps/admin/src/lib/order-form.test.ts` ແກ້ import: ເພີ່ມ `orderFormForConversation,` ໃນລາຍການ import ຈາກ `./order-form` (ຕໍ່ຈາກ `newIdempotencyKey,`). ເພີ່ມທ້າຍໄຟລ໌:

```ts
describe("orderFormForConversation", () => {
  it("ເຄສບໍ່ມີລູກຄ້າ = ຟອມເປົ່າ (ຜູ້ໃຊ້ເລືອກ/ສ້າງເອງ)", () => {
    expect(orderFormForConversation(null)).toEqual(emptyOrderForm());
  });

  it("ເຄສມີລູກຄ້າ: ເລືອກລູກຄ້າທີ່ມີແລ້ວ + ເຕີມຊື່/ໂທຈັດສົ່ງ", () => {
    const form = orderFormForConversation({ id: "cu1", name: "Dala", phone: "020111111" });
    expect(form.customerMode).toBe("existing");
    expect(form.customer).toEqual({ id: "cu1", name: "Dala", phone: "020111111", email: null });
    expect(form.shippingName).toBe("Dala");
    expect(form.shippingPhone).toBe("020111111");
    expect(form.lines).toEqual([]);
  });

  it("ລູກຄ້າບໍ່ມີເບີ: ໂທຈັດສົ່ງວ່າງ", () => {
    expect(orderFormForConversation({ id: "cu2", name: "Noi", phone: null }).shippingPhone).toBe("");
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/order-form.test.ts` → Expected: FAIL (`orderFormForConversation` ບໍ່ມີ)

- [ ] **Step 4: implementation (GREEN)**

ໃນ `apps/admin/src/lib/order-form.ts` ຕໍ່ທ້າຍ `emptyOrderForm()`:

old:
```ts
    note: "",
    reservationMinutes: "",
  };
}

// ຊ້ຳກັບ `quantitySchema`
```
new:
```ts
    note: "",
    reservationMinutes: "",
  };
}

/** ຟອມຂອງບິນທີ່ເປີດຈາກແຊັດ: ມີລູກຄ້າທີ່ລິ້ງກັບເຄສ = prefill (ເລືອກແລ້ວ + ຊື່/ໂທຈັດສົ່ງ); ບໍ່ມີ = ຟອມເປົ່າ */
export function orderFormForConversation(customer: { id: string; name: string; phone: string | null } | null): OrderFormState {
  const base = emptyOrderForm();
  if (!customer) return base;
  return {
    ...base,
    customerMode: "existing",
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: null },
    shippingName: customer.name,
    shippingPhone: customer.phone ?? "",
  };
}

// ຊ້ຳກັບ `quantitySchema`
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/order-form.test.ts` → Expected: PASS

- [ ] **Step 5: test ຂອງ `buildOrderSummary` (RED)**

ສ້າງ `apps/admin/src/lib/order-summary.test.ts`:

```ts
import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { type OrderSummarySource, buildOrderSummary } from "./order-summary";

const order = (patch: Partial<OrderSummarySource> = {}): OrderSummarySource => ({
  orderNumber: "SO-000001",
  currency: "LAK",
  status: "PENDING_PAYMENT",
  items: [
    { productName: "Tee", variantName: "Red", quantity: 2, unitPrice: "100.00", discount: "10.00", lineTotal: "190.00" },
    { productName: "Mug", variantName: null, quantity: 1, unitPrice: "50.00", discount: "0.00", lineTotal: "50.00" },
  ],
  shippingFee: "5.00",
  total: "245.00",
  // 2026-10-05T06:00Z = 13:00 ເວລາລາວ (UTC+7)
  reservedUntil: "2026-10-05T06:00:00.000Z",
  ...patch,
});

describe("buildOrderSummary", () => {
  it("ເລກບິນ, ລາຍການ (ຊື່ + ແບບ, ຈຳນວນ x ລາຄາ = ລວມແຖວ, ສ່ວນຫຼຸດ), ຄ່າສົ່ງ, ຍອດ ແລະ ເວລາຈອງ", () => {
    expect(buildOrderSummary(order())).toBe(
      [
        "ສະຫຼຸບບິນຂອງທ່ານ",
        "ເລກທີ SO-000001",
        "",
        "1. Tee (Red) 2 x 100.00 = 190.00 (ຫຼັງຫັກສ່ວນຫຼຸດ 10.00)",
        "2. Mug 1 x 50.00 = 50.00",
        "",
        "ຄ່າສົ່ງ: 5.00",
        "ລວມທັງໝົດ: 245.00 LAK",
        "ຈອງສິນຄ້າໃຫ້ຮອດ 05/10/2026 13:00",
        "",
        "ຂອບໃຈທີ່ສັ່ງຊື້",
      ].join("\n"),
    );
  });

  it("ບໍ່ມີຄ່າສົ່ງ ແລະ ບໍ່ໄດ້ລໍຖ້າຊຳລະ (ບໍ່ມີເວລາຈອງ): ບໍ່ມີສອງບັນທັດນັ້ນ", () => {
    const text = buildOrderSummary(order({ shippingFee: "0.00", status: "PAID", reservedUntil: null }));
    expect(text).not.toContain("ຄ່າສົ່ງ");
    expect(text).not.toContain("ຈອງສິນຄ້າ");
    expect(text).toContain("ລວມທັງໝົດ: 245.00 LAK");
  });

  it("ລໍຖ້າຊຳລະແຕ່ບໍ່ມີ reservedUntil: ບໍ່ມີບັນທັດເວລາຈອງ", () => {
    expect(buildOrderSummary(order({ reservedUntil: null }))).not.toContain("ຈອງສິນຄ້າ");
  });

  it("ບໍ່ສັນຍາເລື່ອງການຊຳລະ (ຍັງບໍ່ມີ payment link): ບໍ່ມີ URL ໃນຂໍ້ຄວາມ", () => {
    expect(buildOrderSummary(order())).not.toMatch(/https?:\/\//);
  });

  it("ບິນໃຫຍ່ (100 ລາຍການ): ຍາວບໍ່ເກີນ MAX_MESSAGE_LENGTH, ຍັງມີເລກບິນ + ຍອດ ແລະ ບອກຈຳນວນລາຍການທີ່ຕັດ", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      productName: `ສິນຄ້າ ${"ກ".repeat(30)} ${index + 1}`,
      variantName: null,
      quantity: 1,
      unitPrice: "10.00",
      discount: "0.00",
      lineTotal: "10.00",
    }));
    const text = buildOrderSummary(order({ items, total: "1000.00", shippingFee: "0.00" }));
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(text).toContain("ເລກທີ SO-000001");
    expect(text).toContain("ລວມທັງໝົດ: 1,000.00 LAK");
    const listed = text.split("\n").filter((line) => /^\d+\. /.test(line)).length;
    const omitted = /ແລະ ອີກ (\d+) ລາຍການ/.exec(text);
    expect(listed).toBeGreaterThan(0);
    expect(listed).toBeLessThan(100);
    expect(Number(omitted?.[1])).toBe(100 - listed);
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/order-summary.test.ts` → Expected: FAIL (module ບໍ່ມີ)

- [ ] **Step 6: implementation (GREEN)**

ສ້າງ `apps/admin/src/lib/order-summary.ts`:

```ts
import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { formatDateTime, formatMoney } from "./format";

/** ສ່ວນຂອງ OrderDetailDto ທີ່ສະຫຼຸບບິນໃຊ້ (ບໍ່ຜູກກັບ DTO ທັງກ້ອນ ເພື່ອ test ງ່າຍ) */
export interface OrderSummarySource {
  orderNumber: string;
  currency: string;
  status: string;
  items: {
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    discount: string;
    lineTotal: string;
  }[];
  shippingFee: string;
  total: string;
  reservedUntil: string | null;
}

const hasAmount = (value: string): boolean => Number(value) > 0;

function itemLine(item: OrderSummarySource["items"][number], index: number): string {
  const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
  const base = `${index + 1}. ${name} ${item.quantity} x ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`;
  return hasAmount(item.discount) ? `${base} (ຫຼັງຫັກສ່ວນຫຼຸດ ${formatMoney(item.discount)})` : base;
}

/**
 * ຂໍ້ຄວາມສະຫຼຸບບິນທີ່ສົ່ງຫາລູກຄ້າໃນແຊັດ (ພາສາລາວຄົງທີ່ ບໍ່ຜ່ານ i18n ຂອງ admin ເພາະເປັນຂໍ້ຄວາມຫາລູກຄ້າ).
 * ເກີນ MAX_MESSAGE_LENGTH (Messenger ຈຳກັດ) → ຕັດລາຍການທ້າຍອອກ ແລ້ວບອກວ່າ "ແລະ ອີກ N ລາຍການ"; ເລກບິນ ແລະ ຍອດຢູ່ຄົບສະເໝີ.
 */
export function buildOrderSummary(order: OrderSummarySource): string {
  const head = ["ສະຫຼຸບບິນຂອງທ່ານ", `ເລກທີ ${order.orderNumber}`].join("\n");
  const totals = [
    ...(hasAmount(order.shippingFee) ? [`ຄ່າສົ່ງ: ${formatMoney(order.shippingFee)}`] : []),
    `ລວມທັງໝົດ: ${formatMoney(order.total)} ${order.currency}`,
    ...(order.status === "PENDING_PAYMENT" && order.reservedUntil
      ? [`ຈອງສິນຄ້າໃຫ້ຮອດ ${formatDateTime(order.reservedUntil)}`]
      : []),
  ].join("\n");
  const thanks = "ຂອບໃຈທີ່ສັ່ງຊື້";

  const lines = order.items.map(itemLine);
  const compose = (shown: number): string => {
    const omitted = lines.length - shown;
    const list = [...lines.slice(0, shown), ...(omitted > 0 ? [`ແລະ ອີກ ${omitted} ລາຍການ`] : [])].join("\n");
    return [head, list, totals, thanks].join("\n\n");
  };

  for (let shown = lines.length; shown >= 0; shown -= 1) {
    const text = compose(shown);
    if (text.length <= MAX_MESSAGE_LENGTH) return text;
  }
  // ບໍ່ເຄີຍເກີດ (ສ່ວນຫົວ + ຍອດສັ້ນກວ່າ 2000 ຫຼາຍ) ແຕ່ຮັບປະກັນຄວາມຍາວ
  return compose(0).slice(0, MAX_MESSAGE_LENGTH);
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/order-summary.test.ts` → Expected: PASS (ຖ້າ test ລຳດັບແຖວວ່າງຕ່າງ ໃຫ້ແກ້ test ຕາມ `compose` — ໂຄງ: ຫົວ / ລາຍການ / ຍອດ / ຂອບໃຈ ແຍກດ້ວຍແຖວວ່າງ)

- [ ] **Step 7: ກວດ + commit**

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint` → Expected: ຂຽວທັງໝົດ

```bash
git add apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries.orders.test.tsx apps/admin/src/lib/order-form.ts apps/admin/src/lib/order-form.test.ts apps/admin/src/lib/order-summary.ts apps/admin/src/lib/order-summary.test.ts
git commit -m "feat(admin): order-from-chat data layer (conversationId filter, form prefill, summary builder)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Admin: ແຖບຂ້າງ: ລາຍການບິນຂອງເຄສ + ປຸ່ມ "ເປີດບິນ"

**Files:**
- Create: `apps/admin/src/components/inbox/conversation-orders.tsx`, `apps/admin/src/components/inbox/conversation-orders.test.tsx`, `apps/admin/src/components/inbox/side-panel-orders.test.tsx`
- Modify: `apps/admin/src/components/inbox/side-panel.tsx`, `apps/admin/src/components/inbox/side-panel.test.tsx`, `apps/admin/src/components/inbox/inbox-page.test.tsx`, `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: ຂໍ້ຄວາມ i18n (ເພີ່ມກ່ອນ ເພື່ອໃຫ້ test ເຫັນ key)**

`git status` ກ່ອນ (ຢືນຢັນວ່າ `dictionary.ts` ບໍ່ມີຄົນແກ້ຄ້າງ). ໃນ `apps/admin/src/lib/i18n/dictionary.ts`:

lo: old `  "inbox.panel.reopen": "ເປີດເຄສຄືນ",` new
```ts
  "inbox.panel.reopen": "ເປີດເຄສຄືນ",
  "inbox.panel.orders": "ບິນຂອງການສົນທະນານີ້",
  "inbox.panel.noOrders": "ຍັງບໍ່ມີບິນຈາກການສົນທະນານີ້",
  "inbox.panel.openOrder": "ເປີດບິນ",
  "inbox.panel.ordersMore": "ສະແດງ {shown} ບິນຫຼ້າສຸດ ຈາກທັງໝົດ {total}",
```
en: old `  "inbox.panel.reopen": "Reopen conversation",` new
```ts
  "inbox.panel.reopen": "Reopen conversation",
  "inbox.panel.orders": "Orders from this conversation",
  "inbox.panel.noOrders": "No orders from this conversation yet",
  "inbox.panel.openOrder": "Open order",
  "inbox.panel.ordersMore": "Showing the latest {shown} of {total} orders",
```

- [ ] **Step 2: test ຂອງ `ConversationOrders` (RED)**

ສ້າງ `apps/admin/src/components/inbox/conversation-orders.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ConversationOrders } from "./conversation-orders";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const row = (patch: Partial<OrderListItemDto> = {}): OrderListItemDto => ({
  id: "o1",
  orderNumber: "SO-000001",
  status: "PENDING_PAYMENT",
  channel: "FACEBOOK",
  source: "CHAT",
  conversationId: "c1",
  customer: null,
  total: "1195.00",
  itemCount: 2,
  reservedUntil: null,
  createdAt: "2026-10-07T05:00:00.000Z",
  ...patch,
});

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ConversationOrders", () => {
  it("ດຶງບິນຂອງເຄສ ແລະ ສະແດງເລກບິນ (ລິ້ງ /orders/[id]), ສະຖານະ, ຍອດ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [row(), row({ id: "o2", orderNumber: "SO-000002", status: "PAID", total: "50.00" })],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    const first = await screen.findByRole("link", { name: "SO-000001" });
    expect(first).toHaveAttribute("href", "/orders/o1");
    expect(screen.getByRole("link", { name: "SO-000002" })).toHaveAttribute("href", "/orders/o2");
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("1,195.00")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20");
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });

  it("ບໍ່ມີບິນ: ສະແດງຄຳບອກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByText("No orders from this conversation yet")).toBeInTheDocument();
  });

  it("ມີຫຼາຍກວ່າທີ່ສະແດງ: ບອກ 'ສະແດງ N ຈາກທັງໝົດ'", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [row()], total: 25, page: 1, pageSize: 20 });
    renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByText("Showing the latest 1 of 25 orders")).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ: ມີຂໍ້ຄວາມ + Retry ທີ່ດຶງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "x"));
    vi.mocked(apiFetch).mockResolvedValue({ items: [row()], total: 1, page: 1, pageSize: 20 });
    const { user } = renderWithProviders(<ConversationOrders conversationId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load data");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/conversation-orders.test.tsx` → Expected: FAIL (component ບໍ່ມີ). ຖ້າຂໍ້ຄວາມ en ຂອງ `common.error.load` ບໍ່ແມ່ນ "Could not load data" ໃຫ້ກວດ `dictionary.ts` ແລ້ວແກ້ expectation ໃຫ້ກົງ.

- [ ] **Step 3: `ConversationOrders` (GREEN)**

ສ້າງ `apps/admin/src/components/inbox/conversation-orders.tsx`:

```tsx
"use client";

import { Button } from "@oca/ui";
import Link from "next/link";
import { OrderStatusPill } from "@/components/orders/order-status";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useOrders } from "@/lib/queries";

const LIMIT = 20;

/** ບິນທີ່ເປີດຈາກເຄສນີ້ (GET /orders?conversationId=, ຕ້ອງ orders:read: ຜູ້ເອີ້ນເປັນຜູ້ກວດສິດກ່ອນ mount) */
export function ConversationOrders({ conversationId }: { conversationId: string }) {
  const { t } = useT();
  const orders = useOrders({ conversationId, page: 1, pageSize: LIMIT });

  if (orders.isPending) return <p className="text-sm text-ink-muted">{t("common.loading")}</p>;
  if (orders.isError) {
    return (
      <p role="alert" className="flex items-center gap-2 text-xs text-danger">
        {t("common.error.load")}
        <Button variant="ghost" size="sm" onClick={() => void orders.refetch()}>
          {t("common.retry")}
        </Button>
      </p>
    );
  }

  const items = orders.data.items;
  if (items.length === 0) return <p className="text-sm text-ink-muted">{t("inbox.panel.noOrders")}</p>;
  return (
    <>
      <ul className="space-y-2">
        {items.map((order) => (
          <li key={order.id} className="rounded-xl border border-line bg-subtle px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/orders/${order.id}`} className="font-mono text-sm font-semibold text-brand-ink hover:underline">
                {order.orderNumber}
              </Link>
              <OrderStatusPill status={order.status} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-ink-secondary">{formatMoney(order.total)}</p>
          </li>
        ))}
      </ul>
      {orders.data.total > items.length ? (
        <p className="text-xs text-ink-muted">{t("inbox.panel.ordersMore", { shown: items.length, total: orders.data.total })}</p>
      ) : null}
    </>
  );
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/conversation-orders.test.tsx` → Expected: PASS

- [ ] **Step 4: ແກ້ mock ຂອງ test ເກົ່າທີ່ຈະເຫັນ `/orders?...` ໃໝ່ (ກ່ອນແກ້ SidePanel)**

`apps/admin/src/components/inbox/side-panel.test.tsx`: ໃນ `beforeEach` old
```ts
    if (url === "/inbox/assignees") return assignees;
    if (url.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (init?.method === "PATCH") return conversation;
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});
```
new
```ts
    if (url === "/inbox/assignees") return assignees;
    if (url.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (url.startsWith("/orders")) return { items: [], total: 0, page: 1, pageSize: 20 };
    if (init?.method === "PATCH") return conversation;
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});
```
ແລະ ໃນ test "ເລືອກລູກຄ້າທີ່ມີ → PATCH customerId" old
```ts
      if (url.startsWith("/customers")) return { items: [{ id: "cu9", name: "Dala", phone: "020111111", email: null }], total: 1, page: 1, pageSize: 8 };
```
new
```ts
      if (url.startsWith("/orders")) return { items: [], total: 0, page: 1, pageSize: 20 };
      if (url.startsWith("/customers")) return { items: [{ id: "cu9", name: "Dala", phone: "020111111", email: null }], total: 1, page: 1, pageSize: 8 };
```

`apps/admin/src/components/inbox/inbox-page.test.tsx`: old
```ts
    if (url === "/inbox/assignees") return [];
```
new
```ts
    if (url === "/inbox/assignees") return [];
    if (url.startsWith("/orders")) return { items: [], total: 0, page: 1, pageSize: 20 };
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox` → Expected: PASS (ຍັງບໍ່ແກ້ SidePanel ຈຶ່ງຜ່ານຄືເກົ່າ)

- [ ] **Step 5: test ຂອງສ່ວນ "ບິນ" + ປຸ່ມ ໃນ SidePanel (RED)**

ສ້າງ `apps/admin/src/components/inbox/side-panel-orders.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SidePanel } from "./side-panel";

const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => !auth.denied.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c 1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: { id: "cu1", name: "Dala", phone: "020111111" },
  createdAt: "2026-10-06T05:00:00.000Z",
};

const orderRow = {
  id: "o1",
  orderNumber: "SO-000001",
  status: "PENDING_PAYMENT",
  channel: "FACEBOOK",
  source: "CHAT",
  conversationId: "c 1",
  customer: null,
  total: "195.00",
  itemCount: 1,
  reservedUntil: null,
  createdAt: "2026-10-07T05:00:00.000Z",
};

const openOrder = () => screen.queryByRole("link", { name: "Open order" });

beforeEach(() => {
  auth.denied.clear();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url === "/inbox/assignees") return [];
    if (url.startsWith("/orders")) return { items: [orderRow], total: 1, page: 1, pageSize: 20 };
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("SidePanel: ບິນຂອງເຄສ + ເປີດບິນ", () => {
  it("ສະແດງບິນຂອງເຄສ ແລະ ປຸ່ມ 'ເປີດບິນ' ທີ່ຊີ້ໄປ /orders/new?conversationId= (id ຖືກ encode)", async () => {
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(screen.getByRole("region", { name: "Orders from this conversation" })).toBeInTheDocument();
    expect(openOrder()).toHaveAttribute("href", "/orders/new?conversationId=c%201");
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c%201&page=1&pageSize=20");
  });

  it("ບໍ່ມີ orders:read: ເຊື່ອງລາຍການບິນ (ບໍ່ຍິງ /orders) ແຕ່ປຸ່ມເປີດບິນຍັງຢູ່", () => {
    auth.denied.add("orders:read");
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(openOrder()).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "SO-000001" })).not.toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.some((call) => String(call[0]).startsWith("/orders"))).toBe(false);
  });

  it("ບໍ່ມີ inbox:write (canWrite=false): ບໍ່ມີປຸ່ມ ແຕ່ເຫັນລາຍການບິນ", async () => {
    renderWithProviders(<SidePanel conversation={conversation} canWrite={false} />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    expect(openOrder()).not.toBeInTheDocument();
  });

  it.each(["orders:write", "inventory:read"])("ບໍ່ມີ %s: ບໍ່ມີປຸ່ມເປີດບິນ", async (permission) => {
    auth.denied.add(permission);
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    expect(openOrder()).not.toBeInTheDocument();
  });

  it("ບໍ່ມີທັງ orders:read ແລະ ສິດເປີດບິນ: ບໍ່ມີ section ບິນເລີຍ", () => {
    auth.denied.add("orders:read");
    renderWithProviders(<SidePanel conversation={conversation} canWrite={false} />);
    expect(screen.queryByRole("region", { name: "Orders from this conversation" })).not.toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/side-panel-orders.test.tsx` → Expected: FAIL (ບໍ່ມີ section/ປຸ່ມ)

- [ ] **Step 6: ແກ້ `SidePanel` (GREEN)**

ໃນ `apps/admin/src/components/inbox/side-panel.tsx`:

(ກ) imports: old `import { Button, Card, Select, toast } from "@oca/ui";` new `import { Button, Card, Select, buttonVariants, cn, toast } from "@oca/ui";`. old `import { Lock, LockOpen, Unlink, UserPlus } from "lucide-react";` new
```ts
import { Lock, LockOpen, Plus, Unlink, UserPlus } from "lucide-react";
import Link from "next/link";
```
old `import { CreateCustomerDialog } from "./create-customer-dialog";` new
```ts
import { ConversationOrders } from "./conversation-orders";
import { CreateCustomerDialog } from "./create-customer-dialog";
```

(ຂ) id ແລະ ສິດ: old
```ts
  const statusId = `${uid}-status`;
  // CustomerPicker ຄົ້ນລູກຄ້າຜ່ານ GET /customers ທີ່ຕ້ອງ orders:read
  const canLinkExisting = useCan("orders:read");
```
new
```ts
  const statusId = `${uid}-status`;
  const ordersId = `${uid}-orders`;
  // CustomerPicker ຄົ້ນລູກຄ້າຜ່ານ GET /customers ທີ່ຕ້ອງ orders:read; ລາຍການບິນຂອງເຄສ (GET /orders) ກໍ່ຕ້ອງ orders:read
  const canLinkExisting = useCan("orders:read");
  // ເປີດບິນ = POST /orders ຜູກເຄສ: ຕ້ອງ inbox:write (canWrite) + orders:write + inventory:read (ຄືຂອງໜ້າ /orders/new)
  const canWriteOrders = useCan("orders:write");
  const canReadInventory = useCan("inventory:read");
  const canOpenOrder = canWrite && canWriteOrders && canReadInventory;
```

(ຄ) ເພີ່ມ section ຕໍ່ຈາກ section ລູກຄ້າ (ກ່ອນ section ຜູ້ຮັບຜິດຊອບ): old
```tsx
      <section aria-labelledby={`${assigneeId}-label`} className="space-y-2">
```
new
```tsx
      {canLinkExisting || canOpenOrder ? (
        <section aria-labelledby={ordersId} className="space-y-2">
          <h3 id={ordersId} className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.orders")}</h3>
          {canLinkExisting ? <ConversationOrders conversationId={conversation.id} /> : null}
          {canOpenOrder ? (
            <Link
              href={`/orders/new?conversationId=${encodeURIComponent(conversation.id)}`}
              className={cn(buttonVariants({ variant: "outlinePrimary" }), "w-full rounded-lg")}
            >
              <Plus aria-hidden="true" />
              {t("inbox.panel.openOrder")}
            </Link>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby={`${assigneeId}-label`} className="space-y-2">
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox` → Expected: PASS ທັງໝົດ (ລວມ side-panel/inbox-page ເກົ່າ)

- [ ] **Step 7: ກວດ + commit**

Run: `pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint` → Expected: ຂຽວ

```bash
git add apps/admin/src/components/inbox/conversation-orders.tsx apps/admin/src/components/inbox/conversation-orders.test.tsx apps/admin/src/components/inbox/side-panel.tsx apps/admin/src/components/inbox/side-panel.test.tsx apps/admin/src/components/inbox/side-panel-orders.test.tsx apps/admin/src/components/inbox/inbox-page.test.tsx apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): inbox side panel lists the conversation's orders and links to open one

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin: `OrderForm` ໂໝດແຊັດ + `ChatOrderPage` (ສົ່ງສະຫຼຸບ + retry) + route

**Files:**
- Modify: `apps/admin/src/components/orders/order-form.tsx`, `apps/admin/src/app/(app)/orders/new/page.tsx`, `apps/admin/src/lib/i18n/dictionary.ts`
- Create: `apps/admin/src/components/orders/order-form.chat.test.tsx`, `apps/admin/src/components/orders/chat-order-page.tsx`, `apps/admin/src/components/orders/chat-order-page.test.tsx`

- [ ] **Step 1: ຂໍ້ຄວາມ i18n**

`git status` ເບິ່ງ `dictionary.ts` ອີກຄັ້ງ. ໃນ `apps/admin/src/lib/i18n/dictionary.ts`:

lo: old
```ts
  "inbox.customerDialog.created": "ສ້າງ ແລະ ລິ້ງລູກຄ້າແລ້ວ",
} as const;
```
new
```ts
  "inbox.customerDialog.created": "ສ້າງ ແລະ ລິ້ງລູກຄ້າແລ້ວ",
  "orders.chat.title": "ເປີດບິນຈາກແຊັດ",
  "orders.chat.description": "ບິນຈະຜູກກັບການສົນທະນາ Facebook ຂອງ {name} (ແຫຼ່ງ: ແຊັດ) ແລະ ຈອງສະຕ໋ອກທັນທີ",
  "orders.chat.unlinkedHint": "ການສົນທະນານີ້ຍັງບໍ່ໄດ້ລິ້ງກັບລູກຄ້າ: ເລືອກ ຫຼື ສ້າງລູກຄ້າໃນຟອມນີ້ໄດ້ ແຕ່ລະບົບຈະບໍ່ລິ້ງການສົນທະນາໃຫ້ອັດຕະໂນມັດ",
  "orders.chat.sendSummary": "ສົ່ງສະຫຼຸບບິນໃຫ້ລູກຄ້າໃນແຊັດ",
  "orders.chat.createdTitle": "ສ້າງບິນ {number} ແລ້ວ",
  "orders.chat.sending": "ກຳລັງສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດ...",
  "orders.chat.sent": "ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດແລ້ວ",
  "orders.chat.sendFailed": "ສ້າງບິນ {number} ສຳເລັດແລ້ວ ແຕ່ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດບໍ່ສຳເລັດ: {reason}. ລະບົບຈະບໍ່ສ້າງບິນຊ້ຳ ທ່ານລອງສົ່ງສະຫຼຸບໃໝ່ໄດ້",
  "orders.chat.retrySend": "ສົ່ງສະຫຼຸບອີກຄັ້ງ",
  "orders.chat.back": "ກັບໄປແຊັດ",
  "orders.chat.viewOrder": "ເບິ່ງບິນ",
} as const;
```
en: old
```ts
  "inbox.customerDialog.created": "Customer created and linked",
};
```
new
```ts
  "inbox.customerDialog.created": "Customer created and linked",
  "orders.chat.title": "Open order from chat",
  "orders.chat.description": "The order is linked to {name}'s Facebook conversation (source: chat). Stock is reserved immediately",
  "orders.chat.unlinkedHint": "This conversation is not linked to a customer. You can pick or create one in this form, but the conversation is not linked automatically",
  "orders.chat.sendSummary": "Send the order summary to the customer in chat",
  "orders.chat.createdTitle": "Order {number} created",
  "orders.chat.sending": "Sending the order summary to the chat...",
  "orders.chat.sent": "Order summary sent to the chat",
  "orders.chat.sendFailed": "Order {number} was created, but the summary could not be sent to the chat: {reason}. The order will not be created again; you can retry sending",
  "orders.chat.retrySend": "Send summary again",
  "orders.chat.back": "Back to chat",
  "orders.chat.viewOrder": "View order",
};
```

- [ ] **Step 2: test ຂອງ `OrderForm` ໂໝດແຊັດ (RED)**

ສ້າງ `apps/admin/src/components/orders/order-form.chat.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, OrderDetailDto, VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderForm } from "./order-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }],
};
const warehouses = [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };
const created = { id: "o9", orderNumber: "SO-000009" } as OrderDetailDto;

const conversation = (customer: ConversationDto["customer"]): ConversationDto => ({
  id: "conv1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-07T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer,
  createdAt: "2026-10-07T05:00:00.000Z",
});
const mali = { id: "c1", name: "Mali", phone: "02055550001" };

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
    if (path.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return created;
    return { items: [], total: 0, page: 1, pageSize: 8 };
  }) as typeof apiFetch);
}

const orderPosts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders" && call[1]?.method === "POST");
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body: Record<string, unknown> }).body;

async function addTeeAndSubmit(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.type(screen.getByLabelText("Add item (search SKU/name)"), "tee");
  await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
  await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
}

beforeEach(() => {
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderForm (ໂໝດແຊັດ)", () => {
  it("ຫົວຂໍ້ເປັນ 'ເປີດບິນຈາກແຊັດ'; ເຄສມີລູກຄ້າ = prefill ແລະ ເລືອກໂໝດ 'ເລືອກລູກຄ້າທີ່ມີ'", () => {
    renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated: vi.fn() }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Open order from chat" })).toBeInTheDocument();
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pick an existing customer" })).toBeChecked();
    expect(screen.getByLabelText("Shipping name")).toHaveValue("Mali");
    expect(screen.queryByText(/not linked to a customer/)).not.toBeInTheDocument();
  });

  it("ເຄສບໍ່ມີລູກຄ້າ: ຟອມເປົ່າ ແລະ ມີຄຳບອກວ່າຈະບໍ່ລິ້ງເຄສໃຫ້", () => {
    renderWithProviders(<OrderForm chat={{ conversation: conversation(null), onCreated: vi.fn() }} />);
    expect(screen.getByRole("radio", { name: "Walk-in customer (not saved)" })).toBeChecked();
    expect(screen.getByText(/This conversation is not linked to a customer/)).toBeInTheDocument();
  });

  it("ສົ່ງ: payload ມີ conversationId + customerId; ເອີ້ນ onCreated (sendSummary ເລີ່ມຕົ້ນ true) ແລະ ບໍ່ພາໄປ /orders/[id]", async () => {
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(created, { sendSummary: true });
    expect(orderPosts()).toHaveLength(1);
    expect(bodyOf(orderPosts()[0])).toMatchObject({ conversationId: "conv1", customerId: "c1" });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ເອົາຕິກ 'ສົ່ງສະຫຼຸບ' ອອກ → onCreated ໄດ້ sendSummary=false", async () => {
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    const box = screen.getByRole("checkbox", { name: "Send the order summary to the customer in chat" });
    expect(box).toBeChecked();
    await user.click(box);
    await addTeeAndSubmit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, { sendSummary: false }));
  });

  it("ສ້າງບິນລົ້ມ (409 ສະຕ໋ອກບໍ່ພໍ): ບໍ່ເອີ້ນ onCreated ແລະ ສະແດງ alert ຂອງຟອມ", async () => {
    mockApi({ "/orders": new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: [] }) });
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated }} />);
    await addTeeAndSubmit(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("ຍົກເລີກ → ກັບໄປແຊັດຂອງເຄສ", async () => {
    const { user } = renderWithProviders(<OrderForm chat={{ conversation: conversation(mali), onCreated: vi.fn() }} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1");
  });

  it("ບໍ່ມີ prop chat: ຄືເດີມ (ບໍ່ມີ checkbox, ຍົກເລີກໄປ /orders)", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    expect(screen.queryByRole("checkbox", { name: /order summary/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Create order" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.push).toHaveBeenCalledWith("/orders");
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/order-form.chat.test.tsx` → Expected: FAIL (ບໍ່ມີ prop `chat`). ຖ້າ label ຂອງຊ່ອງ "Shipping name" ໃນ dictionary en ບໍ່ກົງ (key `orders.shipping.name`) ໃຫ້ແກ້ expectation ຕາມຄ່າຈິງ.

- [ ] **Step 3: ແກ້ `OrderForm` (GREEN)**

ໃນ `apps/admin/src/components/orders/order-form.tsx` (ແກ້ຕາມລຳດັບ ແຕ່ລະອັນຕ້ອງ match ຕົງ):

(ກ) imports: old `import type { Shortage, VariantSearchItemDto } from "@/lib/types";` new
```ts
import type { ConversationDto, OrderDetailDto, Shortage, VariantSearchItemDto } from "@/lib/types";
```
old
```ts
  emptyOrderForm,
  lineAvailable,
```
new
```ts
  emptyOrderForm,
  lineAvailable,
```
(ບໍ່ປ່ຽນ) ແລະ ໃນບັນຊີ import ດຽວກັນເພີ່ມ `orderFormForConversation,` ຕໍ່ຈາກ `newIdempotencyKey,`: old `  newIdempotencyKey,\n  shortageKeys,` new `  newIdempotencyKey,\n  orderFormForConversation,\n  shortageKeys,`.

(ຂ) ສັນຍາຂອງ component: old
```tsx
export function OrderForm() {
  const { t } = useT();
```
new
```tsx
export interface OrderFormChat {
  /** ເຄສທີ່ເປີດບິນຈາກ: prefill ລູກຄ້າ, ຕິດ conversationId ໃສ່ payload, ຫົວຂໍ້ ແລະ ປຸ່ມຍົກເລີກຕາມແຊັດ */
  conversation: ConversationDto;
  /**
   * ເອີ້ນຫຼັງບິນຖືກສ້າງສຳເລັດແລ້ວ (ຢູ່ນອກ try ຂອງການສ້າງບິນ: ເຖິງ handler throw ກໍ່ບໍ່ຖືກລາຍງານວ່າສ້າງບິນບໍ່ສຳເລັດ).
   * ຜູ້ເອີ້ນຮັບຜິດຊອບການສົ່ງສະຫຼຸບ/ພາໄປໜ້າອື່ນ (ຟອມບໍ່ push ໄປ /orders/[id] ໃນໂໝດນີ້)
   */
  onCreated: (order: OrderDetailDto, options: { sendSummary: boolean }) => void;
}

export function OrderForm({ chat }: { chat?: OrderFormChat } = {}) {
  const { t } = useT();
```

(ຄ) state: old
```tsx
  const [form, setForm] = useState<OrderFormState>(emptyOrderForm);
```
new
```tsx
  const [form, setForm] = useState<OrderFormState>(() =>
    chat ? orderFormForConversation(chat.conversation.customer) : emptyOrderForm(),
  );
  // ໂໝດແຊັດ: ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດຫຼັງສ້າງ (ເລີ່ມຕົ້ນເປີດ)
  const [sendSummary, setSendSummary] = useState(true);
```

(ງ) ການສົ່ງ: old
```tsx
    setIssues(NO_ISSUES);
    const fingerprint = JSON.stringify(result.data);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
    submitting.current = true;
    setSaving(true);
    try {
      const order = await create.mutateAsync({ input: result.data, idempotencyKey: attempt.current.key });
      attempt.current = null; // ສຳເລັດແນ່ນອນ: ການສົ່ງຄັ້ງຕໍ່ໄປເປັນບິນໃໝ່
      // toast ສະແດງສະເໝີ (ບິນຖືກສ້າງ ແລະ ຈອງສະຕ໋ອກແລ້ວ ແມ່ນແຕ່ຜູ້ໃຊ້ອອກຈາກໜ້າ); ການພາໄປໜ້າບິນສະເພາະຕອນຍັງຢູ່
      toast.success(t("orders.toast.created", { number: order.orderNumber }));
      if (mounted.current) router.push(`/orders/${order.id}`);
    } catch (error) {
      if (mounted.current) {
        setShortages(extractShortages(error));
        setIssues({ messages: [errorMessage(error, t), ...shortageLines(error, t)], fields: [] });
        setAlertTick((tick) => tick + 1);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }
```
new
```tsx
    setIssues(NO_ISSUES);
    // ບິນຈາກແຊັດ: ຕິດ conversationId (server ກຳນົດ channel/source ຈາກເຄສ). ຢູ່ໃນ fingerprint ຈຶ່ງ key ປ່ຽນເມື່ອເຄສປ່ຽນ
    const payload = chat ? { ...result.data, conversationId: chat.conversation.id } : result.data;
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
    submitting.current = true;
    setSaving(true);
    let created: OrderDetailDto | null = null;
    try {
      const order = await create.mutateAsync({ input: payload, idempotencyKey: attempt.current.key });
      created = order;
      attempt.current = null; // ສຳເລັດແນ່ນອນ: ການສົ່ງຄັ້ງຕໍ່ໄປເປັນບິນໃໝ່
      // toast ສະແດງສະເໝີ (ບິນຖືກສ້າງ ແລະ ຈອງສະຕ໋ອກແລ້ວ ແມ່ນແຕ່ຜູ້ໃຊ້ອອກຈາກໜ້າ); ການພາໄປໜ້າບິນສະເພາະຕອນຍັງຢູ່
      toast.success(t("orders.toast.created", { number: order.orderNumber }));
      if (!chat && mounted.current) router.push(`/orders/${order.id}`);
    } catch (error) {
      if (mounted.current) {
        setShortages(extractShortages(error));
        setIssues({ messages: [errorMessage(error, t), ...shortageLines(error, t)], fields: [] });
        setAlertTick((tick) => tick + 1);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
    // ນອກ try: ຄວາມຜິດພາດຂອງ handler (ເຊັ່ນ ສົ່ງສະຫຼຸບ) ຕ້ອງບໍ່ຖືກສະແດງເປັນ "ສ້າງບິນບໍ່ສຳເລັດ"
    if (created && chat && mounted.current) chat.onCreated(created, { sendSummary });
  }
```

(ຈ) ຫົວໜ້າ: old
```tsx
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title"), t("orders.form.title")]}
        title={t("orders.form.title")}
        description={t("orders.form.description")}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-xl" disabled={saving} onClick={() => router.push("/orders")}>
```
new
```tsx
      <PageHeader
        breadcrumbs={
          chat
            ? [t("nav.home"), t("inbox.title"), t("orders.chat.title")]
            : [t("nav.home"), t("orders.title"), t("orders.form.title")]
        }
        title={chat ? t("orders.chat.title") : t("orders.form.title")}
        description={chat ? t("orders.chat.description", { name: chat.conversation.displayName }) : t("orders.form.description")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving}
              onClick={() => router.push(chat ? `/inbox?c=${encodeURIComponent(chat.conversation.id)}` : "/orders")}
            >
```

(ສ) ຄຳບອກເຄສບໍ່ລິ້ງລູກຄ້າ: old
```tsx
            {form.customerMode === "existing" ? (
```
new
```tsx
            {chat && !chat.conversation.customer ? (
              <p className="mb-4 text-sm text-ink-secondary">{t("orders.chat.unlinkedHint")}</p>
            ) : null}
            {form.customerMode === "existing" ? (
```

(ຊ) checkbox: old
```tsx
          <p className="mt-3 text-xs text-ink-muted">{t("orders.summary.estimate")}</p>
        </Card>
      </fieldset>
```
new
```tsx
          <p className="mt-3 text-xs text-ink-muted">{t("orders.summary.estimate")}</p>
        </Card>

        {chat ? (
          <Card className="max-w-md rounded-[20px] p-6">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--color-brand)]"
                checked={sendSummary}
                onChange={(event) => setSendSummary(event.target.checked)}
              />
              <span>{t("orders.chat.sendSummary")}</span>
            </label>
          </Card>
        ) : null}
      </fieldset>
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/order-form.chat.test.tsx src/components/orders/order-form.test.tsx` → Expected: PASS ທັງສອງ (test ເກົ່າຕ້ອງຍັງຜ່ານ: ບໍ່ມີ `chat` = ພຶດຕິກຳເດີມ)

- [ ] **Step 4: test ຂອງ `ChatOrderPage` (RED)**

ສ້າງ `apps/admin/src/components/orders/chat-order-page.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { clearToasts, getToasts } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, MessageDto, OrderDetailDto, VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ChatOrderPage } from "./chat-order-page";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "conv1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-07T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: { id: "c1", name: "Mali", phone: "02055550001" },
  createdAt: "2026-10-07T05:00:00.000Z",
};
const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }],
};
const warehouses = [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };
const createdOrder: OrderDetailDto = {
  id: "o9", orderNumber: "SO-000009", status: "PENDING_PAYMENT", channel: "FACEBOOK", source: "CHAT", conversationId: "conv1",
  customer: { id: "c1", name: "Mali", phone: "02055550001", email: null },
  currency: "LAK", exchangeRate: "1.000000", subtotal: "200.00", discountTotal: "0.00", shippingFee: "0.00",
  vatRate: "10.00", vatAmount: "18.18", total: "200.00", shippingName: "Mali", shippingPhone: "02055550001",
  shippingAddress: null, note: null, reservedUntil: "2026-10-07T06:00:00.000Z", secondsUntilExpiry: 1800,
  paidAt: null, shippedAt: null, completedAt: null, cancelledAt: null, createdAt: "2026-10-07T05:30:00.000Z",
  items: [{ id: "i1", variantId: "v1", warehouseId: "w1", productName: "Tee", variantName: "Red", sku: "TEE-R", unitPrice: "100.00", quantity: 2, discount: "0.00", lineTotal: "200.00" }],
  movements: [],
};

const message = (status: MessageDto["status"], errorCode: string | null = null): MessageDto => ({
  id: "m1", direction: "OUT", text: "x", attachments: [], status, errorCode, sentBy: null, createdAt: "2026-10-07T05:31:00.000Z",
});

/** ຄິວຄຳຕອບຂອງ POST /conversations/conv1/messages (ອັນທຳອິດຖືກໃຊ້ກ່ອນ) */
let replies: (MessageDto | Error)[] = [];

const orderPosts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders" && call[1]?.method === "POST");
const messagePosts = () =>
  vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/conversations/conv1/messages" && call[1]?.method === "POST");
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body: Record<string, unknown> }).body;

async function submitOrder(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.type(await screen.findByLabelText("Add item (search SKU/name)"), "tee");
  await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
  await user.click(screen.getByRole("button", { name: "Create order and reserve stock" }));
}

beforeEach(() => {
  router.push.mockReset();
  clearToasts();
  replies = [];
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/conversations/conv1" && !options?.method) return conversation;
    if (path === "/warehouses") return warehouses;
    if (path === "/settings/store") return settings;
    if (path.startsWith("/variants")) return { items: [tee], total: 1, page: 1, pageSize: 8 };
    if (path.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return createdOrder;
    if (path === "/conversations/conv1/messages" && options?.method === "POST") {
      const next = replies.shift();
      if (!next) throw new Error("no reply queued");
      if (next instanceof Error) throw next;
      return next;
    }
    throw new Error(`unexpected ${path}`);
  }) as typeof apiFetch);
});

describe("ChatOrderPage", () => {
  it("ໂຫຼດເຄສລົ້ມ (404): ສະແດງຂໍ້ຄວາມຂອງ code + ລິ້ງກັບໄປ inbox, ບໍ່ສະແດງຟອມ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "x", [], "CONVERSATION_NOT_FOUND"));
    renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation was not found");
    expect(screen.getByRole("link", { name: "Back to chat" })).toHaveAttribute("href", "/inbox?c=conv1");
    expect(screen.queryByLabelText("Add item (search SKU/name)")).not.toBeInTheDocument();
  });

  it("ສຳເລັດທັງສອງ: POST /orders ຄັ້ງດຽວ (ມີ conversationId), ສົ່ງສະຫຼຸບເຂົ້າແຊັດ, ແລ້ວກັບໄປ /inbox?c=", async () => {
    replies = [message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(bodyOf(orderPosts()[0])).toMatchObject({ conversationId: "conv1", customerId: "c1" });
    expect(messagePosts()).toHaveLength(1);
    const text = String(bodyOf(messagePosts()[0]).text);
    expect(text).toContain("SO-000009");
    expect(text).toContain("Tee (Red) 2 x 100.00 = 200.00");
    expect(text).toContain("200.00 LAK");
    const titles = getToasts().map((item) => item.title);
    expect(titles).toContain("Order SO-000009 created");
    expect(titles).toContain("Order summary sent to the chat");
  });

  it("ເອົາຕິກ 'ສົ່ງສະຫຼຸບ' ອອກ: ສ້າງບິນແລ້ວກັບໄປແຊັດເລີຍ ໂດຍບໍ່ສົ່ງຂໍ້ຄວາມ", async () => {
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await user.click(await screen.findByRole("checkbox", { name: "Send the order summary to the customer in chat" }));
    await submitOrder(user);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(0);
  });

  it("ສົ່ງສະຫຼຸບ FAILED (OUTSIDE_WINDOW): ບິນຍັງຢູ່, ບອກຊັດ, ບໍ່ໄປໜ້າອື່ນ; Retry ສົ່ງສະເພາະຂໍ້ຄວາມ (ບໍ່ສ້າງບິນໃໝ່) ແລ້ວກັບໄປແຊັດ", async () => {
    replies = [message("FAILED", "OUTSIDE_WINDOW"), message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Order SO-000009 was created, but the summary could not be sent to the chat/);
    expect(alert).toHaveTextContent("More than 24 hours since the customer's last message; Meta does not allow a reply");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/orders/o9");
    expect(screen.getByRole("link", { name: "Back to chat" })).toHaveAttribute("href", "/inbox?c=conv1");
    expect(orderPosts()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(messagePosts()).toHaveLength(2);
    expect(bodyOf(messagePosts()[1]).text).toBe(bodyOf(messagePosts()[0]).text);
    expect(orderPosts()).toHaveLength(1); // ບິນບໍ່ຖືກສ້າງຊ້ຳ
  });

  it("request ສົ່ງສະຫຼຸບ throw (ເຄືອຂ່າຍ/5xx): ປະຕິບັດຄືກັນ: ບິນຢູ່, ມີ Retry, retry ບໍ່ສ້າງບິນໃໝ່", async () => {
    replies = [new ApiError(503, "x", [], "CHANNEL_NOT_CONFIGURED"), message("SENT")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Order SO-000009 was created, but the summary could not be sent/);
    expect(router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/inbox?c=conv1"));
    expect(orderPosts()).toHaveLength(1);
    expect(messagePosts()).toHaveLength(2);
  });

  it("Retry ລົ້ມອີກ: ຍັງສະແດງ alert + ປຸ່ມ Retry (ບໍ່ຄ້າງສະຖານະກຳລັງສົ່ງ)", async () => {
    replies = [message("FAILED", "CHANNEL_AUTH"), message("FAILED", "CHANNEL_AUTH")];
    const { user } = renderWithProviders(<ChatOrderPage conversationId="conv1" />);
    await submitOrder(user);
    await user.click(await screen.findByRole("button", { name: "Send summary again" }));
    await waitFor(() => expect(messagePosts()).toHaveLength(2));
    expect(await screen.findByRole("button", { name: "Send summary again" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The Page token is invalid or expired");
    expect(router.push).not.toHaveBeenCalled();
    expect(orderPosts()).toHaveLength(1);
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/chat-order-page.test.tsx` → Expected: FAIL (component ບໍ່ມີ)

- [ ] **Step 5: `ChatOrderPage` (GREEN)**

ສ້າງ `apps/admin/src/components/orders/chat-order-page.tsx`:

```tsx
"use client";

import { Button, Card, PageHeader, buttonVariants, cn, toast } from "@oca/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { sendErrorKey } from "@/lib/inbox";
import { buildOrderSummary } from "@/lib/order-summary";
import { useConversation, useSendMessage } from "@/lib/queries";
import type { OrderDetailDto } from "@/lib/types";
import { OrderForm } from "./order-form";

type SummaryState = { kind: "idle" } | { kind: "sending" } | { kind: "failed"; reason: string };

/**
 * ເປີດບິນຈາກແຊັດ (`/orders/new?conversationId=`): ໂຫຼດເຄສ → OrderForm (ໂໝດແຊັດ) → ສົ່ງສະຫຼຸບເຂົ້າແຊັດ.
 * ການສົ່ງສະຫຼຸບຢູ່ຫຼັງບິນຖືກສ້າງແລ້ວ ແລະ ແຍກຈາກການສ້າງບິນຢ່າງສົມບູນ: ລົ້ມ (FAILED ຫຼື throw) = ບິນຍັງຢູ່, ໜ້ານີ້ສະແດງຜົນ
 * ພ້ອມ "ສົ່ງສະຫຼຸບອີກຄັ້ງ" ທີ່ສົ່ງສະເພາະຂໍ້ຄວາມ (ຟອມຖືກຖອດອອກແລ້ວ ຈຶ່ງບໍ່ມີທາງ POST /orders ຊ້ຳ).
 */
export function ChatOrderPage({ conversationId }: { conversationId: string }) {
  const { t } = useT();
  const router = useRouter();
  const conversation = useConversation(conversationId);
  const send = useSendMessage();
  const sending = useRef(false);
  const [created, setCreated] = useState<OrderDetailDto | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ kind: "idle" });
  const chatUrl = `/inbox?c=${encodeURIComponent(conversationId)}`;

  async function sendSummary(order: OrderDetailDto) {
    if (sending.current) return;
    sending.current = true;
    setSummary({ kind: "sending" });
    try {
      const message = await send.mutateAsync({ id: conversationId, input: { text: buildOrderSummary(order) } });
      // API ຕອບ 201 ແຕ່ status=FAILED (ເຊັ່ນ OUTSIDE_WINDOW) ກໍ່ຖືວ່າສົ່ງບໍ່ສຳເລັດ
      if (message.status === "FAILED") {
        setSummary({ kind: "failed", reason: t(sendErrorKey(message.errorCode)) });
        return;
      }
      toast.success(t("orders.chat.sent"));
      router.push(chatUrl);
    } catch (error) {
      setSummary({ kind: "failed", reason: errorMessage(error, t) });
    } finally {
      sending.current = false;
    }
  }

  function onCreated(order: OrderDetailDto, options: { sendSummary: boolean }) {
    setCreated(order);
    if (options.sendSummary) void sendSummary(order);
    else router.push(chatUrl);
  }

  const backLink = (
    <Link href={chatUrl} className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
      {t("orders.chat.back")}
    </Link>
  );

  if (created) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[t("nav.home"), t("inbox.title"), t("orders.chat.createdTitle", { number: created.orderNumber })]}
          title={t("orders.chat.createdTitle", { number: created.orderNumber })}
        />
        <div className="px-3 pb-10 sm:px-6">
          <Card className="max-w-xl space-y-4 rounded-[20px] p-6">
            {summary.kind === "sending" ? (
              <p role="status" className="text-sm text-ink-secondary">
                {t("orders.chat.sending")}
              </p>
            ) : null}
            {summary.kind === "failed" ? (
              <p role="alert" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                {t("orders.chat.sendFailed", { number: created.orderNumber, reason: summary.reason })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {summary.kind === "failed" ? (
                <Button className="rounded-xl" onClick={() => void sendSummary(created)}>
                  {t("orders.chat.retrySend")}
                </Button>
              ) : null}
              {backLink}
              <Link href={`/orders/${created.id}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
                {t("orders.chat.viewOrder")}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (conversation.isPending) return <p role="status" className="p-6 text-sm text-ink-muted">{t("common.loading")}</p>;
  if (conversation.isError) {
    return (
      <div className="space-y-3 p-6">
        <p role="alert" className="text-sm text-danger-ink">
          {errorMessage(conversation.error, t)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void conversation.refetch()}>
            {t("common.retry")}
          </Button>
          {backLink}
        </div>
      </div>
    );
  }

  return <OrderForm chat={{ conversation: conversation.data, onCreated }} />;
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/orders/chat-order-page.test.tsx` → Expected: PASS ທຸກ test. ຈຸດທີ່ຕ້ອງລະວັງ: (1) test "ໂຫຼດເຄສລົ້ມ" ຕ້ອງເຫັນ `Retry` ແລະ ລິ້ງ "Back to chat" ພ້ອມກັນ; (2) ຖ້າ `Button` ບໍ່ຮັບ `variant="outline"` ກວດ `packages/ui` (ໃຊ້ຢູ່ແລ້ວໃນ order-form).

- [ ] **Step 6: route `/orders/new?conversationId=`**

ແກ້ `apps/admin/src/app/(app)/orders/new/page.tsx` ທັງໄຟລ໌ (ອ່ານ docs ຂອງ Next ໃນ node_modules ຕາມຂໍ້ຄວນລະວັງກ່ອນ):

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { ChatOrderPage } from "@/components/orders/chat-order-page";
import { OrderForm } from "@/components/orders/order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string | string[] }>;
}) {
  const { conversationId } = await searchParams;
  const chatId = typeof conversationId === "string" && conversationId.trim() !== "" ? conversationId.trim() : null;
  if (chatId) {
    // ບິນຈາກແຊັດ: ນອກຈາກສິດສ້າງບິນ ຕ້ອງ inbox:write (API ບັງຄັບຄືກັນ) ເພາະຜູກເຄສ + ສົ່ງສະຫຼຸບເຂົ້າແຊັດ
    return (
      <PermissionGate permission={["orders:write", "inventory:read", "inbox:write"]}>
        {/* key ເຮັດໃຫ້ remount ເມື່ອ URL ປ່ຽນເຄສ (state ຂອງຟອມ/ຜົນລັບບໍ່ຮົ່ວຂ້າມເຄສ) */}
        <ChatOrderPage key={chatId} conversationId={chatId} />
      </PermissionGate>
    );
  }
  return (
    <PermissionGate permission={["orders:write", "inventory:read"]}>
      <OrderForm />
    </PermissionGate>
  );
}
```

Run: `pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin exec vitest run src/components/orders src/components/inbox src/lib` → Expected: PASS ທັງໝົດ

- [ ] **Step 7: lint + commit**

Run: `pnpm --filter @oca/admin lint` → Expected: ຂຽວ

```bash
git add apps/admin/src/components/orders/order-form.tsx apps/admin/src/components/orders/order-form.chat.test.tsx apps/admin/src/components/orders/chat-order-page.tsx apps/admin/src/components/orders/chat-order-page.test.tsx "apps/admin/src/app/(app)/orders/new/page.tsx" apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): open an order from the chat, send the summary to the conversation with retry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ກວດສຸດທ້າຍ: ທັງ repo + smoke ໃນ Chrome ຈິງ + ເອກະສານ

ເປັນງານຂອງ controller (ມີການຣັນ server/browser) ບໍ່ແມ່ນ subagent ທີ່ບໍ່ມີ browser. ປະຕິບັດຕາມ Task 8 ຂອງ plan 2a-2 ແລະ memory `phase1-progress`: ເຮັດໃນ **copy ແຍກ** ແລະ **ຖານ/ພອດແຍກ** ບໍ່ແຕະ dev server (:3000/:3001/:3002/:3100) ຫຼື ຖານ `oca` ຂອງຜູ້ໃຊ້.

- [ ] **Step 1: ກວດໂຄດທັງ repo (ໃນ working tree)**

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/database build && pnpm --filter @oca/channels build && pnpm --filter @oca/shared test && pnpm --filter @oca/database test && pnpm --filter @oca/channels test && pnpm --filter @oca/api test && pnpm --filter @oca/admin test && pnpm --filter @oca/api lint && pnpm --filter @oca/admin lint && pnpm --filter @oca/shared lint && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/api build`
Expected: ຂຽວທັງໝົດ. (test ຂອງ `apps/admin` ທີ່ເປັນຂອງງານຄ້າງຄົນອື່ນ ເຊັ່ນ `order-list.test.tsx` ຕ້ອງຍັງຜ່ານຄືກ່ອນ; ຖ້າລົ້ມເພາະ DTO `conversationId` ໃຫ້ກວດວ່າ field ເປັນ optional ແທ້)

- [ ] **Step 2: ສ້າງ copy ແລະ ຕຽມສະພາບແວດລ້ອມແຍກ**

ເຮັດຕາມ Task 8 Step 2 ຂອງ plan 2a-2 ທຸກຢ່າງ (`cp -Rc` ເປັນ copy, ຖານ `oca_smoke` ໃນ Postgres :5433, fake Graph `pnpm --filter @oca/channels simulate graph 4010`, API :3012, worker ແຍກ, admin `next build` + `next start --port 3112`). ເພີ່ມ:
- ຂໍ້ມູນຕົວຢ່າງໃນ `oca_smoke` (ຜ່ານ API ດ້ວຍ owner ຫຼື SQL): ສາງຫຼັກ 1 ແຫ່ງ, ສິນຄ້າ ACTIVE 2 ໂຕ (ມີ variant ລາຄາ), ຮັບສະຕ໋ອກເຂົ້າສາງ (ເຊັ່ນ 10 ຊິ້ນ), ລູກຄ້າ 1 ຄົນ.
- ຜູ້ໃຊ້ທົດສອບ: `CHAT_ADMIN` (orders:rw + inbox:rw + inventory:read), role ທີ່ມີ `inbox:read`+`inbox:write` ແຕ່ບໍ່ມີ `orders:*` (ສ້າງຜ່ານ `/roles` ຫຼື SQL ໃນ `oca_smoke`), role ທີ່ມີ `inbox:read` ຢ່າງດຽວ, ແລະ `ACCOUNTANT`.

- [ ] **Step 3: ຂັ້ນຕອນ smoke (Playwright/Chrome headless ໃນ scratchpad; ບັນທຶກ storageState ທຸກ login ເພາະ refresh token rotate)**

1. Login `chat_admin` → `/inbox`; `say U1001 "ຢາກໄດ້ເສື້ອ 2 ໂຕ"` ດ້ວຍ simulator (`SIM_API_URL=http://127.0.0.1:3012 FACEBOOK_APP_SECRET=smoke-secret pnpm --filter @oca/channels simulate say U1001 "..."`) → ເປີດເຄສ → ແຖບຂ້າງ (ຈໍກວ້າງ ≥1280) ມີສ່ວນ "ບິນຂອງການສົນທະນານີ້" ວ່າງ ("ຍັງບໍ່ມີບິນ...") ແລະ ປຸ່ມ "ເປີດບິນ".
2. ລິ້ງລູກຄ້າໃຫ້ເຄສ (ເລືອກລູກຄ້າທີ່ມີ) → ກົດ "ເປີດບິນ" → ໄປ `/orders/new?conversationId=<id>`: ຫົວຂໍ້ "ເປີດບິນຈາກແຊັດ", ລູກຄ້າ prefill, ຊື່/ໂທຈັດສົ່ງຖືກເຕີມ, ມີ checkbox "ສົ່ງສະຫຼຸບບິນ..." ຕິກຢູ່.
3. ເພີ່ມສິນຄ້າ 2 ຊິ້ນ → ສ້າງບິນ → ໄດ້ toast "ສ້າງບິນ SO-… ແລ້ວ" ແລ້ວ "ສົ່ງສະຫຼຸບບິນເຂົ້າແຊັດແລ້ວ", ກັບໄປ `/inbox?c=<id>`; thread ມີຟອງຂໍ້ຄວາມສະຫຼຸບ (ພາສາລາວ: ເລກບິນ, ລາຍການ, ຍອດ, ເວລາຈອງ) ແລະ fake Graph log ເຫັນ `send → U1001`; ແຖບຂ້າງມີ SO-… (ລິ້ງໄປ `/orders/[id]`, ສະຖານະ "ລໍຖ້າຊຳລະ"). ເປີດ `/orders/[id]` ເຫັນ channel Facebook ແລະ ສະຕ໋ອກຖືກຈອງ; `/orders` ລາຍການເຫັນບິນນີ້.
4. ເປີດບິນອີກອັນໂດຍເອົາຕິກ "ສົ່ງສະຫຼຸບ" ອອກ → ກັບແຊັດທັນທີ, ບໍ່ມີຂໍ້ຄວາມໃໝ່, ບິນທີສອງຂຶ້ນໃນແຖບຂ້າງ.
5. **ສົ່ງສະຫຼຸບບໍ່ໄດ້**: restart fake Graph ດ້ວຍ token ຜິດ (ຫຼື ຈຳລອງເຄສເກີນ 24 ຊມ. ຖ້າ simulator ຮອງຮັບ) ແລ້ວເປີດບິນທີສາມ → ບິນຖືກສ້າງ (ເຫັນ SO-… ໃນ `/orders` ພຽງ 1 ຄັ້ງ), ໜ້າຜົນລັບສະແດງ "ສ້າງບິນ SO-… ສຳເລັດແລ້ວ ແຕ່ສົ່ງສະຫຼຸບ... ບໍ່ສຳເລັດ: <ເຫດຜົນລາວ>" ພ້ອມ "ສົ່ງສະຫຼຸບອີກຄັ້ງ", "ກັບໄປແຊັດ", "ເບິ່ງບິນ". ກົດ "ສົ່ງສະຫຼຸບອີກຄັ້ງ" ຂະນະ token ຍັງຜິດ = ຍັງ error ແລະ ບິນບໍ່ຊ້ຳ; ແກ້ token ກັບຄືນ ແລ້ວກົດອີກ → ສົ່ງສຳເລັດ ແລະ ກັບແຊັດ. ກວດ DB (`oca_smoke`): ບິນດຽວ, ຈອງສະຕ໋ອກຄັ້ງດຽວ (`StockMovement RESERVE` ຕໍ່ບິນ). thread ມີຟອງ FAILED ເກົ່າ + ຟອງ SENT ໃໝ່.
6. ເຄສທີ່ບໍ່ລິ້ງລູກຄ້າ → ເປີດບິນ: ຟອມເປົ່າ + ຄຳບອກ "ການສົນທະນານີ້ຍັງບໍ່ໄດ້ລິ້ງກັບລູກຄ້າ..."; ເລືອກ "ລູກຄ້າໃໝ່" ໃສ່ຊື່/ເບີ → ບິນຖືກສ້າງ; ກັບແຊັດ ແຖບຂ້າງລູກຄ້າຍັງ "ຍັງບໍ່ໄດ້ລິ້ງ" (ບໍ່ລິ້ງອັດຕະໂນມັດ).
7. ສະຕ໋ອກບໍ່ພໍ: ສັ່ງເກີນສະຕ໋ອກ → alert ຂອງຟອມ (409) ແລະ ບໍ່ມີຂໍ້ຄວາມຖືກສົ່ງ, ບໍ່ມີບິນ.
8. ສິດ: role `inbox:rw` ບໍ່ມີ `orders:*` → ແຖບຂ້າງ **ບໍ່ມີ** ລາຍການບິນ ແລະ **ບໍ່ມີ** ປຸ່ມ (ບໍ່ມີ orders:write); ເຂົ້າ `/orders/new?conversationId=…` ໂດຍກົງ = ໜ້າບໍ່ມີສິດ. role `inbox:read` ຢ່າງດຽວ: ບໍ່ມີປຸ່ມ. ACCOUNTANT: ເຂົ້າ `/orders/new?conversationId=…` = ບໍ່ມີສິດ. `curl` ຍິງ `POST /orders` ດ້ວຍ token ຂອງຜູ້ມີ orders:write ແຕ່ບໍ່ມີ inbox:write ພ້ອມ `conversationId` = 403.
9. ຈໍແຄບ (390×800): ໃນ `/inbox` ກົດ "ລາຍລະອຽດ" (dialog) → ເຫັນສ່ວນ "ບິນ" + ປຸ່ມ "ເປີດບິນ"; ໜ້າຟອມບິນຈາກແຊັດໃຊ້ໄດ້ (ຕາຕະລາງເລື່ອນຕາມແນວນອນຄືເດີມ).
10. ເປີດ `/orders/new` (ບໍ່ມີ `conversationId`) = ຟອມເດີມທຸກຢ່າງ (ບໍ່ມີ checkbox, ສຳເລັດແລ້ວໄປ `/orders/[id]`).

ບັນທຶກ bug ທີ່ພົບທັງໝົດ; ແກ້ດ້ວຍ subagent (TDD) ກ່ອນປິດ. ເກັບ screenshot ໃນ scratchpad (ບໍ່ commit).

- [ ] **Step 4: ທຳຄວາມສະອາດ**

ຢຸດ server ທີ່ເປີດເອງ, `DROP DATABASE oca_smoke` (ຜ່ານ 5433 ເທົ່ານັ້ນ), ລຶບ copy.

- [ ] **Step 5: ອັບເດດ spec + ROADMAP**

`docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md` §7: old
```
ເປີດບິນເອີ້ນ `POST /orders` ເດີມ ຈຶ່ງຕ້ອງ `orders:write` + `inventory:read`; ບໍ່ມີສິດ = ເຊື່ອງປຸ່ມ.
```
new
```
ເປີດບິນເອີ້ນ `POST /orders` ເດີມ ພ້ອມ `conversationId` ຈຶ່ງຕ້ອງ `orders:write` + `inventory:read` + `inbox:write` (API ບັງຄັບ `inbox:write` ເມື່ອມີ `conversationId`); ບໍ່ມີສິດ = ເຊື່ອງປຸ່ມ. `channel`/`source` ບໍ່ຮັບຈາກ client: server ຕັ້ງ channel ຕາມເຄສ + `source=CHAT`. ບິນບໍ່ແກ້ `Conversation.customerId` ອັດຕະໂນມັດ.
```
§8: ຕໍ່ທ້າຍຍ່ອໜ້າທີ່ເວົ້າເລື່ອງເປີດບິນ ເພີ່ມປະໂຫຍກ: `ເປີດບິນໃຊ້ route /orders/new?conversationId=<id> (ບໍ່ແມ່ນ dialog); ສະຫຼຸບບິນສົ່ງຫຼັງສ້າງບິນ ແລະ retry ໄດ້ໂດຍບໍ່ສ້າງບິນຊ້ຳ.` (ແກ້ດ້ວຍ Edit ຕາມຂໍ້ຄວາມຈິງໃນໄຟລ໌)

`docs/ROADMAP.md` ບັນທັດ Omnichannel Inbox: old `| 2 | 1. Omnichannel Inbox | ເລີ່ມຈາກ Facebook Messenger, ເປີດບິນໃນແຊັດ |` new `| 2 | 1. Omnichannel Inbox | ເລີ່ມຈາກ Facebook Messenger, ເປີດບິນໃນແຊັດ — **2a ສຳເລັດ**: ຮັບ/ຕອບ Messenger, ມອບໝາຍ/ລິ້ງລູກຄ້າ, ເປີດບິນຈາກແຊັດ + ສະຫຼຸບບິນເຂົ້າແຊັດ. ເຫຼືອ: payment link, AI, ຊ່ອງທາງອື່ນ |`

```bash
git add docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md docs/ROADMAP.md
git commit -m "docs: record order-from-chat decisions and mark inbox 2a done

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: ອັບເດດ memory**

ອັບເດດ memory `phase1-progress`: 2a-3 ສຳເລັດ + commits + bug ຈາກ smoke + ສິ່ງທີ່ຄ້າງ (payment link, AI, channel ອື່ນ, retry ຫຼັງ reload); ຍັງບໍ່ push.

---

## Self-review (spec ↔ task)

- Spec §5 (`Order.conversationId`): Task 1 (persist + DTO + filter + audit).
- Spec §7 (ສິດ: `orders:write`+`inventory:read`, ເຊື່ອງປຸ່ມ; `GET /orders` ຂອງເຄສຕ້ອງ `orders:read`; sweep + ກວດ role seed): Task 1 Step 3 + 6 (API ບັງຄັບ `inbox:write` ເພີ່ມ, CHAT_ADMIN/MANAGER/OWNER ຜ່ານ, ACCOUNTANT/WAREHOUSE ບໍ່ຜ່ານ, `orders:read` ສຳລັບ filter), Task 3 (ປຸ່ມ/ລາຍການຕາມສິດ). ບໍ່ມີ route ໃໝ່ ຈຶ່ງບໍ່ເພີ່ມເຂົ້າ route sweep; sweep ຕາມ role ຈິງຂະຫຍາຍແລ້ວ.
- Spec §8 (ແຖບຂ້າງ: ບິນຂອງເຄສ + ປຸ່ມເປີດບິນ; order-form ແບບ prefill ລູກຄ້າ/channel/source=CHAT/conversationId; ສະຫຼຸບ ລາຍການ+ຍອດ+ເວລາໝົດຈອງ ເຂົ້າແຊັດ; ສົ່ງບໍ່ໄດ້ຕ້ອງບອກຊັດ ແລະ ບໍ່ສ້າງບິນຊ້ຳ): Task 3, 4 (+ builder Task 2). channel/source ຖືກກຳນົດຝັ່ງ server (Task 1) ແທນ prefill ຂອງ client ຕາມການຕັດສິນໃຈ #1.
- Spec §9 (component test ປຸ່ມເປີດບິນຕາມສິດ; smoke Chrome ດ້ວຍ simulator ໃນ copy/ຖານ/ພອດແຍກ: ເປີດບິນ, ສະຫຼຸບເຂົ້າແຊັດ): Task 3 (`side-panel-orders.test.tsx`), Task 5.
- ຄຳຂໍຂອງຜູ້ໃຊ້: ລູກຄ້າທີ່ບໍ່ລິ້ງ = ບໍ່ແກ້ເຄສ (Task 1 test + Task 4 hint + Task 5 smoke 6); retry ໂດຍບໍ່ສ້າງບິນຊ້ຳ (Task 4 test ສອງແບບ: FAILED ແລະ throw, ແລະ retry ລົ້ມຊ້ຳ); builder ເປັນ pure function ມີ unit test (items, qty, price, total, order number, ຄວາມຍາວ ≤ 2000): Task 2.
- ບໍ່ມີ placeholder: ທຸກ step ມີ code/ຂໍ້ຄວາມຈິງ ແລະ ຄຳສັ່ງ + ຜົນທີ່ຄາດໄວ້. ຂໍ້ຄວາມ "ຖ້າ expectation ບໍ່ກົງກັບ en ຈິງ ໃຫ້ແກ້" ໃນ Task 3/4 ໝາຍເຖິງ key ຂອງ dictionary ເດີມທີ່ plan ບໍ່ໄດ້ອ່ານຄ່າ en (`common.error.load`, `orders.shipping.name`): ຜູ້ເຮັດຕ້ອງເປີດ `dictionary.ts` ຢືນຢັນກ່ອນ.
- ຊື່ທີ່ໃຊ້ຂ້າມ task ສອດຄ່ອງ: `OrderListParams.conversationId`, `useOrders` (Task 2) ↔ `ConversationOrders` (Task 3); `orderFormForConversation` (Task 2) ↔ `OrderForm` (Task 4); `buildOrderSummary`/`OrderSummarySource` (Task 2) ↔ `ChatOrderPage` (Task 4; `OrderDetailDto` ເຂົ້າກັນໄດ້ກັບ `OrderSummarySource` ໂດຍໂຄງສ້າງ); `OrderFormChat.onCreated(order, { sendSummary })` (Task 4 ສອງໄຟລ໌); key i18n `inbox.panel.orders/noOrders/openOrder/ordersMore` (Task 3), `orders.chat.*` (Task 4, ທັງ lo+en).

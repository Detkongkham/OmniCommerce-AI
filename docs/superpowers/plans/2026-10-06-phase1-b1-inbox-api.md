# Phase 1 Inbox 2a-1 (API, DB, channels, simulator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ຮັບຂໍ້ຄວາມ Messenger ຜ່ານ webhook ເຂົ້າ DB, ຕອບລູກຄ້າ, ຈັດການເຄສ (ມອບໝາຍ/ປິດ/ລິ້ງລູກຄ້າ) ແລະ ສົ່ງ realtime ຜ່ານ SSE ພ້ອມ simulator ສຳລັບ dev (ຍັງບໍ່ມີ UI; UI ຄື plan 2a-2).

**Architecture:** `@oca/channels` ເກັບ adapter ຂອງແຕ່ລະ channel (Facebook: HMAC signature, parse webhook, Send API, profile) ແລະ simulator (fake Graph server + ຕົວສ້າງ webhook ທີ່ເຊັນຖືກ). `apps/api/src/modules/inbox` ມີ webhook controller (public, raw body), ingest service (transaction + dedupe ດ້ວຍ unique constraint), conversations service/controller ແລະ SSE ທີ່ຮັບ event ຈາກ Redis pub/sub. Spec: `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md`.

**Tech Stack:** NestJS 11, Prisma 7 (Postgres), ioredis, rxjs, zod 4, vitest + supertest, Node fetch.

## ການປ່ຽນແປງຈາກ spec (ຕັດສິນຕອນຂຽນ plan; Task 9 ອັບເດດ spec ຕາມນີ້)

- ຊື່ env ໃຊ້ຕາມ `.env.example` ທີ່ມີຢູ່: `FACEBOOK_APP_SECRET`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN`; ເພີ່ມ `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_BASE_URL`. **ຕັດ** `FB_PAGE_ID` (ບໍ່ຈຳເປັນ: ແຍກ thread ຈາກ `sender`/`recipient` ແລ້ວ).
- `Message.status` ມີ `PENDING` ເພີ່ມ (ແຖວຂາອອກຖືກບັນທຶກກ່ອນເອີ້ນ Graph).
- ບໍ່ມີ `POST /customers` ໃນລະບົບ ຈຶ່ງເພີ່ມ `POST /conversations/:id/customer` (ສ້າງລູກຄ້າ + ລິ້ງໃນ transaction ດຽວ).
- ລາຍການຂໍ້ຄວາມແບ່ງໜ້າດ້ວຍ cursor (`beforeId`, ໃໝ່ສຸດກ່ອນ) ເພື່ອບໍ່ໃຫ້ໜ້າເລື່ອນເມື່ອມີຂໍ້ຄວາມໃໝ່ເຂົ້າ.
- Error code ໃໝ່: `CONVERSATION_NOT_FOUND` (404), `USER_NOT_FOUND` (404), `CHANNEL_NOT_CONFIGURED` (503).

## ຂໍ້ຄວນລະວັງຂອງ repo (ອ່ານກ່ອນເລີ່ມ)

- Dev infra: Postgres `localhost:5433`, Redis `localhost:6380` (ແຍກຂອງຜູ້ໃຊ້). **ຫ້າມແຕະ 5432/6379**. API test ໃຊ້ຖານ `oca_test` ເທົ່ານັ້ນ (global-setup ສ້າງ + `db:deploy` ໃຫ້ເອງ). ຫ້າມ `db:deploy`/migrate ໃສ່ຖານ `oca` ຂອງຜູ້ໃຊ້. ຖ້າ Postgres/Redis ບໍ່ແລ່ນ ໃຫ້ຣັນ `pnpm infra:local` ໃນ terminal ແຍກ.
- ຫຼັງແກ້ `@oca/shared`/`@oca/database`/`@oca/channels` ຕ້ອງ `pnpm --filter <pkg> build` ກ່ອນ test ຂອງ api.
- ຢ່າແຕະ process ທີ່ແລ່ນຢູ່ທີ່ :3000/:3001/:3002/:3100.
- Commit ທຸກຄັ້ງລົງທ້າຍດ້ວຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- ຢ່າຂຽນ `beforeEach(() => mock.mockReset())` (ຕ້ອງໃສ່ວົງເລັບ `{ }`); ຂຽນ RED ກ່ອນສະເໝີ ແລ້ວເບິ່ງມັນລົ້ມຈິງ.

## File map

| ໄຟລ໌ | ໜ້າທີ່ດຽວ |
|---|---|
| `packages/shared/src/schemas/inbox.ts` (ໃໝ່) | constants, zod schema ຂອງ query/body, type `InboxEvent` |
| `packages/shared/src/schemas/inbox.test.ts` (ໃໝ່) | test ຂອງ schema ຂ້າງເທິງ |
| `packages/shared/src/error-codes.ts` (ແກ້) | ເພີ່ມ 3 code |
| `apps/api/src/common/api-error.ts` (ແກ້) | status ຂອງ 3 code |
| `apps/admin/src/lib/i18n/dictionary.ts` (ແກ້) | ຂໍ້ຄວາມ lo/en ຂອງ 3 code (ມີ test ບັງຄັບ) |
| `packages/database/prisma/schema.prisma` (ແກ້) | `Conversation`, `Message`, enum, `Order.conversationId` |
| `packages/database/prisma/migrations/20261006000000_inbox/migration.sql` (ໃໝ່) | migration |
| `packages/channels/*` | ຊຸດ adapter + simulator (ເບິ່ງ Task 3-4) |
| `apps/api/src/config/env.ts` (ແກ້) | env ຂອງ Facebook |
| `apps/api/src/modules/inbox/channel-registry.ts` | ສ້າງ adapter ຈາກ env ແລະ ຫາ adapter ຕາມ channel |
| `apps/api/src/modules/inbox/inbox-events.service.ts` | publish/subscribe Redis ຂອງ event inbox |
| `apps/api/src/modules/inbox/inbox-ingest.service.ts` | ບັນທຶກເຫດການຂາເຂົ້າ (transaction, dedupe) + ດຶງຊື່ໂປຣໄຟລ໌ |
| `apps/api/src/modules/inbox/facebook-webhook.controller.ts` | GET handshake + POST webhook (public) |
| `apps/api/src/modules/inbox/inbox.mapper.ts` | DTO + mapper |
| `apps/api/src/modules/inbox/conversations.service.ts` | list/get/messages/ຕອບ/ແກ້/read/ສ້າງລູກຄ້າ |
| `apps/api/src/modules/inbox/conversations.controller.ts` | route ຂອງ conversations |
| `apps/api/src/modules/inbox/inbox-events.controller.ts` | SSE `GET /inbox/events` |
| `apps/api/src/modules/inbox/inbox.module.ts` (ແກ້) | ຜູກທຸກຢ່າງ |
| `apps/api/test/*.e2e.test.ts` | webhook, conversations, SSE, ສິດ |

---

### Task 1: Shared: error codes + inbox schemas

**Files:**
- Create: `packages/shared/src/schemas/inbox.ts`, `packages/shared/src/schemas/inbox.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/error-codes.ts`, `apps/api/src/common/api-error.ts`, `apps/admin/src/lib/i18n/dictionary.ts`, `packages/shared/src/error-codes.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`packages/shared/src/schemas/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  conversationListQuerySchema,
  createCustomerFromChatSchema,
  messageListQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from "./inbox";

describe("conversationListQuerySchema", () => {
  it("ໃຊ້ຄ່າ default ແລະ ແປງ string", () => {
    expect(conversationListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(
      conversationListQuerySchema.parse({ page: "2", pageSize: "10", status: "OPEN", assignee: "me", unread: "true", q: " ab " }),
    ).toEqual({ page: 2, pageSize: 10, status: "OPEN", assignee: "me", unread: true, q: "ab" });
  });
  it("ປະຕິເສດ status ຜິດ, pageSize > 100, unread ບໍ່ແມ່ນ true/false", () => {
    expect(conversationListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(conversationListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(conversationListQuerySchema.safeParse({ unread: "yes" }).success).toBe(false);
  });
});

describe("messageListQuerySchema", () => {
  it("default limit 50, ສູງສຸດ 100", () => {
    expect(messageListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(messageListQuerySchema.parse({ limit: "20", beforeId: "m1" })).toEqual({ limit: 20, beforeId: "m1" });
    expect(messageListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(messageListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("trim ແລ້ວຕ້ອງບໍ່ວ່າງ ແລະ ≤ MAX_MESSAGE_LENGTH", () => {
    expect(sendMessageSchema.parse({ text: "  ສະບາຍດີ  " })).toEqual({ text: "ສະບາຍດີ" });
    expect(sendMessageSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ text: "a".repeat(MAX_MESSAGE_LENGTH + 1) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ text: "a".repeat(MAX_MESSAGE_LENGTH) }).success).toBe(true);
  });
  it("ປະຕິເສດ field ເກີນ", () => {
    expect(sendMessageSchema.safeParse({ text: "x", extra: 1 }).success).toBe(false);
  });
});

describe("updateConversationSchema", () => {
  it("ຕ້ອງມີຢ່າງໜ້ອຍ 1 field ທີ່ມີຄ່າ", () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(false);
    expect(updateConversationSchema.safeParse({ status: undefined }).success).toBe(false);
  });
  it("ຮັບ null ເພື່ອຖອນຜູ້ຮັບຜິດຊອບ/ລູກຄ້າ", () => {
    expect(updateConversationSchema.parse({ assigneeId: null })).toEqual({ assigneeId: null });
    expect(updateConversationSchema.parse({ customerId: null, status: "CLOSED" })).toEqual({
      customerId: null,
      status: "CLOSED",
    });
  });
  it("ປະຕິເສດ status ຜິດ ແລະ field ເກີນ", () => {
    expect(updateConversationSchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(updateConversationSchema.safeParse({ status: "OPEN", x: 1 }).success).toBe(false);
  });
});

describe("createCustomerFromChatSchema", () => {
  it("name ຈຳເປັນ; phone ເປັນຕົວເລກ 6-15 ຫຼັກ (ມີ + ໜ້າໄດ້) ແລະ optional", () => {
    expect(createCustomerFromChatSchema.parse({ name: " ສົມຊາຍ " })).toEqual({ name: "ສົມຊາຍ" });
    expect(createCustomerFromChatSchema.parse({ name: "A", phone: "+8562055555555" })).toEqual({
      name: "A",
      phone: "+8562055555555",
    });
    expect(createCustomerFromChatSchema.safeParse({ name: "A", phone: "12ab" }).success).toBe(false);
    expect(createCustomerFromChatSchema.safeParse({ name: " " }).success).toBe(false);
  });
});
```

ເພີ່ມໃນ `packages/shared/src/error-codes.test.ts` ຢູ່ໃນ `describe("ERROR_CODES")`:

```ts
  it("ມີ code ຂອງ inbox", () => {
    for (const code of ["CONVERSATION_NOT_FOUND", "USER_NOT_FOUND", "CHANNEL_NOT_CONFIGURED"]) {
      expect(isErrorCode(code), code).toBe(true);
    }
  });
```

- [ ] **Step 2: ຣັນ ແລະ ຢືນຢັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/shared test`
Expected: FAIL (`./inbox` ຫາບໍ່ເຫັນ; code ໃໝ່ບໍ່ມີ)

- [ ] **Step 3: ຂຽນ implementation**

`packages/shared/src/schemas/inbox.ts`:

```ts
import { z } from "zod";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const CONVERSATION_STATUSES = ["OPEN", "CLOSED"] as const;
export const MESSAGE_DIRECTIONS = ["IN", "OUT"] as const;
export const MESSAGE_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
/** ເຫດຜົນທີ່ສົ່ງຂໍ້ຄວາມອອກບໍ່ສຳເລັດ (ເກັບໃນ Message.errorCode; UI ແປເປັນພາສາລາວ). */
export const MESSAGE_SEND_ERRORS = [
  "OUTSIDE_WINDOW", // ເກີນໜ້າຕ່າງ 24 ຊົ່ວໂມງຂອງ Meta
  "CHANNEL_AUTH", // token ຜິດ/ໝົດອາຍຸ
  "CHANNEL_NOT_CONFIGURED",
  "CHANNEL_UNAVAILABLE", // ເຄືອຂ່າຍ / Meta ລົ້ມຊົ່ວຄາວ / rate limit
  "SEND_REJECTED", // Meta ປະຕິເສດດ້ວຍເຫດຜົນອື່ນ
] as const;

/** Messenger ຈຳກັດຂໍ້ຄວາມ 2000 ຕົວອັກສອນ. */
export const MAX_MESSAGE_LENGTH = 2000;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export type MessageSendError = (typeof MESSAGE_SEND_ERRORS)[number];

/** event ເບົາທີ່ສົ່ງຜ່ານ Redis/SSE; client ຕ້ອງ refetch ເອງ. */
export interface InboxEvent {
  type: "conversation.updated";
  conversationId: string;
}

// ---------------------------------------------------------------------------
// query / body
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(CONVERSATION_STATUSES).optional(),
  /** "me" | "unassigned" | id ຂອງຜູ້ໃຊ້ */
  assignee: z.string().trim().min(1).max(100).optional(),
  unread: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  q: z.string().trim().max(100).optional(),
});

/** cursor ແບບ "ກ່ອນຂໍ້ຄວາມນີ້" (ໃໝ່ສຸດກ່ອນ) ເພື່ອບໍ່ໃຫ້ໜ້າເລື່ອນເມື່ອມີຂໍ້ຄວາມໃໝ່ເຂົ້າ. */
export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeId: idSchema.optional(),
});

export const sendMessageSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const updateConversationSchema = z
  .strictObject({
    assigneeId: idSchema.nullable().optional(),
    status: z.enum(CONVERSATION_STATUSES).optional(),
    customerId: idSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");

export const createCustomerFromChatSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .regex(/^\+?[0-9]{6,15}$/, "ເບີໂທບໍ່ຖືກຕ້ອງ")
    .optional(),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateCustomerFromChatInput = z.infer<typeof createCustomerFromChatSchema>;
```

`packages/shared/src/index.ts` ເພີ່ມທ້າຍໄຟລ໌: `export * from "./schemas/inbox";`

`packages/shared/src/error-codes.ts`: ໃນ array ເພີ່ມທ້າຍ (ກ່ອນ `] as const`):

```ts
  // inbox
  "CONVERSATION_NOT_FOUND",
  "USER_NOT_FOUND",
  "CHANNEL_NOT_CONFIGURED",
```

- [ ] **Step 4: ຣັນ shared test ໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/shared test`
Expected: PASS ທັງໝົດ

- [ ] **Step 5: status ຂອງ code ໃໝ່ ໃນ API**

`apps/api/src/common/api-error.ts`: ໃນ `STATUS_BY_CODE` ເພີ່ມທ້າຍ (ຫຼັງ `RESERVATION_EXPIRED`):

```ts
  CONVERSATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHANNEL_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
```

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/api exec tsc --noEmit -p tsconfig.json`
Expected: ບໍ່ມີ error (ຖ້າລືມເພີ່ມ code compiler ຈະຟ້ອງ `Record<ErrorCode, …>`)

- [ ] **Step 6: ຂໍ້ຄວາມ UI ຂອງ code ໃໝ່ (admin ມີ test ບັງຄັບໃຫ້ຄົບທັງ lo/en)**

ໃນ `apps/admin/src/lib/i18n/dictionary.ts` ແກ້ 2 ບ່ອນ:

(a) ຫຼັງແຖວ `  "error.CUSTOMER_NOT_FOUND": "ບໍ່ພົບລູກຄ້ານີ້",` ເພີ່ມ:

```ts
  "error.CONVERSATION_NOT_FOUND": "ບໍ່ພົບການສົນທະນານີ້",
  "error.USER_NOT_FOUND": "ບໍ່ພົບຜູ້ໃຊ້ນີ້ ຫຼື ຜູ້ໃຊ້ຖືກປິດໃຊ້ງານ",
  "error.CHANNEL_NOT_CONFIGURED": "ຊ່ອງທາງນີ້ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ",
```

(b) ຫຼັງແຖວ `  "error.CUSTOMER_NOT_FOUND": "This customer was not found",` ເພີ່ມ:

```ts
  "error.CONVERSATION_NOT_FOUND": "This conversation was not found",
  "error.USER_NOT_FOUND": "This user was not found or is deactivated",
  "error.CHANNEL_NOT_CONFIGURED": "This channel is not configured",
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/errors.test.ts`
Expected: PASS (ລວມ "ທຸກ ERROR_CODES ມີຂໍ້ຄວາມໃນທັງ lo ແລະ en")

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/api/src/common/api-error.ts apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(shared): inbox schemas, send-error constants and conversation/user/channel error codes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database: Conversation, Message, Order.conversationId

**Files:**
- Modify: `packages/database/prisma/schema.prisma`, `apps/api/test/helpers.ts`
- Create: `packages/database/prisma/migrations/20261006000000_inbox/migration.sql`, `apps/api/test/inbox-migration.test.ts`

- [ ] **Step 1: ແກ້ `resetDb` ໃຫ້ລ້າງຕາຕະລາງໃໝ່**

ໃນ `apps/api/test/helpers.ts` ຟັງຊັນ `resetDb` ປ່ຽນ string ທີ່ສອງຂອງ TRUNCATE ຈາກ `'"OrderItem", "Order", ...` ເປັນ:

```ts
    'TRUNCATE TABLE "AuditLog", "RefreshToken", "User", "RolePermission", "Role", ' +
      '"Message", "Conversation", ' +
      '"OrderItem", "Order", "Customer", "StockMovement", "StockLevel", "ProductImage", ' +
```

(ເພີ່ມແຖວ `'"Message", "Conversation", ' +` ລະຫວ່າງສອງແຖວເດີມ; ສ່ວນທີ່ເຫຼືອບໍ່ປ່ຽນ.) ເພີ່ມ helper ທ້າຍໄຟລ໌ (ຕ້ອງ `import type { ConversationStatus }` ຮ່ວມກັບ `PrismaClient` ທີ່ມີຢູ່ແລ້ວ: ປ່ຽນ `import { type PrismaClient, ROLE_DEFINITIONS } from "@oca/database";` ເປັນ `import { type ConversationStatus, type PrismaClient, ROLE_DEFINITIONS } from "@oca/database";`):

```ts
/** ເຄສ Messenger ສຳລັບ test. ຄ່າທີ່ບໍ່ລະບຸ = OPEN, ບໍ່ມີຂໍ້ຄວາມຄ້າງ, ບໍ່ມີຜູ້ຮັບ/ລູກຄ້າ. */
export async function seedConversation(
  db: PrismaClient,
  overrides: Partial<{
    externalThreadId: string;
    displayName: string;
    status: ConversationStatus;
    unreadCount: number;
    lastMessageAt: Date;
    lastMessagePreview: string | null;
    assigneeId: string | null;
    customerId: string | null;
  }> = {},
) {
  const externalThreadId = overrides.externalThreadId ?? `PSID_${Math.random().toString(36).slice(2, 10)}`;
  return db.conversation.create({
    data: {
      channel: "FACEBOOK",
      externalThreadId,
      displayName: overrides.displayName ?? `Customer ${externalThreadId}`,
      status: overrides.status ?? "OPEN",
      unreadCount: overrides.unreadCount ?? 0,
      lastMessageAt: overrides.lastMessageAt ?? new Date(),
      lastMessagePreview: overrides.lastMessagePreview ?? null,
      assigneeId: overrides.assigneeId ?? null,
      customerId: overrides.customerId ?? null,
    },
  });
}

/** inbox-read@test.local: ມີ inbox:read ຢ່າງດຽວ (ເບິ່ງໄດ້ ຕອບບໍ່ໄດ້). ຄວນເອີ້ນຫຼັງ resetDb. */
export async function seedInboxReader(db: PrismaClient) {
  const role = await db.role.create({
    data: { name: "INBOX_READ", permissions: { create: [{ permission: "inbox:read" }] } },
  });
  return db.user.create({
    data: { email: "inbox-read@test.local", name: "Inbox Reader", passwordHash: await hash(TEST_PASSWORD), roleId: role.id },
  });
}
```

- [ ] **Step 2: ຂຽນ migration test (RED)**

`apps/api/test/inbox-migration.test.ts`:

```ts
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedConversation } from "./helpers";

describe("inbox migration", () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  it("Conversation ຊ້ຳ (channel, externalThreadId) ບໍ່ໄດ້", async () => {
    await seedConversation(db, { externalThreadId: "T1" });
    await expect(seedConversation(db, { externalThreadId: "T1" })).rejects.toThrow();
  });

  it("Message: externalId ຊ້ຳໃນເຄສດຽວກັນບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້ ແລະ ຕ່າງເຄສໃຊ້ mid ດຽວກັນໄດ້", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const msg = (conversationId: string, externalId: string | null) =>
      db.message.create({ data: { conversationId, direction: "IN", externalId, text: "x" } });
    await msg(a.id, "m1");
    await expect(msg(a.id, "m1")).rejects.toThrow();
    await msg(a.id, null);
    await msg(a.id, null);
    await msg(b.id, "m1");
    expect(await db.message.count()).toBe(4);
  });

  it("ລຶບ Conversation ລຶບ Message ຕາມ (cascade) ແລະ ເຮັດໃຫ້ Order.conversationId ເປັນ NULL", async () => {
    const conversation = await seedConversation(db);
    await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "hi" } });
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "FACEBOOK",
        source: "CHAT",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
        conversationId: conversation.id,
      },
    });
    await db.conversation.delete({ where: { id: conversation.id } });
    expect(await db.message.count()).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).conversationId).toBeNull();
  });

  it("Message.status ເລີ່ມຕົ້ນ SENT; Conversation ເລີ່ມຕົ້ນ OPEN ແລະ unreadCount 0", async () => {
    const conversation = await seedConversation(db);
    const message = await db.message.create({
      data: { conversationId: conversation.id, direction: "OUT", text: "x" },
    });
    expect(message.status).toBe("SENT");
    expect(conversation).toMatchObject({ status: "OPEN", unreadCount: 0 });
  });
});
```

Run: `pnpm --filter @oca/api exec vitest run test/inbox-migration.test.ts`
Expected: FAIL (ຍັງບໍ່ມີ model `conversation`)

- [ ] **Step 3: ເພີ່ມ model ໃນ `schema.prisma`**

(a) ຫຼັງ block `enum StockMovementType { ... }` ເພີ່ມ:

```prisma
enum ConversationStatus {
  OPEN
  CLOSED
}

enum MessageDirection {
  IN
  OUT
}

// PENDING = ບັນທຶກແລ້ວ ກຳລັງເອີ້ນ channel; SENT/FAILED = ຜົນຂອງການສົ່ງ (ຂາເຂົ້າເປັນ SENT ສະເໝີ)
enum MessageStatus {
  PENDING
  SENT
  FAILED
}
```

(b) ໃນ `model Customer` ເພີ່ມຫຼັງແຖວ `orders    Order[]`: `conversations Conversation[]` (ຈັດວົງເລັບໃຫ້ຕົງກັບ field ອື່ນ; `prisma format` ຈັດໃຫ້).

(c) ໃນ `model User` ເພີ່ມຫຼັງແຖວ `auditLogs     AuditLog[]`:

```prisma
  assignedConversations Conversation[]
  sentMessages          Message[]
```

(d) ໃນ `model Order` ເພີ່ມຫຼັງແຖວ `note            String?`:

```prisma
  conversationId  String?
  conversation    Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
```

ແລະ ຫຼັງ `@@index([createdAt])` ຂອງ Order ເພີ່ມ `@@index([conversationId])`.

(e) ທ້າຍໄຟລ໌ເພີ່ມ:

```prisma
// ---------------------------------------------------------------------------
// Inbox (ໂມດູນ 1): ເຄສແຊັດ ແລະ ຂໍ້ຄວາມ
// ---------------------------------------------------------------------------

// 1 ເຄສ = 1 ລູກຄ້າໃນ 1 ຊ່ອງທາງ (externalThreadId = PSID ຂອງ Messenger). ຊ່ອງທາງມາຈາກ SalesChannel ຄືກັບ Order
model Conversation {
  id                 String             @id @default(cuid())
  channel            SalesChannel
  externalThreadId   String
  displayName        String
  customerId         String?
  customer           Customer?          @relation(fields: [customerId], references: [id], onDelete: SetNull)
  assigneeId         String?
  assignee           User?              @relation(fields: [assigneeId], references: [id], onDelete: SetNull)
  status             ConversationStatus @default(OPEN)
  lastMessageAt      DateTime
  lastMessagePreview String?
  unreadCount        Int                @default(0)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  messages Message[]
  orders   Order[]

  @@unique([channel, externalThreadId])
  @@index([status, lastMessageAt])
  @@index([assigneeId])
  @@index([customerId])
}

model Message {
  id             String           @id @default(cuid())
  conversationId String
  conversation   Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      MessageDirection
  externalId     String? // mid ຂອງ Messenger; ໃຊ້ກັນຂໍ້ຄວາມຊ້ຳ (NULL ໄດ້ຫຼາຍແຖວ)
  text           String?
  attachments    Json? // [{ type, url }]
  sentByUserId   String?
  sentBy         User?            @relation(fields: [sentByUserId], references: [id], onDelete: SetNull)
  status         MessageStatus    @default(SENT)
  errorCode      String? // ໃຊ້ຄ່າຈາກ MESSAGE_SEND_ERRORS ຂອງ @oca/shared
  createdAt      DateTime         @default(now())

  @@unique([conversationId, externalId])
  @@index([conversationId, createdAt])
}
```

Run: `pnpm --filter @oca/database exec prisma format && pnpm --filter @oca/database db:validate`
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 4: ຂຽນ migration SQL**

`packages/database/prisma/migrations/20261006000000_inbox/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "customerId" TEXT,
    "assigneeId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "externalId" TEXT,
    "text" TEXT,
    "attachments" JSONB,
    "sentByUserId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_assigneeId_idx" ON "Conversation"("assigneeId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channel_externalThreadId_key" ON "Conversation"("channel", "externalThreadId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");

-- CreateIndex
CREATE INDEX "Order_conversationId_idx" ON "Order"("conversationId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: apply ໃສ່ `oca_test` ແລະ ກວດ drift = 0**

```bash
DATABASE_URL=postgresql://oca:oca@localhost:5433/oca_test pnpm --filter @oca/database db:deploy
DATABASE_URL=postgresql://oca:oca@localhost:5433/oca_test pnpm --filter @oca/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: deploy ບອກ `Applying migration 20261006000000_inbox`; diff ບອກ `No difference detected.` (exit 0). ຖ້າ option ຊື່ຕ່າງ ໃຫ້ເບິ່ງ `prisma migrate diff --help`. ຖ້າ diff ສະແດງ SQL ຄ້າງ ໃຫ້ແກ້ migration.sql ໃຫ້ຕົງ (ຢ່າແກ້ schema ເພື່ອໃຫ້ຜ່ານ) ແລ້ວ **drop ຖານ `oca_test` ທີ່ apply ຜິດ** (`DROP DATABASE oca_test` ຜ່ານ psql ທີ່ 5433 ເທົ່ານັ້ນ) ແລ້ວ deploy ໃໝ່.

- [ ] **Step 6: build client ແລະ ຣັນ test (GREEN)**

Run: `pnpm --filter @oca/database build && pnpm --filter @oca/api exec vitest run test/inbox-migration.test.ts`
Expected: PASS ທັງ 4 test

- [ ] **Step 7: ຣັນ test ເກົ່າທັງໝົດຂອງ database ແລະ api ວ່າບໍ່ແຕກ**

Run: `pnpm --filter @oca/database test && pnpm --filter @oca/api test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/database apps/api/test/helpers.ts apps/api/test/inbox-migration.test.ts
git commit -m "feat(database): Conversation, Message and Order.conversationId (inbox migration)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `@oca/channels`: interface + Facebook adapter

**Files:**
- Modify: `packages/channels/package.json`
- Create: `packages/channels/tsconfig.json`, `packages/channels/eslint.config.mjs`, `packages/channels/src/index.ts`, `src/types.ts`, `src/util.ts`, `src/facebook/{signature,parse,graph-errors,adapter}.ts` ແລະ test ຄູ່ກັນ (`signature.test.ts`, `parse.test.ts`, `adapter.test.ts`)
- Delete: `packages/channels/src/facebook/.gitkeep`

- [ ] **Step 1: scaffold package**

`packages/channels/package.json`:

```json
{
  "name": "@oca/channels",
  "version": "0.0.0",
  "private": true,
  "description": "Social channel adapters: Facebook, Instagram, TikTok, LINE",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "simulate": "tsx --env-file-if-exists=../../.env src/simulator/cli.ts"
  },
  "dependencies": {
    "@oca/shared": "workspace:*"
  },
  "devDependencies": {
    "@oca/config": "workspace:*",
    "@types/node": "^26.6.4",
    "eslint": "^9.39.5",
    "tsx": "^4.23.15",
    "typescript": "~5.9.3",
    "vitest": "^5.0.3"
  }
}
```

`packages/channels/tsconfig.json`:

```json
{
  "extends": "@oca/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/simulator/cli.ts"]
}
```

`packages/channels/eslint.config.mjs`:

```js
import base from "@oca/config/eslint";

export default base;
```

Run: `git rm -q packages/channels/src/facebook/.gitkeep && pnpm install`
Expected: install ສຳເລັດ, `packages/channels/node_modules/@oca/shared` ມີ

- [ ] **Step 2: types + util**

`packages/channels/src/types.ts`:

```ts
import type { MessageSendError } from "@oca/shared";

export type ChannelId = "FACEBOOK";

export type InboundAttachment = { type: string; url: string | null };

/** ເຫດການມາດຕະຖານທີ່ທຸກ channel ແປງມາ. `echo` = ຂໍ້ຄວາມທີ່ຮ້ານສົ່ງອອກ (ຈາກແອັບຂອງ channel ຫຼື ຈາກ API ຂອງເຮົາເອງ). */
export interface InboundEvent {
  kind: "message" | "echo";
  channel: ChannelId;
  /** ລະຫັດຂອງລູກຄ້າໃນ channel (PSID ຂອງ Messenger) */
  threadId: string;
  /** ລະຫັດຂໍ້ຄວາມຂອງ channel (mid) ໃຊ້ກັນຊ້ຳ */
  externalId: string;
  text: string | null;
  attachments: InboundAttachment[];
  timestamp: Date;
}

export type SendResult =
  | { ok: true; externalId: string }
  | { ok: false; code: MessageSendError; detail: string };

export interface ChannelProfile {
  name: string;
}

export interface ChannelAdapter {
  readonly channel: ChannelId;
  /** ກວດລາຍເຊັນຂອງ webhook ຈາກ raw body (ບໍ່ throw) */
  verifySignature(rawBody: Buffer, header: string | undefined): boolean;
  /** ແປງ payload ເປັນເຫດການ; payload ຜິດຮູບແບບ/ປະເພດທີ່ບໍ່ຮູ້ = [] (ບໍ່ throw) */
  parseWebhook(payload: unknown): InboundEvent[];
  /** ບໍ່ throw: ຄວາມລົ້ມເຫຼວທັງໝົດຄືນເປັນ `{ ok: false }` */
  sendText(threadId: string, text: string): Promise<SendResult>;
  /** ບໍ່ throw: ດຶງບໍ່ໄດ້ = null */
  fetchProfile(threadId: string): Promise<ChannelProfile | null>;
}
```

`packages/channels/src/util.ts`:

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 3: ຂຽນ test ທັງສາມ (RED)**

`packages/channels/src/facebook/signature.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidSignature, signBody } from "./signature";

const SECRET = "app-secret";
const BODY = Buffer.from('{"object":"page"}');

describe("signBody", () => {
  it("ເປັນ sha256=<hex ຂອງ HMAC-SHA256>", () => {
    const expected = `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex")}`;
    expect(signBody(SECRET, BODY)).toBe(expected);
    expect(signBody(SECRET, BODY.toString())).toBe(expected);
  });
});

describe("isValidSignature", () => {
  it("ຖືກຕ້ອງເມື່ອ secret + body + header ຕົງກັນ", () => {
    expect(isValidSignature(SECRET, BODY, signBody(SECRET, BODY))).toBe(true);
  });
  it("ຜິດເມື່ອ body ຖືກແກ້ ຫຼື secret ຕ່າງ", () => {
    expect(isValidSignature(SECRET, Buffer.from('{"object":"x"}'), signBody(SECRET, BODY))).toBe(false);
    expect(isValidSignature("other", BODY, signBody(SECRET, BODY))).toBe(false);
  });
  it("ຜິດເມື່ອ header ຂາດ, ບໍ່ມີ prefix, ຍາວຕ່າງ ຫຼື secret ບໍ່ໄດ້ຕັ້ງ", () => {
    expect(isValidSignature(SECRET, BODY, undefined)).toBe(false);
    expect(isValidSignature(SECRET, BODY, "deadbeef")).toBe(false);
    expect(isValidSignature(SECRET, BODY, "sha256=abc")).toBe(false);
    expect(isValidSignature(undefined, BODY, signBody(SECRET, BODY))).toBe(false);
    expect(isValidSignature("", BODY, signBody("", BODY))).toBe(false);
  });
});
```

`packages/channels/src/facebook/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFacebookWebhook } from "./parse";

const wrap = (...messaging: unknown[]) => ({ object: "page", entry: [{ id: "PAGE", time: 1, messaging }] });

describe("parseFacebookWebhook", () => {
  it("ຂໍ້ຄວາມຕົວອັກສອນຂອງລູກຄ້າ → kind=message, threadId=sender", () => {
    const events = parseFacebookWebhook(
      wrap({ sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1_700_000_000_000, message: { mid: "m1", text: "ສະບາຍດີ" } }),
    );
    expect(events).toEqual([
      {
        kind: "message",
        channel: "FACEBOOK",
        threadId: "U1",
        externalId: "m1",
        text: "ສະບາຍດີ",
        attachments: [],
        timestamp: new Date(1_700_000_000_000),
      },
    ]);
  });

  it("echo (is_echo) → kind=echo ແລະ threadId=recipient (ລູກຄ້າ)", () => {
    const [event] = parseFacebookWebhook(
      wrap({ sender: { id: "PAGE" }, recipient: { id: "U1" }, timestamp: 5, message: { mid: "m2", is_echo: true, text: "ຕອບແລ້ວ", app_id: 1 } }),
    );
    expect(event).toMatchObject({ kind: "echo", threadId: "U1", externalId: "m2", text: "ຕອບແລ້ວ" });
  });

  it("attachment: ເກັບ type ແລະ url; ຂໍ້ຄວາມທີ່ມີແຕ່ຮູບ text=null", () => {
    const [event] = parseFacebookWebhook(
      wrap({
        sender: { id: "U1" },
        recipient: { id: "PAGE" },
        timestamp: 5,
        message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }, { type: "location", payload: {} }] },
      }),
    );
    expect(event).toMatchObject({
      text: null,
      attachments: [
        { type: "image", url: "https://x/y.jpg" },
        { type: "location", url: null },
      ],
    });
  });

  it("ຂ້າມ delivery/read/postback ແລະ ຂໍ້ຄວາມທີ່ບໍ່ມີ mid ຫຼື ບໍ່ມີທັງ text ແລະ attachment", () => {
    const events = parseFacebookWebhook(
      wrap(
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, delivery: { mids: ["m1"], watermark: 1 } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, read: { watermark: 1 } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, postback: { payload: "x" } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, message: { text: "no mid" } },
        { sender: { id: "U1" }, recipient: { id: "PAGE" }, timestamp: 1, message: { mid: "m9" } },
        { recipient: { id: "PAGE" }, timestamp: 1, message: { mid: "m10", text: "no sender" } },
      ),
    );
    expect(events).toEqual([]);
  });

  it("ຫຼາຍ entry/messaging ຖືກແປງຄົບ; ບໍ່ມີ timestamp = ເວລາປັດຈຸບັນ", () => {
    const before = Date.now();
    const events = parseFacebookWebhook({
      object: "page",
      entry: [
        { id: "PAGE", messaging: [{ sender: { id: "A" }, recipient: { id: "PAGE" }, message: { mid: "a", text: "1" } }] },
        { id: "PAGE", messaging: [{ sender: { id: "B" }, recipient: { id: "PAGE" }, message: { mid: "b", text: "2" } }] },
      ],
    });
    expect(events.map((event) => event.threadId)).toEqual(["A", "B"]);
    expect(events[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("payload ຜິດຮູບແບບ/ບໍ່ແມ່ນ page = []", () => {
    for (const payload of [null, undefined, "x", 1, [], {}, { object: "instagram", entry: [] }, { object: "page" }, { object: "page", entry: "x" }, { object: "page", entry: [null, { messaging: "x" }] }]) {
      expect(parseFacebookWebhook(payload)).toEqual([]);
    }
  });
});
```

`packages/channels/src/facebook/adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_BASE_URL, FacebookAdapter, type FacebookAdapterConfig } from "./adapter";
import { signBody } from "./signature";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function make(fetchImpl: typeof fetch, overrides: Partial<FacebookAdapterConfig> = {}) {
  return new FacebookAdapter({
    appSecret: "secret",
    verifyToken: "verify-me",
    pageAccessToken: "tok",
    graphBaseUrl: "http://graph.test/v1",
    fetch: fetchImpl,
    ...overrides,
  });
}

describe("FacebookAdapter.sendText", () => {
  it("POST /me/messages ດ້ວຍ Bearer token ແລະ body ຕາມ Send API; ຄືນ message_id", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { recipient_id: "U1", message_id: "m_1" }),
    );
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "ສະບາຍດີ");
    expect(result).toEqual({ ok: true, externalId: "m_1" });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://graph.test/v1/me/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init?.body))).toEqual({
      recipient: { id: "U1" },
      messaging_type: "RESPONSE",
      message: { text: "ສະບາຍດີ" },
    });
    expect(String(url)).not.toContain("tok");
  });

  it("ບໍ່ມີ page token → CHANNEL_NOT_CONFIGURED ໂດຍບໍ່ເອີ້ນເຄືອຂ່າຍ", async () => {
    const fetchImpl = vi.fn();
    const result = await make(fetchImpl as unknown as typeof fetch, { pageAccessToken: undefined }).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code: "CHANNEL_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [400, { error: { message: "(#10) This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } }, "OUTSIDE_WINDOW"],
    [400, { error: { message: "(#200) This message is sent outside of allowed window", code: 200 } }, "OUTSIDE_WINDOW"],
    [400, { error: { message: "Invalid OAuth access token.", code: 190 } }, "CHANNEL_AUTH"],
    [401, { error: { message: "nope" } }, "CHANNEL_AUTH"],
    [500, { error: { message: "boom", code: 1 } }, "CHANNEL_UNAVAILABLE"],
    [429, { error: { message: "slow down", code: 4 } }, "CHANNEL_UNAVAILABLE"],
    [400, { error: { message: "(#100) bad param", code: 100 } }, "SEND_REJECTED"],
    [400, "not json", "SEND_REJECTED"],
  ])("Graph %i → %s", async (status, body, code) => {
    const fetchImpl = vi.fn(async () => json(status, body));
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code });
  });

  it("200 ແຕ່ບໍ່ມີ message_id = SEND_REJECTED", async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    expect(await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x")).toMatchObject({ ok: false, code: "SEND_REJECTED" });
  });

  it("ເຄືອຂ່າຍລົ້ມ/timeout → CHANNEL_UNAVAILABLE ແລະ detail ບໍ່ມີ token", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code: "CHANNEL_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("tok");
  });
});

describe("FacebookAdapter.fetchProfile", () => {
  it("ຄືນຊື່ເຕັມຈາກ first_name + last_name", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { id: "U1", first_name: "Somchai", last_name: "Vong" }),
    );
    expect(await make(fetchImpl as unknown as typeof fetch).fetchProfile("U1")).toEqual({ name: "Somchai Vong" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://graph.test/v1/U1?fields=first_name%2Clast_name");
  });
  it("ລົ້ມ/ບໍ່ມີຊື່/ບໍ່ມີ token = null", async () => {
    expect(await make((async () => json(400, { error: {} })) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make((async () => json(200, { id: "U1" })) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make((async () => { throw new Error("x"); }) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make(vi.fn() as unknown as typeof fetch, { pageAccessToken: undefined }).fetchProfile("U1")).toBeNull();
  });
});

describe("FacebookAdapter webhook helpers", () => {
  const adapter = make(vi.fn() as unknown as typeof fetch);
  it("verifySignature ໃຊ້ app secret", () => {
    const body = Buffer.from("{}");
    expect(adapter.verifySignature(body, signBody("secret", body))).toBe(true);
    expect(adapter.verifySignature(body, signBody("other", body))).toBe(false);
  });
  it("verifyHandshake ຕ້ອງ mode=subscribe ແລະ token ຕົງ", () => {
    expect(adapter.verifyHandshake("subscribe", "verify-me")).toBe(true);
    expect(adapter.verifyHandshake("subscribe", "nope")).toBe(false);
    expect(adapter.verifyHandshake("unsubscribe", "verify-me")).toBe(false);
    expect(adapter.verifyHandshake(undefined, undefined)).toBe(false);
  });
  it("canReceive ຕ້ອງມີທັງ appSecret ແລະ verifyToken; default base URL", () => {
    expect(adapter.canReceive).toBe(true);
    expect(new FacebookAdapter({ appSecret: "s" }).canReceive).toBe(false);
    expect(new FacebookAdapter({}).canReceive).toBe(false);
    expect(DEFAULT_GRAPH_BASE_URL).toBe("https://graph.facebook.com/v21.0");
  });
});
```

Run: `pnpm --filter @oca/channels test`
Expected: FAIL (module ບໍ່ມີ)

- [ ] **Step 4: implementation**

`packages/channels/src/facebook/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/** ລາຍເຊັນແບບທີ່ Meta ໃຊ້ໃນ header X-Hub-Signature-256: "sha256=" + HMAC-SHA256(appSecret, rawBody) */
export function signBody(appSecret: string, rawBody: Buffer | string): string {
  return PREFIX + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function isValidSignature(
  appSecret: string | undefined,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  if (!appSecret || !header?.startsWith(PREFIX)) return false;
  const expected = Buffer.from(signBody(appSecret, rawBody));
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

`packages/channels/src/facebook/parse.ts`:

```ts
import type { InboundAttachment, InboundEvent } from "../types";
import { isRecord } from "../util";

function idOf(value: unknown): string | null {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 ? value.id : null;
}

function parseAttachments(value: unknown): InboundAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    type: typeof item.type === "string" ? item.type : "unknown",
    url: isRecord(item.payload) && typeof item.payload.url === "string" ? item.payload.url : null,
  }));
}

function parseMessaging(item: unknown): InboundEvent | null {
  if (!isRecord(item) || !isRecord(item.message)) return null;
  const message = item.message;
  const externalId = typeof message.mid === "string" && message.mid.length > 0 ? message.mid : null;
  const sender = idOf(item.sender);
  const recipient = idOf(item.recipient);
  if (!externalId || !sender || !recipient) return null;

  const text = typeof message.text === "string" && message.text.length > 0 ? message.text : null;
  const attachments = parseAttachments(message.attachments);
  if (text === null && attachments.length === 0) return null;

  const echo = message.is_echo === true;
  return {
    kind: echo ? "echo" : "message",
    channel: "FACEBOOK",
    // echo: ຜູ້ສົ່ງຄືເພຈ ຈຶ່ງ thread ຂອງລູກຄ້າຢູ່ຝັ່ງ recipient
    threadId: echo ? recipient : sender,
    externalId,
    text,
    attachments,
    timestamp: typeof item.timestamp === "number" ? new Date(item.timestamp) : new Date(),
  };
}

/** delivery/read/postback ແລະ ອື່ນໆ ຖືກຂ້າມ (ຄືນ []) */
export function parseFacebookWebhook(payload: unknown): InboundEvent[] {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: InboundEvent[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.messaging)) continue;
    for (const item of entry.messaging) {
      const event = parseMessaging(item);
      if (event) events.push(event);
    }
  }
  return events;
}
```

`packages/channels/src/facebook/graph-errors.ts`:

```ts
import type { MessageSendError } from "@oca/shared";
import { isRecord } from "../util";

export interface GraphFailure {
  code: MessageSendError;
  detail: string;
}

const OUTSIDE_WINDOW_SUBCODE = 2018278;
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 613]);

/** ແປງ error ຂອງ Graph API ເປັນລະຫັດຂອງເຮົາ. detail ຕັດ ≤ 300 ຕົວ ແລະ ມາຈາກ message ຂອງ Meta ເທົ່ານັ້ນ (ບໍ່ມີ token). */
export function mapGraphFailure(status: number, body: unknown): GraphFailure {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const code = typeof error.code === "number" ? error.code : undefined;
  const subcode = typeof error.error_subcode === "number" ? error.error_subcode : undefined;
  const message = typeof error.message === "string" ? error.message : `HTTP ${status}`;
  const detail = message.slice(0, 300);

  if (subcode === OUTSIDE_WINDOW_SUBCODE || /outside of allowed window/i.test(message)) {
    return { code: "OUTSIDE_WINDOW", detail };
  }
  if (code === 190 || status === 401) return { code: "CHANNEL_AUTH", detail };
  if (status >= 500 || status === 429 || (code !== undefined && TRANSIENT_CODES.has(code))) {
    return { code: "CHANNEL_UNAVAILABLE", detail };
  }
  return { code: "SEND_REJECTED", detail };
}
```

`packages/channels/src/facebook/adapter.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, ChannelProfile, InboundEvent, SendResult } from "../types";
import { isRecord } from "../util";
import { mapGraphFailure } from "./graph-errors";
import { parseFacebookWebhook } from "./parse";
import { isValidSignature } from "./signature";

export const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

export interface FacebookAdapterConfig {
  appSecret?: string;
  verifyToken?: string;
  pageAccessToken?: string;
  /** ຊີ້ໄປ simulator ໃນ dev/test */
  graphBaseUrl?: string;
  /** ສຳລັບ test */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: FacebookAdapterConfig) {
    this.baseUrl = (config.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** ຮັບ webhook ໄດ້ເມື່ອມີທັງ app secret (ກວດລາຍເຊັນ) ແລະ verify token (handshake) */
  get canReceive(): boolean {
    return Boolean(this.config.appSecret && this.config.verifyToken);
  }

  verifyHandshake(mode: string | undefined, token: string | undefined): boolean {
    const expected = this.config.verifyToken;
    if (mode !== "subscribe" || !token || !expected) return false;
    const actual = Buffer.from(token);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  }

  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    return isValidSignature(this.config.appSecret, rawBody, header);
  }

  parseWebhook(payload: unknown): InboundEvent[] {
    return parseFacebookWebhook(payload);
  }

  async sendText(threadId: string, text: string): Promise<SendResult> {
    const token = this.config.pageAccessToken;
    if (!token) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/me/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipient: { id: threadId }, messaging_type: "RESPONSE", message: { text } }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && isRecord(body) && typeof body.message_id === "string") {
      return { ok: true, externalId: body.message_id };
    }
    const failure = mapGraphFailure(response.status, body);
    return { ok: false, ...failure };
  }

  async fetchProfile(threadId: string): Promise<ChannelProfile | null> {
    const token = this.config.pageAccessToken;
    if (!token) return null;
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/${encodeURIComponent(threadId)}?fields=first_name%2Clast_name`,
        { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!isRecord(body)) return null;
      const name = [body.first_name, body.last_name]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ");
      return name ? { name } : null;
    } catch {
      return null;
    }
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
```

`packages/channels/src/index.ts`:

```ts
export * from "./types";
export { DEFAULT_GRAPH_BASE_URL, FacebookAdapter, type FacebookAdapterConfig } from "./facebook/adapter";
export { parseFacebookWebhook } from "./facebook/parse";
export { isValidSignature, signBody } from "./facebook/signature";
```

- [ ] **Step 5: ຣັນ test + lint + build (GREEN)**

Run: `pnpm --filter @oca/channels test && pnpm --filter @oca/channels lint && pnpm --filter @oca/channels build`
Expected: PASS ທັງໝົດ, `dist/index.js` ຖືກສ້າງ

- [ ] **Step 6: Commit**

```bash
git add packages/channels pnpm-lock.yaml
git commit -m "feat(channels): ChannelAdapter interface and Facebook adapter (signature, parse, send, profile)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `@oca/channels`: simulator (fake Graph, webhook builders, CLI)

**Files:**
- Create: `packages/channels/src/simulator/{payloads,post-webhook,fake-graph,index}.ts`, `packages/channels/src/simulator/simulator.test.ts`, `packages/channels/src/simulator/cli.ts`
- Modify: `packages/channels/src/index.ts`

- [ ] **Step 1: ຂຽນ test (RED)**

`packages/channels/src/simulator/simulator.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { FacebookAdapter } from "../facebook/adapter";
import { parseFacebookWebhook } from "../facebook/parse";
import { type FakeGraph, deliveryPayload, echoPayload, messagePayload, startFakeGraph } from "./index";

describe("payload builders ກັບ parser", () => {
  it("messagePayload → message", () => {
    const events = parseFacebookWebhook(messagePayload({ pageId: "P", psid: "U1", mid: "m1", text: "ສະບາຍດີ", timestamp: 100 }));
    expect(events).toEqual([
      { kind: "message", channel: "FACEBOOK", threadId: "U1", externalId: "m1", text: "ສະບາຍດີ", attachments: [], timestamp: new Date(100) },
    ]);
  });
  it("messagePayload ມີຮູບ", () => {
    const [event] = parseFacebookWebhook(
      messagePayload({ pageId: "P", psid: "U1", mid: "m2", attachments: [{ type: "image", url: "https://x/y.jpg" }] }),
    );
    expect(event).toMatchObject({ text: null, attachments: [{ type: "image", url: "https://x/y.jpg" }] });
  });
  it("echoPayload → echo ຂອງ thread ລູກຄ້າ", () => {
    const [event] = parseFacebookWebhook(echoPayload({ pageId: "P", psid: "U1", mid: "m3", text: "ຕອບ" }));
    expect(event).toMatchObject({ kind: "echo", threadId: "U1", externalId: "m3", text: "ຕອບ" });
  });
  it("deliveryPayload ຖືກຂ້າມ", () => {
    expect(parseFacebookWebhook(deliveryPayload({ pageId: "P", psid: "U1", mids: ["m1"] }))).toEqual([]);
  });
});

describe("fake Graph server", () => {
  let graph: FakeGraph | undefined;
  afterEach(async () => {
    await graph?.close();
    graph = undefined;
  });
  const adapterFor = (g: FakeGraph, token = "tok") => new FacebookAdapter({ pageAccessToken: token, graphBaseUrl: g.url });

  it("ຮັບ Send API, ບັນທຶກຂໍ້ຄວາມ ແລະ ໃຫ້ message_id ຕາມລຳດັບ", async () => {
    graph = await startFakeGraph({ token: "tok" });
    expect(graph.nextMessageId()).toBe("m_sim_1");
    expect(await adapterFor(graph).sendText("U1", "hello")).toEqual({ ok: true, externalId: "m_sim_1" });
    expect(await adapterFor(graph).sendText("U2", "again")).toEqual({ ok: true, externalId: "m_sim_2" });
    expect(graph.sent).toEqual([
      { recipientId: "U1", text: "hello", authorization: "Bearer tok" },
      { recipientId: "U2", text: "again", authorization: "Bearer tok" },
    ]);
  });

  it("token ຜິດ → CHANNEL_AUTH", async () => {
    graph = await startFakeGraph({ token: "tok" });
    expect(await adapterFor(graph, "wrong").sendText("U1", "x")).toMatchObject({ ok: false, code: "CHANNEL_AUTH" });
    expect(graph.sent).toEqual([]);
  });

  it("failNext ໃຊ້ຄັ້ງດຽວ (ເຊັ່ນ ເກີນໜ້າຕ່າງ 24 ຊມ) ແລ້ວກັບເປັນປົກກະຕິ", async () => {
    graph = await startFakeGraph();
    graph.failNext({ status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." });
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: false, code: "OUTSIDE_WINDOW" });
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: true });
  });

  it("profile: ຮູ້ຈັກ id ເທົ່ານັ້ນ (ຫຼື autoProfiles)", async () => {
    graph = await startFakeGraph();
    graph.profiles.set("U1", "Somchai Vong");
    expect(await adapterFor(graph).fetchProfile("U1")).toEqual({ name: "Somchai Vong" });
    expect(await adapterFor(graph).fetchProfile("U2")).toBeNull();
    const auto = await startFakeGraph({ autoProfiles: true });
    try {
      expect(await adapterFor(auto).fetchProfile("U9")).toEqual({ name: "Sim U9" });
    } finally {
      await auto.close();
    }
  });

  it("reset ລ້າງ sent/failures/profiles ແລະ ເລີ່ມນັບ message_id ໃໝ່", async () => {
    graph = await startFakeGraph();
    await adapterFor(graph).sendText("U1", "x");
    graph.failNext({ status: 500, code: 1, message: "boom" });
    graph.profiles.set("U1", "A B");
    graph.reset();
    expect(graph.sent).toEqual([]);
    expect(graph.profiles.size).toBe(0);
    expect(graph.nextMessageId()).toBe("m_sim_1");
    expect(await adapterFor(graph).sendText("U1", "x")).toMatchObject({ ok: true });
  });
});
```

Run: `pnpm --filter @oca/channels test`
Expected: FAIL (`./index` ບໍ່ມີ)

- [ ] **Step 2: implementation**

`packages/channels/src/simulator/payloads.ts`:

```ts
/** ຕົວສ້າງ webhook payload ແບບ Messenger (ໃຊ້ໃນ simulator ແລະ test; ຮູບແບບຕາມເອກະສານ Meta). */

export interface MessagePayloadInput {
  pageId: string;
  psid: string;
  mid: string;
  text?: string;
  attachments?: { type: string; url: string }[];
  timestamp?: number;
}

const wrap = (pageId: string, timestamp: number, messaging: object) => ({
  object: "page",
  entry: [{ id: pageId, time: timestamp, messaging: [messaging] }],
});

export function messagePayload(input: MessagePayloadInput): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.psid },
    recipient: { id: input.pageId },
    timestamp,
    message: {
      mid: input.mid,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.attachments
        ? { attachments: input.attachments.map((item) => ({ type: item.type, payload: { url: item.url } })) }
        : {}),
    },
  });
}

export function echoPayload(input: { pageId: string; psid: string; mid: string; text: string; timestamp?: number }): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.pageId },
    recipient: { id: input.psid },
    timestamp,
    message: { mid: input.mid, is_echo: true, app_id: 1, text: input.text },
  });
}

export function deliveryPayload(input: { pageId: string; psid: string; mids: string[]; timestamp?: number }): object {
  const timestamp = input.timestamp ?? Date.now();
  return wrap(input.pageId, timestamp, {
    sender: { id: input.psid },
    recipient: { id: input.pageId },
    timestamp,
    delivery: { mids: input.mids, watermark: timestamp },
  });
}
```

`packages/channels/src/simulator/post-webhook.ts`:

```ts
import { signBody } from "../facebook/signature";

/** ສົ່ງ webhook ທີ່ເຊັນຖືກຕ້ອງດ້ວຍ app secret ໄປທີ່ URL ຂອງ API */
export async function postSignedWebhook(options: { url: string; appSecret: string; payload: unknown }): Promise<Response> {
  const body = JSON.stringify(options.payload);
  return fetch(options.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signBody(options.appSecret, body) },
    body,
  });
}
```

`packages/channels/src/simulator/fake-graph.ts`:

```ts
import { type IncomingMessage, createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface SentMessage {
  recipientId: string;
  text: string;
  authorization: string | undefined;
}

export interface FakeGraphFailure {
  status: number;
  code: number;
  subcode?: number;
  message: string;
}

export interface FakeGraphOptions {
  port?: number;
  /** ຖ້າຕັ້ງ ຕ້ອງສົ່ງ `Authorization: Bearer <token>` ຖືກ ບໍ່ດັ່ງນັ້ນຕອບ 401 (code 190) */
  token?: string;
  /** id ທີ່ບໍ່ຮູ້ຈັກ ຕອບຊື່ `Sim <id>` ແທນ error */
  autoProfiles?: boolean;
  onSend?: (message: SentMessage) => void;
}

export interface FakeGraph {
  readonly url: string;
  readonly sent: SentMessage[];
  readonly profiles: Map<string, string>;
  /** message_id ທີ່ຈະໄດ້ໃນການສົ່ງຄັ້ງຖັດໄປ */
  nextMessageId(): string;
  failNext(failure: FakeGraphFailure): void;
  reset(): void;
  close(): Promise<void>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Graph API ປອມ: POST .../me/messages ແລະ GET .../<psid>?fields=... (ສຳລັບ dev/test ເທົ່ານັ້ນ) */
export async function startFakeGraph(options: FakeGraphOptions = {}): Promise<FakeGraph> {
  const sent: SentMessage[] = [];
  const profiles = new Map<string, string>();
  const failures: FakeGraphFailure[] = [];
  let counter = 0;

  const server = createServer(async (request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const authorization = request.headers.authorization;
    if (options.token && authorization !== `Bearer ${options.token}`) {
      reply(401, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } });
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "POST" && url.pathname.endsWith("/me/messages")) {
      const failure = failures.shift();
      if (failure) {
        reply(failure.status, {
          error: { message: failure.message, type: "OAuthException", code: failure.code, error_subcode: failure.subcode },
        });
        return;
      }
      const body = await readJson(request);
      const recipient = body?.recipient as { id?: unknown } | undefined;
      const message = body?.message as { text?: unknown } | undefined;
      if (typeof recipient?.id !== "string" || typeof message?.text !== "string") {
        reply(400, { error: { message: "(#100) Invalid parameter", type: "OAuthException", code: 100 } });
        return;
      }
      counter += 1;
      const entry = { recipientId: recipient.id, text: message.text, authorization };
      sent.push(entry);
      options.onSend?.(entry);
      reply(200, { recipient_id: recipient.id, message_id: `m_sim_${counter}` });
      return;
    }

    if (request.method === "GET") {
      const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
      const name = profiles.get(id) ?? (options.autoProfiles ? `Sim ${id}` : undefined);
      if (!name) {
        reply(400, { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 } });
        return;
      }
      const [first = "", ...rest] = name.split(" ");
      reply(200, { id, first_name: first, last_name: rest.join(" ") });
      return;
    }

    reply(404, { error: { message: "Not found", code: 100 } });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    sent,
    profiles,
    nextMessageId: () => `m_sim_${counter + 1}`,
    failNext: (failure) => {
      failures.push(failure);
    },
    reset: () => {
      sent.length = 0;
      failures.length = 0;
      profiles.clear();
      counter = 0;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
```

`packages/channels/src/simulator/index.ts`:

```ts
export * from "./fake-graph";
export * from "./payloads";
export * from "./post-webhook";
```

`packages/channels/src/index.ts` ເພີ່ມທ້າຍ: `export * as simulator from "./simulator";`

`packages/channels/src/simulator/cli.ts`:

```ts
// ໃຊ້ໃນ dev ເທົ່ານັ້ນ. ຕົວຢ່າງ:
//   pnpm --filter @oca/channels simulate graph 4010          # Graph API ປອມ (ຕັ້ງ FACEBOOK_GRAPH_BASE_URL=http://127.0.0.1:4010)
//   pnpm --filter @oca/channels simulate say U123 "ສະບາຍດີ"   # ລູກຄ້າ U123 ສົ່ງຂໍ້ຄວາມເຂົ້າ API
//   pnpm --filter @oca/channels simulate echo U123 "ຕອບແລ້ວ" # ຮ້ານຕອບຈາກແອັບ Facebook
import { echoPayload, messagePayload } from "./payloads";
import { startFakeGraph } from "./fake-graph";
import { postSignedWebhook } from "./post-webhook";

const [command, ...args] = process.argv.slice(2);
const apiUrl = process.env.SIM_API_URL ?? "http://localhost:3001";
const pageId = process.env.SIM_PAGE_ID ?? "PAGE_SIM";

function requireSecret(): string {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) throw new Error("FACEBOOK_APP_SECRET is not set");
  return secret;
}

async function post(payload: object): Promise<void> {
  const response = await postSignedWebhook({ url: `${apiUrl}/webhooks/facebook`, appSecret: requireSecret(), payload });
  console.log(`webhook → ${response.status} ${await response.text()}`);
}

async function main(): Promise<void> {
  if (command === "graph") {
    const port = Number(args[0] ?? 4010);
    const graph = await startFakeGraph({
      port,
      token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || undefined,
      autoProfiles: true,
      onSend: (message) => console.log(`send → ${message.recipientId}: ${message.text}`),
    });
    console.log(`fake Graph API on ${graph.url} (set FACEBOOK_GRAPH_BASE_URL=${graph.url})`);
    return;
  }
  const [psid, ...words] = args;
  const text = words.join(" ");
  if ((command === "say" || command === "echo") && psid && text) {
    const mid = `m_sim_${command}_${Date.now()}`;
    await post(command === "say" ? messagePayload({ pageId, psid, mid, text }) : echoPayload({ pageId, psid, mid, text }));
    return;
  }
  console.log("usage: simulate graph [port] | simulate say <psid> <text> | simulate echo <psid> <text>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: ຣັນ test + lint + build**

Run: `pnpm --filter @oca/channels test && pnpm --filter @oca/channels lint && pnpm --filter @oca/channels build`
Expected: PASS; `dist/simulator/index.js` ມີ ແຕ່ `dist/simulator/cli.js` ບໍ່ມີ

- [ ] **Step 4: ກວດ CLI ແບບບໍ່ແຕະເຄືອຂ່າຍ**

Run: `pnpm --filter @oca/channels simulate`
Expected: ພິມ `usage: simulate graph [port] | simulate say <psid> <text> | simulate echo <psid> <text>` ແລະ exit code 1

- [ ] **Step 5: Commit**

```bash
git add packages/channels
git commit -m "feat(channels): Messenger simulator (fake Graph API, signed webhook builders, CLI)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API: env, registry, ingest, Redis events, webhook

**Files:**
- Modify: `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/src/main.ts`, `apps/api/test/helpers.ts`, `apps/api/src/modules/inbox/inbox.module.ts`
- Create: `apps/api/src/modules/inbox/{channel-registry,inbox-events.service,inbox-ingest.service,facebook-webhook.controller}.ts`, `apps/api/test/inbox-webhook.e2e.test.ts`

- [ ] **Step 1: dependency + rawBody**

`apps/api/package.json` ໃນ `dependencies` ເພີ່ມ (ຮັກສາລຳດັບ alphabetical): `"@oca/channels": "workspace:*",` ກ່ອນ `"@oca/database"`. Run `pnpm install`.

`apps/api/src/main.ts`: ປ່ຽນ `NestFactory.create(AppModule)` ເປັນ `NestFactory.create(AppModule, { rawBody: true })` (webhook ຕ້ອງໃຊ້ raw body ເພື່ອກວດລາຍເຊັນ).

`apps/api/test/helpers.ts` ໃນ `createTestApp`: ປ່ຽນ `moduleRef.createNestApplication()` ເປັນ `moduleRef.createNestApplication({ rawBody: true })`.

- [ ] **Step 2: env (RED → GREEN)**

ເພີ່ມ test ໃນ `apps/api/src/config/env.test.ts` ພາຍໃນ `describe("parseEnv", …)`:

```ts
  it("FACEBOOK_*: ຄ່າວ່າງ (ຈາກ .env.example) = ບໍ່ໄດ້ຕັ້ງ", () => {
    const env = parseEnv({
      ...base,
      FACEBOOK_APP_SECRET: "",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "",
      FACEBOOK_PAGE_ACCESS_TOKEN: "",
      FACEBOOK_GRAPH_BASE_URL: "",
    });
    expect(env.FACEBOOK_APP_SECRET).toBeUndefined();
    expect(env.FACEBOOK_WEBHOOK_VERIFY_TOKEN).toBeUndefined();
    expect(env.FACEBOOK_PAGE_ACCESS_TOKEN).toBeUndefined();
    expect(env.FACEBOOK_GRAPH_BASE_URL).toBeUndefined();
  });

  it("FACEBOOK_*: ອ່ານຄ່າທີ່ຕັ້ງ ແລະ ປະຕິເສດ base URL ທີ່ບໍ່ແມ່ນ URL", () => {
    expect(
      parseEnv({ ...base, FACEBOOK_APP_SECRET: "s", FACEBOOK_GRAPH_BASE_URL: "http://127.0.0.1:4010" }),
    ).toMatchObject({ FACEBOOK_APP_SECRET: "s", FACEBOOK_GRAPH_BASE_URL: "http://127.0.0.1:4010" });
    expect(() => parseEnv({ ...base, FACEBOOK_GRAPH_BASE_URL: "not a url" })).toThrow();
  });
```

Run: `pnpm --filter @oca/api exec vitest run src/config/env.test.ts` → Expected: FAIL.

ໃນ `apps/api/src/config/env.ts`: ກ່ອນ `const envSchema` ເພີ່ມ:

```ts
/** ຄ່າວ່າງ ("") ຖືວ່າບໍ່ໄດ້ຕັ້ງ (.env.example ມີແຖວວ່າງ) */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
```

ແລະ ໃນ `z.object({ ... })` ເພີ່ມຫຼັງ `REFRESH_COOKIE_PATH`:

```ts
    FACEBOOK_APP_SECRET: optionalString,
    FACEBOOK_WEBHOOK_VERIFY_TOKEN: optionalString,
    FACEBOOK_PAGE_ACCESS_TOKEN: optionalString,
    // ຊີ້ໄປ simulator ໃນ dev; ບໍ່ຕັ້ງ = https://graph.facebook.com/v21.0
    FACEBOOK_GRAPH_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
```

Run ອີກຄັ້ງ → Expected: PASS.

- [ ] **Step 3: ຂຽນ e2e ຂອງ webhook (RED)**

`apps/api/test/inbox-webhook.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { signBody, simulator } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb } from "./helpers";

const SECRET = "app-secret-test";
const VERIFY = "verify-me";
const PAGE = "PAGE1";

describe("Facebook webhook (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  const server = () => app.getHttpServer();

  const post = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return request(server())
      .post("/webhooks/facebook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature ?? signBody(SECRET, raw))
      .send(raw);
  };
  const say = (psid: string, mid: string, text: string, timestamp?: number) =>
    post(simulator.messagePayload({ pageId: PAGE, psid, mid, text, timestamp }));

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: VERIFY,
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
  });

  describe("GET handshake", () => {
    const get = (query: Record<string, string>) => request(server()).get("/webhooks/facebook").query(query);

    it("verify token ຖືກ → ຄືນ challenge ເປັນ text/plain", async () => {
      const res = await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "12345" }).expect(200);
      expect(res.text).toBe("12345");
      expect(res.headers["content-type"]).toContain("text/plain");
    });
    it("token ຜິດ, mode ຜິດ ຫຼື ບໍ່ມີ challenge → 403", async () => {
      await get({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }).expect(403);
      await get({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" }).expect(403);
      await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY }).expect(403);
    });
    it("challenge ທີ່ມີຕົວອັກສອນພິເສດ (ກັນສະທ້ອນ HTML) → 403", async () => {
      await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "<script>" }).expect(403);
    });
  });

  describe("POST ລາຍເຊັນ", () => {
    it("ບໍ່ມີ/ຜິດລາຍເຊັນ → 401 ແລະ ບໍ່ບັນທຶກຫຍັງ", async () => {
      const payload = simulator.messagePayload({ pageId: PAGE, psid: "U1", mid: "m1", text: "hi" });
      await request(server()).post("/webhooks/facebook").send(payload).expect(401);
      await post(payload, "sha256=deadbeef").expect(401);
      await post(payload, signBody("other-secret", JSON.stringify(payload))).expect(401);
      expect(await db.conversation.count()).toBe(0);
      expect(await db.message.count()).toBe(0);
    });

    it("body ຖືກແກ້ຫຼັງເຊັນ → 401", async () => {
      const original = JSON.stringify(simulator.messagePayload({ pageId: PAGE, psid: "U1", mid: "m1", text: "hi" }));
      const tampered = original.replace('"hi"', '"hacked"');
      await request(server())
        .post("/webhooks/facebook")
        .set("content-type", "application/json")
        .set("x-hub-signature-256", signBody(SECRET, original))
        .send(tampered)
        .expect(401);
      expect(await db.message.count()).toBe(0);
    });
  });

  describe("POST ຂໍ້ຄວາມ", () => {
    it("thread ໃໝ່ → ສ້າງເຄສ + ຂໍ້ຄວາມ IN; unread 1, preview, OPEN, ຊື່ default", async () => {
      const res = await say("U1234", "m1", "ສະບາຍດີ", 1_700_000_000_000).expect(200);
      expect(res.body).toEqual({ received: 1 });
      const conversation = await db.conversation.findFirstOrThrow({ include: { messages: true } });
      expect(conversation).toMatchObject({
        channel: "FACEBOOK",
        externalThreadId: "U1234",
        status: "OPEN",
        unreadCount: 1,
        lastMessagePreview: "ສະບາຍດີ",
        displayName: "Facebook 1234",
        customerId: null,
        assigneeId: null,
      });
      expect(conversation.lastMessageAt).toEqual(new Date(1_700_000_000_000));
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({
        direction: "IN",
        externalId: "m1",
        text: "ສະບາຍດີ",
        status: "SENT",
        sentByUserId: null,
      });
      expect(conversation.messages[0]?.createdAt).toEqual(new Date(1_700_000_000_000));
    });

    it("mid ຊ້ຳ (Meta ສົ່ງຊ້ຳ) → 200 ແຕ່ບໍ່ເພີ່ມຂໍ້ຄວາມ ແລະ ບໍ່ເພີ່ມ unread", async () => {
      await say("U1", "m1", "hi").expect(200);
      await say("U1", "m1", "hi").expect(200);
      expect(await db.message.count()).toBe(1);
      expect((await db.conversation.findFirstOrThrow()).unreadCount).toBe(1);
    });

    it("ຂໍ້ຄວາມຕໍ່ມາໃນ thread ດຽວກັນ → ເຄສເດີມ, unread 2, preview ອັບເດດ", async () => {
      await say("U1", "m1", "ທຳອິດ", 1000).expect(200);
      await say("U1", "m2", "ທີສອງ", 2000).expect(200);
      expect(await db.conversation.count()).toBe(1);
      const conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ unreadCount: 2, lastMessagePreview: "ທີສອງ" });
      expect(conversation.lastMessageAt).toEqual(new Date(2000));
    });

    it("ຂໍ້ຄວາມເກົ່າທີ່ມາຊ້າ (out of order) ບໍ່ຍ້າຍ preview/lastMessageAt ຖອຍຫຼັງ ແຕ່ນັບ unread", async () => {
      await say("U1", "m2", "ໃໝ່", 2000).expect(200);
      await say("U1", "m1", "ເກົ່າ", 1000).expect(200);
      const conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ unreadCount: 2, lastMessagePreview: "ໃໝ່" });
      expect(conversation.lastMessageAt).toEqual(new Date(2000));
    });

    it("ເຄສທີ່ປິດແລ້ວ ເປີດຄືນເມື່ອລູກຄ້າທັກມາໃໝ່", async () => {
      await say("U1", "m1", "hi").expect(200);
      await db.conversation.updateMany({ data: { status: "CLOSED", unreadCount: 0 } });
      await say("U1", "m2", "ຍັງຢູ່ບໍ").expect(200);
      expect(await db.conversation.findFirstOrThrow()).toMatchObject({ status: "OPEN", unreadCount: 1 });
    });

    it("ຮູບຢ່າງດຽວ: ເກັບ attachments, text=null, preview=null", async () => {
      await post(
        simulator.messagePayload({
          pageId: PAGE,
          psid: "U1",
          mid: "m1",
          attachments: [{ type: "image", url: "https://cdn.example/a.jpg" }],
        }),
      ).expect(200);
      const message = await db.message.findFirstOrThrow();
      expect(message.text).toBeNull();
      expect(message.attachments).toEqual([{ type: "image", url: "https://cdn.example/a.jpg" }]);
      expect((await db.conversation.findFirstOrThrow()).lastMessagePreview).toBeNull();
    });

    it("preview ຖືກຕັດ ≤ 120 ຕົວ ແຕ່ຂໍ້ຄວາມເກັບເຕັມ", async () => {
      const long = "ກ".repeat(500);
      await say("U1", "m1", long).expect(200);
      expect((await db.conversation.findFirstOrThrow()).lastMessagePreview).toBe("ກ".repeat(120));
      expect((await db.message.findFirstOrThrow()).text).toBe(long);
    });
  });

  describe("POST echo ແລະ ເຫດການທີ່ບໍ່ຮູ້ຈັກ", () => {
    it("echo → ຂໍ້ຄວາມ OUT; ເຄສໃໝ່ unread 0; ເຄສເດີມ unread ບໍ່ປ່ຽນ ແລະ ບໍ່ເປີດຄືນ", async () => {
      await post(simulator.echoPayload({ pageId: PAGE, psid: "U9", mid: "e1", text: "ແອດມິນຕອບ" })).expect(200);
      let conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ externalThreadId: "U9", unreadCount: 0, lastMessagePreview: "ແອດມິນຕອບ" });
      expect(await db.message.findFirstOrThrow()).toMatchObject({ direction: "OUT", externalId: "e1", sentByUserId: null });

      await db.conversation.update({ where: { id: conversation.id }, data: { status: "CLOSED", unreadCount: 2 } });
      await post(simulator.echoPayload({ pageId: PAGE, psid: "U9", mid: "e2", text: "ອີກຄັ້ງ" })).expect(200);
      conversation = await db.conversation.findFirstOrThrow();
      expect(conversation).toMatchObject({ status: "CLOSED", unreadCount: 2 });
    });

    it("delivery/read/payload ທີ່ບໍ່ແມ່ນ page → 200 ແຕ່ບໍ່ບັນທຶກ", async () => {
      await post(simulator.deliveryPayload({ pageId: PAGE, psid: "U1", mids: ["m1"] })).expect(200);
      const res = await post({ object: "instagram", entry: [] }).expect(200);
      expect(res.body).toEqual({ received: 0 });
      expect(await db.conversation.count()).toBe(0);
    });
  });

  describe("ຊື່ໂປຣໄຟລ໌ (best-effort)", () => {
    const waitForName = async (expected: string) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const row = await db.conversation.findFirst();
        if (row?.displayName === expected) return row;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`displayName never became ${expected}`);
    };

    it("ດຶງຊື່ຈາກ Graph ຫຼັງຂໍ້ຄວາມທຳອິດ", async () => {
      graph.profiles.set("U7", "Somchai Vong");
      await say("U7", "m1", "hi").expect(200);
      await waitForName("Somchai Vong");
    });

    it("ດຶງຊື່ບໍ່ໄດ້ ບໍ່ກະທົບການຮັບຂໍ້ຄວາມ (ຊື່ default ຄົງເດີມ)", async () => {
      await say("U8", "m1", "hi").expect(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await db.conversation.findFirstOrThrow()).displayName).toBe("Facebook U8");
      expect(await db.message.count()).toBe(1);
    });

    it("ບໍ່ຂຽນທັບຊື່ທີ່ຖືກແກ້/ຮູ້ແລ້ວ", async () => {
      graph.profiles.set("U7", "Somchai Vong");
      await say("U7", "m1", "hi").expect(200);
      await waitForName("Somchai Vong");
      graph.profiles.set("U7", "Other Name");
      await say("U7", "m2", "hello").expect(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await db.conversation.findFirstOrThrow()).displayName).toBe("Somchai Vong");
    });
  });
});

describe("Facebook webhook ເມື່ອຍັງບໍ່ໄດ້ຕັ້ງຄ່າ (e2e)", () => {
  it("GET ແລະ POST → 503 CHANNEL_NOT_CONFIGURED", async () => {
    const { app } = await createTestApp({ FACEBOOK_APP_SECRET: "", FACEBOOK_WEBHOOK_VERIFY_TOKEN: "" });
    try {
      const get = await request(app.getHttpServer())
        .get("/webhooks/facebook")
        .query({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" })
        .expect(503);
      expect(get.body.code).toBe("CHANNEL_NOT_CONFIGURED");
      const post = await request(app.getHttpServer()).post("/webhooks/facebook").send({}).expect(503);
      expect(post.body.code).toBe("CHANNEL_NOT_CONFIGURED");
    } finally {
      await app.close();
    }
  });
});
```

Run: `pnpm --filter @oca/api exec vitest run test/inbox-webhook.e2e.test.ts`
Expected: FAIL (route ບໍ່ມີ → 404)

- [ ] **Step 4: implementation: registry**

`apps/api/src/modules/inbox/channel-registry.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { type ChannelAdapter, FacebookAdapter } from "@oca/channels";
import { ENV, type Env } from "../../config/env";

/** ສ້າງ adapter ຈາກ env ຄັ້ງດຽວ. Instagram/TikTok/LINE ຈະເພີ່ມທີ່ນີ້ໃນອະນາຄົດ. */
@Injectable()
export class ChannelRegistry {
  readonly facebook: FacebookAdapter;

  constructor(@Inject(ENV) env: Env) {
    this.facebook = new FacebookAdapter({
      appSecret: env.FACEBOOK_APP_SECRET,
      verifyToken: env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      graphBaseUrl: env.FACEBOOK_GRAPH_BASE_URL,
    });
  }

  adapterFor(channel: string): ChannelAdapter | null {
    return channel === "FACEBOOK" ? this.facebook : null;
  }
}
```

- [ ] **Step 5: implementation: Redis events**

`apps/api/src/modules/inbox/inbox-events.service.ts`:

```ts
import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { InboxEvent } from "@oca/shared";
import { Redis } from "ioredis";
import { type Observable, Subject } from "rxjs";
import { ENV, type Env } from "../../config/env";

export const INBOX_EVENTS_CHANNEL = "oca:inbox:events";

function parseEvent(raw: string): InboxEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      (value as InboxEvent).type === "conversation.updated" &&
      typeof (value as InboxEvent).conversationId === "string"
    ) {
      return { type: "conversation.updated", conversationId: (value as InboxEvent).conversationId };
    }
  } catch {
    // ຂໍ້ຄວາມທີ່ບໍ່ແມ່ນ JSON ຖືກຂ້າມ
  }
  return null;
}

/**
 * event ຂອງ inbox ຜ່ານ Redis pub/sub ເພື່ອຮອງຮັບຫຼາຍ instance ຂອງ API.
 * publish ລົ້ມເຫຼວບໍ່ເຮັດໃຫ້ການບັນທຶກຂໍ້ຄວາມລົ້ມ (client ມີ poll ສຳຮອງ).
 */
@Injectable()
export class InboxEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(InboxEventsService.name);
  private readonly subject = new Subject<InboxEvent>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscribing: Promise<void> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private createClient(): Redis {
    const client = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    client.on("error", (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    return client;
  }

  async publish(event: InboxEvent): Promise<void> {
    try {
      this.publisher ??= this.createClient();
      await this.publisher.publish(INBOX_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`publish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** subscribe ຄັ້ງທຳອິດທີ່ມີ client SSE (connection ແຍກຈາກ publisher ເພາະ subscriber mode ສົ່ງຄຳສັ່ງອື່ນບໍ່ໄດ້) */
  ensureSubscribed(): Promise<void> {
    this.subscribing ??= (async () => {
      const subscriber = this.createClient();
      subscriber.on("message", (_channel: string, raw: string) => {
        const event = parseEvent(raw);
        if (event) this.subject.next(event);
      });
      try {
        await subscriber.subscribe(INBOX_EVENTS_CHANNEL);
      } catch (error) {
        subscriber.disconnect();
        throw error;
      }
      this.subscriber = subscriber;
    })().catch((error: unknown) => {
      this.subscribing = null;
      throw error;
    });
    return this.subscribing;
  }

  get updates$(): Observable<InboxEvent> {
    return this.subject.asObservable();
  }

  async onModuleDestroy(): Promise<void> {
    this.subject.complete();
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }
}
```

- [ ] **Step 6: implementation: ingest**

`apps/api/src/modules/inbox/inbox-ingest.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { InboundEvent } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "./channel-registry";
import { InboxEventsService } from "./inbox-events.service";

export const PREVIEW_MAX = 120;

/** ຊື່ຊົ່ວຄາວຈົນກວ່າຈະດຶງຊື່ຈິງໄດ້ */
export function defaultDisplayName(channel: string, threadId: string): string {
  const label = channel === "FACEBOOK" ? "Facebook" : channel;
  return `${label} ${threadId.slice(-4)}`;
}

export interface IngestResult {
  conversationId: string;
  duplicate: boolean;
}

@Injectable()
export class InboxIngestService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  /**
   * ບັນທຶກເຫດການ 1 ອັນ. ກັນຊ້ຳດ້ວຍ unique (conversationId, externalId) ແບບ ON CONFLICT DO NOTHING
   * ເພື່ອບໍ່ໃຫ້ transaction ຖືກ abort ເມື່ອ Meta ສົ່ງ mid ຊ້ຳ (ຫຼື 2 request ພ້ອມກັນ).
   */
  async ingest(event: InboundEvent): Promise<IngestResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { channel_externalThreadId: { channel: event.channel, externalThreadId: event.threadId } },
        create: {
          channel: event.channel,
          externalThreadId: event.threadId,
          displayName: defaultDisplayName(event.channel, event.threadId),
          lastMessageAt: event.timestamp,
        },
        update: {},
      });
      const inserted = await tx.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            direction: event.kind === "echo" ? "OUT" : "IN",
            externalId: event.externalId,
            text: event.text,
            attachments: event.attachments.length > 0 ? event.attachments : undefined,
            status: "SENT",
            createdAt: event.timestamp,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { conversationId: conversation.id, duplicate: true };

      const isNewest = event.timestamp >= conversation.lastMessageAt;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(isNewest
            ? {
                lastMessageAt: event.timestamp,
                lastMessagePreview: event.text ? event.text.slice(0, PREVIEW_MAX) : null,
              }
            : {}),
          ...(event.kind === "message" ? { unreadCount: { increment: 1 }, status: "OPEN" as const } : {}),
        },
      });
      return { conversationId: conversation.id, duplicate: false };
    });
    if (!result.duplicate) {
      await this.events.publish({ type: "conversation.updated", conversationId: result.conversationId });
    }
    return result;
  }

  /** ດຶງຊື່ໂປຣໄຟລ໌ (best-effort): ປ່ຽນສະເພາະເມື່ອຊື່ຍັງເປັນຊື່ default ຢູ່ */
  async enrichProfile(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;
    const fallback = defaultDisplayName(conversation.channel, conversation.externalThreadId);
    if (conversation.displayName !== fallback) return;
    const profile = await this.channels.adapterFor(conversation.channel)?.fetchProfile(conversation.externalThreadId);
    if (!profile) return;
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, displayName: fallback },
      data: { displayName: profile.name },
    });
    if (count > 0) await this.events.publish({ type: "conversation.updated", conversationId });
  }
}
```

- [ ] **Step 7: implementation: webhook controller + module**

`apps/api/src/modules/inbox/facebook-webhook.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  type RawBodyRequest,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { apiError } from "../../common/api-error";
import { Public } from "../../common/decorators";
import { ChannelRegistry } from "./channel-registry";
import { InboxIngestService } from "./inbox-ingest.service";

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

/** Endpoint ສາທາລະນະສຳລັບ Meta (ບໍ່ມີ JWT): ຄວາມປອດໄພຢູ່ທີ່ verify token ແລະ ລາຍເຊັນ X-Hub-Signature-256 */
@Controller("webhooks/facebook")
export class FacebookWebhookController {
  private readonly logger = new Logger(FacebookWebhookController.name);

  constructor(
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(InboxIngestService) private readonly ingest: InboxIngestService,
  ) {}

  @Public()
  @Get()
  @Header("Content-Type", "text/plain; charset=utf-8")
  handshake(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string,
  ): string {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!adapter.verifyHandshake(mode, token) || !challenge || !CHALLENGE_PATTERN.test(challenge)) {
      throw apiError("FORBIDDEN", "Invalid verify token");
    }
    return challenge;
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers("x-hub-signature-256") signature?: string,
  ): Promise<{ received: number }> {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!req.rawBody || !adapter.verifySignature(req.rawBody, signature)) throw new UnauthorizedException();

    const events = adapter.parseWebhook(body);
    for (const event of events) {
      const result = await this.ingest.ingest(event);
      if (!result.duplicate && event.kind === "message") {
        // ບໍ່ລໍຖ້າ: Meta ຕ້ອງໄດ້ 200 ໄວ
        void this.ingest.enrichProfile(result.conversationId).catch((error: unknown) => {
          this.logger.warn(`profile enrich failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    return { received: events.length };
  }
}
```

`apps/api/src/modules/inbox/inbox.module.ts` (ແທນທີ່ເນື້ອໃນເດີມ):

```ts
import { Module } from "@nestjs/common";
import { ChannelRegistry } from "./channel-registry";
import { FacebookWebhookController } from "./facebook-webhook.controller";
import { InboxEventsService } from "./inbox-events.service";
import { InboxIngestService } from "./inbox-ingest.service";

/** Omnichannel Inbox: ຮັບ webhook, ເກັບເຄສ/ຂໍ້ຄວາມ, ຕອບ, realtime. */
@Module({
  controllers: [FacebookWebhookController],
  providers: [ChannelRegistry, InboxEventsService, InboxIngestService],
  exports: [InboxEventsService],
})
export class InboxModule {}
```

- [ ] **Step 8: ຣັນ (GREEN)**

Run: `pnpm --filter @oca/api exec vitest run test/inbox-webhook.e2e.test.ts`
Expected: PASS ທຸກ test. ຖ້າ test "ຄືນ challenge" ລົ້ມເພາະ query key `hub.mode` ຖືກແຍກເປັນ object ຊ້ອນ (`hub: {mode}`) ໃຫ້ກວດ query parser ຂອງ express ແລ້ວອ່ານຜ່ານ `@Query() query` ແທນ (ຢ່າເດົາ; ພິມ `req.query` ກ່ອນ).

- [ ] **Step 9: ຣັນ api ທັງໝົດ + lint + build**

Run: `pnpm --filter @oca/api test && pnpm --filter @oca/api lint && pnpm --filter @oca/api build`
Expected: PASS (permissions sweep ຍັງຂຽວ: webhook ເປັນ `@Public`)

- [ ] **Step 10: Commit**

```bash
git add apps/api packages pnpm-lock.yaml
git commit -m "feat(api): Facebook webhook ingest (signature, dedupe, echo, profile enrich) and Redis inbox events

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API: conversations (list, messages, reply, update, read, create customer)

**Files:**
- Create: `apps/api/src/modules/inbox/{inbox.mapper,conversations.service,conversations.controller}.ts`, `apps/api/test/conversations.e2e.test.ts`
- Modify: `apps/api/src/modules/inbox/inbox.module.ts`

- [ ] **Step 1: ຂຽນ e2e (RED)**

`apps/api/test/conversations.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { simulator } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedConversation, seedInboxReader, seedRoleUsers } from "./helpers";

describe("conversations (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let chat: { Authorization: string };
  let reader: { Authorization: string };
  let chatUserId: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: "s",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
    await seedRoleUsers(db);
    await seedInboxReader(db);
    chat = await bearerFor(app, "chat_admin@role.test");
    reader = await bearerFor(app, "inbox-read@test.local");
    chatUserId = (await db.user.findUniqueOrThrow({ where: { email: "chat_admin@role.test" } })).id;
  });

  describe("GET /conversations", () => {
    it("ຕ້ອງ login ແລະ inbox:read", async () => {
      await request(server()).get("/conversations").expect(401);
      const accountant = await bearerFor(app, "accountant@role.test");
      await request(server()).get("/conversations").set(accountant).expect(403);
      await request(server()).get("/conversations").set(reader).expect(200);
    });

    it("ຮູບແບບ DTO + ລຽງ lastMessageAt ຫຼ້າສຸດກ່ອນ + ແບ່ງໜ້າ", async () => {
      const customer = await db.customer.create({ data: { name: "ສົມຊາຍ", phone: "020111111" } });
      const old = await seedConversation(db, { displayName: "Old", lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      const mid = await seedConversation(db, {
        displayName: "Mid",
        lastMessageAt: new Date("2026-10-02T00:00:00Z"),
        unreadCount: 3,
        lastMessagePreview: "hello",
        assigneeId: chatUserId,
        customerId: customer.id,
      });
      const fresh = await seedConversation(db, { displayName: "New", lastMessageAt: new Date("2026-10-03T00:00:00Z") });

      const res = await request(server()).get("/conversations?pageSize=2").set(reader).expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([fresh.id, mid.id]);
      expect(res.body.items[1]).toEqual({
        id: mid.id,
        channel: "FACEBOOK",
        displayName: "Mid",
        status: "OPEN",
        unreadCount: 3,
        lastMessageAt: "2026-10-02T00:00:00.000Z",
        lastMessagePreview: "hello",
        assignee: { id: chatUserId, name: "CHAT_ADMIN" },
        customer: { id: customer.id, name: "ສົມຊາຍ", phone: "020111111" },
        createdAt: expect.any(String),
      });
      const page2 = await request(server()).get("/conversations?pageSize=2&page=2").set(reader).expect(200);
      expect(page2.body.items.map((item: { id: string }) => item.id)).toEqual([old.id]);
    });

    it("ກອງ status / assignee (me, unassigned, id) / unread / q", async () => {
      const mine = await seedConversation(db, { displayName: "Mine", assigneeId: chatUserId, unreadCount: 1 });
      const free = await seedConversation(db, { displayName: "Free Somchai", lastMessagePreview: "ຂໍລາຄາ" });
      const closed = await seedConversation(db, { displayName: "Closed", status: "CLOSED" });
      const ids = async (query: string) =>
        ((await request(server()).get(`/conversations?${query}`).set(chat).expect(200)).body.items as { id: string }[])
          .map((item) => item.id)
          .sort();
      expect(await ids("status=CLOSED")).toEqual([closed.id]);
      expect(await ids("status=OPEN")).toEqual([mine.id, free.id].sort());
      expect(await ids("assignee=me")).toEqual([mine.id]);
      expect(await ids(`assignee=${chatUserId}`)).toEqual([mine.id]);
      expect(await ids("assignee=unassigned")).toEqual([free.id, closed.id].sort());
      expect(await ids("unread=true")).toEqual([mine.id]);
      expect(await ids("unread=false")).toEqual([free.id, closed.id].sort());
      expect(await ids("q=somchai")).toEqual([free.id]);
      expect(await ids(`q=${encodeURIComponent("ລາຄາ")}`)).toEqual([free.id]);
    });

    it("query ຜິດ → 400 VALIDATION_FAILED", async () => {
      const res = await request(server()).get("/conversations?status=NOPE").set(reader).expect(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("GET /conversations/:id ແລະ /messages", () => {
    it("get ຄືນ DTO; id ບໍ່ມີ → 404 CONVERSATION_NOT_FOUND (ທັງ get ແລະ messages)", async () => {
      const conversation = await seedConversation(db, { displayName: "A" });
      const res = await request(server()).get(`/conversations/${conversation.id}`).set(reader).expect(200);
      expect(res.body).toMatchObject({ id: conversation.id, displayName: "A", assignee: null, customer: null });
      const missing = await request(server()).get("/conversations/nope").set(reader).expect(404);
      expect(missing.body.code).toBe("CONVERSATION_NOT_FOUND");
      await request(server()).get("/conversations/nope/messages").set(reader).expect(404);
    });

    it("messages: ໃໝ່ສຸດກ່ອນ, cursor beforeId ໄດ້ໜ້າຖັດໄປ, hasMore ຖືກ, ບໍ່ປົນເຄສອື່ນ", async () => {
      const conversation = await seedConversation(db);
      const other = await seedConversation(db);
      const base = Date.parse("2026-10-01T00:00:00Z");
      for (let i = 1; i <= 5; i++) {
        await db.message.create({
          data: { conversationId: conversation.id, direction: i % 2 ? "IN" : "OUT", text: `m${i}`, createdAt: new Date(base + i * 1000) },
        });
      }
      await db.message.create({ data: { conversationId: other.id, direction: "IN", text: "other" } });

      const first = await request(server()).get(`/conversations/${conversation.id}/messages?limit=2`).set(reader).expect(200);
      expect(first.body.items.map((m: { text: string }) => m.text)).toEqual(["m5", "m4"]);
      expect(first.body.hasMore).toBe(true);
      expect(first.body.items[0]).toEqual({
        id: expect.any(String),
        direction: "IN",
        text: "m5",
        attachments: [],
        status: "SENT",
        errorCode: null,
        sentBy: null,
        createdAt: "2026-10-01T00:00:05.000Z",
      });

      const lastId = first.body.items[1].id as string;
      const second = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=2&beforeId=${lastId}`)
        .set(reader)
        .expect(200);
      expect(second.body.items.map((m: { text: string }) => m.text)).toEqual(["m3", "m2"]);
      expect(second.body.hasMore).toBe(true);

      const third = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=2&beforeId=${second.body.items[1].id}`)
        .set(reader)
        .expect(200);
      expect(third.body.items.map((m: { text: string }) => m.text)).toEqual(["m1"]);
      expect(third.body.hasMore).toBe(false);
    });

    it("beforeId ທີ່ບໍ່ຢູ່ໃນເຄສນີ້ → 404", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const message = await db.message.create({ data: { conversationId: b.id, direction: "IN", text: "x" } });
      await request(server()).get(`/conversations/${a.id}/messages?beforeId=${message.id}`).set(reader).expect(404);
    });

    it("ສະແດງຜູ້ສົ່ງ, ສະຖານະ ແລະ errorCode ຂອງຂໍ້ຄວາມຂາອອກ", async () => {
      const conversation = await seedConversation(db);
      await db.message.create({
        data: { conversationId: conversation.id, direction: "OUT", text: "x", status: "FAILED", errorCode: "OUTSIDE_WINDOW", sentByUserId: chatUserId },
      });
      const res = await request(server()).get(`/conversations/${conversation.id}/messages`).set(reader).expect(200);
      expect(res.body.items[0]).toMatchObject({
        direction: "OUT",
        status: "FAILED",
        errorCode: "OUTSIDE_WINDOW",
        sentBy: { id: chatUserId, name: "CHAT_ADMIN" },
      });
    });
  });

  describe("POST /conversations/:id/messages (ຕອບ)", () => {
    it("ສຳເລັດ: ສົ່ງຜ່ານ Graph ດ້ວຍ token, ບັນທຶກ SENT + mid + ຜູ້ສົ່ງ, ລ້າງ unread, ອັບເດດ preview", async () => {
      const conversation = await seedConversation(db, {
        externalThreadId: "U1",
        unreadCount: 4,
        lastMessageAt: new Date("2026-01-01T00:00:00Z"),
      });
      const res = await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set(chat)
        .send({ text: "  ສະບາຍດີ  " })
        .expect(201);
      expect(res.body).toMatchObject({
        direction: "OUT",
        text: "ສະບາຍດີ",
        status: "SENT",
        errorCode: null,
        sentBy: { id: chatUserId, name: "CHAT_ADMIN" },
      });
      expect(graph.sent).toEqual([{ recipientId: "U1", text: "ສະບາຍດີ", authorization: "Bearer page-token" }]);
      const row = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
      expect(row.externalId).toBe("m_sim_1");
      const after = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
      expect(after.unreadCount).toBe(0);
      expect(after.lastMessagePreview).toBe("ສະບາຍດີ");
      expect(after.lastMessageAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime());
    });

    it("ເກີນໜ້າຕ່າງ 24 ຊມ: 201 ແຕ່ຂໍ້ຄວາມ FAILED errorCode=OUTSIDE_WINDOW (ບັນທຶກໄວ້ ບໍ່ເສຍ)", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      graph.failNext({ status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." });
      const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      expect(res.body).toMatchObject({ status: "FAILED", errorCode: "OUTSIDE_WINDOW", text: "hi" });
      const row = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
      expect(row).toMatchObject({ status: "FAILED", errorCode: "OUTSIDE_WINDOW", externalId: null });
    });

    it("token ຜິດ → FAILED CHANNEL_AUTH; Meta ລົ້ມ → FAILED CHANNEL_UNAVAILABLE", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      graph.failNext({ status: 400, code: 190, message: "Invalid OAuth access token." });
      const auth = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "a" }).expect(201);
      expect(auth.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_AUTH" });
      graph.failNext({ status: 500, code: 1, message: "boom" });
      const down = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "b" }).expect(201);
      expect(down.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_UNAVAILABLE" });
    });

    it("echo ມາກ່ອນ response ຂອງ Graph (race) → ເຫຼືອແຖວດຽວ ແລະ ຜູ້ສົ່ງເປັນຄົນຕອບ", async () => {
      const conversation = await seedConversation(db, { externalThreadId: "U1" });
      // webhook echo ຂອງຂໍ້ຄວາມນີ້ມາຮອດກ່ອນ ດ້ວຍ mid ທີ່ Graph ປອມຈະໃຫ້
      await db.message.create({
        data: { conversationId: conversation.id, direction: "OUT", externalId: graph.nextMessageId(), text: "hi", status: "SENT" },
      });
      const res = await request(server()).post(`/conversations/${conversation.id}/messages`).set(chat).send({ text: "hi" }).expect(201);
      expect(res.body).toMatchObject({ status: "SENT", sentBy: { id: chatUserId } });
      const rows = await db.message.findMany({ where: { conversationId: conversation.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ externalId: "m_sim_1", sentByUserId: chatUserId });
    });

    it("ສິດ: inbox:read ຢ່າງດຽວ → 403 ແລະ ບໍ່ສົ່ງຫຍັງ; ເຄສບໍ່ມີ → 404", async () => {
      const conversation = await seedConversation(db);
      await request(server()).post(`/conversations/${conversation.id}/messages`).set(reader).send({ text: "x" }).expect(403);
      expect(graph.sent).toEqual([]);
      const res = await request(server()).post("/conversations/nope/messages").set(chat).send({ text: "x" }).expect(404);
      expect(res.body.code).toBe("CONVERSATION_NOT_FOUND");
      expect(await db.message.count()).toBe(0);
    });

    it("ຂໍ້ຄວາມວ່າງ/ຍາວເກີນ 2000/ມີ field ເກີນ → 400 ແລະ ບໍ່ບັນທຶກ", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/messages`;
      await request(server()).post(url).set(chat).send({ text: "   " }).expect(400);
      await request(server()).post(url).set(chat).send({ text: "a".repeat(2001) }).expect(400);
      await request(server()).post(url).set(chat).send({ text: "x", extra: 1 }).expect(400);
      await request(server()).post(url).set(chat).send({}).expect(400);
      expect(await db.message.count()).toBe(0);
    });
  });

  describe("POST /conversations/:id/messages ເມື່ອ channel ບໍ່ໄດ້ຕັ້ງ token", () => {
    it("201 ແຕ່ FAILED errorCode=CHANNEL_NOT_CONFIGURED", async () => {
      const { app: bare, db: bareDb } = await createTestApp({ FACEBOOK_PAGE_ACCESS_TOKEN: "" });
      try {
        await resetDb(bareDb);
        await seedRoleUsers(bareDb);
        const headers = await bearerFor(bare, "chat_admin@role.test");
        const conversation = await seedConversation(bareDb);
        const res = await request(bare.getHttpServer())
          .post(`/conversations/${conversation.id}/messages`)
          .set(headers)
          .send({ text: "x" })
          .expect(201);
        expect(res.body).toMatchObject({ status: "FAILED", errorCode: "CHANNEL_NOT_CONFIGURED" });
      } finally {
        await bare.close();
      }
    });
  });

  describe("PATCH /conversations/:id", () => {
    it("ມອບໝາຍ, ປິດ, ລິ້ງລູກຄ້າ ແລະ ຖອນ (null); ບັນທຶກ audit", async () => {
      const conversation = await seedConversation(db);
      const customer = await db.customer.create({ data: { name: "C1" } });
      const res = await request(server())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ assigneeId: chatUserId, status: "CLOSED", customerId: customer.id })
        .expect(200);
      expect(res.body).toMatchObject({
        status: "CLOSED",
        assignee: { id: chatUserId, name: "CHAT_ADMIN" },
        customer: { id: customer.id, name: "C1", phone: null },
      });
      const cleared = await request(server())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ assigneeId: null, customerId: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ status: "CLOSED", assignee: null, customer: null });
      expect(await db.auditLog.count({ where: { action: "conversation.update", entityId: conversation.id } })).toBe(2);
    });

    it("assignee ບໍ່ມີ ຫຼື ຖືກປິດໃຊ້ງານ → 404 USER_NOT_FOUND; customer ບໍ່ມີ → 404 CUSTOMER_NOT_FOUND", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}`;
      expect((await request(server()).patch(url).set(chat).send({ assigneeId: "nope" }).expect(404)).body.code).toBe("USER_NOT_FOUND");
      await db.user.update({ where: { id: chatUserId }, data: { isActive: false } });
      expect((await request(server()).patch(url).set(chat).send({ assigneeId: chatUserId }).expect(404)).body.code).toBe("USER_NOT_FOUND");
      expect((await request(server()).patch(url).set(chat).send({ customerId: "nope" }).expect(404)).body.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("body ວ່າງ/status ຜິດ → 400; ບໍ່ມີ id → 404; inbox:read ຢ່າງດຽວ → 403", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}`;
      await request(server()).patch(url).set(chat).send({}).expect(400);
      await request(server()).patch(url).set(chat).send({ status: "NOPE" }).expect(400);
      await request(server()).patch("/conversations/nope").set(chat).send({ status: "OPEN" }).expect(404);
      await request(server()).patch(url).set(reader).send({ status: "CLOSED" }).expect(403);
    });
  });

  describe("POST /conversations/:id/read", () => {
    it("ລ້າງ unread; ເຄສທີ່ unread=0 ຢູ່ແລ້ວກໍໄດ້ 200; ຕ້ອງ inbox:write; ບໍ່ມີ id → 404", async () => {
      const conversation = await seedConversation(db, { unreadCount: 5 });
      const url = `/conversations/${conversation.id}/read`;
      await request(server()).post(url).set(reader).expect(403);
      const res = await request(server()).post(url).set(chat).expect(200);
      expect(res.body.unreadCount).toBe(0);
      await request(server()).post(url).set(chat).expect(200);
      await request(server()).post("/conversations/nope/read").set(chat).expect(404);
    });
  });

  describe("POST /conversations/:id/customer", () => {
    it("ສ້າງລູກຄ້າ + ລິ້ງໃນຄັ້ງດຽວ", async () => {
      const conversation = await seedConversation(db);
      const res = await request(server())
        .post(`/conversations/${conversation.id}/customer`)
        .set(chat)
        .send({ name: "ນາງ ດາລາ", phone: "+8562055550000" })
        .expect(201);
      expect(res.body.customer).toMatchObject({ name: "ນາງ ດາລາ", phone: "+8562055550000" });
      const customer = await db.customer.findFirstOrThrow({ where: { phone: "+8562055550000" } });
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBe(customer.id);
    });

    it("ເບີຊ້ຳ → 409 DUPLICATE_VALUE ແລະ ບໍ່ລິ້ງ; ເຄສລິ້ງແລ້ວ → 409 ແລະ ບໍ່ສ້າງລູກຄ້າເພີ່ມ", async () => {
      await db.customer.create({ data: { name: "Existing", phone: "020999999" } });
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/customer`;
      const dup = await request(server()).post(url).set(chat).send({ name: "X", phone: "020999999" }).expect(409);
      expect(dup.body.code).toBe("DUPLICATE_VALUE");
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBeNull();

      await request(server()).post(url).set(chat).send({ name: "First" }).expect(201);
      const before = await db.customer.count();
      const again = await request(server()).post(url).set(chat).send({ name: "Second" }).expect(409);
      expect(again.body.code).toBe("CONFLICT");
      expect(await db.customer.count()).toBe(before);
    });

    it("name ວ່າງ/phone ຜິດ → 400; ບໍ່ມີ id → 404; inbox:read ຢ່າງດຽວ → 403", async () => {
      const conversation = await seedConversation(db);
      const url = `/conversations/${conversation.id}/customer`;
      await request(server()).post(url).set(chat).send({ name: " " }).expect(400);
      await request(server()).post(url).set(chat).send({ name: "A", phone: "abc" }).expect(400);
      await request(server()).post("/conversations/nope/customer").set(chat).send({ name: "A" }).expect(404);
      await request(server()).post(url).set(reader).send({ name: "A" }).expect(403);
    });
  });
});
```

Run: `pnpm --filter @oca/api exec vitest run test/conversations.e2e.test.ts`
Expected: FAIL (route ບໍ່ມີ → 404)

- [ ] **Step 2: implementation: mapper**

`apps/api/src/modules/inbox/inbox.mapper.ts`:

```ts
import type { Prisma } from "@oca/database";

export const CONVERSATION_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
} as const satisfies Prisma.ConversationInclude;

export const MESSAGE_INCLUDE = {
  sentBy: { select: { id: true, name: true } },
} as const satisfies Prisma.MessageInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export interface ConversationDto {
  id: string;
  channel: string;
  displayName: string;
  status: "OPEN" | "CLOSED";
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  attachments: { type: string; url: string | null }[];
  status: "PENDING" | "SENT" | "FAILED";
  errorCode: string | null;
  sentBy: { id: string; name: string } | null;
  createdAt: string;
}

export function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    channel: row.channel,
    displayName: row.displayName,
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    assignee: row.assignee,
    customer: row.customer,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    direction: row.direction,
    text: row.text,
    attachments: Array.isArray(row.attachments) ? (row.attachments as MessageDto["attachments"]) : [],
    status: row.status,
    errorCode: row.errorCode,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
  };
}
```

- [ ] **Step 3: implementation: service**

`apps/api/src/modules/inbox/conversations.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SendResult } from "@oca/channels";
import type { Prisma, PrismaClient } from "@oca/database";
import type {
  ConversationListQuery,
  CreateCustomerFromChatInput,
  MessageListQuery,
  SendMessageInput,
  UpdateConversationInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "./channel-registry";
import { InboxEventsService } from "./inbox-events.service";
import { PREVIEW_MAX } from "./inbox-ingest.service";
import {
  CONVERSATION_INCLUDE,
  type ConversationDto,
  type ConversationRow,
  MESSAGE_INCLUDE,
  type MessageDto,
  type MessageRow,
  toConversationDto,
  toMessageDto,
} from "./inbox.mapper";

function listWhere(query: ConversationListQuery, actor: AuthUser): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.assignee === "me") where.assigneeId = actor.id;
  else if (query.assignee === "unassigned") where.assigneeId = null;
  else if (query.assignee) where.assigneeId = query.assignee;
  if (query.unread === true) where.unreadCount = { gt: 0 };
  if (query.unread === false) where.unreadCount = 0;
  if (query.q) {
    where.OR = [
      { displayName: { contains: query.q, mode: "insensitive" } },
      { lastMessagePreview: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return where;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
  ) {}

  async list(query: ConversationListQuery, actor: AuthUser): Promise<Page<ConversationDto>> {
    const where = listWhere(query, actor);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPage(rows.map(toConversationDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ConversationDto> {
    return toConversationDto(await this.require(id));
  }

  async listMessages(id: string, query: MessageListQuery): Promise<{ items: MessageDto[]; hasMore: boolean }> {
    await this.require(id);
    let before: Prisma.MessageWhereInput = {};
    if (query.beforeId) {
      const cursor = await this.prisma.message.findFirst({
        where: { id: query.beforeId, conversationId: id },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw apiError("NOT_FOUND", "Message cursor not found in this conversation");
      before = {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      };
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...before },
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    return { items: rows.slice(0, query.limit).map(toMessageDto), hasMore: rows.length > query.limit };
  }

  /**
   * ບັນທຶກຂໍ້ຄວາມຂາອອກເປັນ PENDING ກ່ອນ ແລ້ວຈຶ່ງເອີ້ນ channel ເພື່ອບໍ່ໃຫ້ຂໍ້ຄວາມຫາຍເມື່ອສົ່ງບໍ່ໄດ້.
   * ການສົ່ງລົ້ມເຫຼວ = ຕອບ 201 ພ້ອມ status FAILED + errorCode (ບໍ່ແມ່ນ error ຂອງ HTTP).
   * ຖ້າ process ຕາຍກາງທາງ ແຖວຈະຄ້າງ PENDING (ຍັງບໍ່ມີ job ກວາດ; ບັນທຶກໃນ DEPLOYMENT-NOTES).
   */
  async sendMessage(id: string, input: SendMessageInput, actor: AuthUser): Promise<MessageDto> {
    const conversation = await this.require(id);
    const pending = await this.prisma.message.create({
      data: { conversationId: id, direction: "OUT", text: input.text, status: "PENDING", sentByUserId: actor.id },
    });

    const adapter = this.channels.adapterFor(conversation.channel);
    let result: SendResult;
    try {
      result = adapter
        ? await adapter.sendText(conversation.externalThreadId, input.text)
        : { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: `No adapter for ${conversation.channel}` };
    } catch (error) {
      result = { ok: false, code: "SEND_REJECTED", detail: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok) this.logger.warn(`send failed (${conversation.id}): ${result.code} ${result.detail}`);

    const message = await this.settle(pending.id, id, actor, result);
    await this.prisma.conversation.updateMany({
      where: { id, lastMessageAt: { lte: message.createdAt } },
      data: { lastMessageAt: message.createdAt, lastMessagePreview: input.text.slice(0, PREVIEW_MAX) },
    });
    await this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toMessageDto(message);
  }

  private async settle(pendingId: string, conversationId: string, actor: AuthUser, result: SendResult): Promise<MessageRow> {
    if (!result.ok) {
      return this.prisma.message.update({
        where: { id: pendingId },
        data: { status: "FAILED", errorCode: result.code },
        include: MESSAGE_INCLUDE,
      });
    }
    try {
      return await this.prisma.message.update({
        where: { id: pendingId },
        data: { status: "SENT", externalId: result.externalId },
        include: MESSAGE_INCLUDE,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // webhook echo ຂອງຂໍ້ຄວາມນີ້ມາຮອດກ່ອນ response ຂອງ Graph: ແຖວ echo ເປັນຕົວຈິງ → ລຶບແຖວ pending ແລ້ວໃສ່ຜູ້ສົ່ງໃຫ້ echo
      await this.prisma.message.delete({ where: { id: pendingId } });
      const echo = await this.prisma.message.findFirstOrThrow({
        where: { conversationId, externalId: result.externalId },
      });
      return this.prisma.message.update({
        where: { id: echo.id },
        data: { sentByUserId: actor.id },
        include: MESSAGE_INCLUDE,
      });
    }
  }

  async update(id: string, input: UpdateConversationInput, actor: AuthUser, ip: string | undefined): Promise<ConversationDto> {
    const before = await this.require(id);
    if (input.assigneeId) {
      const user = await this.prisma.user.findUnique({ where: { id: input.assigneeId }, select: { isActive: true } });
      if (!user?.isActive) throw apiError("USER_NOT_FOUND", "Assignee not found or inactive");
    }
    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
      if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const after = await this.prisma.conversation.update({
      where: { id },
      data: { assigneeId: input.assigneeId, status: input.status, customerId: input.customerId },
      include: CONVERSATION_INCLUDE,
    });
    await this.audit.record({
      userId: actor.id,
      action: "conversation.update",
      entity: "conversation",
      entityId: id,
      before: { assigneeId: before.assigneeId, status: before.status, customerId: before.customerId },
      after: { assigneeId: after.assigneeId, status: after.status, customerId: after.customerId },
      ip,
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(after);
  }

  async markRead(id: string): Promise<ConversationDto> {
    const row = await this.require(id);
    if (row.unreadCount === 0) return toConversationDto(row);
    const after = await this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      include: CONVERSATION_INCLUDE,
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(after);
  }

  /** ສ້າງລູກຄ້າ + ລິ້ງເຄສໃນ transaction ດຽວ; ເຄສທີ່ລິ້ງແລ້ວ = 409 ໂດຍບໍ່ສ້າງລູກຄ້າເພີ່ມ (ກັນ 2 ຄົນກົດພ້ອມກັນ) */
  async createCustomer(
    id: string,
    input: CreateCustomerFromChatInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<ConversationDto> {
    const existing = await this.require(id);
    if (existing.customerId) throw apiError("CONFLICT", "Conversation is already linked to a customer");
    try {
      const after = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { name: input.name, phone: input.phone } });
        const linked = await tx.conversation.updateMany({
          where: { id, customerId: null },
          data: { customerId: customer.id },
        });
        if (linked.count === 0) throw apiError("CONFLICT", "Conversation is already linked to a customer");
        return tx.conversation.findUniqueOrThrow({ where: { id }, include: CONVERSATION_INCLUDE });
      });
      await this.audit.record({
        userId: actor.id,
        action: "conversation.create-customer",
        entity: "conversation",
        entityId: id,
        after: { customerId: after.customerId },
        ip,
      });
      await this.events.publish({ type: "conversation.updated", conversationId: id });
      return toConversationDto(after);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Phone number already in use");
      throw error;
    }
  }

  private async require(id: string): Promise<ConversationRow> {
    const row = await this.prisma.conversation.findUnique({ where: { id }, include: CONVERSATION_INCLUDE });
    if (!row) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
    return row;
  }
}
```

- [ ] **Step 4: implementation: controller + module**

`apps/api/src/modules/inbox/conversations.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type ConversationListQuery,
  type CreateCustomerFromChatInput,
  type MessageListQuery,
  type SendMessageInput,
  type UpdateConversationInput,
  conversationListQuerySchema,
  createCustomerFromChatSchema,
  messageListQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ConversationsService } from "./conversations.service";

/** ເບິ່ງ = inbox:read; ຕອບ/ມອບໝາຍ/ປິດ/ລິ້ງລູກຄ້າ/ໝາຍອ່ານແລ້ວ = inbox:write */
@Controller("conversations")
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get()
  @RequirePermissions("inbox:read")
  list(
    @Query(new ZodValidationPipe(conversationListQuerySchema)) query: ConversationListQuery,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.conversations.list(query, actor);
  }

  @Get(":id")
  @RequirePermissions("inbox:read")
  get(@Param("id") id: string) {
    return this.conversations.get(id);
  }

  @Get(":id/messages")
  @RequirePermissions("inbox:read")
  messages(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(messageListQuerySchema)) query: MessageListQuery,
  ) {
    return this.conversations.listMessages(id, query);
  }

  @Post(":id/messages")
  @RequirePermissions("inbox:write")
  send(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.conversations.sendMessage(id, body, actor);
  }

  @Patch(":id")
  @RequirePermissions("inbox:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: UpdateConversationInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.conversations.update(id, body, actor, req.ip);
  }

  @Post(":id/read")
  @HttpCode(200)
  @RequirePermissions("inbox:write")
  markRead(@Param("id") id: string) {
    return this.conversations.markRead(id);
  }

  @Post(":id/customer")
  @RequirePermissions("inbox:write")
  createCustomer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createCustomerFromChatSchema)) body: CreateCustomerFromChatInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.conversations.createCustomer(id, body, actor, req.ip);
  }
}
```

`apps/api/src/modules/inbox/inbox.module.ts`: ເພີ່ມ import `ConversationsController`, `ConversationsService` ແລະ ປ່ຽນເປັນ:

```ts
  controllers: [FacebookWebhookController, ConversationsController],
  providers: [ChannelRegistry, InboxEventsService, InboxIngestService, ConversationsService],
```

- [ ] **Step 5: ຣັນ (GREEN)**

Run: `pnpm --filter @oca/api exec vitest run test/conversations.e2e.test.ts`
Expected: PASS ທຸກ test. ຖ້າ test ລຳດັບ list ລົ້ມເພາະ `mid`/`fresh` ຄ່າ `lastMessageAt` ຄືກັນ ໃຫ້ກວດວ່າ seed ໃຊ້ວັນທີ່ຕ່າງກັນຕາມທີ່ຂຽນ.

- [ ] **Step 6: ຣັນ api ທັງໝົດ + lint + build**

Run: `pnpm --filter @oca/api test && pnpm --filter @oca/api lint && pnpm --filter @oca/api build`
Expected: PASS (permissions sweep ຄົບທຸກ route ໃໝ່: 401 ບໍ່ມີ token, 403 ເມື່ອຂາດສິດ)

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): conversations API (list, messages cursor, reply with FAILED handling, assign/close/link, read, create customer)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: API: SSE `GET /inbox/events`

**Files:**
- Create: `apps/api/src/modules/inbox/inbox-events.controller.ts`, `apps/api/test/inbox-events.e2e.test.ts`
- Modify: `apps/api/src/modules/inbox/inbox.module.ts`

- [ ] **Step 1: ຂຽນ e2e (RED)**

`apps/api/test/inbox-events.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { signBody, simulator } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedConversation, seedInboxReader, seedRoleUsers } from "./helpers";

const SECRET = "app-secret-test";

describe("GET /inbox/events (SSE e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let port: number;
  let chat: { Authorization: string };
  let reader: { Authorization: string };

  beforeAll(async () => {
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
    }));
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    await seedInboxReader(db);
    chat = await bearerFor(app, "chat_admin@role.test");
    reader = await bearerFor(app, "inbox-read@test.local");
  });

  const url = () => `http://127.0.0.1:${port}/inbox/events`;

  /** ອ່ານ stream ຈົນກວ່າຈະມີຂໍ້ຄວາມທີ່ຕ້ອງການ (ມີ timeout ກັນ test ຄ້າງ) */
  function openStream(headers: Record<string, string>) {
    const controller = new AbortController();
    let buffer = "";
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const decoder = new TextDecoder();
    return {
      async connect() {
        const res = await fetch(url(), { headers, signal: controller.signal });
        reader = res.body?.getReader();
        return res;
      },
      async readUntil(needle: string, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (!buffer.includes(needle)) {
          const remaining = deadline - Date.now();
          if (remaining <= 0 || !reader) throw new Error(`timeout waiting for ${needle}; got: ${buffer}`);
          const chunk = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout waiting for ${needle}; got: ${buffer}`)), remaining)),
          ]);
          if (chunk.done) throw new Error(`stream ended; got: ${buffer}`);
          buffer += decoder.decode(chunk.value, { stream: true });
        }
        return buffer;
      },
      close() {
        controller.abort();
      },
    };
  }

  it("ຕ້ອງ login ແລະ inbox:read", async () => {
    expect((await fetch(url())).status).toBe(401);
    const accountant = await bearerFor(app, "accountant@role.test");
    expect((await fetch(url(), { headers: accountant })).status).toBe(403);
  });

  it("ສົ່ງ event ready ກ່ອນ ແລ້ວຕາມດ້ວຍ conversation.updated ເມື່ອມີຂໍ້ຄວາມເຂົ້າທາງ webhook", async () => {
    const stream = openStream(reader);
    try {
      const res = await stream.connect();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      await stream.readUntil("event: ready");

      const raw = JSON.stringify(simulator.messagePayload({ pageId: "P", psid: "U1", mid: "m1", text: "hi" }));
      await request(app.getHttpServer())
        .post("/webhooks/facebook")
        .set("content-type", "application/json")
        .set("x-hub-signature-256", signBody(SECRET, raw))
        .send(raw)
        .expect(200);

      const conversation = await db.conversation.findFirstOrThrow();
      const seen = await stream.readUntil("conversation.updated");
      expect(seen).toContain(conversation.id);
    } finally {
      stream.close();
    }
  });

  it("ໄດ້ event ເມື່ອແອດມິນປ່ຽນເຄສ (PATCH) ນຳ", async () => {
    const conversation = await seedConversation(db);
    const stream = openStream(chat);
    try {
      await stream.connect();
      await stream.readUntil("event: ready");
      await request(app.getHttpServer())
        .patch(`/conversations/${conversation.id}`)
        .set(chat)
        .send({ status: "CLOSED" })
        .expect(200);
      const seen = await stream.readUntil("conversation.updated");
      expect(seen).toContain(conversation.id);
    } finally {
      stream.close();
    }
  });

  it("ຫຼາຍ client ໄດ້ event ເທົ່າກັນ", async () => {
    const conversation = await seedConversation(db);
    const a = openStream(chat);
    const b = openStream(reader);
    try {
      await a.connect();
      await b.connect();
      await a.readUntil("event: ready");
      await b.readUntil("event: ready");
      await request(app.getHttpServer()).patch(`/conversations/${conversation.id}`).set(chat).send({ status: "CLOSED" }).expect(200);
      expect(await a.readUntil(conversation.id)).toContain("conversation.updated");
      expect(await b.readUntil(conversation.id)).toContain("conversation.updated");
    } finally {
      a.close();
      b.close();
    }
  });
});
```

Run: `pnpm --filter @oca/api exec vitest run test/inbox-events.e2e.test.ts`
Expected: FAIL (`/inbox/events` ບໍ່ມີ → 404, status check ລົ້ມ)

- [ ] **Step 2: implementation**

`apps/api/src/modules/inbox/inbox-events.controller.ts`:

```ts
import { Controller, Inject, type MessageEvent, Sse } from "@nestjs/common";
import { type Observable, defer, interval, map, merge, startWith, switchMap } from "rxjs";
import { RequirePermissions } from "../../common/decorators";
import { InboxEventsService } from "./inbox-events.service";

const HEARTBEAT_MS = 25_000;

/**
 * SSE: event ເບົາ (`conversation.updated`) ໃຫ້ client refetch ເອງ.
 * `ready` ຖືກສົ່ງຫຼັງ subscribe Redis ສຳເລັດ (client ຮູ້ວ່າຈະບໍ່ພາດ event ຕັ້ງແຕ່ຈຸດນີ້),
 * `ping` ທຸກ 25 ວິ ກັນ proxy ຕັດ connection ທີ່ວ່າງ.
 */
@Controller("inbox")
export class InboxEventsController {
  constructor(@Inject(InboxEventsService) private readonly events: InboxEventsService) {}

  @Sse("events")
  @RequirePermissions("inbox:read")
  stream(): Observable<MessageEvent> {
    return defer(() => this.events.ensureSubscribed()).pipe(
      switchMap(() =>
        merge(
          this.events.updates$.pipe(map((event): MessageEvent => ({ type: event.type, data: event }))),
          interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "ping", data: {} }))),
        ).pipe(startWith<MessageEvent>({ type: "ready", data: {} })),
      ),
    );
  }
}
```

`apps/api/src/modules/inbox/inbox.module.ts`: ເພີ່ມ import `InboxEventsController` ແລະ ໃສ່ໃນ `controllers: [FacebookWebhookController, ConversationsController, InboxEventsController]`.

- [ ] **Step 3: ຣັນ (GREEN)**

Run: `pnpm --filter @oca/api exec vitest run test/inbox-events.e2e.test.ts`
Expected: PASS ທຸກ test ແລະ ຈົບໄວ (ບໍ່ຄ້າງ). ຖ້າ `afterAll` ຄ້າງ ໃຫ້ກວດວ່າ `stream.close()` ຖືກເອີ້ນໃນ `finally` ທຸກ test ແລະ `onModuleDestroy` complete subject.

- [ ] **Step 4: ຣັນ api ທັງໝົດ + lint + build**

Run: `pnpm --filter @oca/api test && pnpm --filter @oca/api lint && pnpm --filter @oca/api build`
Expected: PASS (sweep: `/inbox/events` ຖືກນັບ ມີ `inbox:read`)

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): SSE inbox events (ready, conversation.updated, heartbeat) over Redis pub/sub

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ສິດຕາມ seeded role

**Files:**
- Modify: `apps/api/test/permissions.e2e.test.ts`

- [ ] **Step 1: ເພີ່ມ test (ໃນ `describe("role model ຕາມ seed ຈິງ ...")` ຕໍ່ຈາກ test ACCOUNTANT) + import `seedConversation`**

ແກ້ import ບັນທັດ `import { bearerFor, createTestApp, resetDb, seedCatalog, seedRoleUsers } from "./helpers";` ເປັນ `import { bearerFor, createTestApp, resetDb, seedCatalog, seedConversation, seedRoleUsers } from "./helpers";`

```ts
  it("inbox: CHAT_ADMIN/MANAGER/OWNER ອ່ານ+ຕອບ+ແກ້ເຄສໄດ້; ACCOUNTANT/WAREHOUSE ບໍ່ໄດ້", async () => {
    const conversation = await seedConversation(db);
    for (const name of ["CHAT_ADMIN", "MANAGER", "OWNER"]) {
      const headers = await as(name);
      await request(server()).get("/conversations").set(headers).expect(200);
      await request(server()).get(`/conversations/${conversation.id}/messages`).set(headers).expect(200);
      // ບໍ່ໄດ້ຕັ້ງ token ໃນ test ນີ້ → ການສົ່ງ FAILED ແຕ່ຍັງ 201 (ສິດຜ່ານ)
      await request(server()).post(`/conversations/${conversation.id}/messages`).set(headers).send({ text: "x" }).expect(201);
      await request(server()).patch(`/conversations/${conversation.id}`).set(headers).send({ status: "CLOSED" }).expect(200);
    }
    for (const name of ["ACCOUNTANT", "WAREHOUSE"]) {
      const headers = await as(name);
      await request(server()).get("/conversations").set(headers).expect(403);
      await request(server()).get("/inbox/events").set(headers).expect(403);
      await request(server()).post(`/conversations/${conversation.id}/messages`).set(headers).send({ text: "x" }).expect(403);
      await request(server()).patch(`/conversations/${conversation.id}`).set(headers).send({ status: "OPEN" }).expect(403);
    }
  });
```

- [ ] **Step 2: ຣັນ**

Run: `pnpm --filter @oca/api exec vitest run test/permissions.e2e.test.ts`
Expected: PASS (ທຸກ test ເກົ່າ + ໃໝ່). ຖ້າ test ໃໝ່ລົ້ມເພາະ env `.env` ມີ `FACEBOOK_PAGE_ACCESS_TOKEN` ແລະ ພະຍາຍາມຍິງ Graph ຈິງ ໃຫ້ເພີ່ມ `process.env.FACEBOOK_PAGE_ACCESS_TOKEN = ""` ໃນ `test/setup.ts` (ກັນ test ຍິງອອກເນັດ) ແລ້ວ commit ພ້ອມກັນ.

- [ ] **Step 3: ກັນ test ຍິງ Graph ຈິງ (ປ້ອງກັນຖາວອນ)**

ໃນ `apps/api/test/setup.ts` ເພີ່ມທ້າຍໄຟລ໌ (test ທີ່ຕ້ອງການ Facebook ສົ່ງຄ່າຜ່ານ `createTestApp(overrides)` ເອງ):

```ts
// ກັນ test ຍິງ Meta ຈິງຖ້າ .env ຂອງເຄື່ອງມີ token: test ທີ່ຕ້ອງການໃຫ້ສົ່ງ overrides ຜ່ານ createTestApp
for (const key of [
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "FACEBOOK_GRAPH_BASE_URL",
]) {
  delete process.env[key];
}
```

Run: `pnpm --filter @oca/api test`
Expected: PASS ທັງໝົດ

- [ ] **Step 4: Commit**

```bash
git add apps/api/test
git commit -m "test(api): inbox permissions per seeded role; isolate tests from real Meta credentials

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ເອກະສານ + env example

**Files:**
- Modify: `.env.example`, `docs/DEPLOYMENT-NOTES.md`, `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md`

- [ ] **Step 1: `.env.example`**

ໃນບລ໋ອກ `# Social channels` ຫຼັງແຖວ `FACEBOOK_WEBHOOK_VERIFY_TOKEN=` ເພີ່ມ:

```
# Page Access Token ຂອງເພຈ (ຕອບແຊັດ + ດຶງຊື່ລູກຄ້າ). ບໍ່ຕັ້ງ = ຕອບບໍ່ໄດ້ (ຂໍ້ຄວາມຂາອອກ FAILED/CHANNEL_NOT_CONFIGURED)
FACEBOOK_PAGE_ACCESS_TOKEN=
# ຊີ້ໄປ simulator ໃນ dev (ເຊັ່ນ http://127.0.0.1:4010); ບໍ່ຕັ້ງ = https://graph.facebook.com/v21.0
FACEBOOK_GRAPH_BASE_URL=
```

- [ ] **Step 2: DEPLOYMENT-NOTES**

ເພີ່ມທ້າຍ `docs/DEPLOYMENT-NOTES.md` ຫົວຂໍ້ໃໝ່:

```md
## 11. Inbox / Facebook Messenger

- ຕັ້ງ env: `FACEBOOK_APP_SECRET` (ກວດລາຍເຊັນ), `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (ຄ່າໃດກໍໄດ້ ແຕ່ຕ້ອງຕົງກັບທີ່ໃສ່ໃນ Meta), `FACEBOOK_PAGE_ACCESS_TOKEN` (long-lived Page token). ບໍ່ຕັ້ງ app secret/verify token = webhook ຕອບ `503 CHANNEL_NOT_CONFIGURED`.
- Meta App → Messenger → Webhooks: Callback URL = `https://<host>/webhooks/facebook` (ຖ້າຜ່ານ proxy `/api` ຂອງ admin ໃຫ້ເປັນ `/api/webhooks/facebook` ແລະ ຕ້ອງເປີດໃຫ້ internet ເຂົ້າເຖິງໂດຍບໍ່ຕ້ອງ login). Subscribe fields: `messages` ແລະ `message_echoes` (echo ໃຊ້ບັນທຶກຂໍ້ຄວາມທີ່ແອດມິນຕອບຈາກແອັບ Facebook ແລະ ກັນຂໍ້ຄວາມຕອບຈາກ API ຊ້ຳ). ສິດທີ່ຕ້ອງການ: `pages_messaging` (ແລະ `pages_read_engagement` ຖ້າຢາກດຶງຊື່ລູກຄ້າ).
- Meta ຈຳກັດການຕອບພາຍໃນ 24 ຊົ່ວໂມງຫຼັງລູກຄ້າທັກຄັ້ງລ່າສຸດ; ເກີນນັ້ນຂໍ້ຄວາມຂາອອກຖືກບັນທຶກເປັນ `FAILED` ພ້ອມ `errorCode=OUTSIDE_WINDOW` (ບໍ່ມີ retry ອັດຕະໂນມັດ).
- ຂໍ້ຄວາມຂາອອກຖືກບັນທຶກເປັນ `PENDING` ກ່ອນເອີ້ນ Meta: ຖ້າ API ຕາຍກາງທາງ ແຖວຈະຄ້າງ `PENDING` (ຍັງບໍ່ມີ job ກວາດ; ຕ້ອງກວດເອງດ້ວຍ `SELECT * FROM "Message" WHERE status='PENDING' AND "createdAt" < now() - interval '5 minutes'`).
- Realtime ໃຊ້ Redis pub/sub channel `oca:inbox:events` (ຕ້ອງມີ Redis; ຖ້າ Redis ລົ້ມ ການບັນທຶກຂໍ້ຄວາມຍັງສຳເລັດ ແຕ່ admin ຈະເຫັນຊ້າສຸດ 60 ວິ ຕາມ poll ສຳຮອງ). SSE ຜ່ານ reverse proxy ຕ້ອງປິດ response buffering (nginx: `proxy_buffering off`) ແລະ ຕັ້ງ read timeout > 25 ວິ (heartbeat).
- ຍັງບໍ່ໄດ້ພິສູດກັບ Meta ຈິງ (ພັດທະນາດ້ວຍ simulator `pnpm --filter @oca/channels simulate`): ຮູບແບບ payload/ລະຫັດ error ອາງອີງຕາມເອກະສານ Meta; ຕ້ອງທົດສອບຄືນເມື່ອມີ Meta App ແລະ ບັນທຶກຜົນ.
- Migration `20261006000000_inbox` ເພີ່ມຕາຕະລາງ `Conversation`, `Message` ແລະ `Order.conversationId` (ເພີ່ມຢ່າງດຽວ); ກວດເທິງ Postgres 16 ກ່ອນ deploy ຈິງ (ຄືກັບຂໍ້ 6). Role `CHAT_ADMIN`/`MANAGER`/`OWNER` ມີ `inbox:*` ຢູ່ແລ້ວ; role ອື່ນທີ່ປັບແຕ່ງເອງຕ້ອງຕິກສິດ `inbox` ເອງ.
```

- [ ] **Step 3: ອັບເດດ spec ໃຫ້ຕົງກັບ plan**

ແກ້ `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md`:
1. §2 ປ່ຽນບັນທັດ Env ເປັນ: `- Env ໃໝ່ (ໃນ api): FACEBOOK_APP_SECRET, FACEBOOK_WEBHOOK_VERIFY_TOKEN (ມີໃນ .env.example ແລ້ວ), FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_GRAPH_BASE_URL (ຊີ້ໄປ simulator). ຖ້າບໍ່ຕັ້ງ app secret/verify token webhook ຕອບ 503 CHANNEL_NOT_CONFIGURED (ບໍ່ crash ຕອນ boot); ບໍ່ຕັ້ງ page token = ຕອບບໍ່ໄດ້ (ຂໍ້ຄວາມ FAILED). Token ບໍ່ຖືກ log.`
2. §3 `Message.status`: ແກ້ເປັນ `status` (PENDING | SENT | FAILED).
3. §5: ປ່ຽນປະໂຫຍກ "ສ້າງລູກຄ້າຈາກແຊັດໃຊ້ endpoint customers ທີ່ມີຢູ່ ແລ້ວ PATCH ລິ້ງ." ເປັນ "ສ້າງລູກຄ້າຈາກແຊັດ = `POST /conversations/:id/customer` (ສ້າງ Customer + ລິ້ງໃນ transaction ດຽວ; ເບີຊ້ຳ = 409 DUPLICATE_VALUE; ເຄສທີ່ລິ້ງແລ້ວ = 409)." ແລະ "GET messages ແບ່ງໜ້າດ້ວຍ cursor `beforeId` (ໃໝ່ສຸດກ່ອນ)".

- [ ] **Step 4: Commit**

```bash
git add .env.example docs
git commit -m "docs: inbox deployment notes, env example and spec alignment with plan 2a-1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ກວດສຸດທ້າຍ

- [ ] **Step 1: build + lint + test ທັງ repo**

Run: `pnpm -r build && pnpm -r lint && pnpm -r test`
Expected: ທັງໝົດຂຽວ. ຕົວເລກໂດຍປະມານ: shared ເພີ່ມ ~15 test, channels ~35, api ເພີ່ມ ~55 (ຈຳນວນຈິງອາດຕ່າງ; ສິ່ງທີ່ສຳຄັນ = ບໍ່ມີ fail/skip ໃໝ່). admin ຍັງ 639 (ບໍ່ປ່ຽນ ນອກຈາກ dictionary).

- [ ] **Step 2: ກວດ migration ບໍ່ drift ແລະ ບໍ່ໄດ້ແຕະຖານ dev ຂອງຜູ້ໃຊ້**

```bash
DATABASE_URL=postgresql://oca:oca@localhost:5433/oca_test pnpm --filter @oca/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
git status --short
```

Expected: `No difference detected.`; `git status` ສະອາດ. **ບໍ່** ຣັນ `db:deploy` ໃສ່ຖານ `oca` ຂອງຜູ້ໃຊ້: ແຈ້ງຜູ້ໃຊ້ໃນສະຫຼຸບວ່າ migration `20261006000000_inbox` ຍັງຕ້ອງ deploy ກ່ອນໃຊ້ API ໃໝ່ກັບ DB dev.

- [ ] **Step 3: self-review ຕາມ spec**

ກວດແຕ່ລະຂໍ້ຂອງ spec §4-§7 ວ່າມີ test: signature ຜິດ=401 ✔, handshake ✔, mid ຊ້ຳ ✔, thread ໃໝ່/ເດີມ ✔, ເປີດຄືນ ✔, echo ✔, ຕອບສຳເລັດ/FAILED ✔, 404 ✔, permission sweep ✔ (ອັດຕະໂນມັດ), SSE ✔. ສິ່ງທີ່ **ຍັງບໍ່ໄດ້ເຮັດໃນ plan ນີ້** (ເປັນຂອງ 2a-2/2a-3): ໜ້າ `/inbox`, nav, error i18n ຂອງ `errorCode` ຂາອອກ (`OUTSIDE_WINDOW` ແລະ ອື່ນໆ), ເປີດບິນໃນແຊັດ (`createOrderSchema.conversationId`, ສະຫຼຸບບິນ).

- [ ] **Step 4: ບັນທຶກສະຖານະ**

ອັບເດດ memory `phase1-progress` (ເພີ່ມບັນທັດ: 2a-1 API ສຳເລັດ + commits, ຄ້າງ: DB dev `oca` ຕ້ອງ deploy migration inbox, ຕໍ່ໄປ 2a-2). ບໍ່ push/PR ຈົນກວ່າຜູ້ໃຊ້ຢືນຢັນ.

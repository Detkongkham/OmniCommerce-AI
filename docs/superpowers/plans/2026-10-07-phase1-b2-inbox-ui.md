# Phase 1 Inbox 2a-2 (ໜ້າ /inbox ໃນ admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ໜ້າ `/inbox` ໃນ admin: ເບິ່ງລາຍການສົນທະນາ Messenger, ອ່ານ/ຕອບຂໍ້ຄວາມ, ໄດ້ຂໍ້ຄວາມໃໝ່ແບບສົດ (SSE), ມອບໝາຍ/ປິດ-ເປີດເຄສ ແລະ ລິ້ງ/ສ້າງລູກຄ້າ. (ເປີດບິນໃນແຊັດເປັນ plan 2a-3.)

**Architecture:** ຊັ້ນຂໍ້ມູນ (`types.ts`, hooks ໃນ `queries.ts`) → ຊັ້ນ realtime ທີ່ບໍ່ຜູກກັບ React (`sse.ts` parser, `inbox-stream.ts` loop ທີ່ reconnect/refresh token) ຫໍ່ດ້ວຍ hook `useInboxRealtime` ທີ່ invalidate query → component 3 ຖັນ (`ConversationList`, `ThreadPane`+`Composer`, `SidePanel`) ປະກອບໃນ `InboxPage`. ມີ backend ນ້ອຍ (Task 1) ທີ່ plan 2a-1 ປ່ອຍຄ້າງ: `GET /inbox/assignees`, ແກ້ `markRead`, `isMessageSendError`.

**Tech Stack:** Next.js 16 (App Router, ຕາມແບບໜ້າເດີມ: page ເປັນ server component ບາງໆ ຫໍ່ client component), React 19, TanStack Query 5 (`useInfiniteQuery`), react-hook-form + zod, `@oca/ui`, vitest + Testing Library, NestJS (Task 1).

Spec: `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md` §6, §8. Backend ທີ່ plan ນີ້ໃຊ້: plan `2026-10-06-phase1-b1-inbox-api.md` (ເຮັດແລ້ວ).

## ຂໍ້ຄວນລະວັງຂອງ repo (ອ່ານກ່ອນເລີ່ມ)

- **Next.js ໃນ repo ນີ້ບໍ່ແມ່ນ Next ທີ່ຮູ້ຈັກ** (`apps/admin/AGENTS.md`): ກ່ອນເຮັດ Task 7 ໃຫ້ອ່ານ `apps/admin/node_modules/next/dist/docs/` ສ່ວນ App Router page/`searchParams` (ໜ້າເດີມ `apps/admin/src/app/(app)/orders/page.tsx` ໃຊ້ `searchParams: Promise<...>`; ເຮັດຕາມແບບນັ້ນ ຢ່າໃຊ້ API ໃໝ່ທີ່ບໍ່ໄດ້ຢືນຢັນ).
- **ມີງານຂອງຄົນອື່ນຄ້າງໃນ working tree** (dark mode / date-field: `apps/admin/src/components/orders/order-list*.tsx`, `stock-movements*.tsx`, `src/test/render.tsx`, `src/components/common/date-field.tsx`, `apps/*/next.config.ts`, `.next-prod/`): ຫ້າມແກ້/stage/commit. ທຸກ commit ຕ້ອງ `git add` ໄຟລ໌ຂອງຕົນແບບລະບຸຊື່; ກ່ອນແກ້ `dictionary.ts`/`nav.ts` ໃຫ້ `git status` ເບິ່ງວ່າຍັງບໍ່ມີຄົນແກ້ຄ້າງ (ຖ້າມີ ຢຸດ ແລ້ວຖາມ). ຢ່າແຕະ `render.tsx` (ໃຊ້ `renderWithProviders` ທີ່ມີຢູ່ແລ້ວຕາມເດີມ).
- Dev infra: Postgres `:5433`, Redis `:6380`; ຫ້າມແຕະ 5432/6379 ແລະ ຖານ `oca` ຂອງຜູ້ໃຊ້. API test ໃຊ້ `oca_test`. ຢ່າແຕະ process ທີ່ :3000/:3001/:3002/:3100.
- ຫຼັງແກ້ `@oca/shared` ຕ້ອງ `pnpm --filter @oca/shared build` ກ່ອນ test ຂອງ api/admin.
- ແບບ test ຂອງ admin: `vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal()), apiFetch: vi.fn() }))`, `renderWithProviders` ຈາກ `@/test/render` (ພາສາອັງກິດ), mock `@/components/auth/auth-provider` (`useCan`/`useAuth`). ຢ່າຂຽນ `beforeEach(() => mock.mockReset())` ໂດຍບໍ່ໃສ່ວົງເລັບ `{ }`. ຂຽນ RED ກ່ອນສະເໝີ ແລ້ວເບິ່ງມັນລົ້ມຈິງ.
- Commit ລົງທ້າຍດ້ວຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- ການໃຊ້ `t(\`...${x}\` )` ກັບ key ແບບ template ຕ້ອງໃຫ້ union ຂອງ key ມີຢູ່ໃນ `dictionary.ts` ຄົບ (compiler ກວດ); ທຸກ key ຕ້ອງມີທັງ lo ແລະ en.

## File map

| ໄຟລ໌ | ໜ້າທີ່ດຽວ |
|---|---|
| `apps/api/src/modules/inbox/inbox-assignees.controller.ts` (ໃໝ່) | `GET /inbox/assignees` (ຜູ້ໃຊ້ທີ່ເປັນ active ແລະ ມີ `inbox:write`) |
| `apps/api/src/modules/inbox/conversations.service.ts` (ແກ້) | `markRead` ກັນລ້າງ unread ທີ່ມາລະຫວ່າງອ່ານ + `listAssignees()` |
| `packages/shared/src/schemas/inbox.ts` (ແກ້) | `isMessageSendError` |
| `apps/admin/src/lib/types.ts` (ແກ້) | `ConversationDto`, `MessageDto`, `MessagePage`, `AssigneeDto` |
| `apps/admin/src/lib/queries.ts` (ແກ້) | `queryKeys.conversations/assignees` + hooks |
| `apps/admin/src/lib/i18n/dictionary.ts` (ແກ້) | ຂໍ້ຄວາມ `inbox.*` / `nav.*` (lo+en) |
| `apps/admin/src/lib/nav.ts` + `nav.test.ts` (ແກ້) | ເມນູ "ກ່ອງຂໍ້ຄວາມ" (`inbox:read`) |
| `apps/admin/src/lib/sse.ts` | parser ຂອງ `text/event-stream` |
| `apps/admin/src/lib/inbox-stream.ts` | loop ເຊື່ອມ/reconnect/refresh token ຂອງ SSE (ບໍ່ຜູກກັບ React) |
| `apps/admin/src/lib/use-inbox-realtime.ts` | hook: ເອີ້ນ stream + invalidate query + poll 60 ວິ |
| `apps/admin/src/lib/inbox.ts` | helper ເລັກໆ (`isSafeAttachmentUrl`, `sendErrorKey`) |
| `apps/admin/src/components/inbox/conversation-list.tsx` | ຖັນຊ້າຍ: ກອງ/ຄົ້ນຫາ/ລາຍການ/ໜ້າ |
| `apps/admin/src/components/inbox/message-bubble.tsx` | ຟອງຂໍ້ຄວາມ + ໄຟລ໌ແນບ + ສະຖານະ |
| `apps/admin/src/components/inbox/composer.tsx` | ຊ່ອງພິມ + ສົ່ງ |
| `apps/admin/src/components/inbox/thread-pane.tsx` | ຖັນກາງ: header, ຂໍ້ຄວາມ, ໂຫຼດເກົ່າ, ໝາຍອ່ານ, composer |
| `apps/admin/src/components/inbox/create-customer-dialog.tsx` | dialog ສ້າງລູກຄ້າຈາກແຊັດ |
| `apps/admin/src/components/inbox/side-panel.tsx` | ຖັນຂວາ: ລູກຄ້າ, ຜູ້ຮັບຜິດຊອບ, ສະຖານະ |
| `apps/admin/src/components/inbox/inbox-page.tsx` | ປະກອບ 3 ຖັນ + responsive + realtime badge |
| `apps/admin/src/app/(app)/inbox/page.tsx` | route `/inbox` (+ `?c=<id>`) |

---

### Task 1: API ຄ້າງຈາກ 2a-1: `isMessageSendError`, `markRead` guard, `GET /inbox/assignees`

**Files:**
- Modify: `packages/shared/src/schemas/inbox.ts`, `packages/shared/src/schemas/inbox.test.ts`, `apps/api/src/modules/inbox/conversations.service.ts`, `apps/api/src/modules/inbox/inbox.module.ts`, `docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md`
- Create: `apps/api/src/modules/inbox/inbox-assignees.controller.ts`, `apps/api/test/inbox-assignees.e2e.test.ts`
- Test: `apps/api/test/conversations.e2e.test.ts` (ເພີ່ມ test markRead)

- [ ] **Step 1: test ຂອງ `isMessageSendError` (RED)**

ເພີ່ມທ້າຍ `packages/shared/src/schemas/inbox.test.ts` (ແລະ ເພີ່ມ `isMessageSendError` ໃສ່ import ທີ່ມີຢູ່ຈາກ `./inbox`):

```ts
describe("isMessageSendError", () => {
  it("ຮັບສະເພາະລະຫັດໃນ MESSAGE_SEND_ERRORS", () => {
    for (const code of ["OUTSIDE_WINDOW", "CHANNEL_AUTH", "CHANNEL_NOT_CONFIGURED", "CHANNEL_UNAVAILABLE", "SEND_REJECTED"]) {
      expect(isMessageSendError(code), code).toBe(true);
    }
    for (const value of ["", "nope", "outside_window", null, undefined, 1]) {
      expect(isMessageSendError(value), String(value)).toBe(false);
    }
  });
});
```

Run: `pnpm --filter @oca/shared test` → Expected: FAIL (`isMessageSendError` ບໍ່ມີ)

- [ ] **Step 2: implementation**

ໃນ `packages/shared/src/schemas/inbox.ts` ຫຼັງ `export type MessageSendError = ...` ເພີ່ມ:

```ts
export function isMessageSendError(value: unknown): value is MessageSendError {
  return typeof value === "string" && (MESSAGE_SEND_ERRORS as readonly string[]).includes(value);
}
```

Run: `pnpm --filter @oca/shared test && pnpm --filter @oca/shared build` → Expected: PASS

- [ ] **Step 3: test ຂອງ `markRead` ທີ່ບໍ່ລ້າງ unread ທີ່ມາລະຫວ່າງອ່ານ (RED)**

ໃນ `apps/api/test/conversations.e2e.test.ts` ພາຍໃນ `describe("POST /conversations/:id/read", ...)` ເພີ່ມ (ໄຟລ໌ນີ້ import `PRISMA` ຢູ່ແລ້ວ? ຖ້າບໍ່ ໃຫ້ເພີ່ມ `import { PRISMA } from "../src/prisma/prisma.module";` ແລະ `vi` ຈາກ vitest):

```ts
    it("ຂໍ້ຄວາມຂາເຂົ້າທີ່ມາລະຫວ່າງອ່ານ (ຫຼັງ read ຖືກອ່ານແລ້ວ ກ່ອນ update) ບໍ່ຖືກລ້າງ unread", async () => {
      const conversation = await seedConversation(db, { unreadCount: 2, lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      const prisma = app.get<PrismaClient>(PRISMA);
      const original = prisma.conversation.findUnique.bind(prisma.conversation);
      const spy = vi.spyOn(prisma.conversation, "findUnique").mockImplementationOnce(((args: never) =>
        original(args).then(async (row) => {
          // ຂໍ້ຄວາມໃໝ່ເຂົ້າຫຼັງ service ອ່ານແຖວແລ້ວ
          await db.conversation.update({
            where: { id: conversation.id },
            data: { unreadCount: { increment: 1 }, lastMessageAt: new Date("2026-10-01T00:05:00Z") },
          });
          return row;
        })) as never);
      try {
        await request(server()).post(`/conversations/${conversation.id}/read`).set(chat).expect(200);
      } finally {
        spy.mockRestore();
      }
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).unreadCount).toBe(3);
    });
```

Run: `pnpm --filter @oca/api exec vitest run test/conversations.e2e.test.ts -t "ລະຫວ່າງອ່ານ"` → Expected: FAIL (unread ເປັນ 0)

- [ ] **Step 4: ແກ້ `markRead` ແລະ ເພີ່ມ `listAssignees`**

ໃນ `conversations.service.ts` ແທນຟັງຊັນ `markRead` ທັງໝົດດ້ວຍ:

```ts
  /** ລ້າງ unread ສະເພາະຂໍ້ຄວາມທີ່ຜູ້ໃຊ້ເຫັນແລ້ວ: ຖ້າມີຂໍ້ຄວາມໃໝ່ເຂົ້າຫຼັງອ່ານແຖວ (lastMessageAt ເລື່ອນ) ຈະບໍ່ລ້າງ */
  async markRead(id: string): Promise<ConversationDto> {
    const row = await this.require(id);
    if (row.unreadCount === 0) return toConversationDto(row);
    await this.prisma.conversation.updateMany({
      where: { id, lastMessageAt: { lte: row.lastMessageAt } },
      data: { unreadCount: 0 },
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(await this.require(id));
  }

  /** ຜູ້ໃຊ້ທີ່ມອບໝາຍເຄສໃຫ້ໄດ້: active ແລະ ມີສິດ inbox:write (ຜູ້ໃຊ້ inbox:read ທົ່ວໄປບໍ່ຕ້ອງມີ staff:read) */
  async listAssignees(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { permissions: { some: { permission: "inbox:write" } } } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
```

`apps/api/src/modules/inbox/inbox-assignees.controller.ts`:

```ts
import { Controller, Get, Inject } from "@nestjs/common";
import { RequirePermissions } from "../../common/decorators";
import { ConversationsService } from "./conversations.service";

@Controller("inbox")
export class InboxAssigneesController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get("assignees")
  @RequirePermissions("inbox:read")
  list() {
    return this.conversations.listAssignees();
  }
}
```

ໃນ `inbox.module.ts` ເພີ່ມ import ແລະ ໃສ່ `InboxAssigneesController` ໃນ `controllers` (ຮັກສາຂອງເດີມ).

- [ ] **Step 5: test ຂອງ assignees (RED → GREEN)**

`apps/api/test/inbox-assignees.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInboxReader, seedRoleUsers } from "./helpers";

describe("GET /inbox/assignees (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    await seedInboxReader(db);
  });

  it("ຄືນສະເພາະຜູ້ໃຊ້ active ທີ່ມີ inbox:write (ລຽງຕາມຊື່) ໂດຍ CHAT_ADMIN ກໍເອີ້ນໄດ້ (ບໍ່ຕ້ອງ staff:read)", async () => {
    const chat = await bearerFor(app, "chat_admin@role.test");
    const res = await request(server()).get("/inbox/assignees").set(chat).expect(200);
    expect(res.body.map((user: { name: string }) => user.name)).toEqual(["CHAT_ADMIN", "MANAGER", "OWNER"]);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  it("ຕັດຄົນທີ່ຖືກປິດໃຊ້ງານ ແລະ ຄົນທີ່ມີແຕ່ inbox:read ອອກ", async () => {
    await db.user.update({ where: { email: "manager@role.test" }, data: { isActive: false } });
    const owner = await bearerFor(app, "owner@role.test");
    const res = await request(server()).get("/inbox/assignees").set(owner).expect(200);
    const names = res.body.map((user: { name: string }) => user.name);
    expect(names).toEqual(["CHAT_ADMIN", "OWNER"]);
    expect(names).not.toContain("Inbox Reader");
  });

  it("ຕ້ອງ login ແລະ inbox:read", async () => {
    await request(server()).get("/inbox/assignees").expect(401);
    const accountant = await bearerFor(app, "accountant@role.test");
    await request(server()).get("/inbox/assignees").set(accountant).expect(403);
    const reader = await bearerFor(app, "inbox-read@test.local");
    await request(server()).get("/inbox/assignees").set(reader).expect(200);
  });
});
```

Run (RED ກ່ອນ Step 4 ຖ້າຍັງບໍ່ເຮັດ; ຫຼັງຈາກນັ້ນ GREEN): `pnpm --filter @oca/api exec vitest run test/inbox-assignees.e2e.test.ts test/conversations.e2e.test.ts`
Expected: PASS ທັງ 2 ໄຟລ໌ (ລວມ test markRead ໃໝ່)

- [ ] **Step 6: ແກ້ spec §6 (ຊື່ channel Redis)**

ໃນ spec ແກ້ `inbox:events` ເປັນ `oca:inbox:events` (ບ່ອນດຽວທີ່ປາກົດໃນ §6).

- [ ] **Step 7: ຣັນທັງໝົດ + commit**

Run: `pnpm --filter @oca/api test && pnpm --filter @oca/api lint && pnpm --filter @oca/api build && pnpm --filter @oca/shared lint`
Expected: PASS (permissions sweep ຍັງຂຽວ ແລະ ນັບ route ໃໝ່)

```bash
git add packages/shared/src/schemas/inbox.ts packages/shared/src/schemas/inbox.test.ts apps/api/src/modules/inbox apps/api/test/inbox-assignees.e2e.test.ts apps/api/test/conversations.e2e.test.ts docs/superpowers/specs/2026-10-06-phase1-b-inbox-design.md
git commit -m "feat(api): GET /inbox/assignees, markRead keeps concurrent unread, isMessageSendError

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Admin: types, hooks, ຂໍ້ຄວາມ i18n, ເມນູ

**Files:**
- Modify: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/queries.ts`, `apps/admin/src/lib/i18n/dictionary.ts`, `apps/admin/src/lib/nav.ts`, `apps/admin/src/lib/nav.test.ts`
- Create: `apps/admin/src/lib/queries-inbox.test.tsx`

- [ ] **Step 1: ຂຽນ test ຂອງ hooks (RED)**

`apps/admin/src/lib/queries-inbox.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import {
  queryKeys,
  useAssignees,
  useConversation,
  useConversations,
  useCreateCustomerFromChat,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useUpdateConversation,
} from "./queries";
import type { ConversationDto, MessageDto, MessagePage, Page } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  apiFetch: vi.fn(),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

const message = (id: string): MessageDto => ({
  id,
  direction: "IN",
  text: id,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T00:00:00.000Z",
});
const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T00:00:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("useConversations", () => {
  it("ສ້າງ query string ຕາມ filter (ຂ້າມຄ່າວ່າງ ແລະ unread=false)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [conversation], total: 1, page: 1, pageSize: 30 } satisfies Page<ConversationDto>);
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(
      ({ unread }: { unread: boolean }) =>
        useConversations({ status: "OPEN", assignee: "me", unread, q: "som", page: 2, pageSize: 30 }),
      { wrapper: Wrapper, initialProps: { unread: true } },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(1));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations?status=OPEN&assignee=me&unread=true&q=som&page=2&pageSize=30");
    rerender({ unread: false });
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBe(2));
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toBe("/conversations?status=OPEN&assignee=me&q=som&page=2&pageSize=30");
  });
});

describe("useConversation", () => {
  it("ບໍ່ຍິງເມື່ອ id ເປັນ null", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useConversation(null), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("GET /conversations/:id", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useConversation("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.displayName).toBe("Somchai"));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations/c1");
  });
});

describe("useMessages (cursor)", () => {
  it("ໜ້າທຳອິດບໍ່ມີ beforeId; ໜ້າຕໍ່ໄປໃຊ້ id ຂອງຂໍ້ຄວາມສຸດທ້າຍ (ເກົ່າສຸດ) ຂອງໜ້າກ່ອນ; hasMore=false ຢຸດ", async () => {
    const pages: MessagePage[] = [
      { items: [message("m3"), message("m2")], hasMore: true },
      { items: [message("m1")], hasMore: false },
    ];
    vi.mocked(apiFetch).mockImplementation((async () => pages.shift()) as typeof apiFetch);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMessages("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/conversations/c1/messages?limit=30");
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toBe("/conversations/c1/messages?limit=30&beforeId=m2");
    expect(result.current.hasNextPage).toBe(false);
  });
  it("ບໍ່ຍິງເມື່ອ conversationId ເປັນ null", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useMessages(null), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("mutations", () => {
  it("useSendMessage: POST /conversations/:id/messages ແລະ invalidate ທຸກ query ຂອງ conversations (ທັງຕອນລົ້ມ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(message("m9"));
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSendMessage(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { text: "hello" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/messages", { method: "POST", body: { text: "hello" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });

    invalidate.mockClear();
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { text: "again" } }).catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("useUpdateConversation: PATCH", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useUpdateConversation(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { assigneeId: null, status: "CLOSED" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1", { method: "PATCH", body: { assigneeId: null, status: "CLOSED" } });
  });

  it("useMarkConversationRead: POST /read", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1");
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/read", { method: "POST" });
  });

  it("useCreateCustomerFromChat: POST /customer ແລະ invalidate customers ນຳ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(conversation);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateCustomerFromChat(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "c1", input: { name: "Dala", phone: "020111111" } });
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/conversations/c1/customer", {
      method: "POST",
      body: { name: "Dala", phone: "020111111" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.customers });
  });
});

describe("useAssignees", () => {
  it("GET /inbox/assignees; enabled=false ບໍ່ຍິງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ id: "u1", name: "Chat" }]);
    const { Wrapper } = wrapper();
    const off = renderHook(() => useAssignees({ enabled: false }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    off.unmount();
    const { result } = renderHook(() => useAssignees(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "u1", name: "Chat" }]));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toBe("/inbox/assignees");
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries-inbox.test.tsx` → Expected: FAIL (hooks/types ບໍ່ມີ)

- [ ] **Step 2: types**

ໃນ `apps/admin/src/lib/types.ts` ແກ້ບັນທັດ import ທຳອິດໃຫ້ມີ type ເພີ່ມ:

```ts
import type {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  OrderStatus,
  Permission,
  ProductStatus,
  SalesChannel,
  StockMovementType,
} from "@oca/shared";
```

ແລະ ເພີ່ມທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// Inbox (ກົງກັບ DTO ຂອງ apps/api/src/modules/inbox/inbox.mapper.ts)
// ---------------------------------------------------------------------------
export interface ConversationDto {
  id: string;
  channel: SalesChannel;
  displayName: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: string;
  /** null = ຂໍ້ຄວາມສຸດທ້າຍມີແຕ່ໄຟລ໌ແນບ */
  lastMessagePreview: string | null;
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  direction: MessageDirection;
  text: string | null;
  attachments: { type: string; url: string | null }[];
  status: MessageStatus;
  /** ຄ່າຈາກ MESSAGE_SEND_ERRORS ເມື່ອ status = FAILED (ໃຊ້ isMessageSendError ກ່ອນແປ) */
  errorCode: string | null;
  sentBy: { id: string; name: string } | null;
  createdAt: string;
}

/** ໃໝ່ສຸດກ່ອນ; ໜ້າຖັດໄປໃຊ້ id ຂອງແຖວສຸດທ້າຍເປັນ `beforeId` */
export interface MessagePage {
  items: MessageDto[];
  hasMore: boolean;
}

export interface AssigneeDto {
  id: string;
  name: string;
}
```

- [ ] **Step 3: hooks ໃນ `queries.ts`**

(a) ແກ້ import ຈາກ `@oca/shared` ໃຫ້ມີ `ConversationStatus`, `CreateCustomerFromChatInput`, `SendMessageInput`, `UpdateConversationInput` (ຮັກສາລຳດັບ alphabetical ຂອງ list ເດີມ). ແກ້ import react-query ເປັນ `import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";`. ໃນ import `./types` ເພີ່ມ `AssigneeDto`, `ConversationDto`, `MessageDto`, `MessagePage` (ຮັກສາລຳດັບ alphabetical).

(b) ໃນ `queryKeys` ເພີ່ມ:

```ts
  conversations: ["conversations"] as const,
  assignees: ["inbox-assignees"] as const,
```

(c) ເພີ່ມທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
export interface ConversationListParams {
  status?: ConversationStatus;
  /** "me" | "unassigned" | id ຂອງຜູ້ໃຊ້ */
  assignee?: string;
  unread?: boolean;
  q?: string;
  page: number;
  pageSize: number;
}

export function useConversations(params: ConversationListParams) {
  return useQuery({
    queryKey: [...queryKeys.conversations, "list", params],
    queryFn: () =>
      apiFetch<Page<ConversationDto>>(`/conversations${toQueryString({ ...params, unread: params.unread ? true : undefined })}`),
    placeholderData: keepPreviousData,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryKey: [...queryKeys.conversations, "detail", id],
    queryFn: () => apiFetch<ConversationDto>(`/conversations/${id}`),
  });
}

const MESSAGE_PAGE_SIZE = 30;

/** ແບ່ງໜ້າດ້ວຍ cursor: ໜ້າທຳອິດ = ໃໝ່ສຸດ; fetchNextPage ໂຫຼດຂໍ້ຄວາມທີ່ເກົ່າກວ່າ (beforeId = ແຖວສຸດທ້າຍຂອງໜ້າກ່ອນ) */
export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    enabled: conversationId !== null,
    queryKey: [...queryKeys.conversations, "messages", conversationId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<MessagePage>(
        `/conversations/${conversationId}/messages${toQueryString({ limit: MESSAGE_PAGE_SIZE, beforeId: pageParam })}`,
      ),
    getNextPageParam: (last) => (last.hasMore ? last.items.at(-1)?.id : undefined),
  });
}

/** ສົ່ງຂໍ້ຄວາມ: ຖ້າ API ຕອບ 201 ແຕ່ status=FAILED ກໍຍັງ resolve (ຜູ້ເອີ້ນຕ້ອງເບິ່ງ status); invalidate ທັງຕອນລົ້ມ ເພາະແຖວ FAILED ຖືກບັນທຶກແລ້ວ */
export function useSendMessage() {
  const invalidate = useInvalidate(queryKeys.conversations);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SendMessageInput }) =>
      apiFetch<MessageDto>(`/conversations/${id}/messages`, { method: "POST", body: input }),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useUpdateConversation() {
  const invalidate = useInvalidate(queryKeys.conversations);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConversationInput }) =>
      apiFetch<ConversationDto>(`/conversations/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useMarkConversationRead() {
  const invalidate = useInvalidate(queryKeys.conversations);
  return useMutation({
    mutationFn: (id: string) => apiFetch<ConversationDto>(`/conversations/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

/** ສ້າງລູກຄ້າ + ລິ້ງເຄສໃນຄັ້ງດຽວ → ລາຍການລູກຄ້າ (ຕົວເລືອກໃນຟອມບິນ) ປ່ຽນນຳ */
export function useCreateCustomerFromChat() {
  const invalidate = useInvalidate(queryKeys.conversations, queryKeys.customers);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCustomerFromChatInput }) =>
      apiFetch<ConversationDto>(`/conversations/${id}/customer`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

/** ຜູ້ໃຊ້ທີ່ມອບໝາຍເຄສໃຫ້ໄດ້ (GET /inbox/assignees: ບໍ່ຕ້ອງມີ staff:read) */
export function useAssignees(options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: queryKeys.assignees,
    queryFn: () => apiFetch<AssigneeDto[]>("/inbox/assignees"),
    staleTime: 60_000,
  });
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries-inbox.test.tsx` → Expected: PASS

- [ ] **Step 4: ເມນູ (RED → GREEN)**

ແກ້ `apps/admin/src/lib/nav.test.ts`: ໃນ test "ບໍ່ມີສິດ" ປ່ຽນ `expect(visibleNavGroups(["inbox:read"])).toEqual([]);` ເປັນ `expect(visibleNavGroups(["crm:read"])).toEqual([]);` ແລ້ວເພີ່ມ test ໃນ `describe("visibleNavGroups")`:

```ts
  it("ຜູ້ມີ inbox:read ເຫັນກຸ່ມສົນທະນາ (/inbox) ແຕ່ landing ຫຼັງ login ຍັງເປັນໜ້າທຳອິດຂອງກຸ່ມທຳອິດ", () => {
    const groups = visibleNavGroups(["inbox:read"]);
    expect(groups.map((group) => group.id)).toEqual(["chat"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/inbox"]);
    expect(firstAllowedHref(["inbox:read"])).toBe("/inbox");
    // ມີສິດສະຕ໊ອກນຳ: ກຸ່ມ inventory ຍັງມາກ່ອນ ຈຶ່ງບໍ່ປ່ຽນໜ້າຫຼັງ login ຂອງຜູ້ໃຊ້ເດີມ
    expect(firstAllowedHref(["inbox:read", "inventory:read"])).toBe("/products");
  });
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/nav.test.ts` → Expected: FAIL

ໃນ `nav.ts`: ເພີ່ມ `MessageSquare` ໃສ່ import ຈາກ `lucide-react` (ຮັກສາລຳດັບ) ແລະ ເພີ່ມກຸ່ມໃໝ່ໃນ `NAV_GROUPS` ຕໍ່ຈາກກຸ່ມ `inventory` ແລະ ກ່ອນ `settings`:

```ts
  {
    id: "chat",
    labelKey: "nav.group.chat",
    items: [{ href: "/inbox", labelKey: "nav.inbox", icon: MessageSquare, permission: "inbox:read" }],
  },
```

(ຈະ compile ບໍ່ຜ່ານຈົນກວ່າຈະເພີ່ມ key ໃນ Step 5.)

- [ ] **Step 5: ຂໍ້ຄວາມ i18n (lo + en)**

ກ່ອນແກ້: `git status --short apps/admin/src/lib/i18n/dictionary.ts` ຕ້ອງສະອາດ (ບໍ່ມີຄົນແກ້ຄ້າງ).

(a) ໃນ object `lo` ແທນບັນທັດສຸດທ້າຍ + `} as const;`:

```ts
  "orders.detail.cancelUnavailable": "ບິນນີ້ຍົກເລີກບໍ່ໄດ້ແລ້ວ (ສິດຖືກປ່ຽນ)",
} as const;
```

ດ້ວຍ (ຄົງບັນທັດ `orders.detail.cancelUnavailable` ໄວ້ ແລ້ວເພີ່ມຕໍ່):

```ts
  "orders.detail.cancelUnavailable": "ບິນນີ້ຍົກເລີກບໍ່ໄດ້ແລ້ວ (ສິດຖືກປ່ຽນ)",

  "nav.group.chat": "ສົນທະນາ",
  "nav.inbox": "ກ່ອງຂໍ້ຄວາມ",
  "inbox.title": "ກ່ອງຂໍ້ຄວາມ",
  "inbox.description": "ຕອບລູກຄ້າທີ່ທັກມາທາງ Facebook Messenger",
  "inbox.realtime.connected": "ເຊື່ອມຕໍ່ແບບສົດ",
  "inbox.realtime.connecting": "ກຳລັງເຊື່ອມຕໍ່...",
  "inbox.realtime.reconnecting": "ການເຊື່ອມຕໍ່ຂາດ ກຳລັງລອງໃໝ່",
  "inbox.list.label": "ລາຍການສົນທະນາ",
  "inbox.list.search": "ຄົ້ນຫາຊື່ ຫຼື ຂໍ້ຄວາມ...",
  "inbox.filter.status": "ສະຖານະເຄສ",
  "inbox.filter.allStatuses": "ທຸກສະຖານະ",
  "inbox.status.OPEN": "ເປີດຢູ່",
  "inbox.status.CLOSED": "ປິດແລ້ວ",
  "inbox.filter.assignee": "ຜູ້ຮັບຜິດຊອບ",
  "inbox.assignee.all": "ທຸກຄົນ",
  "inbox.assignee.me": "ຂອງຂ້ອຍ",
  "inbox.assignee.unassigned": "ຍັງບໍ່ມີຜູ້ຮັບ",
  "inbox.filter.unread": "ສະເພາະທີ່ຍັງບໍ່ອ່ານ",
  "inbox.list.empty": "ຍັງບໍ່ມີການສົນທະນາ",
  "inbox.list.noResults": "ບໍ່ພົບການສົນທະນາທີ່ຄົ້ນຫາ",
  "inbox.list.pageInfo": "ໜ້າ {page} / {pages}",
  "inbox.item.unread": "{count} ຂໍ້ຄວາມຍັງບໍ່ອ່ານ",
  "inbox.item.attachmentOnly": "[ໄຟລ໌ແນບ]",
  "inbox.thread.label": "ຂໍ້ຄວາມໃນການສົນທະນາ",
  "inbox.thread.select": "ເລືອກການສົນທະນາຈາກລາຍການເພື່ອເລີ່ມ",
  "inbox.thread.empty": "ຍັງບໍ່ມີຂໍ້ຄວາມ",
  "inbox.thread.loadOlder": "ໂຫຼດຂໍ້ຄວາມເກົ່າກວ່າ",
  "inbox.thread.loadingOlder": "ກຳລັງໂຫຼດ...",
  "inbox.thread.back": "ກັບໄປລາຍການ",
  "inbox.thread.details": "ລາຍລະອຽດ",
  "inbox.message.from.IN": "ລູກຄ້າ",
  "inbox.message.from.OUT": "ຮ້ານ",
  "inbox.message.by": "ໂດຍ {name}",
  "inbox.message.pending": "ກຳລັງສົ່ງ...",
  "inbox.message.failed": "ສົ່ງບໍ່ສຳເລັດ",
  "inbox.attachment.image": "ຮູບທີ່ລູກຄ້າສົ່ງ",
  "inbox.attachment.open": "ເປີດໃນແຖບໃໝ່",
  "inbox.attachment.file": "ໄຟລ໌ແນບ ({type})",
  "inbox.sendError.OUTSIDE_WINDOW": "ເກີນ 24 ຊົ່ວໂມງຫຼັງລູກຄ້າທັກຄັ້ງລ່າສຸດ Meta ບໍ່ອະນຸຍາດໃຫ້ຕອບ",
  "inbox.sendError.CHANNEL_AUTH": "Token ຂອງເພຈໃຊ້ບໍ່ໄດ້ ຫຼື ໝົດອາຍຸ ໃຫ້ກວດການຕັ້ງຄ່າ",
  "inbox.sendError.CHANNEL_NOT_CONFIGURED": "ຊ່ອງທາງນີ້ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ",
  "inbox.sendError.CHANNEL_UNAVAILABLE": "ເຊື່ອມຕໍ່ Meta ບໍ່ໄດ້ຊົ່ວຄາວ ລອງໃໝ່ພາຍຫຼັງ",
  "inbox.sendError.SEND_REJECTED": "Meta ປະຕິເສດຂໍ້ຄວາມນີ້",
  "inbox.sendError.UNKNOWN": "ສົ່ງບໍ່ສຳເລັດ (ບໍ່ຮູ້ເຫດຜົນ)",
  "inbox.composer.label": "ຂໍ້ຄວາມຕອບລູກຄ້າ",
  "inbox.composer.placeholder": "ພິມຂໍ້ຄວາມ... (Enter ສົ່ງ, Shift+Enter ຂຶ້ນແຖວໃໝ່)",
  "inbox.composer.send": "ສົ່ງ",
  "inbox.composer.sending": "ກຳລັງສົ່ງ...",
  "inbox.composer.readOnly": "ທ່ານມີສິດເບິ່ງ ແຕ່ບໍ່ມີສິດຕອບແຊັດ",
  "inbox.composer.tooLong": "ຂໍ້ຄວາມຍາວເກີນ {max} ໂຕອັກສອນ",
  "inbox.composer.failedKept": "ສົ່ງບໍ່ສຳເລັດ: {reason} (ຂໍ້ຄວາມຍັງຢູ່ໃນຊ່ອງພິມ)",
  "inbox.panel.title": "ລາຍລະອຽດການສົນທະນາ",
  "inbox.panel.channel": "ຊ່ອງທາງ",
  "inbox.panel.customer": "ລູກຄ້າ",
  "inbox.panel.noCustomer": "ຍັງບໍ່ໄດ້ລິ້ງກັບລູກຄ້າ",
  "inbox.panel.unlink": "ຖອນການລິ້ງ",
  "inbox.panel.createCustomer": "ສ້າງລູກຄ້າໃໝ່",
  "inbox.panel.assignee": "ຜູ້ຮັບຜິດຊອບ",
  "inbox.panel.status": "ສະຖານະ",
  "inbox.panel.close": "ປິດເຄສ",
  "inbox.panel.reopen": "ເປີດເຄສຄືນ",
  "inbox.toast.updated": "ອັບເດດການສົນທະນາແລ້ວ",
  "inbox.customerDialog.title": "ສ້າງລູກຄ້າຈາກການສົນທະນາ",
  "inbox.customerDialog.description": "ບັນທຶກລູກຄ້າໃໝ່ ແລ້ວລິ້ງກັບການສົນທະນານີ້",
  "inbox.customerDialog.phoneHint": "ບໍ່ບັງຄັບ",
  "inbox.customerDialog.phoneInvalid": "ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6-15 ຫຼັກ, ມີ + ໜ້າໄດ້)",
  "inbox.customerDialog.created": "ສ້າງ ແລະ ລິ້ງລູກຄ້າແລ້ວ",
} as const;
```

(b) ໃນ object `en` ແທນ:

```ts
  "orders.detail.cancelUnavailable": "You can no longer cancel this order",
};
```

ດ້ວຍ:

```ts
  "orders.detail.cancelUnavailable": "You can no longer cancel this order",

  "nav.group.chat": "Chat",
  "nav.inbox": "Inbox",
  "inbox.title": "Inbox",
  "inbox.description": "Reply to customers who message you on Facebook Messenger",
  "inbox.realtime.connected": "Live",
  "inbox.realtime.connecting": "Connecting...",
  "inbox.realtime.reconnecting": "Connection lost, retrying",
  "inbox.list.label": "Conversations",
  "inbox.list.search": "Search name or message...",
  "inbox.filter.status": "Conversation status",
  "inbox.filter.allStatuses": "All statuses",
  "inbox.status.OPEN": "Open",
  "inbox.status.CLOSED": "Closed",
  "inbox.filter.assignee": "Assignee",
  "inbox.assignee.all": "Everyone",
  "inbox.assignee.me": "Mine",
  "inbox.assignee.unassigned": "Unassigned",
  "inbox.filter.unread": "Unread only",
  "inbox.list.empty": "No conversations yet",
  "inbox.list.noResults": "No conversations match your search",
  "inbox.list.pageInfo": "Page {page} of {pages}",
  "inbox.item.unread": "{count} unread",
  "inbox.item.attachmentOnly": "[Attachment]",
  "inbox.thread.label": "Conversation messages",
  "inbox.thread.select": "Select a conversation from the list to start",
  "inbox.thread.empty": "No messages yet",
  "inbox.thread.loadOlder": "Load older messages",
  "inbox.thread.loadingOlder": "Loading...",
  "inbox.thread.back": "Back to list",
  "inbox.thread.details": "Details",
  "inbox.message.from.IN": "Customer",
  "inbox.message.from.OUT": "Store",
  "inbox.message.by": "by {name}",
  "inbox.message.pending": "Sending...",
  "inbox.message.failed": "Not delivered",
  "inbox.attachment.image": "Image from the customer",
  "inbox.attachment.open": "Open in a new tab",
  "inbox.attachment.file": "Attachment ({type})",
  "inbox.sendError.OUTSIDE_WINDOW": "More than 24 hours since the customer's last message; Meta does not allow a reply",
  "inbox.sendError.CHANNEL_AUTH": "The Page token is invalid or expired; check the configuration",
  "inbox.sendError.CHANNEL_NOT_CONFIGURED": "This channel is not configured",
  "inbox.sendError.CHANNEL_UNAVAILABLE": "Meta is temporarily unreachable; try again later",
  "inbox.sendError.SEND_REJECTED": "Meta rejected this message",
  "inbox.sendError.UNKNOWN": "Could not be sent (unknown reason)",
  "inbox.composer.label": "Reply to the customer",
  "inbox.composer.placeholder": "Type a message... (Enter to send, Shift+Enter for a new line)",
  "inbox.composer.send": "Send",
  "inbox.composer.sending": "Sending...",
  "inbox.composer.readOnly": "You can view conversations but not reply",
  "inbox.composer.tooLong": "The message is longer than {max} characters",
  "inbox.composer.failedKept": "Not delivered: {reason} (your text is still in the box)",
  "inbox.panel.title": "Conversation details",
  "inbox.panel.channel": "Channel",
  "inbox.panel.customer": "Customer",
  "inbox.panel.noCustomer": "Not linked to a customer yet",
  "inbox.panel.unlink": "Unlink",
  "inbox.panel.createCustomer": "Create customer",
  "inbox.panel.assignee": "Assignee",
  "inbox.panel.status": "Status",
  "inbox.panel.close": "Close conversation",
  "inbox.panel.reopen": "Reopen conversation",
  "inbox.toast.updated": "Conversation updated",
  "inbox.customerDialog.title": "Create customer from conversation",
  "inbox.customerDialog.description": "Save a new customer and link it to this conversation",
  "inbox.customerDialog.phoneHint": "Optional",
  "inbox.customerDialog.phoneInvalid": "Invalid phone (6-15 digits, optional leading +)",
  "inbox.customerDialog.created": "Customer created and linked",
};
```

- [ ] **Step 6: ຣັນ + typecheck + lint**

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS (ລວມ `errors.test.ts`, `nav.test.ts`, `queries-inbox.test.tsx`; typecheck ສະອາດ)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries-inbox.test.tsx apps/admin/src/lib/i18n/dictionary.ts apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts
git commit -m "feat(admin): inbox data layer, hooks, translations and nav entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Admin: SSE client (parser, stream loop, hook)

**Files:**
- Create: `apps/admin/src/lib/sse.ts`, `apps/admin/src/lib/sse.test.ts`, `apps/admin/src/lib/inbox-stream.ts`, `apps/admin/src/lib/inbox-stream.test.ts`, `apps/admin/src/lib/use-inbox-realtime.ts`, `apps/admin/src/lib/use-inbox-realtime.test.tsx`

ເຫດຜົນທີ່ບໍ່ໃຊ້ `EventSource`: ໃສ່ header `Authorization` ບໍ່ໄດ້ (spec §6) ຈຶ່ງໃຊ້ `fetch` + stream ແລະ ຂຽນ parser/reconnect ເອງ. Server ຕັດ stream ຫຼັງ `ACCESS_TOKEN_TTL_SECONDS` ຈຶ່ງ reconnect ດ້ວຍ token ໃໝ່ເປັນເລື່ອງປົກກະຕິ.

- [ ] **Step 1: test ຂອງ parser (RED)**

`apps/admin/src/lib/sse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type SseFrame, createSseParser } from "./sse";

function collect(chunks: string[]): SseFrame[] {
  const frames: SseFrame[] = [];
  const feed = createSseParser((frame) => frames.push(frame));
  for (const chunk of chunks) feed(chunk);
  return frames;
}

describe("createSseParser", () => {
  it("frame ປົກກະຕິຂອງ Nest: event + data ແລ້ວເສັ້ນວ່າງ", () => {
    expect(collect(['event: ready\ndata: {}\n\n'])).toEqual([{ event: "ready", data: "{}" }]);
  });

  it("ຫຼາຍ frame ໃນ chunk ດຽວ", () => {
    expect(collect(["event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"])).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("chunk ຖືກຕັດກາງບັນທັດ/ກາງ frame", () => {
    expect(collect(["eve", "nt: up", "dated\nda", 'ta: {"x":1}\n', "\n"])).toEqual([{ event: "updated", data: '{"x":1}' }]);
  });

  it("CRLF ແລະ CR; \\r\\n ທີ່ຖືກຕັດລະຫວ່າງ chunk", () => {
    expect(collect(["event: a\r\ndata: 1\r\n\r\n"])).toEqual([{ event: "a", data: "1" }]);
    expect(collect(["event: a\r", "\ndata: 1\r", "\n\r", "\n"])).toEqual([{ event: "a", data: "1" }]);
    expect(collect(["event: a\rdata: 1\r\r"])).toEqual([{ event: "a", data: "1" }]);
  });

  it("ບັນທັດ comment (ຂຶ້ນຕົ້ນດ້ວຍ :) ຖືກຂ້າມ ແລະ ບໍ່ສ້າງ frame ເອງ", () => {
    expect(collect([": keepalive\n\n"])).toEqual([]);
    expect(collect([": hi\nevent: a\ndata: 1\n\n"])).toEqual([{ event: "a", data: "1" }]);
  });

  it("data ຫຼາຍບັນທັດຖືກຕໍ່ດ້ວຍ \\n; ບໍ່ມີ event = message; field ທີ່ບໍ່ຮູ້ຈັກຖືກຂ້າມ; ຊ່ອງວ່າງດຽວຫຼັງ : ຖືກຕັດ", () => {
    expect(collect(["data: a\ndata: b\nid: 5\nretry: 10\n\n"])).toEqual([{ event: "message", data: "a\nb" }]);
    expect(collect(["event:x\ndata:  y\n\n"])).toEqual([{ event: "x", data: " y" }]);
  });

  it("frame ທີ່ບໍ່ມີ data ແຕ່ມີ event ກໍສົ່ງ; ເສັ້ນວ່າງຊ້ຳບໍ່ສ້າງ frame", () => {
    expect(collect(["event: ping\n\n\n\n"])).toEqual([{ event: "ping", data: "" }]);
  });

  it("frame ທີ່ຍັງບໍ່ຈົບ (ບໍ່ມີເສັ້ນວ່າງ) ບໍ່ຖືກສົ່ງ", () => {
    expect(collect(["event: a\ndata: 1\n"])).toEqual([]);
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/sse.test.ts` → Expected: FAIL (module ບໍ່ມີ)

- [ ] **Step 2: parser**

`apps/admin/src/lib/sse.ts`:

```ts
export interface SseFrame {
  event: string;
  data: string;
}

const LINE_END = /\r\n|\n|\r/;

/**
 * parser ຂອງ `text/event-stream` (ຕາມ WHATWG): ປ້ອນ chunk ຂໍ້ຄວາມເລື້ອຍໆ; ເອີ້ນ `onFrame` ເມື່ອໄດ້ frame ຄົບ (ເສັ້ນວ່າງ).
 * ຮອງຮັບ \n, \r\n, \r ແລະ chunk ທີ່ຖືກຕັດກາງບັນທັດ. ມີສະເພາະ field `event` ແລະ `data` ທີ່ໃຊ້; ອື່ນໆ (id, retry, comment) ຖືກຂ້າມ.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void): (chunk: string) => void {
  let buffer = "";
  let event = "";
  let data: string[] = [];

  const flush = () => {
    if (event !== "" || data.length > 0) onFrame({ event: event || "message", data: data.join("\n") });
    event = "";
    data = [];
  };

  const handleLine = (line: string) => {
    if (line === "") return flush();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  return (chunk) => {
    buffer += chunk;
    for (;;) {
      const match = LINE_END.exec(buffer);
      if (!match) return;
      // "\r" ທ້າຍ buffer ອາດເປັນຄົ່ງທຳອິດຂອງ "\r\n" ທີ່ຖືກຕັດ: ລໍ chunk ຕໍ່ໄປ
      if (match[0] === "\r" && match.index === buffer.length - 1) return;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      handleLine(line);
    }
  };
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/sse.test.ts` → Expected: PASS

- [ ] **Step 3: test ຂອງ stream loop (RED)**

`apps/admin/src/lib/inbox-stream.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type StreamStatus, runInboxStream } from "./inbox-stream";

const encoder = new TextEncoder();
const READY = "event: ready\ndata: {}\n\n";
const UPDATED = 'event: conversation.updated\ndata: {"type":"conversation.updated","conversationId":"c1"}\n\n';

function streamResponse(...chunks: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

type Step = () => Response | Promise<Response>;

/** fetch ປອມທີ່ເດີນຕາມ steps; ໝົດ steps = abort ແລ້ວ throw (ຈົບ loop) */
function scripted(controller: AbortController, steps: Step[]) {
  const headers: (Record<string, string> | undefined)[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    headers.push(init?.headers as Record<string, string> | undefined);
    const step = steps.shift();
    if (!step) {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }
    return step();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, headers, calls: fetchImpl };
}

function setup(steps: Step[], overrides: Partial<Parameters<typeof runInboxStream>[0]> = {}) {
  const controller = new AbortController();
  const fetcher = scripted(controller, steps);
  const statuses: StreamStatus[] = [];
  const sleeps: number[] = [];
  const onChange = vi.fn();
  const options = {
    url: "/api/inbox/events",
    getToken: () => "tok",
    refresh: vi.fn(async () => "tok2"),
    onStatus: (status: StreamStatus) => statuses.push(status),
    onChange,
    signal: controller.signal,
    fetchImpl: fetcher.fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    baseMs: 1000,
    maxMs: 3000,
    ...overrides,
  };
  return { options, controller, fetcher, statuses, sleeps, onChange };
}

describe("runInboxStream", () => {
  it("ເຊື່ອມດ້ວຍ Bearer + Accept; ready → connected; conversation.updated → onChange; ປິດ → reconnecting; ເຊື່ອມໃໝ່ແລ້ວ ready → onChange (ອາດພາດ event)", async () => {
    const { options, fetcher, statuses, onChange } = setup([() => streamResponse(READY, UPDATED), () => streamResponse(READY)]);
    await runInboxStream(options);
    expect(fetcher.headers[0]).toEqual({ Accept: "text/event-stream", Authorization: "Bearer tok" });
    expect(statuses).toEqual(["connecting", "connected", "reconnecting", "connected", "reconnecting"]);
    // 1 ຄັ້ງຈາກ updated + 1 ຄັ້ງຈາກ ready ຫຼັງ reconnect; ready ຄັ້ງທຳອິດບໍ່ refetch
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ping ແລະ event ທີ່ບໍ່ຮູ້ຈັກຖືກຂ້າມ; ບໍ່ມີ token = ບໍ່ສົ່ງ Authorization", async () => {
    const { options, fetcher, onChange } = setup([() => streamResponse(READY, "event: ping\ndata: {}\n\n", "event: other\ndata: 1\n\n")], {
      getToken: () => null,
    });
    await runInboxStream(options);
    expect(onChange).not.toHaveBeenCalled();
    expect(fetcher.headers[0]).toEqual({ Accept: "text/event-stream" });
  });

  it("chunk ທີ່ຖືກຕັດກາງ frame ຍັງໄດ້ event", async () => {
    const { options, onChange } = setup([() => streamResponse("event: ready\nda", "ta: {}\n\nevent: conversation.upd", "ated\ndata: {}\n\n")]);
    await runInboxStream(options);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("401 → refresh ຄັ້ງດຽວ ແລ້ວລອງໃໝ່ດ້ວຍ token ໃໝ່", async () => {
    let token = "old";
    const { options, fetcher, statuses } = setup([() => new Response(null, { status: 401 }), () => streamResponse(READY)], {
      getToken: () => token,
      refresh: vi.fn(async () => {
        token = "new";
        return "new";
      }),
    });
    await runInboxStream(options);
    expect(options.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.headers[1]?.Authorization).toBe("Bearer new");
    expect(statuses).toContain("connected");
  });

  it("401 ສອງຄັ້ງຕິດ (ຫຼັງ refresh ແລ້ວ) = ເລີກ ບໍ່ວົນ; refresh ໄດ້ null = ເລີກທັນທີ", async () => {
    const twice = setup([() => new Response(null, { status: 401 }), () => new Response(null, { status: 401 }), () => streamResponse(READY)]);
    await runInboxStream(twice.options);
    expect(twice.fetcher.calls).toHaveBeenCalledTimes(2);
    expect(twice.options.refresh).toHaveBeenCalledTimes(1);

    const none = setup([() => new Response(null, { status: 401 })], { refresh: vi.fn(async () => null) });
    await runInboxStream(none.options);
    expect(none.fetcher.calls).toHaveBeenCalledTimes(1);
  });

  it("503/ເຄືອຂ່າຍລົ້ມ → backoff ເພີ່ມເປັນສອງເທົ່າ ຕັນທີ່ maxMs; ເຊື່ອມສຳເລັດແລ້ວກັບໄປ baseMs", async () => {
    const { options, sleeps, statuses } = setup([
      () => new Response(null, { status: 503 }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response(null, { status: 500 }),
      () => streamResponse(READY),
    ]);
    await runInboxStream(options);
    expect(sleeps).toEqual([1000, 2000, 3000, 1000]);
    expect(statuses[0]).toBe("connecting");
    expect(statuses.filter((status) => status === "reconnecting").length).toBe(4);
  });

  it("abort ກ່ອນເລີ່ມ = ບໍ່ເຊື່ອມເລີຍ", async () => {
    const { options, controller, fetcher } = setup([() => streamResponse(READY)]);
    controller.abort();
    await runInboxStream(options);
    expect(fetcher.calls).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/inbox-stream.test.ts` → Expected: FAIL (module ບໍ່ມີ)

- [ ] **Step 4: stream loop**

`apps/admin/src/lib/inbox-stream.ts`:

```ts
import { createSseParser } from "./sse";

export type StreamStatus = "connecting" | "connected" | "reconnecting";

export interface InboxStreamOptions {
  url: string;
  getToken: () => string | null;
  /** ຂໍ token ໃໝ່ (refresh session); null = session ໃຊ້ບໍ່ໄດ້ */
  refresh: () => Promise<string | null>;
  onStatus: (status: StreamStatus) => void;
  /** ມີການປ່ຽນ (conversation.updated) ຫຼື ເຊື່ອມໃໝ່ສຳເລັດ (ອາດພາດ event ລະຫວ່າງຂາດ) → ຜູ້ເອີ້ນ refetch */
  onChange: () => void;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  baseMs?: number;
  maxMs?: number;
}

type Outcome = "unauthorized" | "failed" | "ended";

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const id = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

async function connectOnce(
  options: InboxStreamOptions,
  fetchImpl: typeof fetch,
  handlers: { onReady: () => void },
): Promise<Outcome> {
  let response: Response;
  try {
    const token = options.getToken();
    response = await fetchImpl(options.url, {
      headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    return "failed";
  }
  if (response.status === 401) return "unauthorized";
  if (!response.ok || !response.body) return "failed";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser((frame) => {
    if (frame.event === "ready") handlers.onReady();
    else if (frame.event === "conversation.updated") options.onChange();
  });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }));
    }
  } catch {
    // ເຄືອຂ່າຍຫຼຸດ ຫຼື abort: ຖືວ່າ stream ຈົບ
  }
  return "ended";
}

/**
 * ເຊື່ອມ SSE ຂອງ inbox ຕະຫຼອດ (ຈົນ signal abort):
 * - ເຊື່ອມໃໝ່ເອງເມື່ອ stream ຈົບ (server ຕັດຕາມອາຍຸ token ເປັນເລື່ອງປົກກະຕິ) ດ້ວຍ backoff ແບບສອງເທົ່າ (ຕັນທີ່ maxMs);
 *   ເຊື່ອມສຳເລັດ (ໄດ້ `ready`) ແລ້ວ backoff ກັບໄປ baseMs
 * - 401 → refresh token ຄັ້ງດຽວ ແລ້ວລອງໃໝ່; 401 ຊ້ຳຫຼັງ refresh ຫຼື refresh ບໍ່ໄດ້ = ເລີກ (session ໃຊ້ບໍ່ໄດ້)
 * - ເຊື່ອມໃໝ່ສຳເລັດຄັ້ງທີ 2 ເປັນຕົ້ນໄປເອີ້ນ onChange ເພື່ອ refetch ສິ່ງທີ່ອາດພາດ
 */
export async function runInboxStream(options: InboxStreamOptions): Promise<void> {
  const { signal } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 30_000;
  let failures = 0;
  let unauthorized = 0;
  let everConnected = false;

  options.onStatus("connecting");
  while (!signal.aborted) {
    let readyThisRound = false;
    const outcome = await connectOnce(options, fetchImpl, {
      onReady: () => {
        readyThisRound = true;
        unauthorized = 0;
        options.onStatus("connected");
        if (everConnected) options.onChange();
        everConnected = true;
      },
    });
    if (signal.aborted) return;

    if (outcome === "unauthorized") {
      unauthorized += 1;
      if (unauthorized > 1) return;
      const token = await options.refresh();
      if (!token || signal.aborted) return;
      continue;
    }

    failures = readyThisRound ? 0 : failures + 1;
    options.onStatus("reconnecting");
    await sleep(Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1)), signal);
  }
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/inbox-stream.test.ts` → Expected: PASS ທຸກ test. ຖ້າ test "503 backoff" ໄດ້ລຳດັບຕ່າງ ໃຫ້ທົບທວນ (failures ນັບຮອບທີ່ບໍ່ໄດ້ ready ຕິດກັນ: 1→1000, 2→2000, 3→min(3000,4000)=3000, ຮອບທີ 4 ready → 0 → 1000).

- [ ] **Step 5: test ຂອງ hook (RED)**

`apps/admin/src/lib/use-inbox-realtime.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type InboxStreamOptions, runInboxStream } from "./inbox-stream";
import { queryKeys } from "./queries";
import { POLL_MS, useInboxRealtime } from "./use-inbox-realtime";

vi.mock("./inbox-stream", () => ({ runInboxStream: vi.fn(async () => undefined) }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAccessToken: () => "tok",
  refreshSession: vi.fn(async () => ({ accessToken: "fresh" })),
}));

function setup(enabled = true) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useInboxRealtime(enabled), { wrapper });
  const options = () => vi.mocked(runInboxStream).mock.calls[0]?.[0] as InboxStreamOptions;
  return { ...hook, invalidate, options };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(runInboxStream).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useInboxRealtime", () => {
  it("ເລີ່ມ stream ທີ່ /api/inbox/events ດ້ວຍ token ປັດຈຸບັນ ແລະ refresh ທີ່ຄືນ accessToken", async () => {
    const { options } = setup();
    expect(runInboxStream).toHaveBeenCalledTimes(1);
    expect(options().url).toBe("/api/inbox/events");
    expect(options().getToken()).toBe("tok");
    await expect(options().refresh()).resolves.toBe("fresh");
  });

  it("status ຕາມ onStatus", () => {
    const { result, options } = setup();
    expect(result.current).toBe("connecting");
    act(() => options().onStatus("connected"));
    expect(result.current).toBe("connected");
  });

  it("onChange ຫຼາຍຄັ້ງຕິດກັນ = invalidate conversations ຄັ້ງດຽວ (ລວມ 250ms)", () => {
    const { options, invalidate } = setup();
    act(() => {
      options().onChange();
      options().onChange();
      options().onChange();
    });
    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it("poll ທຸກ 60 ວິ ເມື່ອແທັບເຫັນຢູ່ ແລະ ຂ້າມເມື່ອຖືກຊ່ອນ", () => {
    const { invalidate } = setup();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(invalidate).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("unmount: abort stream, ຍົກເລີກ timer ທີ່ຄ້າງ ແລະ ຢຸດ poll", () => {
    const { options, unmount, invalidate } = setup();
    const signal = options().signal;
    act(() => options().onChange());
    unmount();
    expect(signal.aborted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 2);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("enabled=false ບໍ່ເຊື່ອມ", () => {
    setup(false);
    expect(runInboxStream).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/use-inbox-realtime.test.tsx` → Expected: FAIL (module ບໍ່ມີ)

- [ ] **Step 6: hook**

`apps/admin/src/lib/use-inbox-realtime.ts`:

```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_BASE, getAccessToken, refreshSession } from "./api";
import { type StreamStatus, runInboxStream } from "./inbox-stream";
import { queryKeys } from "./queries";

/** ລວມ event ທີ່ມາຕິດໆກັນເປັນການ refetch ຄັ້ງດຽວ */
const COALESCE_MS = 250;
/** poll ສຳຮອງ (spec §6): ກັນກໍລະນີ SSE ຂາດ/ຖືກ proxy ຕັດ */
export const POLL_MS = 60_000;

/**
 * ຮັບ event ສົດຂອງ inbox ແລ້ວ invalidate ທຸກ query ຂອງ conversations (ລາຍການ, ລາຍລະອຽດ, ຂໍ້ຄວາມ).
 * ຄືນສະຖານະການເຊື່ອມຕໍ່ ເພື່ອສະແດງໃຫ້ຜູ້ໃຊ້.
 */
export function useInboxRealtime(enabled = true): StreamStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    };
    const scheduleRefetch = () => {
      clearTimeout(timer);
      timer = setTimeout(refetch, COALESCE_MS);
    };

    void runInboxStream({
      url: `${API_BASE}/inbox/events`,
      getToken: getAccessToken,
      refresh: async () => (await refreshSession())?.accessToken ?? null,
      onStatus: setStatus,
      onChange: scheduleRefetch,
      signal: controller.signal,
    });
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, POLL_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [enabled, queryClient]);

  return status;
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/sse.ts apps/admin/src/lib/sse.test.ts apps/admin/src/lib/inbox-stream.ts apps/admin/src/lib/inbox-stream.test.ts apps/admin/src/lib/use-inbox-realtime.ts apps/admin/src/lib/use-inbox-realtime.test.tsx
git commit -m "feat(admin): inbox SSE client (parser, reconnecting stream with token refresh, realtime hook)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin: helper + `ConversationList` (ຖັນຊ້າຍ)

**Files:**
- Create: `apps/admin/src/lib/inbox.ts`, `apps/admin/src/lib/inbox.test.ts`, `apps/admin/src/components/inbox/conversation-list.tsx`, `apps/admin/src/components/inbox/conversation-list.test.tsx`

- [ ] **Step 1: test ຂອງ helper (RED)**

`apps/admin/src/lib/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSafeAttachmentUrl, sendErrorKey } from "./inbox";

describe("isSafeAttachmentUrl", () => {
  it("ຮັບສະເພາະ https", () => {
    expect(isSafeAttachmentUrl("https://scontent.xx.fbcdn.net/a.jpg?x=1")).toBe(true);
  });
  it("ປະຕິເສດ http, javascript:, data:, ຄ່າວ່າງ/null/ບໍ່ແມ່ນ URL", () => {
    for (const value of ["http://x/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "", null, undefined, "not a url", "//x/a.jpg"]) {
      expect(isSafeAttachmentUrl(value), String(value)).toBe(false);
    }
  });
});

describe("sendErrorKey", () => {
  it("ລະຫັດທີ່ຮູ້ຈັກ → key ຂອງລະຫັດນັ້ນ", () => {
    expect(sendErrorKey("OUTSIDE_WINDOW")).toBe("inbox.sendError.OUTSIDE_WINDOW");
    expect(sendErrorKey("CHANNEL_NOT_CONFIGURED")).toBe("inbox.sendError.CHANNEL_NOT_CONFIGURED");
  });
  it("ບໍ່ຮູ້ຈັກ/null → UNKNOWN", () => {
    expect(sendErrorKey("WHATEVER")).toBe("inbox.sendError.UNKNOWN");
    expect(sendErrorKey(null)).toBe("inbox.sendError.UNKNOWN");
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/inbox.test.ts` → Expected: FAIL

- [ ] **Step 2: helper**

`apps/admin/src/lib/inbox.ts`:

```ts
import { isMessageSendError } from "@oca/shared";
import type { TranslationKey } from "@/lib/i18n/dictionary";

/** ຮູບ/ໄຟລ໌ແນບເປີດ/ສະແດງໄດ້ສະເພາະ https (CDN ຂອງ Meta); ກັນ javascript:/data:/http */
export function isSafeAttachmentUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** ຂໍ້ຄວາມເຫດຜົນທີ່ສົ່ງບໍ່ໄດ້; errorCode ທີ່ບໍ່ຮູ້ຈັກ (server ເພີ່ມລະຫັດໃໝ່) ໃຊ້ UNKNOWN ແທນທີ່ຈະສະແດງລະຫັດດິບ */
export function sendErrorKey(code: string | null): TranslationKey {
  return isMessageSendError(code) ? (`inbox.sendError.${code}` as const) : "inbox.sendError.UNKNOWN";
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/lib/inbox.test.ts` → Expected: PASS

- [ ] **Step 3: test ຂອງ `ConversationList` (RED)**

`apps/admin/src/components/inbox/conversation-list.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ConversationList } from "./conversation-list";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const make = (id: string, overrides: Partial<ConversationDto> = {}): ConversationDto => ({
  id,
  channel: "FACEBOOK",
  displayName: `Customer ${id}`,
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: `hello ${id}`,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
  ...overrides,
});

const items = [
  make("c1", { unreadCount: 3, assignee: { id: "u1", name: "Chat Admin" } }),
  make("c2", { lastMessagePreview: null }),
  make("c3", { status: "CLOSED" }),
];

function mockApi(page: Page<ConversationDto> = { items, total: 3, page: 1, pageSize: 30 }) {
  vi.mocked(apiFetch).mockImplementation((async () => page) as typeof apiFetch);
}
const urls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]);
const lastUrl = () => urls().at(-1);
const SEARCH = "Search name or message...";

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ConversationList", () => {
  it("ສະແດງຊື່, ຕົວຢ່າງຂໍ້ຄວາມ, ເວລາລາວ, ຜູ້ຮັບຜິດຊອບ/ຍັງບໍ່ມີ, ເຄສປິດ; ເລກ unread ມີຊື່ສຳລັບ screen reader", async () => {
    renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    const first = await screen.findByTestId("conversation-c1");
    expect(within(first).getByText("Customer c1")).toBeInTheDocument();
    expect(within(first).getByText("hello c1")).toBeInTheDocument();
    expect(within(first).getByText("06/10/2026 12:30")).toBeInTheDocument();
    expect(within(first).getByText("Chat Admin")).toBeInTheDocument();
    expect(within(first).getByText("3 unread")).toBeInTheDocument();
    const second = screen.getByTestId("conversation-c2");
    expect(within(second).getByText("[Attachment]")).toBeInTheDocument();
    expect(within(second).getByText("Unassigned")).toBeInTheDocument();
    expect(within(second).queryByText(/unread/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId("conversation-c3")).getByText("Closed")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Conversations" })).toBeInTheDocument();
  });

  it("request ທຳອິດ: status=OPEN, ໜ້າ 1, 30 ແຖວ", async () => {
    renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    expect(urls()[0]).toBe("/conversations?status=OPEN&page=1&pageSize=30");
  });

  it("ກອງ status, ຜູ້ຮັບຜິດຊອບ ແລະ ສະເພາະທີ່ຍັງບໍ່ອ່ານ", async () => {
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");

    await user.selectOptions(screen.getByLabelText("Conversation status"), "");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?page=1&pageSize=30"));
    await user.selectOptions(screen.getByLabelText("Conversation status"), "CLOSED");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&page=1&pageSize=30"));

    await user.selectOptions(screen.getByLabelText("Assignee"), "me");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=me&page=1&pageSize=30"));
    await user.selectOptions(screen.getByLabelText("Assignee"), "unassigned");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=unassigned&page=1&pageSize=30"));

    await user.click(screen.getByRole("checkbox", { name: "Unread only" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=CLOSED&assignee=unassigned&unread=true&page=1&pageSize=30"));
  });

  it("ຄົ້ນຫາ (debounce) ສົ່ງ q ແລະ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 90, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=2&pageSize=30"));

    await user.type(screen.getByRole("searchbox", { name: SEARCH }), "somchai");
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&q=somchai&page=1&pageSize=30"));
  });

  it("ກົດແຖວ → onSelect(id); ແຖວທີ່ເລືອກມີ aria-current", async () => {
    const onSelect = vi.fn();
    // ໃຊ້ Harness ທີ່ເກັບ selectedId ເອງ: `rerender` ຂອງ renderWithProviders ຈະເສຍ providers ເພາະ providers ຫໍ່ຢູ່ນອກ `ui`
    function Harness() {
      const [id, setId] = useState<string | null>(null);
      return (
        <ConversationList
          selectedId={id}
          onSelect={(next) => {
            onSelect(next);
            setId(next);
          }}
        />
      );
    }
    const { user } = renderWithProviders(<Harness />);
    const row = await screen.findByTestId("conversation-c2");
    expect(row).not.toHaveAttribute("aria-current");
    await user.click(row);
    expect(onSelect).toHaveBeenCalledWith("c2");
    expect(screen.getByTestId("conversation-c2")).toHaveAttribute("aria-current", "true");
  });

  it("ບໍ່ມີຂໍ້ມູນ: ຂໍ້ຄວາມຕ່າງກັນລະຫວ່າງ 'ຍັງບໍ່ມີ' ກັບ 'ຄົ້ນຫາບໍ່ພົບ'", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    // ຄ່າເລີ່ມຕົ້ນ (status=OPEN) ຖືວ່າເປັນ filter ຢູ່ ແຕ່ຍັງບໍ່ໄດ້ຄົ້ນຫາ/ກອງເອງ → ຍັງບໍ່ມີ
    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Unread only" }));
    expect(await screen.findByText("No conversations match your search")).toBeInTheDocument();
  });

  it("ໂຫຼດບໍ່ສຳເລັດ: ສະແດງ error ແລະ ປຸ່ມລອງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "boom"));
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("conversation-c1")).toBeInTheDocument();
  });

  it("ແບ່ງໜ້າ: 'Page 1 / 3', ກ່ອນໜ້າຖືກປິດຢູ່ໜ້າ 1, ໜ້າຕໍ່ໄປຂໍ page=2", async () => {
    mockApi({ items, total: 65, page: 1, pageSize: 30 });
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=2&pageSize=30"));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("ໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ (ຂໍ້ມູນຫຼຸດ) → ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ", async () => {
    const empty: Page<ConversationDto> = { items: [], total: 30, page: 2, pageSize: 30 };
    vi.mocked(apiFetch).mockImplementation((async (url: string) =>
      url.includes("page=2") ? empty : { items, total: 90, page: 1, pageSize: 30 }) as typeof apiFetch);
    const { user } = renderWithProviders(<ConversationList selectedId={null} onSelect={() => undefined} />);
    await screen.findByTestId("conversation-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toBe("/conversations?status=OPEN&page=1&pageSize=30"));
  });
});
```


Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/conversation-list.test.tsx` → Expected: FAIL (component ບໍ່ມີ)

- [ ] **Step 4: component**

`apps/admin/src/components/inbox/conversation-list.tsx`:

```tsx
"use client";

import { CONVERSATION_STATUSES, type ConversationStatus } from "@oca/shared";
import { Avatar, Button, Card, EmptyState, Select, Skeleton, StatusPill, cn } from "@oca/ui";
import { AlertCircle, MessageSquare, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useConversations } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const PAGE_SIZE = 30;

export interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ConversationStatus | "">("OPEN");
  const [assignee, setAssignee] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  // ລ້າງຊ່ອງຄົ້ນຫາມີຜົນທັນທີ (ບໍ່ລໍ debounce)
  const q = trimmed === "" ? "" : debounced;

  // ປ່ຽນຄຳຄົ້ນຫາ (ຄ່າທີ່ debounce ແລ້ວ) ກັບໄປໜ້າ 1 ໃນ render ດຽວກັນ ຈຶ່ງບໍ່ມີ request (q ເກົ່າ, page ເກົ່າ)
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  const query = useConversations({
    status: status || undefined,
    assignee: assignee || undefined,
    unread: unreadOnly,
    q,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const busy = query.isPending || query.isPlaceholderData;
  // ຄ່າເລີ່ມຕົ້ນ status=OPEN ບໍ່ນັບເປັນ "ກອງ" ຈົນກວ່າຜູ້ໃຊ້ປ່ຽນ/ຄົ້ນຫາ ຈຶ່ງບໍ່ບອກວ່າ "ບໍ່ພົບ" ຕອນຍັງບໍ່ມີເຄສເລີຍ
  const filtered = q !== "" || assignee !== "" || unreadOnly || status !== "OPEN";
  const isEmpty = !busy && rows.length === 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / PAGE_SIZE)));
    }
  }, [query.data, query.isPlaceholderData, page, rows.length, total]);

  const reset = () => setPage(1);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("inbox.list.search")}
            aria-label={t("inbox.list.search")}
            className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label={t("inbox.filter.status")}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ConversationStatus | "");
              reset();
            }}
          >
            <option value="">{t("inbox.filter.allStatuses")}</option>
            {CONVERSATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`inbox.status.${value}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("inbox.filter.assignee")}
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value);
              reset();
            }}
          >
            <option value="">{t("inbox.assignee.all")}</option>
            <option value="me">{t("inbox.assignee.me")}</option>
            <option value="unassigned">{t("inbox.assignee.unassigned")}</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              reset();
            }}
          />
          {t("inbox.filter.unread")}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : query.isPending ? (
          <div className="space-y-2 p-3" aria-busy="true" aria-label={t("common.loading")}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={MessageSquare}
            title={filtered ? t("inbox.list.noResults") : t("inbox.list.empty")}
          />
        ) : (
          <ul aria-label={t("inbox.list.label")} aria-busy={busy}>
            {rows.map((conversation) => {
              const selected = conversation.id === selectedId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    data-testid={`conversation-${conversation.id}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-brand-soft",
                    )}
                  >
                    <Avatar name={conversation.displayName} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm text-ink", conversation.unreadCount > 0 ? "font-bold" : "font-medium")}>
                          {conversation.displayName}
                        </span>
                        <time dateTime={conversation.lastMessageAt} className="shrink-0 text-[11px] text-ink-muted">
                          {formatDateTime(conversation.lastMessageAt)}
                        </time>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-ink-secondary">
                          {conversation.lastMessagePreview ?? t("inbox.item.attachmentOnly")}
                        </span>
                        {conversation.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                            <span aria-hidden="true">{conversation.unreadCount}</span>
                            <span className="sr-only">{t("inbox.item.unread", { count: conversation.unreadCount })}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
                        <span>{conversation.assignee ? conversation.assignee.name : t("inbox.assignee.unassigned")}</span>
                        {conversation.status === "CLOSED" ? <StatusPill tone="neutral">{t("inbox.status.CLOSED")}</StatusPill> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!query.isError && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-secondary">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            {t("page.previous")}
          </Button>
          <span>{t("inbox.list.pageInfo", { page, pages })}</span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>
            {t("page.next")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
```


Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/conversation-list.test.tsx`
Expected: PASS ທຸກ test. ຖ້າ test "ໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ" ບໍ່ຕົງ ໃຫ້ກວດວ່າ mock ຕອບ `total` ທີ່ເຮັດໃຫ້ `pages` ຖືກຕ້ອງ.

- [ ] **Step 5: lint + typecheck + commit**

Run: `pnpm --filter @oca/admin lint && pnpm --filter @oca/admin typecheck`
Expected: ສະອາດ

```bash
git add apps/admin/src/lib/inbox.ts apps/admin/src/lib/inbox.test.ts apps/admin/src/components/inbox/conversation-list.tsx apps/admin/src/components/inbox/conversation-list.test.tsx
git commit -m "feat(admin): inbox conversation list (filters, search, unread, paging) and helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Admin: `MessageBubble`, `Composer`, `ThreadPane` (ຖັນກາງ)

**Files:**
- Create: `apps/admin/src/components/inbox/message-bubble.tsx`, `message-bubble.test.tsx`, `composer.tsx`, `composer.test.tsx`, `thread-pane.tsx`, `thread-pane.test.tsx` (ທັງໝົດໃນ `apps/admin/src/components/inbox/`)

- [ ] **Step 1: test ຂອງ `MessageBubble` (RED)**

`apps/admin/src/components/inbox/message-bubble.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { MessageBubble } from "./message-bubble";

const base: MessageDto = {
  id: "m1",
  direction: "IN",
  text: "ສະບາຍດີ\nມີສິນຄ້າບໍ",
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T05:30:00.000Z",
};
const renderBubble = (overrides: Partial<MessageDto> = {}) =>
  renderWithProviders(
    <ul>
      <MessageBubble message={{ ...base, ...overrides }} />
    </ul>,
  );

describe("MessageBubble", () => {
  it("ຂໍ້ຄວາມຂາເຂົ້າ: ຮັກສາຂຶ້ນແຖວໃໝ່, ເວລາລາວ, ມີຊື່ຜູ້ສົ່ງສຳລັບ screen reader", () => {
    renderBubble();
    const item = screen.getByTestId("message-m1");
    expect(within(item).getByText("Customer:")).toHaveClass("sr-only");
    const paragraph = within(item).getByText((content) => content.startsWith("ສະບາຍດີ"));
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    expect(paragraph.textContent).toBe("ສະບາຍດີ\nມີສິນຄ້າບໍ");
    expect(within(item).getByText("06/10/2026 12:30")).toBeInTheDocument();
  });

  it("ຂໍ້ຄວາມຂາອອກ: ສະແດງຜູ້ຕອບ", () => {
    renderBubble({ direction: "OUT", sentBy: { id: "u1", name: "Chat Admin" } });
    const item = screen.getByTestId("message-m1");
    expect(within(item).getByText("Store:")).toBeInTheDocument();
    expect(within(item).getByText("by Chat Admin")).toBeInTheDocument();
  });

  it("PENDING ສະແດງ 'Sending...'", () => {
    renderBubble({ direction: "OUT", status: "PENDING" });
    expect(screen.getByText("Sending...")).toBeInTheDocument();
  });

  it("FAILED ສະແດງເຫດຜົນເປັນຂໍ້ຄວາມ (ບໍ່ແມ່ນລະຫັດດິບ); errorCode ທີ່ບໍ່ຮູ້ຈັກ/ບໍ່ມີ ໃຊ້ UNKNOWN", () => {
    const { unmount } = renderBubble({ direction: "OUT", status: "FAILED", errorCode: "OUTSIDE_WINDOW" });
    expect(
      screen.getByText("Not delivered: More than 24 hours since the customer's last message; Meta does not allow a reply"),
    ).toBeInTheDocument();
    expect(screen.queryByText("OUTSIDE_WINDOW")).not.toBeInTheDocument();
    unmount();
    renderBubble({ direction: "OUT", status: "FAILED", errorCode: "SOMETHING_NEW" });
    expect(screen.getByText("Not delivered: Could not be sent (unknown reason)")).toBeInTheDocument();
  });

  it("ຮູບ https: ເປັນລິ້ງເປີດແຖບໃໝ່ (noopener, no-referrer) ພ້ອມ alt", () => {
    renderBubble({ text: null, attachments: [{ type: "image", url: "https://cdn.example/a.jpg" }] });
    const link = screen.getByRole("link", { name: "Image from the customer" });
    expect(link).toHaveAttribute("href", "https://cdn.example/a.jpg");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const image = within(link).getByRole("img", { name: "Image from the customer" });
    expect(image).toHaveAttribute("src", "https://cdn.example/a.jpg");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("ຮູບ http/javascript:/ບໍ່ມີ url ແລະ ໄຟລ໌ຊະນິດອື່ນ: ບໍ່ສ້າງລິ້ງ/ຮູບ ມີແຕ່ປ້າຍຊະນິດ", () => {
    renderBubble({
      text: null,
      attachments: [
        { type: "image", url: "http://cdn.example/a.jpg" },
        { type: "image", url: "javascript:alert(1)" },
        { type: "location", url: null },
        { type: "file", url: "https://cdn.example/doc.pdf" },
      ],
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("Attachment (image)")).toHaveLength(2);
    expect(screen.getByText("Attachment (location)")).toBeInTheDocument();
    expect(screen.getByText("Attachment (file)")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/message-bubble.test.tsx` → Expected: FAIL

- [ ] **Step 2: `MessageBubble`**

`apps/admin/src/components/inbox/message-bubble.tsx`:

```tsx
"use client";

import { cn } from "@oca/ui";
import { AlertCircle, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { isSafeAttachmentUrl, sendErrorKey } from "@/lib/inbox";
import type { MessageDto } from "@/lib/types";

export function MessageBubble({ message }: { message: MessageDto }) {
  const { t } = useT();
  const out = message.direction === "OUT";
  const failed = message.status === "FAILED";
  return (
    <li className={cn("flex", out ? "justify-end" : "justify-start")} data-testid={`message-${message.id}`}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[75%]",
          failed
            ? "border border-danger-line bg-danger-soft text-danger-ink"
            : out
              ? "bg-brand text-white"
              : "border border-line bg-surface text-ink",
        )}
      >
        <span className="sr-only">{t(`inbox.message.from.${message.direction}`)}:</span>
        {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
        {message.attachments.map((attachment, index) =>
          attachment.type === "image" && isSafeAttachmentUrl(attachment.url) ? (
            <a
              key={index}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              title={t("inbox.attachment.open")}
              className="mt-1 block"
            >
              {/* ຮູບຈາກ CDN ຂອງ Meta (ບໍ່ຜ່ານ next/image: URL ໝົດອາຍຸ ແລະ ບໍ່ຢູ່ໃນ remotePatterns) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={t("inbox.attachment.image")}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-h-60 rounded-lg"
              />
            </a>
          ) : (
            <p key={index} className="mt-1 text-xs opacity-80">
              {t("inbox.attachment.file", { type: attachment.type })}
            </p>
          ),
        )}
        <p className={cn("mt-1 flex flex-wrap items-center gap-x-2 text-[11px]", !failed && (out ? "text-white/80" : "text-ink-muted"))}>
          <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          {out && message.sentBy ? <span>{t("inbox.message.by", { name: message.sentBy.name })}</span> : null}
          {message.status === "PENDING" ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {t("inbox.message.pending")}
            </span>
          ) : null}
        </p>
        {failed ? (
          <p className="mt-1 flex items-start gap-1 text-xs font-semibold">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{`${t("inbox.message.failed")}: ${t(sendErrorKey(message.errorCode))}`}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}
```

ໝາຍເຫດ: ESLint ຂອງ admin ໃຊ້ `@oca/config/eslint` (typescript-eslint ເທົ່ານັ້ນ ບໍ່ມີ rule ຂອງ next) ຈຶ່ງ `eslint-disable-next-line @next/next/no-img-element` ອາດຖືກລາຍງານວ່າ "rule ບໍ່ມີ" ຫຼື "unused directive": ຖ້າ `pnpm --filter @oca/admin lint` ຮ້ອງ ໃຫ້ລຶບສອງແຖວ comment ນັ້ນ.

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/message-bubble.test.tsx` → Expected: PASS

- [ ] **Step 3: test ຂອງ `Composer` (RED)**

`apps/admin/src/components/inbox/composer.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { Composer } from "./composer";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const sent: MessageDto = {
  id: "m9",
  direction: "OUT",
  text: "hello",
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: { id: "u1", name: "Chat" },
  createdAt: "2026-10-06T05:30:00.000Z",
};
const LABEL = "Reply to the customer";
const box = () => screen.getByRole("textbox", { name: LABEL });
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(sent);
});

describe("Composer", () => {
  it("Enter ສົ່ງຂໍ້ຄວາມທີ່ trim ແລ້ວ ແລະ ລ້າງຊ່ອງພິມ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "  hello  {Enter}");
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual(["/conversations/c1/messages", { method: "POST", body: { text: "hello" } }]);
    await waitFor(() => expect(box()).toHaveValue(""));
  });

  it("ປຸ່ມ ສົ່ງ ກໍສົ່ງໄດ້; ຊ່ອງວ່າງ/ມີແຕ່ຍະຫວ່າງ ປຸ່ມຖືກປິດ ແລະ Enter ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    await user.type(box(), "   {Enter}");
    expect(posts()).toHaveLength(0);
    await user.clear(box());
    await user.type(box(), "hi");
    await user.click(button);
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("Shift+Enter ຂຶ້ນແຖວໃໝ່ ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "a{Shift>}{Enter}{/Shift}b");
    expect(posts()).toHaveLength(0);
    expect(box()).toHaveValue("a\nb");
  });

  it("Enter ຕອນກຳລັງ compose ດ້ວຍ IME (ລາວ/CJK) ບໍ່ສົ່ງ; Enter ປົກກະຕິຫຼັງຈາກນັ້ນສົ່ງ", async () => {
    renderWithProviders(<Composer conversationId="c1" canWrite />);
    fireEvent.change(box(), { target: { value: "ສະບາຍດີ" } });
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posts()).toHaveLength(0);
    fireEvent.keyDown(box(), { key: "Enter" });
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("ຍາວເກີນ 2000 ຕົວອັກສອນ: ສະແດງ error ແລະ ບໍ່ສົ່ງ", async () => {
    renderWithProviders(<Composer conversationId="c1" canWrite />);
    fireEvent.change(box(), { target: { value: "a".repeat(2001) } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("The message is longer than 2000 characters");
    expect(posts()).toHaveLength(0);
  });

  it("ຂະນະສົ່ງ: ຊ່ອງພິມ/ປຸ່ມຖືກລັອກ ແລະ ກົດຊ້ຳບໍ່ສົ່ງຊ້ຳ", async () => {
    let resolve: (message: MessageDto) => void = () => undefined;
    vi.mocked(apiFetch).mockImplementation((() => new Promise((r) => (resolve = r))) as typeof apiFetch);
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    await waitFor(() => expect(box()).toBeDisabled());
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    fireEvent.keyDown(box(), { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posts()).toHaveLength(1);
    resolve(sent);
    await waitFor(() => expect(box()).not.toBeDisabled());
    expect(box()).toHaveValue("");
  });

  it("ສົ່ງບໍ່ໄດ້ (201 ແຕ່ FAILED): ເກັບຂໍ້ຄວາມໄວ້ໃນຊ່ອງ ແລະ ບອກເຫດຜົນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...sent, status: "FAILED", errorCode: "OUTSIDE_WINDOW" });
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not delivered: More than 24 hours since the customer's last message; Meta does not allow a reply (your text is still in the box)",
    );
    expect(box()).toHaveValue("hello");
  });

  it("HTTP error: ສະແດງຂໍ້ຄວາມຈາກ code ແລະ ເກັບຂໍ້ຄວາມໄວ້; ສົ່ງໃໝ່ແລ້ວ error ຫາຍ", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(404, "Conversation not found", [], "CONVERSATION_NOT_FOUND"));
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation was not found");
    expect(box()).toHaveValue("hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("ບໍ່ມີສິດຕອບ (inbox:write): ບໍ່ມີຊ່ອງພິມ ມີແຕ່ຄຳອະທິບາຍ", () => {
    renderWithProviders(<Composer conversationId="c1" canWrite={false} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("You can view conversations but not reply")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/composer.test.tsx` → Expected: FAIL

- [ ] **Step 4: `Composer`**

`apps/admin/src/components/inbox/composer.tsx`:

```tsx
"use client";

import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { Button } from "@oca/ui";
import { Send } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { sendErrorKey } from "@/lib/inbox";
import { useSendMessage } from "@/lib/queries";

export function Composer({ conversationId, canWrite }: { conversationId: string; canWrite: boolean }) {
  const { t } = useT();
  const send = useSendMessage();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = send.isPending;
  const trimmed = text.trim();

  // ສົ່ງແລ້ວ (ຊ່ອງພິມຖືກປົດລັອກ) ໃຫ້ກັບມາ focus ທີ່ຊ່ອງພິມ ເພື່ອພິມຕໍ່ໄດ້ທັນທີ
  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus();
    wasPending.current = pending;
  }, [pending]);

  async function submit() {
    if (!canWrite || pending || trimmed === "") return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(t("inbox.composer.tooLong", { max: MAX_MESSAGE_LENGTH }));
      return;
    }
    setError(null);
    try {
      const message = await send.mutateAsync({ id: conversationId, input: { text: trimmed } });
      // API ບັນທຶກແຖວ FAILED ແລ້ວ (ຢູ່ໃນ thread) ແຕ່ຄືນ 201: ເກັບຂໍ້ຄວາມໃນຊ່ອງໄວ້ໃຫ້ແກ້/ສົ່ງໃໝ່
      if (message.status === "FAILED") {
        setError(t("inbox.composer.failedKept", { reason: t(sendErrorKey(message.errorCode)) }));
      } else {
        setText("");
      }
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // ກຳລັງ compose ດ້ວຍ IME (ລາວ/CJK): Enter ເປັນຂອງ IME (keyCode 229 ສຳລັບ Safari)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  if (!canWrite) {
    return <p className="border-t border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">{t("inbox.composer.readOnly")}</p>;
  }

  return (
    <form
      className="border-t border-line bg-surface p-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <p role="alert" className="mb-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          aria-label={t("inbox.composer.label")}
          placeholder={t("inbox.composer.placeholder")}
          rows={2}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-[3.25rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        />
        <Button type="submit" className="h-10 rounded-xl px-4" disabled={trimmed === ""} loading={pending}>
          {pending ? null : <Send aria-hidden="true" />}
          {pending ? t("inbox.composer.sending") : t("inbox.composer.send")}
        </Button>
      </div>
    </form>
  );
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/composer.test.tsx`
Expected: PASS. ຖ້າ test "Enter ຕອນ IME" ລົ້ມເພາະ `fireEvent.keyDown` ບໍ່ຕັ້ງ `isComposing` ໃຫ້ກວດວ່າ `event.nativeEvent.isComposing` ຖືກຕັ້ງ (jsdom ຮອງຮັບ `isComposing` ໃນ KeyboardEventInit); ຖ້າບໍ່ ໃຫ້ໃຊ້ `keyCode: 229` ອີກແບບ (ຕາມທີ່ຂຽນໄວ້ໃນ test ແລ້ວ).

- [ ] **Step 5: test ຂອງ `ThreadPane` (RED)**

`apps/admin/src/components/inbox/thread-pane.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto, MessageDto, MessagePage } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ThreadPane } from "./thread-pane";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 3,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: "m3",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const message = (id: string, minute: number, overrides: Partial<MessageDto> = {}): MessageDto => ({
  id,
  direction: "IN",
  text: id,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: `2026-10-06T05:${String(minute).padStart(2, "0")}:00.000Z`,
  ...overrides,
});

interface Setup {
  conversation?: ConversationDto;
  /** ໃໝ່ສຸດກ່ອນ ຕາມ API */
  pages?: MessagePage[];
}
function mockApi({ conversation: conv = conversation, pages = [{ items: [message("m3", 30), message("m2", 20), message("m1", 10)], hasMore: false }] }: Setup = {}) {
  const queue = [...pages];
  vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
    if (url === "/conversations/c1") return conv;
    if (url === "/conversations/c1/read") return { ...conv, unreadCount: 0 };
    if (url.startsWith("/conversations/c1/messages") && init?.method === "POST") return message("sent", 40, { direction: "OUT" });
    if (url.startsWith("/conversations/c1/messages")) return queue.shift() ?? { items: [], hasMore: false };
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
}
const calls = (predicate: (url: string, method?: string) => boolean) =>
  vi.mocked(apiFetch).mock.calls.filter((call) => predicate(call[0], call[1]?.method));
const reads = () => calls((url, method) => url === "/conversations/c1/read" && method === "POST");

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ThreadPane", () => {
  it("header ສະແດງຊື່ ແລະ ຊ່ອງທາງ; ຂໍ້ຄວາມລຽງເກົ່າ→ໃໝ່ (API ສົ່ງໃໝ່ສຸດກ່ອນ)", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByRole("heading", { name: "Somchai Vong" })).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Conversation messages" });
    await within(region).findByTestId("message-m1");
    const order = within(region)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-testid"));
    expect(order).toEqual(["message-m1", "message-m2", "message-m3"]);
  });

  it("ໝາຍອ່ານແລ້ວຄັ້ງດຽວເມື່ອ unread > 0 ແລະ ມີສິດຂຽນ", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await waitFor(() => expect(reads()).toHaveLength(1));
    // refetch ຫຼັງ invalidate ຍັງໄດ້ unread ເທົ່າເກົ່າ (mock): ບໍ່ວົນຍິງຊ້ຳ
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reads()).toHaveLength(1);
  });

  it("ບໍ່ໝາຍອ່ານເມື່ອບໍ່ມີສິດຂຽນ ຫຼື unread = 0", async () => {
    const { unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    await screen.findByTestId("message-m1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toHaveLength(0);
    unmount();
    mockApi({ conversation: { ...conversation, unreadCount: 0 } });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads()).toHaveLength(0);
  });

  it("'Load older' ຂຶ້ນເມື່ອ hasMore ແລະ ໂຫຼດດ້ວຍ beforeId = ຂໍ້ຄວາມເກົ່າສຸດທີ່ມີ; ເກົ່າກວ່າຖືກວາງຂ້າງເທິງ", async () => {
    mockApi({
      pages: [
        { items: [message("m3", 30), message("m2", 20)], hasMore: true },
        { items: [message("m1", 10)], hasMore: false },
      ],
    });
    const { user } = renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m2");
    await user.click(screen.getByRole("button", { name: "Load older messages" }));
    await screen.findByTestId("message-m1");
    expect(calls((url) => url.startsWith("/conversations/c1/messages?")).map((call) => call[0])).toEqual([
      "/conversations/c1/messages?limit=30",
      "/conversations/c1/messages?limit=30&beforeId=m2",
    ]);
    const ids = screen.getAllByRole("listitem").map((item) => item.getAttribute("data-testid"));
    expect(ids).toEqual(["message-m1", "message-m2", "message-m3"]);
    expect(screen.queryByRole("button", { name: "Load older messages" })).not.toBeInTheDocument();
  });

  it("ບໍ່ມີຂໍ້ຄວາມ: ສະແດງ 'No messages yet'", async () => {
    mockApi({ pages: [{ items: [], hasMore: false }] });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
  });

  it("ໂຫຼດຂໍ້ຄວາມບໍ່ສຳເລັດ: ສະແດງ error + ລອງໃໝ່; ໂຫຼດເຄສບໍ່ສຳເລັດ (ເຊັ່ນ 404): ບອກເຫດຜົນຕາມ code", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === "/conversations/c1") return conversation;
      throw new ApiError(500, "boom");
    }) as typeof apiFetch);
    const { user, unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    mockApi();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("message-m1")).toBeInTheDocument();
    unmount();

    vi.mocked(apiFetch).mockImplementation((async () => {
      throw new ApiError(404, "nf", [], "CONVERSATION_NOT_FOUND");
    }) as typeof apiFetch);
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("This conversation was not found")).toBeInTheDocument();
  });

  it("ປຸ່ມກັບລາຍການ/ລາຍລະອຽດ ມີສະເພາະເມື່ອສົ່ງ callback ມາ", async () => {
    const onBack = vi.fn();
    const onShowDetails = vi.fn();
    const { user } = renderWithProviders(<ThreadPane conversationId="c1" canWrite onBack={onBack} onShowDetails={onShowDetails} />);
    await screen.findByTestId("message-m1");
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });

  it("ບໍ່ສົ່ງ callback = ບໍ່ມີປຸ່ມ", async () => {
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    expect(screen.queryByRole("button", { name: "Back to list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
  });

  it("ມີ composer ທີ່ສົ່ງໄປຍັງເຄສນີ້; ບໍ່ມີສິດ = ຄຳອະທິບາຍ", async () => {
    const { user, unmount } = renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    await screen.findByTestId("message-m1");
    await user.type(screen.getByRole("textbox", { name: "Reply to the customer" }), "ok{Enter}");
    await waitFor(() =>
      expect(calls((url, method) => url === "/conversations/c1/messages" && method === "POST")).toHaveLength(1),
    );
    unmount();
    renderWithProviders(<ThreadPane conversationId="c1" canWrite={false} />);
    expect(await screen.findByText("You can view conversations but not reply")).toBeInTheDocument();
  });

  it("ເຄສທີ່ປິດແລ້ວສະແດງປ້າຍ Closed", async () => {
    mockApi({ conversation: { ...conversation, status: "CLOSED", unreadCount: 0 } });
    renderWithProviders(<ThreadPane conversationId="c1" canWrite />);
    expect(await screen.findByText("Closed")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/thread-pane.test.tsx` → Expected: FAIL

- [ ] **Step 6: `ThreadPane`**

`apps/admin/src/components/inbox/thread-pane.tsx`:

```tsx
"use client";

import { Avatar, Button, Card, EmptyState, Skeleton, StatusPill } from "@oca/ui";
import { AlertCircle, ArrowLeft, MessageSquare, PanelRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useConversation, useMarkConversationRead, useMessages } from "@/lib/queries";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

export interface ThreadPaneProps {
  conversationId: string;
  canWrite: boolean;
  /** ມີເມື່ອຈໍແຄບ (ກັບໄປລາຍການ) */
  onBack?: () => void;
  /** ມີເມື່ອບໍ່ມີຖັນລາຍລະອຽດ (ຈໍແຄບ) */
  onShowDetails?: () => void;
}

/** ໃກ້ທ້າຍພຽງໃດຖືວ່າ "ຢູ່ລຸ່ມສຸດ" (px) ເພື່ອເລື່ອນຕາມຂໍ້ຄວາມໃໝ່ */
const STICK_THRESHOLD = 80;

export function ThreadPane({ conversationId, canWrite, onBack, onShowDetails }: ThreadPaneProps) {
  const { t } = useT();
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const { mutate: markRead } = useMarkConversationRead();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // API ສົ່ງໃໝ່ສຸດກ່ອນ (ໜ້າທຳອິດ = ໃໝ່ສຸດ, ໜ້າຕໍ່ໄປ = ເກົ່າກວ່າ) → ກັບດ້ານເພື່ອສະແດງເກົ່າ→ໃໝ່
  const items = useMemo(() => [...(messages.data?.pages.flatMap((page) => page.items) ?? [])].reverse(), [messages.data]);

  // ເປີດເຄສທີ່ມີ unread (ແລະ ມີຂໍ້ຄວາມໃໝ່ເຂົ້າຕອນເປີດຢູ່) → ໝາຍອ່ານ. deps ມີ unread ເພື່ອບໍ່ວົນເມື່ອ request ລົ້ມ
  const unread = conversation.data?.unreadCount ?? 0;
  useEffect(() => {
    if (canWrite && unread > 0 && document.visibilityState === "visible") markRead(conversationId);
  }, [canWrite, unread, conversationId, markRead]);

  // ເລື່ອນລົງລຸ່ມສຸດເມື່ອມີຂໍ້ຄວາມເພີ່ມ ຖ້າຜູ້ໃຊ້ຢູ່ໃກ້ລຸ່ມສຸດ (ຫຼື ເປີດໃໝ່)
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [items.length]);

  function onScroll() {
    const element = scrollRef.current;
    if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD;
  }

  if (conversation.isError) {
    return (
      <Card className="flex h-full items-center justify-center rounded-[20px]">
        <EmptyState
          icon={AlertCircle}
          title={errorMessage(conversation.error, t)}
          action={
            <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void conversation.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </Card>
    );
  }

  const data = conversation.data;
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
        {onBack ? (
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("inbox.thread.back")} onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : null}
        {data ? (
          <>
            <Avatar name={data.displayName} className="size-9" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-ink">{data.displayName}</h2>
              <p className="text-xs text-ink-secondary">{t(`orders.channel.${data.channel}`)}</p>
            </div>
            {data.status === "CLOSED" ? <StatusPill tone="neutral">{t("inbox.status.CLOSED")}</StatusPill> : null}
          </>
        ) : (
          <Skeleton className="h-9 w-48" />
        )}
        {onShowDetails ? (
          <Button variant="outline" size="sm" className="ml-auto xl:hidden" onClick={onShowDetails}>
            <PanelRight aria-hidden="true" />
            {t("inbox.thread.details")}
          </Button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="region"
        aria-label={t("inbox.thread.label")}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto bg-app px-3 py-4 sm:px-4"
      >
        {messages.isError ? (
          <EmptyState
            icon={AlertCircle}
            title={t("common.error.load")}
            action={
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void messages.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : messages.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label={t("common.loading")}>
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={MessageSquare} title={t("inbox.thread.empty")} />
        ) : (
          <>
            {messages.hasNextPage ? (
              <div className="mb-3 flex justify-center">
                <Button variant="outline" size="sm" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
                  {messages.isFetchingNextPage ? t("inbox.thread.loadingOlder") : t("inbox.thread.loadOlder")}
                </Button>
              </div>
            ) : null}
            <ul className="space-y-2">
              {items.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          </>
        )}
      </div>

      <Composer conversationId={conversationId} canWrite={canWrite} />
    </Card>
  );
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox`
Expected: PASS ທຸກ test ຂອງ message-bubble/composer/thread-pane/conversation-list. ຖ້າ test "ໂຫຼດຂໍ້ຄວາມບໍ່ສຳເລັດ" ມີ error ຈາກ `GET /conversations/c1/read` ທີ່ throw "unexpected" ກໍເປັນຕາມ mock; ຕ້ອງໃຫ້ mock ຕອບທຸກ URL ທີ່ເອີ້ນ.

- [ ] **Step 7: lint + typecheck + commit**

Run: `pnpm --filter @oca/admin lint && pnpm --filter @oca/admin typecheck`

```bash
git add apps/admin/src/components/inbox/message-bubble.tsx apps/admin/src/components/inbox/message-bubble.test.tsx apps/admin/src/components/inbox/composer.tsx apps/admin/src/components/inbox/composer.test.tsx apps/admin/src/components/inbox/thread-pane.tsx apps/admin/src/components/inbox/thread-pane.test.tsx
git commit -m "feat(admin): inbox thread pane (messages, load older, mark read, composer with IME-safe Enter)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admin: `SidePanel` + `CreateCustomerDialog` (ຖັນຂວາ)

**Files:**
- Create: `apps/admin/src/components/inbox/create-customer-dialog.tsx`, `create-customer-dialog.test.tsx`, `side-panel.tsx`, `side-panel.test.tsx` (ໃນ `apps/admin/src/components/inbox/`)

- [ ] **Step 1: test ຂອງ `CreateCustomerDialog` (RED)**

`apps/admin/src/components/inbox/create-customer-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CreateCustomerDialog } from "./create-customer-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: null,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");

function open(onOpenChange = vi.fn()) {
  const result = renderWithProviders(<CreateCustomerDialog open onOpenChange={onOpenChange} conversation={conversation} />);
  return { ...result, onOpenChange };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ ...conversation, customer: { id: "cu1", name: "Somchai Vong", phone: null } });
});

describe("CreateCustomerDialog", () => {
  it("ຊື່ເລີ່ມຕົ້ນ = ຊື່ໃນແຊັດ; ສົ່ງ name (ບໍ່ມີ phone ເມື່ອວ່າງ) ແລ້ວປິດ", async () => {
    const { user, onOpenChange } = open();
    expect(screen.getByLabelText(/Customer name/)).toHaveValue("Somchai Vong");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual(["/conversations/c1/customer", { method: "POST", body: { name: "Somchai Vong" } }]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ສົ່ງ phone ທີ່ trim ແລ້ວເມື່ອໃສ່", async () => {
    const { user } = open();
    await user.clear(screen.getByLabelText(/Customer name/));
    await user.type(screen.getByLabelText(/Customer name/), "  Dala  ");
    await user.type(screen.getByLabelText("Phone"), " +8562055550000 ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.[1]).toEqual({ method: "POST", body: { name: "Dala", phone: "+8562055550000" } });
  });

  it("ຊື່ວ່າງ / ເບີໂທຜິດ: ສະແດງ error ຂອງ field ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = open();
    await user.clear(screen.getByLabelText(/Customer name/));
    await user.type(screen.getByLabelText("Phone"), "12ab");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("Invalid phone (6-15 digits, optional leading +)")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("ເບີຊ້ຳ (409 DUPLICATE_VALUE): ສະແດງ error ໃນ dialog ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const { user, onOpenChange } = open();
    await user.type(screen.getByLabelText("Phone"), "020999999");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Cancel ປິດ dialog ໂດຍບໍ່ສົ່ງ", async () => {
    const { user, onOpenChange } = open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(posts()).toHaveLength(0);
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/create-customer-dialog.test.tsx` → Expected: FAIL

- [ ] **Step 2: `CreateCustomerDialog`**

`apps/admin/src/components/inbox/create-customer-dialog.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createCustomerFromChatSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateCustomerFromChat } from "@/lib/queries";
import type { ConversationDto } from "@/lib/types";

const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;

/** ຟອມໃຊ້ສະຕຣິງລ້ວນ (phone ເປົ່າໄດ້); ແປງເປັນ payload ຂອງ API ຕອນ submit */
const formSchema = z.object({
  name: createCustomerFromChatSchema.shape.name,
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || PHONE_PATTERN.test(value)),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationDto;
}

export function CreateCustomerDialog({ open, onOpenChange, conversation }: CreateCustomerDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        <CustomerForm conversation={conversation} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ conversation, onDone }: { conversation: ConversationDto; onDone: () => void }) {
  const { t } = useT();
  const create = useCreateCustomerFromChat();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: conversation.displayName, phone: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        id: conversation.id,
        input: { name: values.name, ...(values.phone ? { phone: values.phone } : {}) },
      });
      toast.success(t("inbox.customerDialog.created"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  const nameError = errors.name ? (errors.name.type === "too_big" ? t("validation.tooLong", { max: 100 }) : t("validation.required")) : undefined;
  const phoneError = errors.phone ? t("inbox.customerDialog.phoneInvalid") : undefined;

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("inbox.customerDialog.title")} description={t("inbox.customerDialog.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <Field label={t("orders.customer.name")} htmlFor="inbox-customer-name" required error={nameError}>
          <Input id="inbox-customer-name" invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label={t("orders.customer.phone")} htmlFor="inbox-customer-phone" error={phoneError}>
          <Input id="inbox-customer-phone" inputMode="tel" invalid={!!errors.phone} aria-describedby="inbox-customer-phone-hint" {...register("phone")} />
          <p id="inbox-customer-phone-hint" className="mt-1 text-xs text-ink-muted">
            {t("inbox.customerDialog.phoneHint")}
          </p>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/create-customer-dialog.test.tsx` → Expected: PASS

- [ ] **Step 3: test ຂອງ `SidePanel` (RED)**

`apps/admin/src/components/inbox/side-panel.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { clearToasts, getToasts } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SidePanel } from "./side-panel";

const auth = vi.hoisted(() => ({ canReadOrders: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "orders:read" ? auth.canReadOrders : true),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const assignees = [
  { id: "u1", name: "Chat Admin" },
  { id: "u2", name: "Manager" },
];
const patches = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "PATCH");

beforeEach(() => {
  auth.canReadOrders = true;
  clearToasts();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
    if (url === "/inbox/assignees") return assignees;
    if (url.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (init?.method === "PATCH") return conversation;
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("SidePanel", () => {
  it("ສະແດງຊ່ອງທາງ, ລູກຄ້າ (ຊື່ + ເບີ) ແລະ ຖອນການລິ້ງໄດ້", async () => {
    const { user } = renderWithProviders(
      <SidePanel conversation={{ ...conversation, customer: { id: "cu1", name: "Dala", phone: "020111111" } }} canWrite />,
    );
    expect(screen.getByRole("heading", { name: "Conversation details" })).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("Dala")).toBeInTheDocument();
    expect(screen.getByText("020111111")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual(["/conversations/c1", { method: "PATCH", body: { customerId: null } }]);
    await waitFor(() => expect(getToasts().map((item) => item.title)).toContain("Conversation updated"));
  });

  it("ຍັງບໍ່ລິ້ງລູກຄ້າ: ມີຄຳບອກ, ຄົ້ນຫາລູກຄ້າທີ່ມີ (ເມື່ອມີ orders:read) ແລະ ປຸ່ມສ້າງໃໝ່ ທີ່ເປີດ dialog", async () => {
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(screen.getByText("Not linked to a customer yet")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search name or phone" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByRole("dialog", { name: "Create customer from conversation" })).toBeInTheDocument();
  });

  it("ບໍ່ມີ orders:read: ບໍ່ມີຕົວຄົ້ນຫາລູກຄ້າທີ່ມີ (ຍັງສ້າງໃໝ່ໄດ້)", () => {
    auth.canReadOrders = false;
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create customer" })).toBeInTheDocument();
  });

  it("ເລືອກລູກຄ້າທີ່ມີ → PATCH customerId", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (url.startsWith("/customers")) return { items: [{ id: "cu9", name: "Dala", phone: "020111111", email: null }], total: 1, page: 1, pageSize: 8 };
      if (init?.method === "PATCH") return conversation;
      throw new Error(`unexpected ${url}`);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await user.type(screen.getByRole("combobox", { name: "Search name or phone" }), "dal");
    await user.click(await screen.findByRole("option", { name: /Dala/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { customerId: "cu9" } });
  });

  it("ຜູ້ຮັບຜິດຊອບ: ຕົວເລືອກມາຈາກ /inbox/assignees; ປ່ຽນ → PATCH assigneeId; ເລືອກ 'Unassigned' → null", async () => {
    const first = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    await first.user.selectOptions(select, "u2");
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { assigneeId: "u2" } });
    first.unmount();

    // render ໃໝ່ (ບໍ່ໃຊ້ rerender: ຈະເສຍ providers)
    const second = renderWithProviders(<SidePanel conversation={{ ...conversation, assignee: { id: "u2", name: "Manager" } }} canWrite />);
    await second.user.selectOptions(await screen.findByRole("combobox", { name: "Assignee" }), "");
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]?.[1]).toEqual({ method: "PATCH", body: { assigneeId: null } });
  });

  it("ຜູ້ຮັບທີ່ບໍ່ຢູ່ໃນລາຍຊື່ (ເຊັ່ນ ຖືກປິດໃຊ້ງານ) ຍັງສະແດງເປັນຕົວເລືອກປັດຈຸບັນ", async () => {
    renderWithProviders(<SidePanel conversation={{ ...conversation, assignee: { id: "gone", name: "Former Staff" } }} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    expect(select).toHaveValue("gone");
    expect(within(select).getByRole("option", { name: "Former Staff" })).toBeInTheDocument();
  });

  it("ປິດເຄສ / ເປີດຄືນ → PATCH status", async () => {
    const first = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await first.user.click(screen.getByRole("button", { name: "Close conversation" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { status: "CLOSED" } });
    first.unmount();

    const second = renderWithProviders(<SidePanel conversation={{ ...conversation, status: "CLOSED" }} canWrite />);
    await second.user.click(screen.getByRole("button", { name: "Reopen conversation" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]?.[1]).toEqual({ method: "PATCH", body: { status: "OPEN" } });
  });

  it("ບໍ່ມີສິດຂຽນ: ຄວບຄຸມທຸກຢ່າງຖືກປິດ/ຊ່ອນ", () => {
    renderWithProviders(
      <SidePanel conversation={{ ...conversation, customer: { id: "cu1", name: "Dala", phone: null } }} canWrite={false} />,
    );
    expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Unlink" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create customer" })).not.toBeInTheDocument();
  });

  it("ບັນທຶກບໍ່ສຳເລັດ: toast error ຕາມ code", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (init?.method === "PATCH") throw new ApiError(404, "nf", [], "USER_NOT_FOUND");
      return { items: [], total: 0, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Assignee" }), "u1");
    await waitFor(() =>
      expect(getToasts().some((item) => item.variant === "error" && item.title === "This user was not found or is deactivated")).toBe(true),
    );
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/side-panel.test.tsx` → Expected: FAIL

- [ ] **Step 4: `SidePanel`**

`apps/admin/src/components/inbox/side-panel.tsx`:

```tsx
"use client";

import type { UpdateConversationInput } from "@oca/shared";
import { Button, Card, Select, toast } from "@oca/ui";
import { Lock, LockOpen, Unlink, UserPlus } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { CustomerPicker } from "@/components/orders/customer-picker";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useAssignees, useUpdateConversation } from "@/lib/queries";
import type { ConversationDto } from "@/lib/types";
import { CreateCustomerDialog } from "./create-customer-dialog";

export interface SidePanelProps {
  conversation: ConversationDto;
  canWrite: boolean;
}

export function SidePanel({ conversation, canWrite }: SidePanelProps) {
  const { t } = useT();
  // CustomerPicker ຄົ້ນລູກຄ້າຜ່ານ GET /customers ທີ່ຕ້ອງ orders:read
  const canLinkExisting = useCan("orders:read");
  const update = useUpdateConversation();
  const assignees = useAssignees();
  const [createOpen, setCreateOpen] = useState(false);
  const busy = update.isPending;
  const current = conversation.assignee;
  const options = assignees.data ?? [];

  async function apply(input: UpdateConversationInput) {
    try {
      await update.mutateAsync({ id: conversation.id, input });
      toast.success(t("inbox.toast.updated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  return (
    <Card className="h-full space-y-5 overflow-y-auto rounded-[20px] p-4">
      <h2 className="text-sm font-bold text-ink">{t("inbox.panel.title")}</h2>

      <section aria-label={t("inbox.panel.channel")}>
        <h3 className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.channel")}</h3>
        <p className="mt-1 text-sm text-ink">{t(`orders.channel.${conversation.channel}`)}</p>
      </section>

      <section aria-label={t("inbox.panel.customer")} className="space-y-2">
        <h3 className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.customer")}</h3>
        {conversation.customer ? (
          <div className="flex items-start justify-between gap-2 rounded-xl border border-line bg-subtle px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{conversation.customer.name}</p>
              {conversation.customer.phone ? <p className="text-xs text-ink-secondary">{conversation.customer.phone}</p> : null}
            </div>
            {canWrite ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void apply({ customerId: null })}>
                <Unlink aria-hidden="true" />
                {t("inbox.panel.unlink")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{t("inbox.panel.noCustomer")}</p>
            {canWrite && canLinkExisting ? (
              <CustomerPicker
                value={null}
                disabled={busy}
                onSelect={(customer) => {
                  if (customer) void apply({ customerId: customer.id });
                }}
              />
            ) : null}
            {canWrite ? (
              <Button variant="outlinePrimary" className="w-full rounded-lg" disabled={busy} onClick={() => setCreateOpen(true)}>
                <UserPlus aria-hidden="true" />
                {t("inbox.panel.createCustomer")}
              </Button>
            ) : null}
          </>
        )}
      </section>

      <section aria-label={t("inbox.panel.assignee")} className="space-y-2">
        <label htmlFor="inbox-assignee" className="text-xs font-semibold text-ink-secondary">
          {t("inbox.panel.assignee")}
        </label>
        <Select
          id="inbox-assignee"
          value={current?.id ?? ""}
          disabled={!canWrite || busy}
          onChange={(event) => void apply({ assigneeId: event.target.value || null })}
        >
          <option value="">{t("inbox.assignee.unassigned")}</option>
          {/* ຜູ້ຮັບປັດຈຸບັນທີ່ບໍ່ຢູ່ໃນລາຍຊື່ (ເຊັ່ນ ຖືກປິດໃຊ້ງານ) ຍັງຕ້ອງສະແດງ ບໍ່ຢ່າງນັ້ນ select ຈະເບິ່ງຄືບໍ່ມີຄົນຮັບ */}
          {current && !options.some((option) => option.id === current.id) ? <option value={current.id}>{current.name}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </section>

      <section aria-label={t("inbox.panel.status")} className="space-y-2">
        <h3 className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.status")}</h3>
        <p className="text-sm text-ink">{t(`inbox.status.${conversation.status}`)}</p>
        {canWrite ? (
          conversation.status === "OPEN" ? (
            <Button variant="outline" className="w-full rounded-lg" disabled={busy} onClick={() => void apply({ status: "CLOSED" })}>
              <Lock aria-hidden="true" />
              {t("inbox.panel.close")}
            </Button>
          ) : (
            <Button variant="outline" className="w-full rounded-lg" disabled={busy} onClick={() => void apply({ status: "OPEN" })}>
              <LockOpen aria-hidden="true" />
              {t("inbox.panel.reopen")}
            </Button>
          )
        ) : null}
      </section>

      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} conversation={conversation} />
    </Card>
  );
}
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox`
Expected: PASS ທັງໝົດຂອງໂຟລເດີ. ຖ້າ test ຊື່ combobox ຂອງ Assignee ບໍ່ເຫັນ (ຍ້ອນ `<Select>` ເປັນ `combobox` role ຂອງ `<select>`) ກໍປົກກະຕິ; ຖ້າ `getByRole("combobox",{name:"Assignee"})` ພົບສອງອັນ (CustomerPicker ກໍເປັນ combobox) ຊື່ຕ່າງກັນ ຈຶ່ງບໍ່ຊ້ຳ.

- [ ] **Step 5: lint + typecheck + commit**

Run: `pnpm --filter @oca/admin lint && pnpm --filter @oca/admin typecheck`

```bash
git add apps/admin/src/components/inbox/create-customer-dialog.tsx apps/admin/src/components/inbox/create-customer-dialog.test.tsx apps/admin/src/components/inbox/side-panel.tsx apps/admin/src/components/inbox/side-panel.test.tsx
git commit -m "feat(admin): inbox side panel (assignee, close/reopen, link or create customer)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin: `InboxPage` + route `/inbox`

**Files:**
- Create: `apps/admin/src/components/inbox/inbox-page.tsx`, `inbox-page.test.tsx`, `apps/admin/src/app/(app)/inbox/page.tsx`

ກ່ອນເລີ່ມ: ອ່ານ `apps/admin/node_modules/next/dist/docs/` ສ່ວນ App Router (page, `searchParams`) ແລະ ປຽບທຽບກັບ `apps/admin/src/app/(app)/orders/page.tsx`; ເຮັດ route ຕາມແບບດຽວກັນ.

- [ ] **Step 1: test ຂອງ `InboxPage` (RED)**

`apps/admin/src/components/inbox/inbox-page.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { StreamStatus } from "@/lib/inbox-stream";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { InboxPage } from "./inbox-page";

const state = vi.hoisted(() => ({ canWrite: true, status: "connected" as StreamStatus }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "inbox:write" ? state.canWrite : true),
}));
vi.mock("@/lib/use-inbox-realtime", () => ({ useInboxRealtime: () => state.status }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const make = (id: string, name: string): ConversationDto => ({
  id,
  channel: "FACEBOOK",
  displayName: name,
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: `hello from ${name}`,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
});
const conversations = [make("c1", "Somchai"), make("c2", "Dala")];
const message = (conversationId: string): MessageDto => ({
  id: `m-${conversationId}`,
  direction: "IN",
  text: `text of ${conversationId}`,
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T05:30:00.000Z",
});

beforeEach(() => {
  state.canWrite = true;
  state.status = "connected";
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url.startsWith("/conversations?")) return { items: conversations, total: 2, page: 1, pageSize: 30 };
    if (url === "/inbox/assignees") return [];
    const detail = /^\/conversations\/(c\d)$/.exec(url);
    if (detail) return conversations.find((c) => c.id === detail[1]);
    const messages = /^\/conversations\/(c\d)\/messages/.exec(url);
    if (messages) return { items: [message(messages[1] as string)], hasMore: false };
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("InboxPage", () => {
  it("ບໍ່ເລືອກເຄສ: ສະແດງລາຍການ + ຄຳເຊີນໃຫ້ເລືອກ; ປ້າຍການເຊື່ອມຕໍ່ສົດ", async () => {
    renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(await screen.findByTestId("conversation-c1")).toBeInTheDocument();
    expect(screen.getByText("Select a conversation from the list to start")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Live");
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
  });

  it("ປ້າຍການເຊື່ອມຕໍ່ປ່ຽນຕາມສະຖານະ (connecting / reconnecting)", () => {
    state.status = "reconnecting";
    const { unmount } = renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Connection lost, retrying");
    unmount();
    state.status = "connecting";
    renderWithProviders(<InboxPage initialConversationId={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Connecting...");
  });

  it("ເລືອກເຄສຈາກລາຍການ → ເປີດ thread ແລະ ລາຍລະອຽດ; ເລືອກອັນອື່ນ → ປ່ຽນ thread", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId={null} />);
    await user.click(await screen.findByTestId("conversation-c1"));
    const region = await screen.findByRole("region", { name: "Conversation messages" });
    expect(await within(region).findByText("text of c1")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Conversation details" }).length).toBeGreaterThan(0);
    await user.click(screen.getByTestId("conversation-c2"));
    expect(await within(screen.getByRole("region", { name: "Conversation messages" })).findByText("text of c2")).toBeInTheDocument();
    expect(screen.queryByText("text of c1")).not.toBeInTheDocument();
  });

  it("initialConversationId (ຈາກ ?c=) ເປີດ thread ທັນທີ", async () => {
    renderWithProviders(<InboxPage initialConversationId="c2" />);
    const region = await screen.findByRole("region", { name: "Conversation messages" });
    expect(await within(region).findByText("text of c2")).toBeInTheDocument();
    expect(screen.queryByText("Select a conversation from the list to start")).not.toBeInTheDocument();
  });

  it("ປຸ່ມ 'Back to list' ເຮັດໃຫ້ກັບໄປສະຖານະບໍ່ເລືອກ", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("region", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    expect(await screen.findByText("Select a conversation from the list to start")).toBeInTheDocument();
  });

  it("ປຸ່ມ Details ເປີດ dialog ລາຍລະອຽດ (ສຳລັບຈໍແຄບ)", async () => {
    const { user } = renderWithProviders(<InboxPage initialConversationId="c1" />);
    await screen.findByRole("region", { name: "Conversation messages" });
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Conversation details" })).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດຂຽນ: ໃຊ້ໄດ້ແບບອ່ານຢ່າງດຽວ (composer ເປັນຄຳອະທິບາຍ)", async () => {
    state.canWrite = false;
    renderWithProviders(<InboxPage initialConversationId="c1" />);
    expect(await screen.findByText("You can view conversations but not reply")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Reply to the customer" })).not.toBeInTheDocument());
  });
});
```

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox/inbox-page.test.tsx` → Expected: FAIL

- [ ] **Step 2: `InboxPage`**

`apps/admin/src/components/inbox/inbox-page.tsx`:

```tsx
"use client";

import { Dialog, DialogBody, DialogContent, DialogHeader, EmptyState, PageHeader, StatusPill, cn } from "@oca/ui";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import type { StreamStatus } from "@/lib/inbox-stream";
import { useConversation } from "@/lib/queries";
import { useInboxRealtime } from "@/lib/use-inbox-realtime";
import { ConversationList } from "./conversation-list";
import { SidePanel } from "./side-panel";
import { ThreadPane } from "./thread-pane";

const STATUS_TONE: Record<StreamStatus, "success" | "neutral" | "warning"> = {
  connected: "success",
  connecting: "neutral",
  reconnecting: "warning",
};

/**
 * 3 ຖັນ (ລາຍການ | ຂໍ້ຄວາມ | ລາຍລະອຽດ). ຈໍ ≥ xl ເຫັນຄົບ; lg = ລາຍການ + ຂໍ້ຄວາມ (ລາຍລະອຽດເປີດດ້ວຍ dialog);
 * ຕ່ຳກວ່າ lg = ສະແດງທີລະຖັນ (ມີເຄສຖືກເລືອກ = ຂໍ້ຄວາມ, ບໍ່ມີ = ລາຍການ). ການເລືອກເກັບໃນ state (ຄ່າເລີ່ມຕົ້ນຈາກ ?c=).
 */
export function InboxPage({ initialConversationId }: { initialConversationId: string | null }) {
  const { t } = useT();
  const canWrite = useCan("inbox:write");
  const connection = useInboxRealtime(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selected = useConversation(selectedId);

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("inbox.title")]}
        title={t("inbox.title")}
        description={t("inbox.description")}
        actions={
          <span role="status">
            <StatusPill tone={STATUS_TONE[connection]}>{t(`inbox.realtime.${connection}`)}</StatusPill>
          </span>
        }
      />
      <div className="px-3 pb-6 sm:px-6">
        <div className="grid h-[calc(100vh-17rem)] min-h-[480px] grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <section aria-label={t("inbox.list.label")} className={cn("min-h-0", selectedId ? "hidden lg:block" : "block")}>
            <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          <section className={cn("min-h-0", selectedId ? "block" : "hidden lg:block")}>
            {selectedId ? (
              <ThreadPane
                key={selectedId}
                conversationId={selectedId}
                canWrite={canWrite}
                onBack={() => setSelectedId(null)}
                onShowDetails={() => setDetailsOpen(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[20px] border border-line bg-surface">
                <EmptyState icon={MessageSquare} title={t("inbox.thread.select")} />
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 xl:block">
            {selected.data ? <SidePanel key={selected.data.id} conversation={selected.data} canWrite={canWrite} /> : null}
          </aside>
        </div>
      </div>

      <Dialog open={detailsOpen && !!selected.data} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md" closeLabel={t("common.close")}>
          <DialogHeader title={t("inbox.panel.title")} description={selected.data?.displayName ?? ""} />
          <DialogBody>
            {selected.data ? <SidePanel conversation={selected.data} canWrite={canWrite} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

`apps/admin/src/app/(app)/inbox/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { InboxPage } from "@/components/inbox/inbox-page";

export default async function InboxRoute({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const conversationId = typeof c === "string" && c.trim() !== "" ? c.trim() : null;
  // ຄ່າຈາກ URL ເປັນພຽງຄ່າເລີ່ມຕົ້ນຂອງການເລືອກ; key ເຮັດໃຫ້ remount ເມື່ອ URL ປ່ຽນ (ເຊັ່ນ ລິ້ງຈາກໜ້າອື່ນ)
  return (
    <PermissionGate permission="inbox:read">
      <InboxPage key={conversationId ?? "none"} initialConversationId={conversationId} />
    </PermissionGate>
  );
}
```

ໝາຍເຫດ test: ໃນ jsdom CSS ບໍ່ມີຜົນ ຈຶ່ງ `aside` ແລະ dialog ອາດມີ SidePanel ພ້ອມກັນ (ໃຊ້ `getAllBy*` ຕາມທີ່ຂຽນໄວ້). `SidePanel` ໃນ dialog ຫໍ່ `Card` ຊ້ອນໃນ `DialogBody`: ຖ້າຮູບລັກບໍ່ງາມ (ຂອບສອງຊັ້ນ) ໃຫ້ເພີ່ມ prop `className` ໃຫ້ `SidePanel` ແລ້ວໃສ່ `border-0 shadow-none` ຕອນຢູ່ໃນ dialog (ເຮັດໃນຂັ້ນ smoke ຖ້າເຫັນວ່າຜິດ).

Run: `pnpm --filter @oca/admin exec vitest run src/components/inbox`
Expected: PASS ທຸກ test

- [ ] **Step 3: ທົດສອບທັງ admin + lint + typecheck**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin lint && pnpm --filter @oca/admin typecheck`
Expected: ຂຽວ (ຈຳນວນ test ເພີ່ມຈາກ 639 → ປະມານ +90). **ຢ່າ** ຣັນ `next build` ໃນ `apps/admin` ຂອງຜູ້ໃຊ້ (ແບ່ງ `.next` ກັບ dev server :3000): ເຮັດໃນ Task 8 ແບບ copy ແຍກ.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/inbox/inbox-page.tsx apps/admin/src/components/inbox/inbox-page.test.tsx "apps/admin/src/app/(app)/inbox/page.tsx"
git commit -m "feat(admin): /inbox page (three-column layout, realtime badge, responsive details dialog)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ກວດສຸດທ້າຍ: build + smoke ໃນ Chrome ຈິງດ້ວຍ simulator

ເປັນງານຂອງ controller (ມີການຣັນ server/browser) ບໍ່ແມ່ນ subagent ທີ່ບໍ່ມີ browser. ປະຕິບັດຕາມບົດຮຽນໃນ memory `phase1-progress`: ເຮັດໃນ **copy ແຍກ** ແລະ **ຖານ/ພອດແຍກ** ບໍ່ແຕະ dev server (:3000/:3001/:3002/:3100) ຫຼື ຖານ `oca` ຂອງຜູ້ໃຊ້.

- [ ] **Step 1: ກວດໂຄດທັງ repo (ໃນ working tree)**

Run: `pnpm --filter @oca/shared build && pnpm --filter @oca/database build && pnpm --filter @oca/channels build && pnpm --filter @oca/shared test && pnpm --filter @oca/channels test && pnpm --filter @oca/api test && pnpm --filter @oca/admin test && pnpm --filter @oca/api lint && pnpm --filter @oca/admin lint && pnpm --filter @oca/admin typecheck`
Expected: ຂຽວທັງໝົດ

- [ ] **Step 2: ສ້າງ copy ແລະ ຕຽມສະພາບແວດລ້ອມແຍກ**

- `cp -Rc /Users/ta/oca "$SCRATCH/oca-smoke"` (clone ຂອງ APFS); ລຶບ `.next`/`.next-prod` ໃນ copy ແລ້ວ `pnpm install --offline` ຖ້າຈຳເປັນ.
- ຖານໃໝ່ `oca_smoke` ໃນ Postgres :5433 ເທົ່ານັ້ນ (`CREATE DATABASE oca_smoke` ຜ່ານ `psql` ທີ່ 5433); `DATABASE_URL=postgresql://oca:oca@localhost:5433/oca_smoke pnpm --filter @oca/database db:deploy && ... db:seed` (ສ້າງ OWNER + role ຕາມ seed).
- ສ້າງຜູ້ໃຊ້ທົດສອບດ້ວຍ role: `CHAT_ADMIN` (ມີ inbox:rw), `ACCOUNTANT` (ບໍ່ມີ inbox), ແລະ role ທີ່ມີແຕ່ `inbox:read` (ສ້າງຜ່ານ `/roles` ຫຼື SQL ໃນ `oca_smoke`).
- Redis ໃຊ້ :6380 ຮ່ວມ (pub/sub channel `oca:inbox:events` ຮ່ວມກັບ API dev ຖ້າມັນແລ່ນ: event ເປັນ id ເທົ່ານັ້ນ ບໍ່ເປັນອັນຕະລາຍ; ບັນທຶກໄວ້ໃນສະຫຼຸບ).
- ເປີດ: fake Graph `pnpm --filter @oca/channels simulate graph 4010` (ຕັ້ງ `FACEBOOK_PAGE_ACCESS_TOKEN=smoke-token`), API :3012 (env: `DATABASE_URL`→oca_smoke, `REDIS_URL`, `PORT=3012`, `FACEBOOK_APP_SECRET=smoke-secret`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN=v`, `FACEBOOK_PAGE_ACCESS_TOKEN=smoke-token`, `FACEBOOK_GRAPH_BASE_URL=http://127.0.0.1:4010`, `CORS_ORIGIN=http://localhost:3112`, `ACCESS_TOKEN_TTL_SECONDS=60` ເພື່ອທົດສອບການ reconnect), worker ແຍກ, admin `next build` ແລ້ວ `next start --port 3112` ໃນ copy (ເບິ່ງ `apps/admin/next.config.ts` ວ່າ proxy `/api` ອ່ານ env ຊື່ໃດເພື່ອຊີ້ໄປ :3012).

- [ ] **Step 3: ຂັ້ນຕອນ smoke (Playwright/Chrome headless ໃນ scratchpad ຕາມ memory; ບັນທຶກ storageState ທຸກ login ເພາະ refresh token rotate)**

1. Login `owner` → ເມນູ "ກ່ອງຂໍ້ຄວາມ" ມີ → `/inbox` ເປີດໄດ້; ປ້າຍ "ເຊື່ອມຕໍ່ແບບສົດ".
2. `SIM_API_URL=http://127.0.0.1:3012 FACEBOOK_APP_SECRET=smoke-secret pnpm --filter @oca/channels simulate say U1001 "ສະບາຍດີ ມີສິນຄ້າບໍ"` → **ແຖວໃໝ່ປາກົດໂດຍບໍ່ refresh** (ພາຍໃນ ~1 ວິ) ພ້ອມ badge unread 1 ແລະ ຊື່ເປັນ "Sim U1001" (fake Graph autoProfiles).
3. ເປີດເຄສ → ຂໍ້ຄວາມສະແດງ (ພາສາລາວຖືກ, ຂຶ້ນແຖວໃໝ່ຖືກ), unread ຫາຍ; `say` ອີກຄັ້ງຂະນະເປີດຢູ່ → ຂໍ້ຄວາມໃໝ່ເຂົ້າ + ເລື່ອນລົງ + unread ຍັງ 0.
4. ຕອບ "ມີຄ່ະ" ດ້ວຍ Enter → ຟອງສົ່ງ; fake Graph log ເຫັນ `send → U1001`; Shift+Enter ຂຶ້ນແຖວໃໝ່; ພິມລາວດ້ວຍ IME ແລ້ວກົດ Enter ຢືນຢັນ composition ບໍ່ສົ່ງ (ທົດສອບດ້ວຍແປ້ນພິມລາວຈິງ ຖ້າເປັນໄປໄດ້).
5. ຈຳລອງສົ່ງບໍ່ໄດ້: ແກ້ token ຂອງ fake Graph ໃຫ້ຜິດ (restart ດ້ວຍ token ອື່ນ) ແລ້ວຕອບ → ຟອງ "ສົ່ງບໍ່ສຳເລັດ: Token ຂອງເພຈໃຊ້ບໍ່ໄດ້..." ແລະ ຂໍ້ຄວາມຍັງຢູ່ໃນຊ່ອງພິມ.
6. ແຖບຂ້າງ: ມອບໝາຍໃຫ້ CHAT_ADMIN, ສ້າງລູກຄ້າຈາກແຊັດ (ເບີຊ້ຳ → ຂໍ້ຄວາມຊ້ຳ), ຖອນລິ້ງ, ລິ້ງລູກຄ້າທີ່ມີ, ປິດເຄສ → ລາຍການ (filter "ເປີດຢູ່") ເຄສຫາຍ, ປ່ຽນ filter "ປິດແລ້ວ" ເຫັນ; `say` ໃໝ່ເຂົ້າເຄສທີ່ປິດ → ເປີດຄືນເອງ.
7. Realtime: ເປີດ 2 ແຖບ (owner ກັບ chat_admin) ປ່ຽນໃນແຖບໜຶ່ງ ອີກແຖບອັບເດດເອງ; ລໍ ~60 ວິ (TTL) ເບິ່ງ stream reconnect ໂດຍບໍ່ສະແດງ error ຄ້າງ ແລະ ຍັງໄດ້ event ຫຼັງ reconnect; ຢຸດ API ຊົ່ວຄາວ → ປ້າຍ "ການເຊື່ອມຕໍ່ຂາດ ກຳລັງລອງໃໝ່" ແລ້ວເປີດຄືນ → "ເຊື່ອມຕໍ່ແບບສົດ" ແລະ ຂໍ້ມູນ refetch.
8. ສິດ: ACCOUNTANT ບໍ່ເຫັນເມນູ, ເຂົ້າ `/inbox` ໂດຍກົງ = ໜ້າບໍ່ມີສິດ; role ທີ່ມີແຕ່ `inbox:read` ເຫັນລາຍການ/ຂໍ້ຄວາມ ແຕ່ composer ເປັນຄຳອະທິບາຍ ແລະ ແຖບຂ້າງຄວບຄຸມຖືກປິດ; CHAT_ADMIN (ບໍ່ມີ staff:read) ເຫັນລາຍຊື່ຜູ້ຮັບຜິດຊອບໄດ້.
9. ຈໍແຄບ (viewport 390×800): ເຫັນລາຍການ → ກົດເຄສ → ເຫັນຂໍ້ຄວາມ + ປຸ່ມ "ກັບໄປລາຍການ" + "ລາຍລະອຽດ" (dialog).
10. ຮູບ: `say` ແບບມີ attachment ຮູບ https (ຕ້ອງເພີ່ມ option ໃນ CLI ຫຼືສົ່ງຜ່ານ `postSignedWebhook` ໃນ script ຊົ່ວຄາວ) ສະແດງຮູບ; `http://` ບໍ່ສະແດງ.

ບັນທຶກ bug ທີ່ພົບທັງໝົດ; ແກ້ດ້ວຍ subagent (TDD) ກ່ອນປິດ. ເກັບ screenshot ໃນ scratchpad (ບໍ່ commit).

- [ ] **Step 4: ທຳຄວາມສະອາດ**

ຢຸດ server ທີ່ເປີດເອງ, `DROP DATABASE oca_smoke` (ຜ່ານ 5433 ເທົ່ານັ້ນ), ລຶບ copy.

- [ ] **Step 5: ອັບເດດເອກະສານ + memory**

- `docs/ROADMAP.md`: ບໍ່ປ່ຽນຈົນກວ່າ 2a-3 ຈົບ.
- ອັບເດດ memory `phase1-progress`: 2a-2 ສຳເລັດ + commits + bug ຈາກ smoke + ສິ່ງທີ່ຍັງຄ້າງ; ຍັງບໍ່ push.

---

## Self-review (spec ↔ task)

- Spec §8 (3 ຖັນ: ລາຍການ + ກອງ/ຄົ້ນຫາ/badge unread; ກະທູ້ + Enter ສົ່ງ + IME + FAILED ພ້ອມເຫດຜົນ; ແຖບຂ້າງ: ລູກຄ້າ/ຜູ້ຮັບຜິດຊອບ): Task 4, 5, 6. ປຸ່ມເປີດບິນ/ບິນຂອງເຄສ → 2a-3.
- Spec §6 (SSE ໃຊ້ fetch-stream + Bearer, reconnect + refetch + poll 60 ວິ, ປິດ subscription): Task 3 (client) + ຂອງ 2a-1 (server).
- Spec §7 (ສິດ: ເບິ່ງ `inbox:read`, ຂຽນ `inbox:write`; ເຊື່ອງປຸ່ມ): Task 5 (composer), 6 (side panel), 7 (route gate + nav ໃນ Task 2).
- Spec §9 (component test: load-error+Retry, read-only, ປຸ່ມຕາມສິດ; smoke Chrome ດ້ວຍ simulator): ທຸກ task ມີ test; Task 8.
- ງານຄ້າງຈາກ final review 2a-1: i18n send errors + `isMessageSendError` (Task 1-2), assignee source (`GET /inbox/assignees`, Task 1), markRead guard (Task 1), `beforeId` ຈາກແຖວສຸດທ້າຍ (Task 2 `useMessages`), refetch ເມື່ອ reconnect + poll 60 ວິ (Task 3), spec §6 ຊື່ channel Redis (Task 1).
- ຊື່ທີ່ໃຊ້ຂ້າມ task ສອດຄ່ອງ: `useConversations/useConversation/useMessages/useSendMessage/useUpdateConversation/useMarkConversationRead/useCreateCustomerFromChat/useAssignees` (Task 2) ↔ ຜູ້ໃຊ້ໃນ Task 4-7; `runInboxStream`/`StreamStatus`/`useInboxRealtime`/`POLL_MS` (Task 3) ↔ Task 7; `isSafeAttachmentUrl`/`sendErrorKey` (Task 4) ↔ Task 5; `ThreadPaneProps.onBack/onShowDetails` ↔ Task 7.

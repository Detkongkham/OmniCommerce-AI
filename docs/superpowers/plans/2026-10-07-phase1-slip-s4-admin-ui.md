# Slip Verification S4 — Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**ຕ້ອງເຮັດ S1-S3 ໃຫ້ຄົບກ່ອນ** (API routes ຂອງ S2 ແລະ `StoreSettingsDto.receivingAccounts` ຂອງ S2 Task 9).

**Goal:** ໜ້າ admin ສຳລັບ Slip Verification: panel "ສະລິບ" ໃນໜ້າບິນ (ອັບໂຫຼດ, ເບິ່ງຮູບ+ຄ່າທີ່ອ່ານ+flag, ແກ້ຄ່າ, ອ່ານໃໝ່, ຢືນຢັນ, ປະຕິເສດ), ປຸ່ມ "ໃຊ້ເປັນສະລິບ" ຂອງຮູບໃນແຊັດ, ແລະ ຕັ້ງບັນຊີຮັບເງິນຂອງຮ້ານໃນໜ້າ settings.

**Architecture:** ຕາມ pattern ທີ່ມີຢູ່: hooks ໃນ `lib/queries.ts` (TanStack Query + `apiFetch`), ຂໍ້ຄວາມຜ່ານ `useT`/dictionary (lo+en), error ຜ່ານ `errorMessage`, ສິດຜ່ານ `useCan`. ຮູບສະລິບບໍ່ເປີດ public ຈຶ່ງໂຫຼດດ້ວຍ `apiFetch` ເປັນ Blob (ມີ Bearer) ແລ້ວສະແດງຜ່ານ object URL. ສະລິບທີ່ `PENDING_READ` ເຮັດໃຫ້ query poll ທຸກ 3 ວິ.

**Tech Stack:** Next.js (admin), React, TanStack Query, react-hook-form (ສະເພາະ settings ທີ່ມີຢູ່), `@oca/ui`, vitest + Testing Library.

**ກົດ** (ຄືກັບ S1-S3) + ຂອງ admin: ຢ່າ `beforeEach(() => mock.mockReset())` (ຕ້ອງໃສ່ວົງເລັບ `{ }`); ຢ່າແຕະໄຟລ໌ທີ່ຜູ້ໃຊ້ແກ້ຄ້າງ (`next.config.ts`, `order-list*`, `stock-movements*`, `test/render.tsx`, `components/common/date-field.tsx`) — ແຜນນີ້ບໍ່ໃຊ້ `DateField`; `paidAt` ສະແດງແບບອ່ານຢ່າງດຽວ (API ຮອງຮັບແກ້ ແຕ່ UI ຍັງບໍ່ຈຳເປັນ). Test ໃຊ້ `renderWithProviders` (ພາສາ en). ເຫັນ RED ກ່ອນ implement ແລະ ລາຍງານ. Commit ລົງທ້າຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add` ສະເພາະໄຟລ໌ຂອງເຮົາ.

**ສິດ (ຕາມ API):** ເຫັນ panel = `orders:read`; ອັບໂຫຼດ = `orders:write`; ແກ້/ອ່ານໃໝ່/ຢືນຢັນ/ປະຕິເສດ = `payments:write`; ຜູກຈາກແຊັດ = `inbox:write` + `orders:write`; ຕັ້ງບັນຊີຮ້ານ = `inventory:write` (ແບບດຽວກັບ settings ອື່ນ).

## File map

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `lib/api.ts` (ແກ້) | ຮອງຮັບ `FormData` ແລະ `responseType: "blob"` |
| `lib/types.ts` (ແກ້) | `SlipDto`, `SlipValuesDto`, `StoreSettingsDto.receivingAccounts` |
| `lib/queries.ts` (ແກ້) | hooks ຂອງ slips |
| `lib/slips.ts` (ໃໝ່) | helper ຄ່າຄົງທີ່/ກົດ (tone, flag key, validate file, canConfirm) |
| `lib/i18n/dictionary.ts` (ແກ້) | ຂໍ້ຄວາມ `slips.*`, `settings.receiving.*` (lo+en) |
| `components/slips/slip-image.tsx` | ໂຫຼດຮູບດ້ວຍ auth |
| `components/slips/slip-card.tsx` | ສະລິບ 1 ໃບ: ຄ່າ + flag + ແກ້ + ປຸ່ມ |
| `components/slips/reject-slip-dialog.tsx` | dialog ປະຕິເສດ (ເຫດຜົນບັງຄັບ) |
| `components/slips/order-slips-card.tsx` | panel ໃນໜ້າບິນ + ອັບໂຫຼດ |
| `components/orders/order-detail.tsx` (ແກ້) | ວາງ `OrderSlipsCard` |
| `components/inbox/link-slip-dialog.tsx` | ເລືອກບິນເພື່ອຜູກຮູບເປັນສະລິບ |
| `components/inbox/message-bubble.tsx`, `thread-pane.tsx`, `inbox-page.tsx` (ແກ້) | ປຸ່ມ "ໃຊ້ເປັນສະລິບ" |
| `components/settings/store-settings-form.tsx` (ແກ້) | ແກ້ບັນຊີຮັບເງິນ |

ທຸກ path ຂ້າງເທິງຢູ່ໃຕ້ `apps/admin/src/`. ຄຳສັ່ງ test: `pnpm --filter @oca/admin test -- <ຊື່>`.

---

### Task 1: `apiFetch` ຮອງຮັບ FormData ແລະ Blob

**Files:** Modify `lib/api.ts`, `lib/api.test.ts`

- [ ] **Step 1: test ແດງ** — ເພີ່ມໃນ `lib/api.test.ts` ພາຍໃນ `describe("apiFetch", ...)` (ໃຊ້ `mockFetch`, `json`, `headersOf` ທີ່ມີແລ້ວ):

```ts
  it("FormData: ສົ່ງຕົວມັນເອງ (ບໍ່ stringify) ແລະ ບໍ່ຕັ້ງ Content-Type ເພື່ອໃຫ້ browser ໃສ່ boundary", async () => {
    setAccessToken("tok");
    const fetchMock = mockFetch(() => json(201, { id: "s1" }));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    await apiFetch("/orders/o1/slips", { method: "POST", body: form });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(form);
    expect(headersOf(init)["Content-Type"]).toBeUndefined();
    expect(headersOf(init).Authorization).toBe("Bearer tok");
  });

  it("responseType blob: ຄືນ Blob; error ຍັງເປັນ ApiError", async () => {
    mockFetch(() => new Response(new Blob(["img"], { type: "image/png" }), { status: 200 }));
    const blob = await apiFetch<Blob>("/slips/s1/image", { responseType: "blob" });
    expect(blob.size).toBe(3);
    mockFetch(() => json(404, { code: "SLIP_NOT_FOUND", message: "Slip not found" }));
    await expect(apiFetch("/slips/s1/image", { responseType: "blob" })).rejects.toMatchObject({ status: 404, code: "SLIP_NOT_FOUND" });
  });
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- lib/api` → **FAIL**.

- [ ] **Step 3: implement** — `lib/api.ts`:
  - `RequestOptions` ເພີ່ມ `/** "blob" ສຳລັບຮູບ/ໄຟລ໌; ຄ່າເລີ່ມຕົ້ນ json */ responseType?: "json" | "blob";`
  - `parse`:

```ts
async function parse<T>(response: Response, responseType: "json" | "blob" = "json"): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  if (responseType === "blob") return (await response.blob()) as T;
  return (await response.json()) as T;
}
```

  - `send`:

```ts
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  ...
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
```

  - `apiFetch`: ທຸກ `parse<T>(response)` / `parse<T>(retry)` ປ່ຽນເປັນ `parse<T>(..., options.responseType)`.

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- lib/api` → PASS ທັງໄຟລ໌ (test ເກົ່າບໍ່ພັງ).

- [ ] **Step 5: commit** — `git add apps/admin/src/lib/api.ts apps/admin/src/lib/api.test.ts && git commit -m "feat(admin): apiFetch supports FormData bodies and blob responses"`.

---

### Task 2: types + hooks + helpers

**Files:** Modify `lib/types.ts`, `lib/queries.ts`; Create `lib/slips.ts`, `lib/slips.test.ts`, `lib/queries.slips.test.tsx`

- [ ] **Step 1: types** — `lib/types.ts`: ໃນ `StoreSettingsDto` ເພີ່ມ `receivingAccounts: ReceivingAccount[];` (import `type ReceivingAccount` ຈາກ `@oca/shared` — ກວດວ່າ types.ts ມີ import ຈາກ shared ແລ້ວ; ຖ້າບໍ່ມີ ໃຫ້ເພີ່ມ). ເພີ່ມທ້າຍໄຟລ໌:

```ts
export interface SlipValuesDto {
  amount: string | null;
  currency: string | null;
  paidAt: string | null;
  destAccount: string | null;
  refNo: string | null;
}

/** ກົງກັບ SlipDto ຂອງ API (ບໍ່ມີ imageKey/readRaw) */
export interface SlipDto {
  id: string;
  orderId: string | null;
  conversationId: string | null;
  messageId: string | null;
  attachmentIndex: number | null;
  source: SlipSource;
  status: SlipStatus;
  imageMime: string;
  imageBytes: number;
  readerName: string | null;
  readerVersion: string | null;
  read: SlipValuesDto;
  confirmed: SlipValuesDto;
  flags: string[];
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}
```
(import `type SlipSource`, `type SlipStatus` ຈາກ `@oca/shared`.)

ຫຼັງແກ້ `StoreSettingsDto`, ໄຟລ໌ test ທີ່ສ້າງ `StoreSettingsDto` (ເຊັ່ນ `store-settings-form.test.tsx`, `order-form*.test`) ອາດ error type — `pnpm --filter @oca/admin exec tsc --noEmit` ແລ້ວເພີ່ມ `receivingAccounts: []` ໃນ fixture ທີ່ຂາດ (ບໍ່ແກ້ໄຟລ໌ທີ່ຜູ້ໃຊ້ແກ້ຄ້າງ).

- [ ] **Step 2: test helper ແດງ** — `lib/slips.test.ts`:

```ts
import { SLIP_MAX_BYTES, SLIP_STATUSES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { canConfirmSlip, isOpenSlip, validateSlipFile } from "./slips";
import type { SlipDto } from "./types";

const slip = (patch: Partial<SlipDto> = {}): SlipDto => ({
  id: "s1", orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD",
  status: "READ", imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100.00", currency: "LAK", paidAt: null, destAccount: null, refNo: "R1" },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T00:00:00.000Z",
  ...patch,
});

describe("validateSlipFile", () => {
  it("ຜ່ານ jpeg/png/webp ທີ່ບໍ່ໃຫຍ່ເກີນ", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateSlipFile({ type, size: 10 })).toBeNull();
    expect(validateSlipFile({ type: "image/png", size: SLIP_MAX_BYTES })).toBeNull();
  });
  it("ປະຕິເສດຊະນິດອື່ນ ແລະ ຂະໜາດເກີນ/ໄຟລ໌ວ່າງ", () => {
    expect(validateSlipFile({ type: "image/gif", size: 10 })).toBe("type");
    expect(validateSlipFile({ type: "application/pdf", size: 10 })).toBe("type");
    expect(validateSlipFile({ type: "image/png", size: SLIP_MAX_BYTES + 1 })).toBe("size");
    expect(validateSlipFile({ type: "image/png", size: 0 })).toBe("size");
  });
});

describe("isOpenSlip / canConfirmSlip", () => {
  it("open = ຍັງບໍ່ຢືນຢັນ/ປະຕິເສດ", () => {
    for (const status of SLIP_STATUSES) expect(isOpenSlip(slip({ status }))).toBe(["PENDING_READ", "READ", "READ_FAILED"].includes(status));
  });
  it("ຢືນຢັນໄດ້ເມື່ອ READ/READ_FAILED + ຜູກບິນ + ມີສິດ; PENDING_READ/ບໍ່ຜູກ/ບໍ່ມີສິດ ບໍ່ໄດ້", () => {
    expect(canConfirmSlip(slip(), true)).toBe(true);
    expect(canConfirmSlip(slip({ status: "READ_FAILED" }), true)).toBe(true);
    expect(canConfirmSlip(slip({ status: "PENDING_READ" }), true)).toBe(false);
    expect(canConfirmSlip(slip({ orderId: null }), true)).toBe(false);
    expect(canConfirmSlip(slip(), false)).toBe(false);
    expect(canConfirmSlip(slip({ status: "CONFIRMED" }), true)).toBe(false);
  });
});

```

- [ ] **Step 3:** `pnpm --filter @oca/admin test -- lib/slips` → **FAIL**.

- [ ] **Step 4: implement helper** — `lib/slips.ts`:

```ts
import { SLIP_ALLOWED_MIMES, SLIP_FLAGS, SLIP_MAX_BYTES, type SlipStatus } from "@oca/shared";
import type { StatusTone } from "@oca/ui";
import type { TranslationKey } from "./i18n/dictionary";
import type { SlipDto } from "./types";

export const SLIP_STATUS_TONE: Record<SlipStatus, StatusTone> = {
  PENDING_READ: "neutral",
  READ: "info",
  READ_FAILED: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
};

/** ຍັງລໍກວດ (ແກ້/ອ່ານໃໝ່/ປະຕິເສດໄດ້) */
export function isOpenSlip(slip: Pick<SlipDto, "status">): boolean {
  return slip.status === "PENDING_READ" || slip.status === "READ" || slip.status === "READ_FAILED";
}

/** ປຸ່ມຢືນຢັນ: ອ່ານແລ້ວ (ຫຼືອ່ານບໍ່ໄດ້ ແຕ່ຕື່ມມື) + ຜູກບິນ + ມີ payments:write */
export function canConfirmSlip(slip: Pick<SlipDto, "status" | "orderId">, canPay: boolean): boolean {
  return canPay && slip.orderId !== null && (slip.status === "READ" || slip.status === "READ_FAILED");
}

/** key ຂໍ້ຄວາມຂອງ flag; flag ໃໝ່ຈາກ API ທີ່ UI ຍັງບໍ່ຮູ້ຈັກ ໃຊ້ຂໍ້ຄວາມທົ່ວໄປ ແທນທີ່ຈະສະແດງ code ດິບ */
export function slipFlagKey(flag: string): TranslationKey {
  return ((SLIP_FLAGS as readonly string[]).includes(flag) ? `slips.flag.${flag}` : "slips.flag.UNKNOWN") as TranslationKey;
}

/** ກວດໄຟລ໌ຝັ່ງ client ກ່ອນສົ່ງ (API ກວດ magic bytes ຊ້ຳ): "type" | "size" | null */
export function validateSlipFile(file: { type: string; size: number }): "type" | "size" | null {
  if (!(SLIP_ALLOWED_MIMES as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0 || file.size > SLIP_MAX_BYTES) return "size";
  return null;
}
```

`slipFlagKey` ຈະມີ test ໃນ Task 3 (ຕ້ອງການ dictionary).

- [ ] **Step 5: hooks test ແດງ** — `lib/queries.slips.test.tsx`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import {
  useConfirmSlip,
  useConversationSlips,
  useLinkChatSlip,
  useOrderSlips,
  usePatchSlip,
  useRejectSlip,
  useRetrySlip,
  useSlipImage,
  useUploadSlip,
} from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("slip hooks", () => {
  it("useOrderSlips: GET /orders/:id/slips; poll ທຸກ 3 ວິ ສະເພາະເມື່ອມີ PENDING_READ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { client, Wrapper } = wrapper();
    renderHook(() => useOrderSlips("o1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders/o1/slips"));
    const query = client.getQueryCache().find({ queryKey: ["slips", "order", "o1"] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval as (q: unknown) => number | false;
    expect(interval({ state: { data: [{ status: "PENDING_READ" }] } })).toBe(3000);
    expect(interval({ state: { data: [{ status: "READ" }, { status: "CONFIRMED" }] } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
  });

  it("useOrderSlips enabled=false ບໍ່ຍິງ", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useOrderSlips("o1", { enabled: false }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("useConversationSlips: GET /conversations/:id/slips", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    renderHook(() => useConversationSlips("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/slips"));
  });

  it("useSlipImage: ໂຫຼດເປັນ blob", async () => {
    const blob = new Blob(["x"]);
    vi.mocked(apiFetch).mockResolvedValue(blob);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSlipImage("s1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBe(blob));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/image", { responseType: "blob" });
  });

  it("useUploadSlip: POST multipart ດ້ວຍ field 'file'; invalidate slips", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "s1" });
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadSlip(), { wrapper: Wrapper });
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(() => result.current.mutateAsync({ orderId: "o1", file }));
    const [path, options] = vi.mocked(apiFetch).mock.calls[0] as [string, { method: string; body: FormData }];
    expect(path).toBe("/orders/o1/slips");
    expect(options.method).toBe("POST");
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
  });

  it("useLinkChatSlip: POST /conversations/:cid/messages/:mid/slips ດ້ວຍ { orderId, attachmentIndex }", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "s1" });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useLinkChatSlip(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ conversationId: "c1", messageId: "m1", input: { orderId: "o1", attachmentIndex: 0 } }));
    expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/messages/m1/slips", { method: "POST", body: { orderId: "o1", attachmentIndex: 0 } });
  });

  it("usePatchSlip / useRetrySlip / useRejectSlip: path + method + body ຖືກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const patch = renderHook(() => usePatchSlip(), { wrapper: Wrapper });
    const retry = renderHook(() => useRetrySlip(), { wrapper: Wrapper });
    const reject = renderHook(() => useRejectSlip(), { wrapper: Wrapper });
    await act(() => patch.result.current.mutateAsync({ id: "s1", input: { confirmedAmount: "5", confirmedRefNo: null } }));
    await act(() => retry.result.current.mutateAsync("s1"));
    await act(() => reject.result.current.mutateAsync({ id: "s1", reason: "x" }));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1", { method: "PATCH", body: { confirmedAmount: "5", confirmedRefNo: null } });
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/retry", { method: "POST" });
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/reject", { method: "POST", body: { reason: "x" } });
  });

  it("useConfirmSlip: POST confirm; invalidate ທັງ slips ແລະ orders (ບິນເປັນ PAID); ລົ້ມກໍ invalidate (ສະຖານະອາດປ່ຽນ)", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConfirmSlip(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync("s1"));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/confirm", { method: "POST" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["orders"] });
    spy.mockClear();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("409"));
    await act(async () => {
      await result.current.mutateAsync("s1").catch(() => undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });
});
```

- [ ] **Step 6:** `pnpm --filter @oca/admin test -- queries.slips` → **FAIL**.

- [ ] **Step 7: implement hooks** — `lib/queries.ts`: ເພີ່ມ import `LinkChatSlipInput`, `PatchSlipInput` (type) ຈາກ `@oca/shared` ແລະ `SlipDto` ຈາກ `./types`; ໃນ `queryKeys` ເພີ່ມ `slips: ["slips"] as const,`; ແລ້ວເພີ່ມທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// ສະລິບໂອນເງິນ
// ---------------------------------------------------------------------------
/** ມີສະລິບຍັງ PENDING_READ → poll ທຸກ 3 ວິ ຈົນ worker ອ່ານແລ້ວ */
const slipsRefetchInterval = (query: { state: { data: SlipDto[] | undefined } }): number | false =>
  query.state.data?.some((slip) => slip.status === "PENDING_READ") ? 3000 : false;

export function useOrderSlips(orderId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: [...queryKeys.slips, "order", orderId],
    queryFn: () => apiFetch<SlipDto[]>(`/orders/${orderId}/slips`),
    refetchInterval: slipsRefetchInterval,
  });
}

/** ສະລິບທີ່ຜູກຈາກເຄສນີ້ (ເພື່ອຮູ້ວ່າຮູບໃດຜູກແລ້ວ) */
export function useConversationSlips(conversationId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: [...queryKeys.slips, "conversation", conversationId],
    queryFn: () => apiFetch<SlipDto[]>(`/conversations/${conversationId}/slips`),
    refetchInterval: slipsRefetchInterval,
  });
}

/** ຮູບສະລິບບໍ່ເປີດ public: ໂຫຼດດ້ວຍ Bearer ເປັນ Blob (ຮູບບໍ່ປ່ຽນ ຈຶ່ງ cache ຕະຫຼອດ) */
export function useSlipImage(id: string) {
  return useQuery({
    queryKey: [...queryKeys.slips, "image", id],
    queryFn: () => apiFetch<Blob>(`/slips/${id}/image`, { responseType: "blob" }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useUploadSlip() {
  const invalidate = useInvalidate(queryKeys.slips);
  return useMutation({
    mutationFn: ({ orderId, file }: { orderId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<SlipDto>(`/orders/${orderId}/slips`, { method: "POST", body: form });
    },
    onSuccess: invalidate,
  });
}

export function useLinkChatSlip() {
  const invalidate = useInvalidate(queryKeys.slips);
  return useMutation({
    mutationFn: ({ conversationId, messageId, input }: { conversationId: string; messageId: string; input: LinkChatSlipInput }) =>
      apiFetch<SlipDto>(`/conversations/${conversationId}/messages/${messageId}/slips`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function usePatchSlip() {
  const invalidate = useInvalidate(queryKeys.slips);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: z.input<typeof patchSlipSchema> }) =>
      apiFetch<SlipDto>(`/slips/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useRetrySlip() {
  const invalidate = useInvalidate(queryKeys.slips);
  return useMutation({
    mutationFn: (id: string) => apiFetch<SlipDto>(`/slips/${id}/retry`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useRejectSlip() {
  const invalidate = useInvalidate(queryKeys.slips);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<SlipDto>(`/slips/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: invalidate,
  });
}

/** ຢືນຢັນ = ບິນເປັນ PAID ດ້ວຍ → invalidate orders ນຳ. ລົ້ມ (409 ບິນບໍ່ຢູ່ PENDING_PAYMENT/ໝົດເວລາຈອງ) ກໍ refetch ໃຫ້ເຫັນຄວາມຈິງ */
export function useConfirmSlip() {
  const invalidate = useInvalidate(queryKeys.slips, queryKeys.orders);
  return useMutation({
    mutationFn: (id: string) => apiFetch<SlipDto>(`/slips/${id}/confirm`, { method: "POST" }),
    onSuccess: invalidate,
    onError: invalidate,
  });
}
```
ແລະ ເພີ່ມ `patchSlipSchema` ໃນ import (value-less: `import type`-style ໃນບ່ອນທີ່ມີ `createProductSchema, variantInputSchema` ຢູ່ແລ້ວ — ເພີ່ມ `patchSlipSchema` ໃນລາຍການນັ້ນ; ເຂົາໃຊ້ `typeof`).

- [ ] **Step 8:** `pnpm --filter @oca/admin test -- queries.slips lib/slips` → PASS. `pnpm --filter @oca/admin exec tsc --noEmit` ສະອາດ (ຖ້າ `TranslationKey` ບໍ່ມີ `slips.flag.*` ຍັງ error ໃນ `lib/slips.ts` ເພາະ cast `as TranslationKey` — cast ຢູ່ແລ້ວຈຶ່ງບໍ່ error).

- [ ] **Step 9: commit** — `git add apps/admin/src/lib && git commit -m "feat(admin): slip types, hooks and helpers"`.

---

### Task 3: ຂໍ້ຄວາມ i18n

**Files:** Modify `lib/i18n/dictionary.ts`

ຂໍ້ຄວາມຕ້ອງມີທັງ `lo` (ແຫຼ່ງ ຂອງ `TranslationKey`) ແລະ `en` (`Record<TranslationKey,string>` ບັງຄັບຄົບ).

- [ ] **Step 1:** ໃນ object `lo` ຫຼັງແຖວ `"inbox.attachment.file": ...` ເພີ່ມ:

```ts
  "slips.title": "ສະລິບໂອນເງິນ",
  "slips.upload": "ອັບໂຫຼດສະລິບ",
  "slips.upload.hint": "JPG, PNG ຫຼື WebP ບໍ່ເກີນ 8MB",
  "slips.empty": "ຍັງບໍ່ມີສະລິບສຳລັບບິນນີ້",
  "slips.file.type": "ຮອງຮັບສະເພາະຮູບ JPG, PNG ແລະ WebP",
  "slips.file.size": "ຮູບໃຫຍ່ເກີນ {max}MB ຫຼື ເປັນໄຟລ໌ວ່າງ",
  "slips.toast.uploaded": "ອັບໂຫຼດສະລິບແລ້ວ ກຳລັງອ່ານ",
  "slips.toast.saved": "ບັນທຶກການແກ້ໄຂແລ້ວ",
  "slips.toast.retried": "ສົ່ງໄປອ່ານໃໝ່ແລ້ວ",
  "slips.toast.confirmed": "ຢືນຢັນຊຳລະແລ້ວ ບິນເປັນ ຊຳລະແລ້ວ",
  "slips.toast.rejected": "ປະຕິເສດສະລິບແລ້ວ",
  "slips.toast.linked": "ຜູກສະລິບກັບບິນແລ້ວ ກຳລັງອ່ານ",
  "slips.status.PENDING_READ": "ກຳລັງອ່ານ",
  "slips.status.READ": "ລໍກວດ",
  "slips.status.READ_FAILED": "ອ່ານບໍ່ໄດ້",
  "slips.status.CONFIRMED": "ຢືນຢັນແລ້ວ",
  "slips.status.REJECTED": "ປະຕິເສດ",
  "slips.source.CHAT": "ຈາກແຊັດ",
  "slips.source.UPLOAD": "ອັບໂຫຼດ",
  "slips.pendingNote": "ກຳລັງອ່ານສະລິບ ລໍຖ້າສັກຄູ່ ຖ້າຄ້າງດົນ ກົດ ອ່ານໃໝ່",
  "slips.failedNote": "ອ່ານສະລິບບໍ່ໄດ້ ກົດ ອ່ານໃໝ່ ຫຼື ຕື່ມຄ່າເອງ ແລ້ວຢືນຢັນ",
  "slips.flags": "ຂໍ້ສັງເກດ",
  "slips.noFlags": "ບໍ່ພົບຄວາມຜິດປົກກະຕິ",
  "slips.flag.AMOUNT_MISMATCH": "ຍອດບໍ່ຕົງກັບຍອດບິນ",
  "slips.flag.DUPLICATE_REF": "ເລກອ້າງອີງຊ້ຳກັບສະລິບອື່ນ",
  "slips.flag.DUPLICATE_IMAGE": "ຮູບຊ້ຳກັບສະລິບອື່ນ",
  "slips.flag.DEST_MISMATCH": "ບັນຊີປາຍທາງບໍ່ແມ່ນຂອງຮ້ານ",
  "slips.flag.PAID_BEFORE_ORDER": "ໂອນກ່ອນບິນຖືກສ້າງ",
  "slips.flag.ORDER_NOT_PAYABLE": "ບິນນີ້ຮັບຊຳລະບໍ່ໄດ້ແລ້ວ (ໝົດເວລາ/ຖືກປິດ/ຈ່າຍແລ້ວ)",
  "slips.flag.UNREADABLE_FIELDS": "ອ່ານບາງຄ່າບໍ່ໄດ້",
  "slips.flag.UNKNOWN": "ຂໍ້ສັງເກດອື່ນ",
  "slips.field.amount": "ຍອດເງິນ",
  "slips.field.currency": "ສະກຸນ",
  "slips.field.paidAt": "ເວລາໂອນ",
  "slips.field.destAccount": "ບັນຊີປາຍທາງ",
  "slips.field.refNo": "ເລກອ້າງອີງ",
  "slips.read": "ຄ່າທີ່ເຄື່ອງອ່ານ",
  "slips.confirmed": "ຄ່າທີ່ຢືນຢັນ",
  "slips.image.alt": "ຮູບສະລິບ",
  "slips.image.open": "ເປີດຮູບເຕັມໃນແຖບໃໝ່",
  "slips.image.error": "ໂຫຼດຮູບບໍ່ໄດ້",
  "slips.edit.save": "ບັນທຶກການແກ້ໄຂ",
  "slips.edit.none": "ບໍ່ມີການປ່ຽນແປງ",
  "slips.edit.amountInvalid": "ຍອດເງິນບໍ່ຖືກຕ້ອງ",
  "slips.action.retry": "ອ່ານໃໝ່",
  "slips.action.confirm": "ຢືນຢັນຊຳລະ",
  "slips.action.reject": "ປະຕິເສດ",
  "slips.confirm.title": "ຢືນຢັນຊຳລະ?",
  "slips.confirm.description": "ຢືນຢັນຍອດ {amount} {currency} ສຳລັບບິນ {order}? ບິນຈະເປັນ ຊຳລະແລ້ວ ແລະ ຍ້ອນກັບບໍ່ໄດ້ ນອກຈາກຍົກເລີກບິນ",
  "slips.confirm.flags": "ມີຂໍ້ສັງເກດ {count} ຂໍ້ ກະລຸນາກວດກ່ອນຢືນຢັນ",
  "slips.confirm.noAmount": "ຕ້ອງໃສ່ຍອດເງິນກ່ອນຢືນຢັນ",
  "slips.reject.title": "ປະຕິເສດສະລິບ",
  "slips.reject.description": "ສະລິບນີ້ຈະບໍ່ຖືກໃຊ້ຢືນຢັນຊຳລະ ບິນບໍ່ປ່ຽນສະຖານະ",
  "slips.reject.reason": "ເຫດຜົນ",
  "slips.reject.reasonRequired": "ຕ້ອງໃສ່ເຫດຜົນ",
  "slips.reject.submit": "ປະຕິເສດສະລິບ",
  "slips.reviewedBy": "ກວດໂດຍ {name}",
  "slips.rejectReason": "ເຫດຜົນ: {reason}",
  "slips.link.action": "ໃຊ້ເປັນສະລິບ",
  "slips.link.linked": "ຜູກເປັນສະລິບແລ້ວ",
  "slips.link.title": "ຜູກຮູບນີ້ເປັນສະລິບຂອງບິນ",
  "slips.link.description": "ເລືອກບິນຂອງເຄສນີ້ທີ່ລູກຄ້າໂອນເງິນໃຫ້",
  "slips.link.noOrders": "ເຄສນີ້ຍັງບໍ່ມີບິນ ເປີດບິນກ່ອນ",
  "slips.link.notPayable": "ຮັບຊຳລະບໍ່ໄດ້",
  "slips.link.submit": "ຜູກສະລິບ",
  "slips.link.cancel": "ຍົກເລີກ",
  "settings.receiving.title": "ບັນຊີຮັບເງິນຂອງຮ້ານ",
  "settings.receiving.description": "ໃຊ້ກວດວ່າສະລິບໂອນເຂົ້າບັນຊີຂອງຮ້ານ ຖ້າເປົ່າ ຈະບໍ່ກວດບັນຊີປາຍທາງ",
  "settings.receiving.bank": "ທະນາຄານ",
  "settings.receiving.accountNo": "ເລກບັນຊີ",
  "settings.receiving.accountName": "ຊື່ບັນຊີ",
  "settings.receiving.add": "ເພີ່ມບັນຊີ",
  "settings.receiving.remove": "ລຶບບັນຊີ {n}",
  "settings.receiving.empty": "ຍັງບໍ່ໄດ້ຕັ້ງບັນຊີຮັບເງິນ",
  "settings.receiving.invalid": "ຕ້ອງໃສ່ທະນາຄານ ແລະ ເລກບັນຊີ (ມີຕົວເລກ)",
```

ໃນ object `en` ຫຼັງ `"inbox.attachment.file": "Attachment ({type})",`:

```ts
  "slips.title": "Payment slips",
  "slips.upload": "Upload slip",
  "slips.upload.hint": "JPG, PNG or WebP, up to 8MB",
  "slips.empty": "No slips for this order yet",
  "slips.file.type": "Only JPG, PNG and WebP images are supported",
  "slips.file.size": "The image is larger than {max}MB or empty",
  "slips.toast.uploaded": "Slip uploaded; reading it now",
  "slips.toast.saved": "Changes saved",
  "slips.toast.retried": "Sent to be read again",
  "slips.toast.confirmed": "Payment confirmed; the order is now paid",
  "slips.toast.rejected": "Slip rejected",
  "slips.toast.linked": "Slip linked to the order; reading it now",
  "slips.status.PENDING_READ": "Reading",
  "slips.status.READ": "To review",
  "slips.status.READ_FAILED": "Unreadable",
  "slips.status.CONFIRMED": "Confirmed",
  "slips.status.REJECTED": "Rejected",
  "slips.source.CHAT": "From chat",
  "slips.source.UPLOAD": "Uploaded",
  "slips.pendingNote": "Reading the slip; this takes a moment. If it stays here, press Read again",
  "slips.failedNote": "The slip could not be read. Press Read again, or enter the values yourself and confirm",
  "slips.flags": "Warnings",
  "slips.noFlags": "No anomalies found",
  "slips.flag.AMOUNT_MISMATCH": "Amount does not match the order",
  "slips.flag.DUPLICATE_REF": "Reference number duplicates another slip",
  "slips.flag.DUPLICATE_IMAGE": "Image duplicates another slip",
  "slips.flag.DEST_MISMATCH": "Destination account is not the store's",
  "slips.flag.PAID_BEFORE_ORDER": "Transferred before the order was created",
  "slips.flag.ORDER_NOT_PAYABLE": "This order can no longer accept payment (expired, closed or already paid)",
  "slips.flag.UNREADABLE_FIELDS": "Some values could not be read",
  "slips.flag.UNKNOWN": "Other warning",
  "slips.field.amount": "Amount",
  "slips.field.currency": "Currency",
  "slips.field.paidAt": "Transferred at",
  "slips.field.destAccount": "Destination account",
  "slips.field.refNo": "Reference no.",
  "slips.read": "Read by the reader",
  "slips.confirmed": "Confirmed values",
  "slips.image.alt": "Slip image",
  "slips.image.open": "Open the full image in a new tab",
  "slips.image.error": "Could not load the image",
  "slips.edit.save": "Save changes",
  "slips.edit.none": "No changes",
  "slips.edit.amountInvalid": "Invalid amount",
  "slips.action.retry": "Read again",
  "slips.action.confirm": "Confirm payment",
  "slips.action.reject": "Reject",
  "slips.confirm.title": "Confirm payment?",
  "slips.confirm.description": "Confirm {amount} {currency} for order {order}? The order becomes paid and this cannot be undone except by cancelling the order",
  "slips.confirm.flags": "{count} warning(s); please review before confirming",
  "slips.confirm.noAmount": "Enter the amount before confirming",
  "slips.reject.title": "Reject slip",
  "slips.reject.description": "This slip will not be used to confirm payment; the order status does not change",
  "slips.reject.reason": "Reason",
  "slips.reject.reasonRequired": "A reason is required",
  "slips.reject.submit": "Reject slip",
  "slips.reviewedBy": "Reviewed by {name}",
  "slips.rejectReason": "Reason: {reason}",
  "slips.link.action": "Use as slip",
  "slips.link.linked": "Linked as a slip",
  "slips.link.title": "Link this image as an order's slip",
  "slips.link.description": "Pick the order of this conversation that the customer paid for",
  "slips.link.noOrders": "This conversation has no orders yet; open an order first",
  "slips.link.notPayable": "cannot accept payment",
  "slips.link.submit": "Link slip",
  "slips.link.cancel": "Cancel",
  "settings.receiving.title": "Store receiving accounts",
  "settings.receiving.description": "Used to check that slips were paid into the store's account; if empty, the destination account is not checked",
  "settings.receiving.bank": "Bank",
  "settings.receiving.accountNo": "Account no.",
  "settings.receiving.accountName": "Account name",
  "settings.receiving.add": "Add account",
  "settings.receiving.remove": "Remove account {n}",
  "settings.receiving.empty": "No receiving accounts set",
  "settings.receiving.invalid": "Bank and account number (with digits) are required",
```

- [ ] **Step 2: test ສຳລັບ flag key** — ເພີ່ມທ້າຍ `lib/slips.test.ts` (ແລະ ເພີ່ມ `import { SLIP_FLAGS } from "@oca/shared"` ແລະ `import { dictionaries } from "./i18n/dictionary"` ແລະ `slipFlagKey` ເຂົ້າ import ເດີມ):

```ts
describe("slipFlagKey", () => {
  it("ທຸກ flag ທີ່ API ອາດສົ່ງ ມີຂໍ້ຄວາມທັງ lo ແລະ en; ຄ່າທີ່ບໍ່ຮູ້ຈັກ → UNKNOWN", () => {
    for (const flag of SLIP_FLAGS) {
      const key = slipFlagKey(flag);
      expect(dictionaries.lo[key], key).toBeTruthy();
      expect(dictionaries.en[key], key).toBeTruthy();
    }
    expect(slipFlagKey("NEW_FLAG_FROM_FUTURE")).toBe("slips.flag.UNKNOWN");
  });
});
```

- [ ] **Step 3:** `pnpm --filter @oca/admin exec tsc --noEmit && pnpm --filter @oca/admin test -- i18n lib/slips queries.slips` → PASS (test `i18n.test.tsx` ກວດ lo/en ຄົບຢູ່ແລ້ວ). ກ່ອນເພີ່ມຂໍ້ຄວາມ (Step 1) test flag key ຕ້ອງ **FAIL** — ເຮັດລຳດັບ Step 2 (ເຫັນ RED) → Step 1 → Step 3.

- [ ] **Step 4: commit** — `git add apps/admin/src/lib && git commit -m "feat(admin): slip translations and flag key test"`.

---

### Task 4: SlipImage

**Files:** Create `components/slips/slip-image.tsx`, `components/slips/slip-image.test.tsx`

- [ ] **Step 1: test ແດງ** — `slip-image.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { SlipImage } from "./slip-image";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));

const create = vi.fn(() => "blob:mock-1");
const revoke = vi.fn();
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  create.mockClear();
  revoke.mockClear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
});
afterEach(() => vi.unstubAllGlobals());

describe("SlipImage", () => {
  it("ໂຫຼດ blob ດ້ວຍ auth ແລ້ວສະແດງຮູບ + ລິ້ງເປີດເຕັມ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    renderWithProviders(<SlipImage slipId="s1" />);
    const image = await screen.findByRole("img", { name: "Slip image" });
    expect(image).toHaveAttribute("src", "blob:mock-1");
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/image", { responseType: "blob" });
    const link = screen.getByRole("link", { name: "Open the full image in a new tab" });
    expect(link).toHaveAttribute("href", "blob:mock-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("ຄືນ object URL ຕອນ unmount (ບໍ່ຮົ່ວ memory)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Blob(["x"]));
    const { unmount } = renderWithProviders(<SlipImage slipId="s1" />);
    await screen.findByRole("img");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:mock-1");
  });

  it("ໂຫຼດບໍ່ໄດ້ → ຂໍ້ຄວາມ error + ປຸ່ມ Retry ທີ່ຍິງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(404, "nf", [], "SLIP_NOT_FOUND"));
    const { user } = renderWithProviders(<SlipImage slipId="s1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the image");
    vi.mocked(apiFetch).mockResolvedValueOnce(new Blob(["x"]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });

  it("ກຳລັງໂຫຼດ → skeleton ທີ່ບອກ busy", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SlipImage slipId="s1" />);
    expect(screen.getByRole("status", { name: "Loading..." })).toHaveAttribute("aria-busy", "true");
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- slip-image` → **FAIL**.

- [ ] **Step 3: implement** — `components/slips/slip-image.tsx`:

```tsx
"use client";

import { Button, Skeleton, cn } from "@oca/ui";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { useSlipImage } from "@/lib/queries";

/** ຮູບສະລິບ: ໂຫຼດດ້ວຍ Bearer ເປັນ Blob (API ບໍ່ເປີດຮູບ public) ແລ້ວສະແດງຜ່ານ object URL */
export function SlipImage({ slipId, className }: { slipId: string; className?: string }) {
  const { t } = useT();
  const query = useSlipImage(slipId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-xs text-danger">
        <span>{t("slips.image.error")}</span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!url) {
    return <Skeleton role="status" aria-busy="true" aria-label={t("common.loading")} className={cn("h-40 w-full rounded-xl", className)} />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={t("slips.image.open")} aria-label={t("slips.image.open")} className="block">
      {/* ຮູບຈາກ blob (ບໍ່ຜ່ານ next/image) */}
      <img src={url} alt={t("slips.image.alt")} className={cn("max-h-72 w-full rounded-xl border border-line object-contain", className)} />
    </a>
  );
}
```

ໝາຍເຫດ: ລິ້ງມີ `aria-label` ຈຶ່ງ accessible name ຂອງລິ້ງ = "Open the full image..." ແລະ `img` ພາຍໃນຍັງເປັນ `img` name "Slip image" (test ຄາດທັງສອງ).

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- slip-image && pnpm --filter @oca/admin lint` → ຜ່ານ. (ຖ້າ `Skeleton` ບໍ່ຮັບ `role`/`aria-*` props ໃຫ້ຫໍ່ດ້ວຍ `<div role="status" aria-busy="true" aria-label=...>`.)

- [ ] **Step 5: commit** — `git add apps/admin/src/components/slips && git commit -m "feat(admin): authenticated slip image"`.

---

### Task 5: RejectSlipDialog

**Files:** Create `components/slips/reject-slip-dialog.tsx`, `components/slips/reject-slip-dialog.test.tsx`

- [ ] **Step 1: test ແດງ**:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { RejectSlipDialog } from "./reject-slip-dialog";

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  const view = renderWithProviders(<RejectSlipDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
  return { ...view, onConfirm, onOpenChange };
}

describe("RejectSlipDialog", () => {
  it("ຕ້ອງມີເຫດຜົນ: ວ່າງ/ແຕ່ຍະຫວ່າງ → ຂໍ້ຄວາມ error ແລະ ບໍ່ເອີ້ນ onConfirm", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");
    await user.type(screen.getByLabelText("Reason"), "   ");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ສົ່ງເຫດຜົນທີ່ຕັດຍະຫວ່າງແລ້ວ ແລະ ປິດ dialog ເມື່ອສຳເລັດ", async () => {
    const { user, onConfirm, onOpenChange } = setup();
    await user.type(screen.getByLabelText("Reason"), "  Wrong amount  ");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Wrong amount"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onConfirm ລົ້ມ → ສະແດງຂໍ້ຄວາມ error ຂອງ code ແລະ dialog ຍັງເປີດ", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(409, "x", [], "SLIP_ALREADY_REVIEWED"));
    const { user, onOpenChange } = setup(onConfirm);
    await user.type(screen.getByLabelText("Reason"), "dup");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This slip was already confirmed or rejected");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("ຂະນະກຳລັງສົ່ງ: ກົດຊ້ຳບໍ່ສົ່ງຊ້ຳ", async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const { user } = setup(onConfirm);
    await user.type(screen.getByLabelText("Reason"), "dup");
    const button = screen.getByRole("button", { name: "Reject slip" });
    await user.click(button);
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolve();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- reject-slip-dialog` → **FAIL**.

- [ ] **Step 3: implement** — `components/slips/reject-slip-dialog.tsx` (ຕາມ pattern `cancel-order-dialog.tsx`):

```tsx
"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input } from "@oca/ui";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";

export interface RejectSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ຕ້ອງ throw ເມື່ອລົ້ມ (dialog ສະແດງຂໍ້ຄວາມ ແລະ ຍັງເປີດ); ສຳເລັດ = ປິດ */
  onConfirm: (reason: string) => Promise<void>;
}

const REASON_MAX = 500;
const ERROR_ID = "reject-slip-error";

export function RejectSlipDialog({ open, onOpenChange, onConfirm }: RejectSlipDialogProps) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      // ຂະນະສົ່ງ ຫ້າມປິດ (Escape / overlay / X) ຈົນກວ່າຄຳຂໍຈະຈົບ
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {open ? <RejectForm saving={saving} onSavingChange={setSaving} onConfirm={onConfirm} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({
  saving,
  onSavingChange,
  onConfirm,
  onDone,
}: {
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onConfirm: RejectSlipDialogProps["onConfirm"];
  onDone: () => void;
}) {
  const { t } = useT();
  const submitting = useRef(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || submitting.current) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setMessage(t("slips.reject.reasonRequired"));
      return;
    }
    setMessage(null);
    submitting.current = true;
    onSavingChange(true);
    try {
      await onConfirm(trimmed);
      onDone();
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      submitting.current = false;
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("slips.reject.title")} description={t("slips.reject.description")} />
      <DialogBody>
        {message ? (
          <p id={ERROR_ID} role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <Field label={t("slips.reject.reason")} htmlFor="reject-slip-reason" required>
          <Input
            id="reject-slip-reason"
            value={reason}
            maxLength={REASON_MAX}
            aria-describedby={message ? ERROR_ID : undefined}
            onChange={(event) => {
              setMessage(null);
              setReason(event.target.value);
            }}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="destructive" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {t("slips.reject.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- reject-slip-dialog && pnpm --filter @oca/admin lint` → ຜ່ານ.

- [ ] **Step 5: commit** — `git add apps/admin/src/components/slips && git commit -m "feat(admin): reject slip dialog"`.

---

### Task 6: SlipCard

**Files:** Create `components/slips/slip-card.tsx`, `components/slips/slip-card.test.tsx`

ພຶດຕິກຳ:
- ສະແດງ: `SlipImage`, status pill (`slips.status.*`, tone ຈາກ `SLIP_STATUS_TONE`), ແຫຼ່ງ (`slips.source.*`), flags (ແຕ່ລະອັນເປັນຂໍ້ຄວາມ ມີໄອຄອນ — ບໍ່ອີງສີຢ່າງດຽວ) ຫຼື "ບໍ່ພົບຄວາມຜິດປົກກະຕິ" ເມື່ອ `READ` ແລະ flags ວ່າງ, ຕາຕະລາງ "ຄ່າທີ່ອ່ານ" vs "ຄ່າທີ່ຢືນຢັນ" (5 ແຖວ; `—` ເມື່ອບໍ່ມີ; `paidAt` ຜ່ານ `formatDateTime`; amount ຜ່ານ `formatMoney`), ໝາຍເຫດ `pendingNote`/`failedNote`, ຜູ້ກວດ/ເຫດຜົນປະຕິເສດ.
- `canReview && open && status !== PENDING_READ`: ຟອມແກ້ (amount, currency Select, refNo, destAccount) ປຸ່ມ "Save changes"; ປຸ່ມ "Read again" (open ທຸກສະຖານະ ລວມ PENDING_READ); ປຸ່ມ "Confirm payment" (`canConfirmSlip`), "Reject".
- Confirm ໃຊ້ `ConfirmDialog`: description ມີ `{amount} {currency}` ຂອງຄ່າສຸດທ້າຍ (confirmed ?? read) ແລະ `{order}`; ຖ້າ flags>0 ເພີ່ມປະໂຫຍກ `slips.confirm.flags`; ຖ້າບໍ່ມີຍອດ → ປຸ່ມ Confirm ຖືກ disable ແລະ ສະແດງ `slips.confirm.noAmount`.
- ຜົນ: toast ສຳເລັດ/ລົ້ມ (`errorMessage`).

- [ ] **Step 1: test ແດງ** — `slip-card.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { SlipDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SlipCard } from "./slip-card";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("./slip-image", () => ({ SlipImage: ({ slipId }: { slipId: string }) => <div data-testid={`image-${slipId}`} /> }));

const order = { id: "o1", orderNumber: "SO-000001", total: "100000.00", currency: "LAK" };
const base: SlipDto = {
  id: "s1", orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD",
  status: "READ", imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100000.00", currency: "LAK", paidAt: "2026-10-07T09:00:00.000Z", destAccount: "010-12", refNo: "R1" },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T08:00:00.000Z",
};
const slip = (patch: Partial<SlipDto> = {}): SlipDto => ({ ...base, ...patch });
const calls = (method: string) => vi.mocked(apiFetch).mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === method);

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({});
});

describe("SlipCard: ສະແດງ", () => {
  it("ສະຖານະ, ແຫຼ່ງ, ຄ່າທີ່ອ່ານ (ເງິນ/ວັນເວລາ ຈັດຮູບແບບ), ຄ່າທີ່ຢືນຢັນເປັນ —, ບໍ່ມີຄວາມຜິດປົກກະຕິ", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    expect(screen.getByTestId("image-s1")).toBeInTheDocument();
    expect(screen.getByText("To review")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    const read = screen.getByRole("table", { name: "Read by the reader" });
    expect(within(read).getByText("100,000.00")).toBeInTheDocument();
    expect(within(read).getByText("07/10/2026 16:00")).toBeInTheDocument();
    expect(within(read).getByText("R1")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Confirmed values" })).getAllByText("—").length).toBe(5);
    expect(screen.getByText("No anomalies found")).toBeInTheDocument();
  });

  it("flag ສະແດງເປັນຂໍ້ຄວາມ (ບໍ່ອີງສີ) ແລະ flag ທີ່ບໍ່ຮູ້ຈັກສະແດງຂໍ້ຄວາມທົ່ວໄປ", () => {
    renderWithProviders(<SlipCard slip={slip({ flags: ["AMOUNT_MISMATCH", "DUPLICATE_IMAGE", "FUTURE_FLAG"] })} order={order} canReview />);
    const list = screen.getByRole("list", { name: "Warnings" });
    expect(within(list).getByText("Amount does not match the order")).toBeInTheDocument();
    expect(within(list).getByText("Image duplicates another slip")).toBeInTheDocument();
    expect(within(list).getByText("Other warning")).toBeInTheDocument();
    expect(screen.queryByText("No anomalies found")).toBeNull();
  });

  it("PENDING_READ: ໝາຍເຫດ + ບໍ່ມີຟອມແກ້/ປຸ່ມຢືນຢັນ ແຕ່ມີ Read again; READ_FAILED: ໝາຍເຫດ + ຢືນຢັນໄດ້", () => {
    const { unmount } = renderWithProviders(<SlipCard slip={slip({ status: "PENDING_READ" })} order={order} canReview />);
    expect(screen.getByText(/Reading the slip/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByLabelText("Amount")).toBeNull();
    expect(screen.getByRole("button", { name: "Read again" })).toBeInTheDocument();
    unmount();
    renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeEnabled();
  });

  it("CONFIRMED/REJECTED: ອ່ານຢ່າງດຽວ (ບໍ່ມີຟອມ/ປຸ່ມ) ແລະ ສະແດງຜູ້ກວດ/ເຫດຜົນ", () => {
    const reviewedBy = { id: "u1", name: "Owner" };
    const { unmount } = renderWithProviders(<SlipCard slip={slip({ status: "CONFIRMED", reviewedBy, reviewedAt: "2026-10-07T10:00:00.000Z" })} order={order} canReview />);
    expect(screen.getByText("Reviewed by Owner")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    renderWithProviders(<SlipCard slip={slip({ status: "REJECTED", reviewedBy, rejectReason: "Wrong amount" })} order={order} canReview />);
    expect(screen.getByText("Reason: Wrong amount")).toBeInTheDocument();
  });

  it("ບໍ່ມີ payments:write: ເຫັນຂໍ້ມູນ ແຕ່ບໍ່ມີຟອມ/ປຸ່ມ", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview={false} />);
    expect(screen.getByText("To review")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });
});

describe("SlipCard: ແກ້ຄ່າ", () => {
  it("ຟອມເລີ່ມຈາກຄ່າສຸດທ້າຍ; ບັນທຶກສົ່ງສະເພາະ field ທີ່ປ່ຽນ (ຍອດ normalize ຝັ່ງ API)", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    expect(screen.getByLabelText("Amount")).toHaveValue("100000.00");
    expect(screen.getByLabelText("Currency")).toHaveValue("LAK");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "95,000");
    await user.clear(screen.getByLabelText("Reference no."));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(calls("PATCH")[0]).toEqual(["/slips/s1", { method: "PATCH", body: { confirmedAmount: "95,000", confirmedRefNo: null } }]);
  });

  it("ບໍ່ມີການປ່ຽນ → ບໍ່ຍິງ API; ຍອດຜິດຮູບແບບ → error ໃນຊ່ອງ ແລະ ບໍ່ຍິງ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(calls("PATCH")).toHaveLength(0);
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "abc");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Invalid amount")).toBeInTheDocument();
    expect(calls("PATCH")).toHaveLength(0);
  });

  it("ແກ້ລົ້ມ → ສະແດງ toast error (ບໍ່ crash)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "SLIP_ALREADY_REVIEWED"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.type(screen.getByLabelText("Destination account"), "9");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});

describe("SlipCard: ຢືນຢັນ / ປະຕິເສດ / ອ່ານໃໝ່", () => {
  it("ຢືນຢັນ: dialog ບອກຍອດ+ເລກບິນ (+ຈຳນວນ flag) ແລ້ວຍິງ POST confirm", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ flags: ["AMOUNT_MISMATCH"] })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm payment?" });
    expect(dialog).toHaveTextContent("Confirm 100,000.00 LAK for order SO-000001?");
    expect(dialog).toHaveTextContent("1 warning(s)");
    await user.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/confirm", { method: "POST" }]);
  });

  it("ບໍ່ມີຍອດ → ປຸ່ມຢືນຢັນໃນ dialog ຖືກປິດ ແລະ ບອກເຫດຜົນ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ read: { ...base.read, amount: null } })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Enter the amount before confirming");
    expect(within(dialog).getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });

  it("ຢືນຢັນລົ້ມ (409) → dialog ປິດ + toast error; ບໍ່ crash", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "ORDER_INVALID_STATE"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ປະຕິເສດ: ເປີດ dialog ເຫດຜົນ ແລ້ວ POST reject", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText("Reason"), "Wrong amount");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/reject", { method: "POST", body: { reason: "Wrong amount" } }]);
  });

  it("Read again: POST retry", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Read again" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/retry", { method: "POST" }]);
  });

  it("ຂະນະມີ action ກຳລັງສົ່ງ ປຸ່ມອື່ນຖືກປິດ (ບໍ່ສົ່ງຊ້ອນ)", async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { user } = renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Read again" }));
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });
});
```

ໝາຍເຫດ: `ConfirmDialog` ໃຊ້ Radix Dialog (role `dialog`, ຊື່ = title). `toast` ຈິງຖືກໃຊ້ (ບໍ່ mock) ຈຶ່ງບໍ່ assert ຂໍ້ຄວາມ toast; assert ຜົນຂ້າງຄຽງຜ່ານ `apiFetch`.

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- slip-card` → **FAIL**.

- [ ] **Step 3: implement** — `components/slips/slip-card.tsx`:

```tsx
"use client";

import { SLIP_CURRENCIES, normalizeSlipAmount } from "@oca/shared";
import { Button, Card, ConfirmDialog, Field, Input, Select, StatusPill, toast } from "@oca/ui";
import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useConfirmSlip, usePatchSlip, useRejectSlip, useRetrySlip } from "@/lib/queries";
import { SLIP_STATUS_TONE, canConfirmSlip, isOpenSlip, slipFlagKey } from "@/lib/slips";
import type { SlipDto, SlipValuesDto } from "@/lib/types";
import { RejectSlipDialog } from "./reject-slip-dialog";
import { SlipImage } from "./slip-image";

export interface SlipOrderInfo {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
}

const FIELDS = ["amount", "currency", "paidAt", "destAccount", "refNo"] as const;

/** ຄ່າສຸດທ້າຍ = ທີ່ແອດມິນແກ້ ກ່ອນ ບໍ່ດັ່ງນັ້ນທີ່ເຄື່ອງອ່ານ */
function effective(slip: SlipDto): SlipValuesDto {
  return {
    amount: slip.confirmed.amount ?? slip.read.amount,
    currency: slip.confirmed.currency ?? slip.read.currency,
    paidAt: slip.confirmed.paidAt ?? slip.read.paidAt,
    destAccount: slip.confirmed.destAccount ?? slip.read.destAccount,
    refNo: slip.confirmed.refNo ?? slip.read.refNo,
  };
}

function ValuesTable({ title, values }: { title: string; values: SlipValuesDto }) {
  const { t } = useT();
  const display = (field: (typeof FIELDS)[number]): string => {
    const value = values[field];
    if (value === null || value === "") return "—";
    if (field === "amount") return formatMoney(value);
    if (field === "paidAt") return formatDateTime(value);
    return value;
  };
  return (
    <table aria-label={title} className="w-full text-xs">
      <caption className="mb-1 text-left text-xs font-semibold text-ink-secondary">{title}</caption>
      <tbody>
        {FIELDS.map((field) => (
          <tr key={field} className="border-t border-line first:border-t-0">
            <th scope="row" className="py-1 pr-2 text-left font-normal text-ink-muted">
              {t(`slips.field.${field}`)}
            </th>
            <td className="py-1 text-right tabular-nums text-ink">{display(field)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SlipCard({ slip, order, canReview }: { slip: SlipDto; order: SlipOrderInfo; canReview: boolean }) {
  const { t } = useT();
  const patch = usePatchSlip();
  const retry = useRetrySlip();
  const confirm = useConfirmSlip();
  const reject = useRejectSlip();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const open = isOpenSlip(slip);
  const busy = patch.isPending || retry.isPending || confirm.isPending || reject.isPending;
  const final = effective(slip);
  const editable = canReview && open && slip.status !== "PENDING_READ";
  const confirmable = canConfirmSlip(slip, canReview);

  async function run<T>(action: () => Promise<T>, successKey: Parameters<typeof t>[0]): Promise<boolean> {
    try {
      await action();
      toast.success(t(successKey));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t));
      return false;
    }
  }

  return (
    <Card className="rounded-[20px] p-4" data-testid={`slip-${slip.id}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SlipImage slipId={slip.id} />
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={SLIP_STATUS_TONE[slip.status]}>{t(`slips.status.${slip.status}`)}</StatusPill>
            <span className="text-xs text-ink-muted">{t(`slips.source.${slip.source}`)}</span>
            <time dateTime={slip.createdAt} className="text-xs text-ink-muted">
              {formatDateTime(slip.createdAt)}
            </time>
          </div>

          {slip.status === "PENDING_READ" ? <p className="text-sm text-ink-secondary">{t("slips.pendingNote")}</p> : null}
          {slip.status === "READ_FAILED" ? <p className="text-sm text-warning-ink">{t("slips.failedNote")}</p> : null}

          {slip.flags.length > 0 ? (
            <ul aria-label={t("slips.flags")} className="space-y-1">
              {slip.flags.map((flag) => (
                <li key={flag} className="flex items-start gap-1.5 text-xs font-medium text-warning-ink">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{t(slipFlagKey(flag))}</span>
                </li>
              ))}
            </ul>
          ) : slip.status === "READ" ? (
            <p className="text-xs text-success-ink">{t("slips.noFlags")}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ValuesTable title={t("slips.read")} values={slip.read} />
            <ValuesTable title={t("slips.confirmed")} values={slip.confirmed} />
          </div>

          {slip.reviewedBy ? <p className="text-xs text-ink-muted">{t("slips.reviewedBy", { name: slip.reviewedBy.name })}</p> : null}
          {slip.status === "REJECTED" && slip.rejectReason ? (
            <p className="text-xs text-ink-secondary">{t("slips.rejectReason", { reason: slip.rejectReason })}</p>
          ) : null}

          {editable ? (
            <SlipEditForm
              // ຄ່າຈາກ server ປ່ຽນ (ຫຼັງບັນທຶກ/ອ່ານໃໝ່) → ຣີເຊັດຟອມໃຫ້ກົງ
              key={JSON.stringify(final)}
              values={final}
              disabled={busy}
              saving={patch.isPending}
              onSave={(input) => run(() => patch.mutateAsync({ id: slip.id, input }), "slips.toast.saved")}
            />
          ) : null}

          {canReview && open ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" disabled={busy} loading={retry.isPending} onClick={() => void run(() => retry.mutateAsync(slip.id), "slips.toast.retried")}>
                {t("slips.action.retry")}
              </Button>
              {slip.status !== "PENDING_READ" ? (
                <>
                  <Button variant="outlineDanger" size="sm" disabled={busy} onClick={() => setRejectOpen(true)}>
                    {t("slips.action.reject")}
                  </Button>
                  <Button size="sm" className="font-bold" disabled={busy || !confirmable} onClick={() => setConfirmOpen(true)}>
                    {t("slips.action.confirm")}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {confirmable ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("slips.confirm.title")}
          description={[
            final.amount === null
              ? t("slips.confirm.noAmount")
              : t("slips.confirm.description", { amount: formatMoney(final.amount), currency: final.currency ?? order.currency, order: order.orderNumber }),
            slip.flags.length > 0 ? t("slips.confirm.flags", { count: slip.flags.length }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel={t("slips.action.confirm")}
          cancelLabel={t("common.cancel")}
          closeLabel={t("common.close")}
          busy={confirm.isPending}
          onConfirm={async () => {
            if (final.amount === null) return;
            await run(() => confirm.mutateAsync(slip.id), "slips.toast.confirmed");
            setConfirmOpen(false);
          }}
        />
      ) : null}
      <RejectSlipDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={async (reason) => {
          await reject.mutateAsync({ id: slip.id, reason });
          toast.success(t("slips.toast.rejected"));
        }}
      />
    </Card>
  );
}

function SlipEditForm({
  values,
  disabled,
  saving,
  onSave,
}: {
  values: SlipValuesDto;
  disabled: boolean;
  saving: boolean;
  onSave: (input: Record<string, string | null>) => Promise<boolean>;
}) {
  const { t } = useT();
  const uid = useId();
  const [amount, setAmount] = useState(values.amount ?? "");
  const [currency, setCurrency] = useState(values.currency ?? "");
  const [refNo, setRefNo] = useState(values.refNo ?? "");
  const [destAccount, setDestAccount] = useState(values.destAccount ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: Record<string, string | null> = {};
    const trimmedAmount = amount.trim();
    if (trimmedAmount !== (values.amount ?? "")) {
      if (trimmedAmount !== "" && normalizeSlipAmount(trimmedAmount) === null) {
        setAmountError(t("slips.edit.amountInvalid"));
        return;
      }
      // ຍອດຫວ່າງ = ລ້າງ (API ບໍ່ຍອມຮັບ amount ວ່າງ ຈຶ່ງບໍ່ສົ່ງ ແລະ ບອກວ່າບໍ່ມີການປ່ຽນ)
      if (trimmedAmount !== "") input.confirmedAmount = trimmedAmount;
    }
    setAmountError(null);
    if (currency !== (values.currency ?? "")) input.confirmedCurrency = currency === "" ? null : currency;
    if (refNo.trim() !== (values.refNo ?? "")) input.confirmedRefNo = refNo.trim() === "" ? null : refNo.trim();
    if (destAccount.trim() !== (values.destAccount ?? "")) input.confirmedDestAccount = destAccount.trim() === "" ? null : destAccount.trim();
    if (Object.keys(input).length === 0) {
      toast.info(t("slips.edit.none"));
      return;
    }
    await onSave(input);
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <Field label={t("slips.field.amount")} htmlFor={`${uid}-amount`} error={amountError ?? undefined}>
        <Input id={`${uid}-amount`} inputMode="decimal" value={amount} invalid={amountError !== null} disabled={disabled} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("slips.field.currency")} htmlFor={`${uid}-currency`}>
        <Select id={`${uid}-currency`} value={currency} disabled={disabled} onChange={(e) => setCurrency(e.target.value)}>
          <option value="">—</option>
          {SLIP_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("slips.field.refNo")} htmlFor={`${uid}-refNo`}>
        <Input id={`${uid}-refNo`} value={refNo} disabled={disabled} onChange={(e) => setRefNo(e.target.value)} />
      </Field>
      <Field label={t("slips.field.destAccount")} htmlFor={`${uid}-destAccount`}>
        <Input id={`${uid}-destAccount`} value={destAccount} disabled={disabled} onChange={(e) => setDestAccount(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="outlinePrimary" size="sm" disabled={disabled} loading={saving}>
          {t("slips.edit.save")}
        </Button>
      </div>
    </form>
  );
}
```

**ໝາຍເຫດການອອກແບບ:**
1. `ConfirmDialog` ຂອງ `@oca/ui` ໃຊ້ໄອຄອນເຕືອນສີແດງ: ຍອມຮັບໄດ້ (ການຢືນຢັນເງິນຍ້ອນບໍ່ໄດ້ ແລະ ອາດມີ flag). ຖ້າ `onConfirm` ລົ້ມ `run` ຈັບ error ແລ້ວ toast; dialog ປິດ.
2. `RejectSlipDialog.onConfirm` ຕ້ອງ throw ເມື່ອລົ້ມ (ເພື່ອໃຫ້ dialog ສະແດງ error ແລະ ຍັງເປີດ) — `reject.mutateAsync` throw ເອງ ຈຶ່ງບໍ່ຫໍ່ດ້ວຍ `run`.
3. ຍອດທີ່ແອດມິນລ້າງເປັນວ່າງ ບໍ່ຖືກສົ່ງ (API ບໍ່ຮັບ amount ວ່າງ): ຖືວ່າ "ບໍ່ມີການປ່ຽນ" ຖ້າບໍ່ມີ field ອື່ນປ່ຽນ.
4. `Button` ມີ variant `outline`, `outlinePrimary`, `outlineDanger`, `destructive` ແລະ size `sm` (ຖືກໃຊ້ຢູ່ແລ້ວໃນ component ອື່ນ); ຖ້າ type ບໍ່ຮັບ ໃຫ້ກວດ `packages/ui/src/components/button.tsx`.

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- slip-card` → PASS; `tsc --noEmit` + `lint` ສະອາດ. ແກ້ຕາມ 5 ຂໍ້ຂ້າງເທິງຈົນ test ຜ່ານ ໂດຍບໍ່ຜ່ອນ assertion.

- [ ] **Step 5: mutation check** (ລາຍງານ): (a) ເອົາ `disabled={busy || !confirmable}` ເປັນ `disabled={!confirmable}` → test "ຂະນະມີ action ກຳລັງສົ່ງ" ຕ້ອງແດງ; (b) ເອົາ `key={JSON.stringify(final)}` ອອກ ແລະ ກວດວ່າມີ test ຈັບການ reset ຟອມຫຼັງຄ່າປ່ຽນ — ຖ້າບໍ່ມີ ໃຫ້ເພີ່ມ test: rerender ດ້ວຍ slip ທີ່ `confirmed.amount` ປ່ຽນ ແລ້ວ `Amount` ຕ້ອງເປັນຄ່າໃໝ່; (c) ປ່ຽນ `slip.flags.length > 0` ໃນ description ເປັນ `false` → test ຢືນຢັນ+flag ຕ້ອງແດງ.

- [ ] **Step 6: commit** — `git add apps/admin/src/components/slips && git commit -m "feat(admin): slip card with edit, confirm, reject and retry"`.

---

### Task 7: OrderSlipsCard + ວາງໃນໜ້າບິນ

**Files:** Create `components/slips/order-slips-card.tsx`, `components/slips/order-slips-card.test.tsx`; Modify `components/orders/order-detail.tsx`, `components/orders/order-detail.test.tsx`

- [ ] **Step 1: test ແດງ** — `order-slips-card.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { SlipDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderSlipsCard } from "./order-slips-card";

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("./slip-image", () => ({ SlipImage: ({ slipId }: { slipId: string }) => <div data-testid={`image-${slipId}`} /> }));

const order = { id: "o1", orderNumber: "SO-000001", total: "100000.00", currency: "LAK" };
const slip = (id: string, status: SlipDto["status"] = "READ"): SlipDto => ({
  id, orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD", status,
  imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100000.00", currency: "LAK", paidAt: null, destAccount: null, refNo: id },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const file = (type = "image/png", size = 10) => {
  const f = new File(["x"], "a.png", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

beforeEach(() => {
  auth.perms = new Set(["orders:read", "orders:write", "payments:write"]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue([]);
});

describe("OrderSlipsCard", () => {
  it("ໂຫຼດສະລິບຂອງບິນ ແລະ ສະແດງແຕ່ລະໃບ; ບໍ່ມີ = ຂໍ້ຄວາມວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([slip("s1"), slip("s2", "CONFIRMED")]);
    renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByTestId("slip-s1")).toBeInTheDocument();
    expect(screen.getByTestId("slip-s2")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/slips");
  });

  it("ວ່າງ → 'No slips for this order yet'", async () => {
    renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByText("No slips for this order yet")).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ → error + Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "x"));
    const { user } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No slips for this order yet")).toBeInTheDocument();
  });

  it("ອັບໂຫຼດ: ເລືອກຮູບ → POST multipart /orders/o1/slips ແລ້ວ refetch", async () => {
    const { user } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    vi.mocked(apiFetch).mockResolvedValueOnce(slip("s9", "PENDING_READ"));
    await user.upload(screen.getByLabelText("Upload slip"), file());
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post?.[0]).toBe("/orders/o1/slips");
      expect((post?.[1] as { body: FormData }).body.get("file")).toBeInstanceOf(File);
    });
  });

  it("ໄຟລ໌ຜິດຊະນິດ/ໃຫຍ່ເກີນ → ບໍ່ຍິງ API ແລະ ບອກເຫດຜົນ", async () => {
    renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    const input = screen.getByLabelText("Upload slip");
    fireEvent.change(input, { target: { files: [file("image/gif")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only JPG, PNG and WebP images are supported");
    fireEvent.change(input, { target: { files: [file("image/png", 9 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 8MB");
    expect(vi.mocked(apiFetch).mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST")).toHaveLength(0);
  });

  it("ບໍ່ມີ orders:write → ບໍ່ມີປຸ່ມອັບໂຫຼດ; ບໍ່ມີ payments:write → ບໍ່ມີປຸ່ມຢືນຢັນ/ປະຕິເສດ", async () => {
    auth.perms = new Set(["orders:read"]);
    vi.mocked(apiFetch).mockResolvedValue([slip("s1")]);
    renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByTestId("slip-s1");
    expect(screen.queryByLabelText("Upload slip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("ບໍ່ມີ orders:read → ບໍ່ render ຫຍັງ ແລະ ບໍ່ຍິງ API", () => {
    auth.perms = new Set();
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(container).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- order-slips-card` → **FAIL**.

- [ ] **Step 3: implement** — `components/slips/order-slips-card.tsx`:

```tsx
"use client";

import { SLIP_MAX_BYTES } from "@oca/shared";
import { Button, Card, Skeleton, toast } from "@oca/ui";
import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useOrderSlips, useUploadSlip } from "@/lib/queries";
import { validateSlipFile } from "@/lib/slips";
import { SlipCard, type SlipOrderInfo } from "./slip-card";

const MAX_MB = SLIP_MAX_BYTES / (1024 * 1024);

/** panel ສະລິບໃນໜ້າບິນ. ຜູ້ເອີ້ນບໍ່ຕ້ອງກວດສິດ: ບໍ່ມີ orders:read = ບໍ່ render ຫຍັງ */
export function OrderSlipsCard({ order }: { order: SlipOrderInfo }) {
  const canRead = useCan("orders:read");
  if (!canRead) return null;
  return <OrderSlipsInner order={order} />;
}

function OrderSlipsInner({ order }: { order: SlipOrderInfo }) {
  const { t } = useT();
  const uid = useId();
  const canUpload = useCan("orders:write");
  const canReview = useCan("payments:write");
  const slips = useOrderSlips(order.id);
  const upload = useUploadSlip();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateSlipFile(file);
    if (problem) {
      setFileError(problem === "type" ? t("slips.file.type") : t("slips.file.size", { max: MAX_MB }));
      return;
    }
    setFileError(null);
    try {
      await upload.mutateAsync({ orderId: order.id, file });
      toast.success(t("slips.toast.uploaded"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  const headingId = `${uid}-title`;
  return (
    <Card className="rounded-[20px] p-6" aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-bold text-ink">
          {t("slips.title")}
        </h2>
        {canUpload ? (
          <div>
            <input
              ref={inputRef}
              id={`${uid}-file`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("slips.upload")}
              className="sr-only"
              onChange={(event) => void onPick(event)}
            />
            <Button variant="outlinePrimary" size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" />
              {t("slips.upload")}
            </Button>
            <p className="mt-1 text-[11px] text-ink-muted">{t("slips.upload.hint")}</p>
          </div>
        ) : null}
      </div>
      {fileError ? (
        <p role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {fileError}
        </p>
      ) : null}
      {slips.isError && !slips.data ? (
        <div role="alert" className="flex items-center gap-2 text-sm text-danger">
          {t("common.error.load")}
          <Button variant="outline" size="sm" onClick={() => void slips.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : slips.isPending ? (
        <Skeleton role="status" aria-busy="true" aria-label={t("common.loading")} className="h-24 w-full" />
      ) : slips.data && slips.data.length > 0 ? (
        <div className="space-y-4">
          {slips.data.map((slip) => (
            <SlipCard key={slip.id} slip={slip} order={order} canReview={canReview} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">{t("slips.empty")}</p>
      )}
    </Card>
  );
}
```

ໝາຍເຫດ: `Card` ອາດບໍ່ຮັບ `aria-labelledby` (ຖ້າບໍ່ຮັບ ໃຫ້ເຂົ້າ `<section aria-labelledby=...>` ຫໍ່ Card). ຖ້າ test "ບໍ່ມີ orders:read" ລົ້ມເພາະ hook ຖືກເອີ້ນຕາມເງື່ອນໄຂ — ໂຄດຂ້າງເທິງແຍກເປັນສອງ component ເພື່ອກັນບັນຫານັ້ນ. Test ທີ່ "ຍິງ upload": `user.upload` ກັບ `input` ທີ່ `sr-only` ໃຊ້ໄດ້ (ບໍ່ hidden).

- [ ] **Step 4: ວາງໃນໜ້າບິນ** — `order-detail.tsx`: import `OrderSlipsCard` ແລະ ໃສ່ຫຼັງ `<OrderItemsCard order={order} showCost={showCost} />`:

```tsx
        <OrderSlipsCard order={{ id: order.id, orderNumber: order.orderNumber, total: order.total, currency: order.currency }} />
```

ແລ້ວແກ້ `order-detail.test.tsx`: `mockOrder` ປັດຈຸບັນຕອບ `order` ໃຫ້ທຸກ path ຈຶ່ງ `/orders/o1/slips` ໄດ້ object (ບໍ່ແມ່ນ array). ປ່ຽນເປັນ:

```ts
function mockOrder(order: OrderDetailDto) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) =>
    path.endsWith("/slips") ? [] : order) as typeof apiFetch);
}
```

ແລະ test ທີ່ນັບ `gets()` ອາດມີ GET `/orders/o1/slips` ເພີ່ມ: ແກ້ `gets()` ໃຫ້ຕັດ `/slips` ອອກ: `.filter((call) => !call[1]?.method && !String(call[0]).endsWith("/slips"))`. ຈາກນັ້ນເພີ່ມ test: "ໜ້າບິນສະແດງ panel ສະລິບ (heading 'Payment slips')" ແລະ "ບໍ່ມີ orders:read → ບໍ່ມີ panel" (ເມື່ອ perms ບໍ່ມີ orders:read).

ລັນ `pnpm --filter @oca/admin test -- order-detail order-slips-card` ຕ້ອງຜ່ານທັງໝົດ (ລວມ test ເກົ່າຂອງ order-detail).

- [ ] **Step 5:** `pnpm --filter @oca/admin lint && pnpm --filter @oca/admin exec tsc --noEmit` ສະອາດ.

- [ ] **Step 6: commit** — `git add apps/admin/src/components/slips apps/admin/src/components/orders/order-detail.tsx apps/admin/src/components/orders/order-detail.test.tsx && git commit -m "feat(admin): slips panel on the order page"`.

---

### Task 8: Inbox — "ໃຊ້ເປັນສະລິບ"

**Files:** Create `components/inbox/link-slip-dialog.tsx` (+test); Modify `message-bubble.tsx` (+test), `thread-pane.tsx` (+test), `inbox-page.tsx`

ພຶດຕິກຳ: ແຕ່ລະຮູບ (attachment `image` ທີ່ມີ URL ປອດໄພ) ໃນຟອງຂໍ້ຄວາມ **ຂາເຂົ້າ** ມີປຸ່ມ "Use as slip" ເມື່ອ `canLinkSlip`; ຖ້າຮູບຜູກແລ້ວ (ມີສະລິບທີ່ `messageId`+`attachmentIndex` ກົງ) ສະແດງປ້າຍ "Linked as a slip" ແທນ. ກົດປຸ່ມ → `LinkSlipDialog` ລາຍການບິນຂອງເຄສ (radio), ບິນທີ່ບໍ່ແມ່ນ `PENDING_PAYMENT` ຖືກປິດ + ຂໍ້ຄວາມ "cannot accept payment", ເລືອກເລີ່ມຕົ້ນ = ບິນ PENDING_PAYMENT ຫຼ້າສຸດ; ບໍ່ມີບິນ = ຂໍ້ຄວາມ + ລິ້ງ ເປີດບິນ (`/orders/new?conversationId=`).

- [ ] **Step 1: test ແດງ (dialog)** — `link-slip-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { OrderListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { LinkSlipDialog } from "./link-slip-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));

const order = (id: string, status: OrderListItemDto["status"], total = "100.00"): OrderListItemDto => ({
  id, orderNumber: `SO-${id}`, status, channel: "FACEBOOK", source: "CHAT", conversationId: "c1",
  customer: null, total, itemCount: 1, reservedUntil: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const page = (items: OrderListItemDto[]) => ({ items, total: items.length, page: 1, pageSize: 20 });
const target = { conversationId: "c1", messageId: "m1", attachmentIndex: 1 };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("LinkSlipDialog", () => {
  it("ລາຍການບິນຂອງເຄສ: ເລືອກເລີ່ມຕົ້ນເປັນບິນ PENDING_PAYMENT ແລະ ບິນອື່ນຖືກປິດ ພ້ອມເຫດຜົນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([order("A", "PAID"), order("B", "PENDING_PAYMENT", "250.00")]));
    renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} />);
    const pending = await screen.findByRole("radio", { name: /SO-B/ });
    expect(pending).toBeChecked();
    const paid = screen.getByRole("radio", { name: /SO-A/ });
    expect(paid).toBeDisabled();
    expect(screen.getByText(/cannot accept payment/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20");
  });

  it("ຜູກ: POST ດ້ວຍ { orderId, attachmentIndex } ແລ້ວປິດ dialog", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    vi.mocked(apiFetch).mockResolvedValueOnce({ id: "s1" });
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/messages/m1/slips", { method: "POST", body: { orderId: "B", attachmentIndex: 1 } });
  });

  it("ລົ້ມ (ລິ້ງໝົດອາຍຸ 422) → ສະແດງຂໍ້ຄວາມ error ໃນ dialog ແລະ ຍັງເປີດ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("B", "PENDING_PAYMENT")]));
    const onClose = vi.fn();
    const { user } = renderWithProviders(<LinkSlipDialog target={target} onClose={onClose} />);
    await screen.findByRole("radio", { name: /SO-B/ });
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(422, "x", [], "SLIP_FILE_INVALID"));
    await user.click(screen.getByRole("button", { name: "Link slip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid image");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ບໍ່ມີບິນ → ຂໍ້ຄວາມ ແລະ ປຸ່ມຜູກຖືກປິດ; ບໍ່ມີບິນທີ່ຮັບຊຳລະໄດ້ → ປຸ່ມຜູກຖືກປິດ", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page([]));
    const { unmount } = renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} />);
    expect(await screen.findByText("This conversation has no orders yet; open an order first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
    unmount();
    vi.mocked(apiFetch).mockResolvedValueOnce(page([order("A", "PAID")]));
    renderWithProviders(<LinkSlipDialog target={target} onClose={vi.fn()} />);
    await screen.findByRole("radio", { name: /SO-A/ });
    expect(screen.getByRole("button", { name: "Link slip" })).toBeDisabled();
  });

  it("target = null → ບໍ່ render dialog ແລະ ບໍ່ຍິງ API", () => {
    renderWithProviders(<LinkSlipDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- link-slip-dialog` → **FAIL**.

- [ ] **Step 3: implement** — `components/inbox/link-slip-dialog.tsx`:

```tsx
"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Skeleton, toast } from "@oca/ui";
import { useState } from "react";
import { OrderStatusPill } from "@/components/orders/order-status";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useLinkChatSlip, useOrders } from "@/lib/queries";

export interface LinkSlipTarget {
  conversationId: string;
  messageId: string;
  attachmentIndex: number;
}

/** key ຕາມ target: ເປີດຮູບອື່ນ = remount (ຄ່າທີ່ເລືອກ/ຂໍ້ຄວາມ error ບໍ່ຮົ່ວຂ້າມຮູບ) */
export function LinkSlipDialog({ target, onClose }: { target: LinkSlipTarget | null; onClose: () => void }) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {target ? (
          <LinkForm key={`${target.messageId}:${target.attachmentIndex}`} target={target} saving={saving} onSavingChange={setSaving} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  target,
  saving,
  onSavingChange,
  onClose,
}: {
  target: LinkSlipTarget;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const orders = useOrders({ conversationId: target.conversationId, page: 1, pageSize: 20 });
  const link = useLinkChatSlip();
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = orders.data?.items ?? [];
  const payable = items.filter((order) => order.status === "PENDING_PAYMENT");
  // ເລີ່ມຕົ້ນ = ບິນທີ່ຮັບຊຳລະໄດ້ ຫຼ້າສຸດ (API ຮຽງໃໝ່ສຸດກ່ອນ)
  const selected = picked ?? payable[0]?.id ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !selected) return;
    setMessage(null);
    onSavingChange(true);
    try {
      await link.mutateAsync({
        conversationId: target.conversationId,
        messageId: target.messageId,
        input: { orderId: selected, attachmentIndex: target.attachmentIndex },
      });
      toast.success(t("slips.toast.linked"));
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("slips.link.title")} description={t("slips.link.description")} />
      <DialogBody>
        {message ? (
          <p role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        {orders.isError && !orders.data ? (
          <div role="alert" className="flex items-center gap-2 text-sm text-danger">
            {t("common.error.load")}
            <Button type="button" variant="outline" size="sm" onClick={() => void orders.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : orders.isPending ? (
          <Skeleton role="status" aria-busy="true" aria-label={t("common.loading")} className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-secondary">{t("slips.link.noOrders")}</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("slips.link.title")}</legend>
            {items.map((order) => {
              const ok = order.status === "PENDING_PAYMENT";
              return (
                <label
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm has-[:disabled]:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name="slip-order"
                      value={order.id}
                      checked={selected === order.id}
                      disabled={!ok || saving}
                      onChange={() => setPicked(order.id)}
                    />
                    <span className="font-mono font-semibold">{order.orderNumber}</span>
                    <span className="tabular-nums text-ink-secondary">{formatMoney(order.total)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <OrderStatusPill status={order.status} />
                    {ok ? null : <span className="text-[11px] text-ink-muted">{t("slips.link.notPayable")}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={saving} onClick={onClose}>
          {t("slips.link.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving} disabled={!selected}>
          {t("slips.link.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

ໝາຍເຫດ: ຊື່ accessible ຂອງ radio = ຂໍ້ຄວາມໃນ `<label>` (ມີເລກບິນ) ຈຶ່ງ regex `/SO-B/` ຈັບໄດ້. ຖ້າ ຮຽງລຳດັບບິນໃນ test ຕ້ອງ "ບິນທີ່ຮັບຊຳລະໄດ້ຫຼ້າສຸດ" ເປັນອັນທຳອິດໃນ `payable` ຕາມລຳດັບ API.

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- link-slip-dialog` → PASS.

- [ ] **Step 5: test ແດງ (message-bubble)** — ເພີ່ມໃນ `message-bubble.test.tsx` (ອ່ານໄຟລ໌ກ່ອນ ເພື່ອໃຊ້ fixture/helper ເດີມ):

```tsx
describe("MessageBubble: ໃຊ້ເປັນສະລິບ", () => {
  const imageMessage = (patch: Partial<MessageDto> = {}): MessageDto => ({
    id: "m1", direction: "IN", text: null, attachments: [{ type: "image", url: "https://cdn.example/a.png" }, { type: "file", url: null }],
    status: "SENT", errorCode: null, sentBy: null, createdAt: "2026-10-07T08:00:00.000Z", ...patch,
  });

  it("ບໍ່ມີ onUseAsSlip → ບໍ່ມີປຸ່ມ (ພຶດຕິກຳເດີມ)", () => {
    renderWithProviders(<ul><MessageBubble message={imageMessage()} /></ul>);
    expect(screen.queryByRole("button", { name: "Use as slip" })).toBeNull();
  });

  it("ຂໍ້ຄວາມຂາເຂົ້າທີ່ມີຮູບ: ມີປຸ່ມ ແລະ ກົດແລ້ວຮຽກ onUseAsSlip(index) ດ້ວຍ index ຂອງ attachment; ໄຟລ໌ທີ່ບໍ່ແມ່ນຮູບບໍ່ມີປຸ່ມ", async () => {
    const onUseAsSlip = vi.fn();
    const { user } = renderWithProviders(<ul><MessageBubble message={imageMessage()} onUseAsSlip={onUseAsSlip} /></ul>);
    const buttons = screen.getAllByRole("button", { name: "Use as slip" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0] as HTMLElement);
    expect(onUseAsSlip).toHaveBeenCalledWith(0);
  });

  it("ຂໍ້ຄວາມຂາອອກ (OUT) ບໍ່ມີປຸ່ມ; ຮູບທີ່ຜູກແລ້ວສະແດງ 'Linked as a slip' ແທນປຸ່ມ", () => {
    const onUseAsSlip = vi.fn();
    const { unmount } = renderWithProviders(<ul><MessageBubble message={imageMessage({ direction: "OUT" })} onUseAsSlip={onUseAsSlip} /></ul>);
    expect(screen.queryByRole("button", { name: "Use as slip" })).toBeNull();
    unmount();
    renderWithProviders(<ul><MessageBubble message={imageMessage()} onUseAsSlip={onUseAsSlip} linkedIndexes={new Set([0])} /></ul>);
    expect(screen.queryByRole("button", { name: "Use as slip" })).toBeNull();
    expect(screen.getByText("Linked as a slip")).toBeInTheDocument();
  });
});
```

`pnpm --filter @oca/admin test -- message-bubble` → **FAIL**. ແລ້ວແກ້ `message-bubble.tsx`:
  - props: `export function MessageBubble({ message, onUseAsSlip, linkedIndexes }: { message: MessageDto; onUseAsSlip?: (attachmentIndex: number) => void; linkedIndexes?: ReadonlySet<number> })`.
  - ຫຼັງ `<a ...><img/></a>` ຂອງຮູບ (ພາຍໃນ `map`) ເພີ່ມ (ຕ້ອງຫໍ່ ເປັນ Fragment ທີ່ມີ key):

```tsx
        {message.attachments.map((attachment, index) => {
          const url = attachment.type === "image" ? safeAttachmentUrl(attachment.url) : null;
          return url ? (
            <div key={index} className="mt-1">
              <a href={url} target="_blank" rel="noopener noreferrer" title={t("inbox.attachment.open")} className="block">
                <img src={url} alt={t("inbox.attachment.image")} loading="lazy" referrerPolicy="no-referrer" className="max-h-60 rounded-lg" />
              </a>
              {!out && onUseAsSlip ? (
                linkedIndexes?.has(index) ? (
                  <p className="mt-1 text-xs font-semibold text-success-ink">{t("slips.link.linked")}</p>
                ) : (
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => onUseAsSlip(index)}>
                    {t("slips.link.action")}
                  </Button>
                )
              ) : null}
            </div>
          ) : (
            <p key={index} className="mt-1 text-xs opacity-80">
              {t("inbox.attachment.file", { type: attachment.type })}
            </p>
          );
        })}
```
  (import `Button` ຈາກ `@oca/ui` ຄຽງ `cn`; ຮັກສາໂຄງເດີມຂອງ `<a>` ໃຫ້ test ເກົ່າຜ່ານ: ເດີມ `<a className="mt-1 block">` ຖືກຍ້າຍ `mt-1` ໄປ `div` — ຖ້າ test ເກົ່າ assert class ນີ້ໃຫ້ປັບຕາມ).
  → test PASS ພ້ອມ test ເກົ່າ.

- [ ] **Step 6: ThreadPane + InboxPage** — test ແດງໃນ `thread-pane.test.tsx` (ອ່ານໄຟລ໌ເພື່ອຮູບແບບ mock; ເພີ່ມ):
  - `canLinkSlip` ບໍ່ສົ່ງ → ບໍ່ມີປຸ່ມ "Use as slip" ແລະ **ບໍ່ຍິງ** `/conversations/c1/slips`.
  - `canLinkSlip` ສົ່ງ + ຂໍ້ຄວາມຮູບຂາເຂົ້າ → ມີປຸ່ມ; ກົດ → dialog "Link this image as an order's slip" ເປີດ (mock `/orders?conversationId=c1...`).
  - ມີສະລິບທີ່ `messageId`+`attachmentIndex` ກົງ (mock `/conversations/c1/slips`) → ສະແດງ "Linked as a slip" ແທນປຸ່ມ.

  ແລ້ວແກ້ `thread-pane.tsx`: prop `canLinkSlip?: boolean` (default false); `const conversationSlips = useConversationSlips(conversationId, { enabled: canLinkSlip });` `const linked = useMemo(() => { const map = new Map<string, Set<number>>(); for (const slip of conversationSlips.data ?? []) if (slip.messageId && slip.attachmentIndex !== null) { map.get(slip.messageId)?.add(slip.attachmentIndex) ?? map.set(slip.messageId, new Set([slip.attachmentIndex])); } return map; }, [conversationSlips.data]);` `const [slipTarget, setSlipTarget] = useState<LinkSlipTarget | null>(null);` ໃນ `items.map`: `<MessageBubble key=... message={message} onUseAsSlip={canLinkSlip ? (index) => setSlipTarget({ conversationId, messageId: message.id, attachmentIndex: index }) : undefined} linkedIndexes={linked.get(message.id)} />`; ທ້າຍ component ເພີ່ມ `{canLinkSlip ? <LinkSlipDialog target={slipTarget} onClose={() => setSlipTarget(null)} /> : null}`. ປ່ຽນເຄສ → ປິດ dialog: `useEffect(() => setSlipTarget(null), [conversationId])`.

  `inbox-page.tsx`: ຄຽງ `const canWrite = useCan("inbox:write");` ເພີ່ມ `const canWriteOrders = useCan("orders:write"); const canLinkSlip = canWrite && canWriteOrders;` ແລະ ສົ່ງ `canLinkSlip={canLinkSlip}` ໃຫ້ທຸກບ່ອນທີ່ render `<ThreadPane ...>`. ແກ້ `inbox-page.test.tsx` ຖ້າ mock `useCan` ຕ້ອງໃຫ້ຮອງຮັບ `orders:write` (ເບິ່ງວິທີ mock ໃນໄຟລ໌).

- [ ] **Step 7:** `pnpm --filter @oca/admin test -- inbox link-slip message-bubble thread-pane` ທັງໝົດຜ່ານ; lint + tsc ສະອາດ.

- [ ] **Step 8: commit** — `git add apps/admin/src/components/inbox && git commit -m "feat(admin): link chat images as payment slips from the inbox"`.

---

### Task 9: Settings — ບັນຊີຮັບເງິນ

**Files:** Modify `components/settings/store-settings-form.tsx`, `store-settings-form.test.tsx`

ພຶດຕິກຳ: ພາຍໃຕ້ຟອມ settings ມີ fieldset "Store receiving accounts": ແຕ່ລະແຖວ (bank, accountNo, accountName) + ປຸ່ມລຶບ (`aria-label` = `Remove account {n}`) + ປຸ່ມ "Add account" (ສູງສຸດ 20); ບໍ່ມີແຖວ = ຂໍ້ຄວາມ "No receiving accounts set". ບັນທຶກສົ່ງ `receivingAccounts` ພ້ອມ field ອື່ນຜ່ານ `PATCH /settings/store`. ບັງຄັບດ້ວຍ `receivingAccountsSchema` (bank + accountNo ມີຕົວເລກ ບໍ່ວ່າງ).

- [ ] **Step 1: test ແດງ** — ໃນ `store-settings-form.test.tsx`: ເພີ່ມ `receivingAccounts: []` ໃນ fixture `settings`; ແກ້ test ເດີມ "ບັນທຶກ: PATCH ພ້ອມ vatRate..." ໃຫ້ body ເປັນ `{ name: "OCA Store", vatRate: "7", pricesIncludeVat: false, reservationMinutes: 45, receivingAccounts: [] }`; ເພີ່ມ helper ແລະ test ໃໝ່ (mock `useCan: () => auth.canWrite` ຂອງໄຟລ໌ນີ້ໃຫ້ຜົນດຽວກັນທຸກສິດ; `toast.success/error` ຖືກ mock ແລ້ວ):

```tsx
const patchCall = () =>
  vi.mocked(apiFetch).mock.calls.find((call) => (call[1] as { method?: string } | undefined)?.method === "PATCH");
```


```tsx
  it("ແກ້ບັນຊີຮັບເງິນ: ເພີ່ມ/ລຶບແຖວ ແລ້ວບັນທຶກສົ່ງ receivingAccounts ໃນ PATCH ດຽວກັນ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByText("No receiving accounts set")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText("Bank"), "BCEL");
    await user.type(screen.getByLabelText("Account no."), "010-12-00-0123");
    await user.type(screen.getByLabelText("Account name"), "OCA");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchCall()?.[1]).toMatchObject({ method: "PATCH", body: expect.objectContaining({ receivingAccounts: [{ bank: "BCEL", accountNo: "010-12-00-0123", accountName: "OCA" }] }) });
  });

  it("ບັນຊີທີ່ຂາດທະນາຄານ/ເລກບັນຊີບໍ່ມີຕົວເລກ → error ແລະ ບໍ່ຍິງ API; ລຶບແຖວໄດ້", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByText("No receiving accounts set");
    await user.click(screen.getByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText("Account no."), "abc");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Bank and account number (with digits) are required")).toBeInTheDocument();
    expect(patchCall()).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Remove account 1" }));
    expect(screen.getByText("No receiving accounts set")).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດຂຽນ → ເຫັນລາຍການ ແຕ່ແກ້ບໍ່ໄດ້ (input ປິດ, ບໍ່ມີປຸ່ມເພີ່ມ/ລຶບ)", async () => {
    auth.canWrite = false;
    vi.mocked(apiFetch).mockImplementation(
      (async () => ({ ...settings, receivingAccounts: [{ bank: "BCEL", accountNo: "0101", accountName: "OCA" }] })) as typeof apiFetch,
    );
    renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByDisplayValue("BCEL")).toBeDisabled();
    expect(screen.getByLabelText("Account no.")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove account 1" })).toBeNull();
  });
```

- [ ] **Step 2:** `pnpm --filter @oca/admin test -- store-settings-form` → **FAIL**.

- [ ] **Step 3: implement** — ໃນ `store-settings-form.tsx`:
  - import `receivingAccountsSchema` ຈາກ `@oca/shared`; ໃຊ້ `useFieldArray` ຂອງ react-hook-form (ເພີ່ມ import).
  - `formSchema` ເພີ່ມ `receivingAccounts: z.array(z.object({ bank: z.string().trim(), accountNo: z.string().trim(), accountName: z.string().trim().optional() })).max(20)` ແລ້ວໃນ `submit` ກ່ອນ `update.mutateAsync` ກວດດ້ວຍ `receivingAccountsSchema.safeParse(values.receivingAccounts.map(({accountName, ...rest}) => ({...rest, ...(accountName ? {accountName} : {})})))`; ບໍ່ຜ່ານ → `setFormError(t("settings.receiving.invalid"))` ແລະ return; ຜ່ານ → ສົ່ງ `receivingAccounts: parsed.data`.
  - `defaultValues`/`reset` ເພີ່ມ `receivingAccounts: settings.receivingAccounts.map((a) => ({ bank: a.bank, accountNo: a.accountNo, accountName: a.accountName ?? "" }))`.
  - UI: ຫຼັງ field ເດີມ ເພີ່ມ `<fieldset>` ຕາມພຶດຕິກຳຂ້າງເທິງ ໂດຍມີ `<legend>` = `settings.receiving.title` + ຄຳອະທິບາຍ; ແຕ່ລະແຖວ 3 `Field` (htmlFor ເປັນ id ທີ່ unique ຕໍ່ index) + ປຸ່ມລຶບ; ປຸ່ມ "Add account" `disabled` ເມື່ອ ≥ 20 ຫຼື `!canWrite`; ເມື່ອ `!canWrite` input ທັງໝົດ `disabled` ແລະ ບໍ່ສະແດງປຸ່ມເພີ່ມ/ລຶບ.
  - `update.mutateAsync(values)` ຕ້ອງຕັດ field ທີ່ຟອມມີແຕ່ API ບໍ່ຮັບ (strictObject): ສົ່ງ object ໃໝ່ `{ name, vatRate, pricesIncludeVat, reservationMinutes, receivingAccounts }`.

- [ ] **Step 4:** `pnpm --filter @oca/admin test -- store-settings-form` ທັງໄຟລ໌ຜ່ານ (test ເກົ່າບໍ່ພັງ — ຖ້າ test ເກົ່າ assert `body` ເທົ່າກັບ 4 field ໃຫ້ປັບໃຫ້ມີ `receivingAccounts: []`); lint + tsc ສະອາດ.

- [ ] **Step 5: commit** — `git add apps/admin/src/components/settings && git commit -m "feat(admin): store receiving accounts in settings"`.

---

### Task 10: ກວດລວມ + smoke ໃນ Chrome ຈິງ + ເອກະສານ

- [ ] **Step 1:** `pnpm lint && pnpm build && pnpm test` ທັງ repo ຂຽວ (ລາຍງານຈຳນວນ test ຕໍ່ package). ຖ້າ `apps/admin` build ໃຊ້ `.next` ຮ່ວມກັບ dev server ຂອງຜູ້ໃຊ້ → **ຫ້າມ** build ໃນ working copy ຫຼັກ; ແຕກ copy ແຍກ (ຕາມທີ່ເຄີຍເຮັດໃນ smoke ຂອງ 1a/2a ໃນ memory `phase1-progress`) ແລ້ວ build ທີ່ນັ້ນ.

- [ ] **Step 2: smoke ໃນ Chrome headless** ດ້ວຍ `playwright-core` ທີ່ຕິດຕັ້ງໃນ scratchpad (ບໍ່ແກ້ repo), ໃນ copy ແຍກ + DB ແຍກ `oca_slip_smoke` + API/admin/worker ພອດແຍກ (3013/3113) ແລະ Redis prefix ແຍກ — **ບໍ່ແຕະ** dev server/DB ຂອງຜູ້ໃຊ້ ແລະ ຢ່າ kill :3000/:3001/:3002/:3100. ຕັ້ງ `SLIP_READER=fake` ແລະ `SLIP_FAKE_RESULT` ຕາມບິນທົດສອບ. ຂັ້ນຕອນທີ່ຕ້ອງພິສູດ ແລະ ລາຍງານ (ຜ່ານ/ບໍ່ຜ່ານ + ຮູບ/ຫຼັກຖານ):
  1. settings: ເພີ່ມບັນຊີຮັບເງິນ → ບັນທຶກ → reload ຍັງຢູ່.
  2. ສ້າງບິນ → ໜ້າບິນ → ອັບໂຫຼດ PNG → ສະລິບ `Reading` ແລ້ວປ່ຽນເປັນ `To review` ເອງ (poll ≤ ~6 ວິ) ພ້ອມຄ່າທີ່ອ່ານ.
  3. flag: ຕັ້ງຄ່າອ່ານໃຫ້ຍອດຜິດ → ເຫັນ "Amount does not match…"; ອັບໂຫຼດຮູບດຽວກັນອີກ → "Image duplicates…".
  4. ແກ້ຍອດ → ບັນທຶກ → flag ຫາຍ; ຢືນຢັນ → dialog ບອກຍອດ+ເລກບິນ → ບິນເປັນ `Paid`, ສະລິບ `Confirmed` (ບໍ່ມີປຸ່ມ).
  5. ປະຕິເສດ (ເຫດຜົນບັງຄັບ) ກັບສະລິບອີກໃບ.
  6. Inbox: ໃຊ້ simulator (`pnpm --filter @oca/channels simulate`) ສົ່ງຮູບເຂົ້າແຊັດ → "Use as slip" → ເລືອກບິນ → ສະລິບເກີດໃນໜ້າບິນ; ປຸ່ມກາຍເປັນ "Linked as a slip". ລິ້ງຮູບໝົດອາຍຸ (simulator ຕອບ 403) → ຂໍ້ຄວາມ error ໃນ dialog.
  7. ສິດ: CHAT_ADMIN ອັບໂຫຼດ/ຜູກໄດ້ ແຕ່ບໍ່ເຫັນປຸ່ມຢືນຢັນ/ປະຕິເສດ; WAREHOUSE/ACCOUNTANT ເຫັນສະລິບ ແຕ່ບໍ່ມີປຸ່ມ.
  8. worker ຢຸດ → ສະລິບຄ້າງ `Reading`; ເປີດ worker ຄືນ → ອ່ານເອງ; ຮູບໂຫຼດບໍ່ໄດ້ (ລຶບໄຟລ໌ໃນ storage) → alert + Retry.
  9. ໜ້າຈໍແຄບ 390px: panel ສະລິບບໍ່ລົ້ນຂອບ; dark mode: ຂໍ້ຄວາມ flag ອ່ານອອກ.
  ແກ້ bug ທີ່ພົບດ້ວຍ test ແດງກ່ອນ. ບໍ່ commit ຫຍັງ ເວັ້ນແຕ່ແກ້ bug. ຢຸດ process ທີ່ເຮົາເປີດ ແລະ ລຶບ DB/ໂຟເດີຊົ່ວຄາວ.

- [ ] **Step 3: ເອກະສານ** — `docs/ROADMAP.md`: ແຖວ "4 | 9. Slip Verification" ປ່ຽນຂອບເຂດເປັນ "**ຂັ້ນ 1 ສຳເລັດ**: ຮັບສະລິບ (ແຊັດ + ອັບໂຫຼດ), ກວດ 4 ຢ່າງ, ຄົນຢືນຢັນ → PAID, `SlipReader` interface (ມີແຕ່ fake). ເຫຼືອ **ຂັ້ນ 2**: bake-off + ເລືອກ/host model OCR ເອງ + fine-tune" (ຮັກສາຮູບແບບຕາຕະລາງ). `README.md`: ຖ້າມີ section ກ່ຽວກັບ inbox/simulator ໃຫ້ເພີ່ມປະໂຫຍກສັ້ນ ຊີ້ໄປ spec + `SLIP_*` env. Commit: `git add docs README.md && git commit -m "docs: mark slip verification stage 1 done"`.

---

## Self-review (ເຮັດແລ້ວ)
- Spec §8 UI: panel ສະລິບໃນໜ້າບິນ (Task 6-7), flag ເປັນຂໍ້ຄວາມ + ໄອຄອນ ບໍ່ໃຊ້ສີຢ່າງດຽວ (Task 6), confirm dialog ຍອດ + ເລກບິນ (Task 6), ປຸ່ມ "ໃຊ້ເປັນສະລິບ" ໃນ Inbox (Task 8), ຮູບຜ່ານ auth + `readRaw` ບໍ່ສະແດງ (Task 4), `receivingAccounts` (Task 9).
- ຊື່ສອດຄ່ອງກັບ S2: routes, `SlipDto` fields (`read`, `confirmed`, `flags`, `reviewedBy`, `rejectReason`), error codes (`SLIP_*`, ໃຊ້ຜ່ານ `errorMessage` ທີ່ເພີ່ມ i18n ແລ້ວໃນ S1).
- ຄວາມສ່ຽງທີ່ບັນທຶກ: `toast.info` ອາດບໍ່ມີ; ids ຊ້ຳໃນຫຼາຍ SlipCard (ໃຫ້ແກ້ດ້ວຍ `useId`); `Card` ອາດບໍ່ຮັບ aria props; ConfirmDialog ໄອຄອນແດງ (ຍອມຮັບ); test ເກົ່າຂອງ order-detail/message-bubble/thread-pane/store-settings ອາດຕ້ອງປັບ fixture (ລະບຸໄວ້ໃນແຕ່ລະ Task).

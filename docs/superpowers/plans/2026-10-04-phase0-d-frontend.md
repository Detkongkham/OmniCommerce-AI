# Phase 0-D: Frontend (`packages/ui`, `apps/admin`, `apps/storefront`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ສ້າງ `@oca/ui` (token ສີມ່ວງ + component ຕາມ DESIGN.md), admin Next.js (login, shell, `/staff`, `/roles`) ທີ່ເຮັດວຽກກັບ `apps/api`, ແລະ storefront placeholder.

**Architecture:** `@oca/ui` ເປັນ package source-only (TS ຖືກ transpile ໂດຍ Next ຜ່ານ `transpilePackages`, ບໍ່ມີ build step). Admin ເອີ້ນ API ຜ່ານ Next rewrites `/api/*` → API ຈຶ່ງ same-origin; access token ຢູ່ໃນ memory, refresh token ເປັນ httpOnly cookie. Form ໃຊ້ zod ຈາກ `@oca/shared`; data ໃຊ້ TanStack Query.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, Radix (dialog, checkbox), class-variance-authority, lucide-react, TanStack Query 5, react-hook-form 7 + @hookform/resolvers 5, zod 4, Vitest 5 + Testing Library (jsdom).

**ອ້າງອີງ:** spec [2026-10-04-phase0-d-frontend-design.md](../specs/2026-10-04-phase0-d-frontend-design.md) ແລະ [DESIGN.md](../../DESIGN.md). **ຖ້າຂັດກັນ DESIGN.md ຊະນະ.**

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* **ກ່ອນແກ້ `turbo.json` ໃຫ້ອ່ານ docs ຂອງ turbo ທີ່ຕິດຕັ້ງ** (ຕາມ `AGENTS.md`): `node_modules/.pnpm/turbo@*/node_modules/turbo/docs/README.md`. ແຜນນີ້ແກ້ພຽງ `dev.dependsOn = ["^build"]` (ຢືນຢັນແລ້ວວ່າ docs ອະນຸຍາດ).
* **Commit trailer:** ທຸກ commit ໃສ່ `-m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"` ເປັນ message ທີສອງ.
* **ຫ້າມແຕະ Postgres 5432 / Redis 6379 ຂອງຜູ້ໃຊ້.** Dev DB ເປັນ embedded Postgres ພອດ 5433 ແລະ Redis ພອດ 6380 (memory `dev-database-isolation`). ແຜນນີ້ໃຊ້ DB ແຕ່ Task 1 (api e2e) ແລະ Task 16 (smoke).
* **Branch:** ເຮັດຢູ່ `phase0-foundation` (ມີ plan C-2 ທີ່ຍັງບໍ່ commit `docs/superpowers/plans/2026-10-04-phase0-c2-worker.md`; **ຢ່າ `git add` ມັນ**, ໃຊ້ path ສະເພາະເວລາ add).
* **ຄວາມແຕກຕ່າງຈາກ spec (ຕັ້ງໃຈ):** matrix permission ໃຊ້ `MODULES`/`ACTIONS`/`PERMISSIONS` ຈາກ `@oca/shared` ໂດຍກົງ (ແຫຼ່ງຄວາມຈິງດຽວຕາມ spec ຫຼັກ) ບໍ່ເອີ້ນ `GET /permissions`. ຈະແກ້ປະໂຫຍກໃນ spec ທີ່ Task 16.
* **ຄວາມແຕກຕ່າງຈາກ DESIGN.md (ຕັ້ງໃຈ, ເລື່ອນໄປ phase ຕໍ່ໄປ):** `Select` ເປັນ `<select>` ພື້ນເມືອງທີ່ໃສ່ style (Radix Select ມີບັນຫາໃນ jsdom, ແລະ page-size dropdown ບໍ່ເປີດຂຶ້ນເທິງ); sidebar rail ບໍ່ມີ HoverCard (ມີກຸ່ມເມນູດຽວ); topbar ບໍ່ມີ command palette ແລະ ກະດິ່ງແຈ້ງເຕືອນ; ໜ້າ login ບໍ່ມີ effect ຈຸດເຊື່ອມຕາມ cursor; ບໍ່ມີ dark-mode toggle (token dark ມີໄວ້ແລ້ວ).
* **ຂໍ້ຈຳກັດທີ່ຮູ້:** ຜ່ານ proxy API ເຫັນ `req.ip` ເປັນ IP ຂອງ Next server; rate limit ຂອງ login ແລະ IP ໃນ AuditLog ຈຶ່ງບໍ່ແມ່ນ IP ແທ້ຂອງ client. ແກ້ໄດ້ພາຍຫຼັງດ້ວຍ `trust proxy` (ນອກຂອບເຂດ D; ລາຍງານຜູ້ໃຊ້ຕອນຈົບ).
* **ທຸກ component ທີ່ໃຊ້ hook ຕ້ອງມີ `"use client"`** ເທິງສຸດ (ເພາະ `@oca/ui` ຖືກ import ຈາກ Server Component ຂອງ storefront ຜ່ານ barrel).
* **noUncheckedIndexedAccess ເປີດຢູ່:** `arr[0]` ເປັນ `T | undefined`.
* **ຖ້າ `lucide-react` ບໍ່ມີຊື່ icon ທີ່ໃຊ້** (v1 ປ່ຽນຊື່ບາງອັນ) ໃຫ້ໃຊ້ຊື່ໃໝ່: `Loader2→LoaderCircle`, `CheckCircle2→CircleCheck`, `XCircle→CircleX`, `AlertTriangle→TriangleAlert`, `AlertCircle→CircleAlert`.
* **ຖ້າ `pnpm install` ແຈ້ງ "ignored build scripts"** (pnpm 11): ເພີ່ມ package ທີ່ຈຳເປັນເຂົ້າ `allowBuilds` ໃນ `pnpm-workspace.yaml` (ປົກກະຕິ `sharp`, `@tailwindcss/oxide`, `unrs-resolver` ເປັນ `true`), ແລ້ວ install ໃໝ່; ບອກຜູ້ໃຊ້ວ່າເພີ່ມຫຍັງ.

## ໂຄງສ້າງໄຟລ໌

```
packages/ui/
  package.json  tsconfig.json  eslint.config.mjs  vitest.config.ts  vitest.setup.ts
  src/index.ts                      barrel
  src/styles/globals.css            ສ້າງຈາກ DESIGN.md §21 (ດ້ວຍຄຳສັ່ງ, ບໍ່ພິມມື)
  src/lib/utils.ts (+test)          cn, formatNumber, formatDate
  src/components/                   button, input, field, card, status-pill, checkbox, select, table, skeleton,
                                    avatar, dialog, confirm-dialog, toast-store, toaster, pagination,
                                    data-table-footer, page-header, empty-state (+ tests)
apps/storefront/                    Next.js placeholder (port 3002)
apps/admin/                         Next.js (port 3000)
  next.config.ts  postcss.config.mjs  tsconfig.json  vitest.config.ts  vitest.setup.ts  eslint.config.mjs
  public/oca-mark.png  public/oca-logo.png
  src/app/layout.tsx  providers.tsx  globals.css  page.tsx
  src/app/(auth)/login/page.tsx
  src/app/(app)/layout.tsx  staff/page.tsx  roles/page.tsx
  src/lib/api.ts  errors.ts  nav.ts  queries.ts  types.ts  validation-text.ts
  src/lib/i18n/dictionary.ts  language-provider.tsx
  src/components/auth/   auth-provider.tsx  login-form.tsx  login-shell.tsx  permission-gate.tsx
  src/components/shell/  sidebar.tsx  topbar.tsx  profile-menu.tsx  language-toggle.tsx  chrome.ts
  src/components/staff/  staff-list.tsx  staff-form-dialog.tsx
  src/components/roles/  roles-list.tsx  role-form-dialog.tsx  permission-matrix.tsx
  src/test/render.tsx
apps/api/ (ແກ້ນ້ອຍ)               REFRESH_COOKIE_PATH
turbo.json  .gitignore  .env.example
```

---

### Task 1: `apps/api` — `REFRESH_COOKIE_PATH` ຕັ້ງຄ່າໄດ້

**ເຫດຜົນ:** cookie refresh ມີ `path=/auth`. ຜ່ານ proxy browser ເອີ້ນ `/api/auth/refresh` ຈຶ່ງບໍ່ສົ່ງ cookie. ເພີ່ມ env (default ເດີມ `/auth` ເພື່ອບໍ່ທຳລາຍ client ອື່ນ).

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e.test.ts`
- Modify: `apps/api/test/setup.ts`
- Modify: `.env.example`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ (env)**

ເພີ່ມໃນ `describe("parseEnv", ...)` ຂອງ `apps/api/src/config/env.test.ts` (ກ່ອນ `})` ປິດທ້າຍ):

```ts
  it("REFRESH_COOKIE_PATH ມີ default /auth, ປ່ຽນໄດ້ ແລະ ຕ້ອງຂຶ້ນຕົ້ນດ້ວຍ /", () => {
    expect(parseEnv(base).REFRESH_COOKIE_PATH).toBe("/auth");
    expect(parseEnv({ ...base, REFRESH_COOKIE_PATH: "/api/auth" }).REFRESH_COOKIE_PATH).toBe("/api/auth");
    expect(() => parseEnv({ ...base, REFRESH_COOKIE_PATH: "api/auth" })).toThrow();
  });
```

ເພີ່ມ e2e test ໃນ `apps/api/test/auth.e2e.test.ts` ຕໍ່ທ້າຍ test "login ສຳເລັດ" (ກ່ອນ test "login ຜິດ"):

```ts
  it("REFRESH_COOKIE_PATH ກຳນົດ path ຂອງ cookie (ໃຊ້ເມື່ອຜ່ານ proxy /api)", async () => {
    const { app: proxied } = await createTestApp({ REFRESH_COOKIE_PATH: "/api/auth" });
    try {
      const res = await request(proxied.getHttpServer())
        .post("/auth/login")
        .send({ email: "owner@test.local", password: TEST_PASSWORD })
        .expect(200);
      const cookies = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(cookies).toContain("Path=/api/auth");
      expect(cookies).not.toMatch(/Path=\/auth(;|$)/);
    } finally {
      await proxied.close();
    }
  });
```

- [ ] **Step 2: ແລ່ນ test ໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/api exec vitest run src/config/env.test.ts`
Expected: FAIL (`REFRESH_COOKIE_PATH` ເປັນ `undefined`).

- [ ] **Step 3: ໃສ່ implementation**

`apps/api/src/config/env.ts` — ເພີ່ມໃນ `envSchema` ຕໍ່ຈາກ `CORS_ORIGIN`:

```ts
  REFRESH_COOKIE_PATH: z.string().startsWith("/").default("/auth"),
```

`apps/api/src/auth/auth.controller.ts` — ລຶບບັນທັດ `const REFRESH_COOKIE_PATH = "/auth";` ແລ້ວແກ້ `cookieOptions()`:

```ts
  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      path: this.env.REFRESH_COOKIE_PATH,
    };
  }
```

`apps/api/test/setup.ts` — ເພີ່ມຕໍ່ຈາກ `loadRepoEnv();` (`.env` ຂອງ dev ຈະຕັ້ງ `/api/auth` ແຕ່ test ຄາດຫວັງ default):

```ts
delete process.env.REFRESH_COOKIE_PATH;
```

`.env.example` — ເພີ່ມໃນພາກ `# API (apps/api)` ຕໍ່ຈາກ `CORS_ORIGIN=...`:

```
# Path ຂອງ cookie refresh token (default /auth). Admin ເອີ້ນ API ຜ່ານ proxy /api ຈຶ່ງຕ້ອງເປັນ /api/auth
REFRESH_COOKIE_PATH=/api/auth
```

- [ ] **Step 4: ແລ່ນ test ທັງ api ໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/api test`
Expected: PASS ທັງໝົດ (ເດີມ 41 test + 2 ໃໝ່). ຕ້ອງມີ Postgres dev (5433) ແລະ Redis (6380) ແລ່ນຢູ່; ຖ້າບໍ່ມີໃຫ້ຢຸດ ແລ້ວແຈ້ງຜູ້ໃຊ້ (ຢ່າໃຊ້ 5432/6379).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/auth/auth.controller.ts apps/api/test/auth.e2e.test.ts apps/api/test/setup.ts .env.example
git commit -m "feat(api): make refresh cookie path configurable for proxied clients" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `@oca/ui` — scaffold, token (`globals.css`), utils

**Files:**
- Create: `packages/ui/package.json` (ແທນທີ່ເດີມ), `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `packages/ui/src/index.ts`, `src/styles/globals.css`, `src/lib/utils.ts`, `src/lib/utils.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: ຂຽນ `packages/ui/package.json`**

```json
{
  "name": "@oca/ui",
  "version": "0.0.0",
  "private": true,
  "description": "Shared shadcn/ui components and OCA design tokens (source-only)",
  "exports": {
    ".": "./src/index.ts",
    "./globals.css": "./src/styles/globals.css"
  },
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-checkbox": "^1.3.11",
    "@radix-ui/react-dialog": "^1.1.23",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.52.0",
    "tailwind-merge": "^3.7.0",
    "tailwindcss": "^4.3.3",
    "tw-animate-css": "^1.4.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@oca/config": "workspace:*",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^9.39.5",
    "jsdom": "^30.1.1",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "typescript": "~5.9.3",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: ໄຟລ໌ config ຂອງ package**

`packages/ui/tsconfig.json`:

```json
{
  "extends": "@oca/config/tsconfig.next.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src", "vitest.config.ts", "vitest.setup.ts"]
}
```

`packages/ui/eslint.config.mjs`:

```js
import base from "@oca/config/eslint";

export default base;
```

`packages/ui/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`packages/ui/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
});
```

ເພີ່ມໃນ `.gitignore` (ຕໍ່ຈາກພາກ `# build output`):

```
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 3: ຕິດຕັ້ງ dependency**

Run: `pnpm install`
Expected: ສຳເລັດ; `packages/ui/node_modules` ມີ `lucide-react`, `tailwindcss` (ເບິ່ງຂໍ້ຕົກລົງສຳຄັນຖ້າມີ "ignored build scripts").

- [ ] **Step 4: ຂຽນ test ທີ່ຈະລົ້ມ — `packages/ui/src/lib/utils.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { cn, formatDate, formatNumber } from "./utils";

describe("cn", () => {
  it("ລວມ class ແລະ class ຫຼັງຊະນະ class ທີ່ຂັດກັນ", () => {
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
  });
});

describe("formatNumber", () => {
  it("ໃສ່ comma ຂັ້ນຫຼັກພັນ ແລະ ສະແດງທົດສະນິຍົມສະເພາະເມື່ອມີ", () => {
    expect(formatNumber(15000)).toBe("15,000");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(1234.5678)).toBe("1,234.57");
  });

  it("0 ສະແດງເປັນ 0; ຄ່າຫວ່າງ ຫຼື ບໍ່ແມ່ນຕົວເລກ ໃຊ້ fallback", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber("")).toBe("—");
    expect(formatNumber("abc")).toBe("—");
    expect(formatNumber(null, { fallback: "-" })).toBe("-");
  });

  it("ຮັບ string ທີ່ເປັນຕົວເລກ", () => {
    expect(formatNumber("2400000")).toBe("2,400,000");
  });
});

describe("formatDate", () => {
  it("ສະແດງ dd/MM/yyyy ຕາມເຂດເວລາ Asia/Vientiane", () => {
    expect(formatDate("2026-10-04T18:00:00Z")).toBe("05/10/2026");
    expect(formatDate(new Date("2026-10-04T00:00:00Z"))).toBe("04/10/2026");
  });

  it("ຄ່າຫວ່າງ ຫຼື ວັນທີຜິດ ໃຊ້ fallback", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
```

- [ ] **Step 5: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/ui test`
Expected: FAIL (`Cannot find module './utils'`).

- [ ] **Step 6: ຂຽນ `packages/ui/src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** ຕາມ DESIGN.md §16.2: comma ຂັ້ນພັນ, ທົດສະນິຍົມສະເພາະເມື່ອມີ, ຄ່າຫວ່າງເປັນ fallback. */
export function formatNumber(
  value: number | string | null | undefined,
  options: { maxDecimals?: number; fallback?: string } = {},
): string {
  const { maxDecimals = 2, fallback = "—" } = options;
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** dd/MM/yyyy ຕາມເຂດເວລາລາວສະເໝີ (DESIGN.md §16.2). */
export function formatDate(value: string | Date | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Vientiane" });
}
```

- [ ] **Step 7: ສ້າງ `globals.css` ຈາກ DESIGN.md §21 ດ້ວຍຄຳສັ່ງ (ຢ່າພິມມື)**

```bash
mkdir -p packages/ui/src/styles
awk '/^## 21\./{f=1} f&&/^```css/{c=1;next} c&&/^```/{exit} c{print}' docs/DESIGN.md \
  | grep -v '@plugin "@tailwindcss/typography"' \
  | grep -vE '^  --shadow-(float|small|brand): var\(--shadow-' \
  > packages/ui/src/styles/globals.css
```

ເຫດຜົນຂອງ 2 `grep -v`: ບໍ່ໃຊ້ plugin typography (YAGNI); ບັນທັດ `--shadow-*: var(--shadow-*)` ໃນ `@theme inline` ອ້າງຕົວເອງ (circular) ຈຶ່ງຕັດອອກ (ໃຊ້ `shadow-xl` ແທນສຳລັບ dropdown/modal).

Verify: `grep -c "oca-skeleton\|--brand: #7e22ce\|@theme inline" packages/ui/src/styles/globals.css` → ຕ້ອງໄດ້ຕົວເລກ ≥ 3, ແລະ `grep -c typography packages/ui/src/styles/globals.css` → `0`.

- [ ] **Step 8: ສ້າງ `packages/ui/src/index.ts`**

```ts
export * from "./lib/utils";
```

- [ ] **Step 9: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/ui test && pnpm --filter @oca/ui typecheck && pnpm --filter @oca/ui lint`
Expected: test PASS (7 test), typecheck ແລະ lint ບໍ່ມີ error.

- [ ] **Step 10: Commit**

```bash
git add packages/ui .gitignore pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(ui): scaffold @oca/ui with design tokens and utils" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `@oca/ui` — primitive (Button, Input, Field, Card, StatusPill, Checkbox, Select, Table, Skeleton, Avatar)

ທຸກ class ໃຊ້ token ຈາກ `globals.css` (DESIGN.md §20.5: ຫ້າມ hex ຕາຍຕົວ).

**Files (create ໃນ `packages/ui/src/components/`):** `button.tsx`, `button.test.tsx`, `input.tsx`, `field.tsx`, `card.tsx`, `status-pill.tsx`, `checkbox.tsx`, `select.tsx`, `table.tsx`, `skeleton.tsx`, `avatar.tsx`. Modify `src/index.ts`.

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `button.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("ສະແດງ label ແລະ ເອີ້ນ onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("loading: disabled, aria-busy ແລະ ບໍ່ເອີ້ນ onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/ui exec vitest run src/components/button.test.tsx`
Expected: FAIL (`Cannot find module './button'`).

- [ ] **Step 3: ຂຽນ `button.tsx`**

```tsx
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-white shadow hover:bg-brand-hover",
        outlinePrimary:
          "border border-brand/40 bg-surface text-ink hover:border-brand hover:bg-brand-soft [&_svg]:text-brand",
        outlineDanger:
          "border border-danger/40 bg-surface text-ink hover:border-danger hover:bg-danger-soft [&_svg]:text-danger",
        outline: "border border-input bg-background hover:bg-accent",
        destructive: "bg-danger text-white hover:bg-danger-ink",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-hover",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 4: ຂຽນ primitive ທີ່ເຫຼືອ**

`input.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export interface InputProps extends ComponentProps<"input"> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-subtle aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
```

`field.tsx` (label + control + error; `*` ເປັນ CSS ເພື່ອບໍ່ປົນໃນ text ຂອງ label):

```tsx
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required = false, error, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "mb-1 block text-xs font-semibold text-ink-secondary",
          required && "after:ml-0.5 after:text-danger after:content-['*']",
        )}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`card.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** DESIGN.md §9.3: ແບນ, ບໍ່ມີເງົາ, ຂອບ 1px, ມົນ 2xl. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-none", className)} {...props} />;
}
```

`status-pill.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

const TONES = {
  success: "border-success-line bg-success-soft text-success-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  danger: "border-danger-line bg-danger-soft text-danger-ink",
  info: "border-info-line bg-info-soft text-info-ink",
  brand: "border-brand-soft-line bg-brand-soft text-brand-ink",
  neutral: "border-line bg-subtle text-ink-secondary",
} as const;

export type StatusTone = keyof typeof TONES;

export interface StatusPillProps {
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

/** ສູດ 3 ສີ (DESIGN.md §3.5/§9.2): ພື້ນ tint + ຂອບ + ຕົວໜັງສື; ມີ label ສະເໝີ ບໍ່ອີງສີຢ່າງດຽວ. */
export function StatusPill({ tone = "neutral", icon: Icon, className, children }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
```

`checkbox.tsx`:

```tsx
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? <Minus className="size-3.5" /> : <Check className="size-3.5" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
```

`select.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export interface SelectProps extends ComponentProps<"select"> {
  invalid?: boolean;
}

/** `<select>` ພື້ນເມືອງທີ່ໃສ່ style ຕາມ Input (ເບິ່ງ "ຄວາມແຕກຕ່າງຈາກ DESIGN.md" ໃນ plan). */
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
```

`skeleton.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** ໃຊ້ `.oca-skeleton` (shimmer) ເທົ່ານັ້ນ, ບໍ່ແມ່ນ animate-pulse (DESIGN.md §9.13). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("oca-skeleton rounded-md", className)} {...props} />;
}
```

`table.tsx` (ແບບ B ໂລ່ງ ຂອງ DESIGN.md §9.8):

```tsx
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";
import { Skeleton } from "./skeleton";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-subtle", className)} {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-t border-hairline transition-colors hover:bg-app", className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("whitespace-nowrap px-4 py-3 text-left font-medium text-ink-secondary", className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3", className)} {...props} />;
}

export function TableSkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row} className="hover:bg-transparent">
      {Array.from({ length: columns }, (_, column) => (
        <TableCell key={column}>
          <Skeleton className="h-4 w-full max-w-[160px]" />
        </TableCell>
      ))}
    </TableRow>
  ));
}
```

`avatar.tsx`:

```tsx
import { cn } from "../lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-brand-bright text-xs font-bold text-white",
        className,
      )}
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 5: ເພີ່ມ export ໃນ `src/index.ts`**

```ts
export * from "./components/avatar";
export * from "./components/button";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/field";
export * from "./components/input";
export * from "./components/select";
export * from "./components/skeleton";
export * from "./components/status-pill";
export * from "./components/table";
```

- [ ] **Step 6: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/ui test && pnpm --filter @oca/ui typecheck && pnpm --filter @oca/ui lint`
Expected: PASS; ບໍ່ມີ error (ຖ້າ icon ບໍ່ມີ ເບິ່ງຂໍ້ຕົກລົງສຳຄັນ).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): add button, input, field, card, status pill, checkbox, select, table, skeleton, avatar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `@oca/ui` — Dialog, ConfirmDialog, Toast

**Files (create ໃນ `packages/ui/src/components/`):** `dialog.tsx`, `confirm-dialog.tsx`, `confirm-dialog.test.tsx`, `toast-store.ts`, `toaster.tsx`, `toast.test.tsx`. Modify `src/index.ts`.

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `toast.test.tsx`**

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, clearToasts, dismissToast, getToasts, toast } from "./toast-store";
import { Toaster } from "./toaster";

beforeEach(() => {
  clearToasts();
});

describe("toast store", () => {
  it("ເກັບສູງສຸດ 5 ອັນ ແລະ ອັນໃໝ່ຢູ່ກ່ອນ", () => {
    for (let i = 1; i <= 6; i++) toast.info(`t${i}`);
    expect(getToasts().map((item) => item.title)).toEqual(["t6", "t5", "t4", "t3", "t2"]);
  });

  it("ຕັ້ງ variant ແລະ duration ເລີ່ມຕົ້ນ 8 ວິນາທີ", () => {
    toast.success("ok", "detail");
    toast.error("bad");
    const [error, success] = getToasts();
    expect(error).toMatchObject({ variant: "error", title: "bad", duration: TOAST_DURATION_MS });
    expect(success).toMatchObject({ variant: "success", title: "ok", description: "detail" });
    expect(TOAST_DURATION_MS).toBe(8000);
  });

  it("dismissToast ເອົາອອກສະເພາະ id ນັ້ນ", () => {
    const first = toast.info("a");
    toast.info("b");
    dismissToast(first);
    expect(getToasts().map((item) => item.title)).toEqual(["b"]);
  });
});

describe("Toaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ສະແດງ toast ແລ້ວປິດເອງຫຼັງ 8 ວິນາທີ", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Saved");
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("ປຸ່ມປິດເອົາ toast ອອກທັນທີ", () => {
    render(<Toaster dismissLabel="Dismiss" />);
    act(() => {
      toast.error("Oops");
    });
    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).click();
    });
    expect(screen.queryByText("Oops")).not.toBeInTheDocument();
  });
});
```

`confirm-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function setup(busy = false) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete role?"
      description="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      busy={busy}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("ສະແດງຫົວຂໍ້ ແລະ ເອີ້ນ onConfirm ເມື່ອກົດຢືນຢັນ", async () => {
    const { onConfirm } = setup();
    expect(screen.getByRole("dialog", { name: "Delete role?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ກົດຍົກເລີກແລ້ວຂໍປິດ dialog", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ຂະນະ busy: ປຸ່ມຖືກປິດ ແລະ Esc ປິດ dialog ບໍ່ໄດ້", async () => {
    const { onOpenChange } = setup(true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/ui exec vitest run src/components/toast.test.tsx src/components/confirm-dialog.test.tsx`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: ຂຽນ `toast-store.ts`**

```ts
export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
}

export interface ToastInput {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

/** DESIGN.md §9.11: ສູງສຸດ 5 ອັນ, ຄ້າງ 8 ວິນາທີ, ອັນໃໝ່ຢູ່ເທິງ. */
export const MAX_TOASTS = 5;
export const TOAST_DURATION_MS = 8000;

let toasts: ToastItem[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

function create(input: ToastInput): string {
  sequence += 1;
  const id = `toast-${sequence}`;
  const item: ToastItem = {
    id,
    variant: input.variant ?? "info",
    title: input.title,
    description: input.description,
    duration: input.duration ?? TOAST_DURATION_MS,
  };
  toasts = [item, ...toasts].slice(0, MAX_TOASTS);
  emit();
  return id;
}

export const toast = Object.assign(create, {
  info: (title: string, description?: string) => create({ variant: "info", title, description }),
  success: (title: string, description?: string) => create({ variant: "success", title, description }),
  warning: (title: string, description?: string) => create({ variant: "warning", title, description }),
  error: (title: string, description?: string) => create({ variant: "error", title, description }),
});

export function dismissToast(id: string): void {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function clearToasts(): void {
  toasts = [];
  emit();
}
```

- [ ] **Step 4: ຂຽນ `toaster.tsx`**

```tsx
"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "../lib/utils";
import { type ToastItem, dismissToast, getToasts, subscribe } from "./toast-store";

const VARIANT_STYLES = {
  info: { card: "border-info-line", iconBox: "bg-info-soft text-info", bar: "bg-info", Icon: Info },
  success: { card: "border-success-line", iconBox: "bg-success-soft text-success", bar: "bg-success", Icon: CheckCircle2 },
  warning: { card: "border-warning-line", iconBox: "bg-warning-soft text-warning", bar: "bg-warning", Icon: AlertTriangle },
  error: { card: "border-danger-line", iconBox: "bg-danger-soft text-danger", bar: "bg-danger", Icon: AlertCircle },
} as const;

function ToastCard({ item, dismissLabel }: { item: ToastItem; dismissLabel: string }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);
  const styles = VARIANT_STYLES[item.variant];
  const Icon = styles.Icon;

  // ນັບຖອຍຫຼັງ; hover/focus ຢຸດນັບ ແລະ ຈື່ເວລາທີ່ເຫຼືອ (ກົງກັບ progress bar ທີ່ຖືກ pause).
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, item.id]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface p-4 pr-10 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2",
        styles.card,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", styles.iconBox)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          {item.description ? <p className="text-sm text-ink-secondary">{item.description}</p> : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => dismissToast(item.id)}
        className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-ink-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-hairline" aria-hidden="true">
        <div
          className={cn("h-full origin-left", styles.bar)}
          style={{
            animation: `oca-toast-progress ${item.duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}

export function Toaster({ dismissLabel = "Dismiss" }: { dismissLabel?: string }) {
  const items = useSyncExternalStore(subscribe, getToasts, getToasts);
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-0 right-0 z-[10000] flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-4 sm:right-4 sm:max-w-[400px] sm:p-0"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastCard item={item} dismissLabel={dismissLabel} />
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: ຂຽນ `dialog.tsx`**

```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-bold text-ink", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-xs text-ink-secondary", className)} {...props} />;
}

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  closeLabel?: string;
  showClose?: boolean;
}

/** DESIGN.md §9.10: overlay ດຳໂປ່ງ + blur, panel ມົນ 2xl, ປາກົດຈາກກາງ (zoom-95). */
export function DialogContent({
  className,
  children,
  closeLabel = "Close",
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[9999] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border-0 bg-surface p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-lg opacity-70 hover:bg-hover hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-line px-5 pb-3 pr-12 pt-5">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription className="mt-0.5">{description}</DialogDescription>
    </div>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 border-t border-line bg-subtle px-5 py-4">{children}</div>;
}
```

- [ ] **Step 6: ຂຽນ `confirm-dialog.tsx`**

```tsx
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** DESIGN.md §9.10: ຂະນະກຳລັງດຳເນີນການ ປິດ dialog ບໍ່ໄດ້ ແລະ ປຸ່ມທັງສອງ disabled. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[400px] p-6" closeLabel={closeLabel} showClose={!busy}>
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="size-5 text-danger" aria-hidden="true" />
          </div>
          <div className="min-w-0 pr-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm">{description}</DialogDescription>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" className="h-10 rounded-xl px-5" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            className="h-10 rounded-xl px-6 font-bold"
            loading={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: ເພີ່ມ export ໃນ `src/index.ts`**

```ts
export * from "./components/confirm-dialog";
export * from "./components/dialog";
export * from "./components/toast-store";
export * from "./components/toaster";
```

- [ ] **Step 8: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/ui test && pnpm --filter @oca/ui typecheck && pnpm --filter @oca/ui lint`
Expected: PASS ທັງໝົດ.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): add dialog, confirm dialog and toast" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `@oca/ui` — Pagination, PageHeader, EmptyState

**Files (create ໃນ `packages/ui/src/components/`):** `pagination.ts`, `pagination.test.ts`, `data-table-footer.tsx`, `data-table-footer.test.tsx`, `page-header.tsx`, `empty-state.tsx`. Modify `src/index.ts`.

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPageItems, paginate } from "./pagination";

describe("getPageItems", () => {
  it("ໜ້ອຍກວ່າຫຼືເທົ່າ 7 ໜ້າ: ສະແດງທັງໝົດ", () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(1, 0)).toEqual([1]);
  });

  it("ຫຼາຍກວ່າ 7 ໜ້າ: ຫຍໍ້ເປັນ 1 … x-1 x x+1 … ສຸດທ້າຍ", () => {
    expect(getPageItems(6, 12)).toEqual([1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 12]);
    expect(getPageItems(1, 12)).toEqual([1, 2, "ellipsis-end", 12]);
    expect(getPageItems(12, 12)).toEqual([1, "ellipsis-start", 11, 12]);
    expect(getPageItems(3, 12)).toEqual([1, 2, 3, 4, "ellipsis-end", 12]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("ຕັດຕາມໜ້າ ແລະ ຄິດ from/to", () => {
    const slice = paginate(items, 2, 10);
    expect(slice.rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(slice).toMatchObject({ page: 2, totalPages: 3, total: 25, from: 11, to: 20 });
  });

  it("ໜ້າເກີນຂອບເຂດຖືກບີບເຂົ້າຂອບເຂດ", () => {
    const slice = paginate(items, 99, 10);
    expect(slice).toMatchObject({ page: 3, from: 21, to: 25 });
    expect(slice.rows).toHaveLength(5);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("pageSize 0 = ທັງໝົດ", () => {
    const slice = paginate(items, 1, 0);
    expect(slice.rows).toHaveLength(25);
    expect(slice).toMatchObject({ totalPages: 1, from: 1, to: 25 });
  });

  it("ບໍ່ມີຂໍ້ມູນ: from/to ເປັນ 0 ແລະ ມີ 1 ໜ້າ", () => {
    expect(paginate([], 1, 10)).toMatchObject({ rows: [], totalPages: 1, total: 0, from: 0, to: 0 });
  });
});
```

`data-table-footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTableFooter } from "./data-table-footer";

const labels = { show: "Show", perPage: "per page", all: "All", previous: "Previous", next: "Next" };

function setup(page = 1) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <DataTableFooter
      page={page}
      totalPages={3}
      pageSize={10}
      summary="Showing 1-10 of 25 items"
      labels={labels}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

describe("DataTableFooter", () => {
  it("ສະແດງສະຫຼຸບ ແລະ ປຸ່ມກ່ອນໜ້າຖືກປິດທີ່ໜ້າທຳອິດ", () => {
    setup(1);
    expect(screen.getByText("Showing 1-10 of 25 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
  });

  it("ກົດເລກໜ້າ ແລະ ປຸ່ມຖັດໄປ", async () => {
    const { onPageChange } = setup(1);
    await userEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("ປ່ຽນຈຳນວນຕໍ່ໜ້າ", async () => {
    const { onPageSizeChange } = setup(1);
    await userEvent.selectOptions(screen.getByLabelText("per page"), "30");
    expect(onPageSizeChange).toHaveBeenCalledWith(30);
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/ui exec vitest run src/components/pagination.test.ts src/components/data-table-footer.test.tsx`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: ຂຽນ `pagination.ts`**

```ts
export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/** ຕົວເລືອກຕໍ່ໜ້າຕາມ DESIGN.md §9.9; 0 = ທັງໝົດ. */
export const PAGE_SIZE_OPTIONS = [10, 30, 50, 0] as const;

/** ຫຼາຍກວ່າ 7 ໜ້າ ຫຍໍ້ເປັນ `1 … x-1 x x+1 … ສຸດທ້າຍ`. */
export function getPageItems(current: number, total: number): PageItem[] {
  const last = Math.max(1, total);
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  const from = Math.max(2, current - 1);
  const to = Math.min(last - 1, current + 1);
  const items: PageItem[] = [1];
  if (from > 2) items.push("ellipsis-start");
  for (let page = from; page <= to; page++) items.push(page);
  if (to < last - 1) items.push("ellipsis-end");
  items.push(last);
  return items;
}

export interface PageSlice<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const total = items.length;
  const size = pageSize <= 0 ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page: current,
    pageSize,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}
```

- [ ] **Step 4: ຂຽນ `data-table-footer.tsx`**

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { PAGE_SIZE_OPTIONS, getPageItems } from "./pagination";

export interface DataTableFooterLabels {
  show: string;
  perPage: string;
  all: string;
  previous: string;
  next: string;
}

export interface DataTableFooterProps {
  page: number;
  totalPages: number;
  pageSize: number;
  /** ຂໍ້ຄວາມສະຫຼຸບທີ່ແປແລ້ວ ເຊັ່ນ "ສະແດງ 1-10 ຈາກ 142 ລາຍການ". */
  summary: string;
  labels: DataTableFooterLabels;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const PAGE_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

/** DESIGN.md §9.9. ປຸ່ມສະແດງຢູ່ສະເໝີ (disabled) ເພື່ອໃຫ້ຄວາມສູງ footer ຄົງທີ່. */
export function DataTableFooter({
  page,
  totalPages,
  pageSize,
  summary,
  labels,
  onPageChange,
  onPageSizeChange,
}: DataTableFooterProps) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line bg-surface px-3 py-3 sm:flex-row sm:px-6">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <div className="flex items-center gap-2">
          <span>{labels.show}</span>
          <select
            aria-label={labels.perPage}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-line bg-surface pl-3 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size === 0 ? labels.all : size}
              </option>
            ))}
          </select>
          <span>{labels.perPage}</span>
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-line" />
        <span>{summary}</span>
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          aria-label={labels.previous}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(PAGE_BUTTON, "border border-line bg-surface text-ink-secondary hover:bg-subtle")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        {getPageItems(page, totalPages).map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                PAGE_BUTTON,
                item === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-line bg-surface text-ink-secondary hover:bg-subtle",
              )}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden="true" className="px-1 text-ink-muted">
              …
            </span>
          ),
        )}
        <button
          type="button"
          aria-label={labels.next}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={cn(PAGE_BUTTON, "border border-line bg-surface text-ink-secondary hover:bg-subtle")}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: ຂຽນ `page-header.tsx` ແລະ `empty-state.tsx`**

`page-header.tsx` (DESIGN.md §11.1: sticky ໃຕ້ topbar 64px):

```tsx
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  breadcrumbs: string[];
  title: string;
  badge?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ breadcrumbs, title, badge, description, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-[64px] z-30 flex w-full flex-col gap-3 bg-app/90 px-3 pb-3 pt-[18px] backdrop-blur-sm sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-secondary">
        {breadcrumbs.map((crumb, index) => {
          const last = index === breadcrumbs.length - 1;
          return (
            <span key={`${index}-${crumb}`} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="size-3.5 text-line-strong" aria-hidden="true" /> : null}
              <span className={last ? "font-medium text-brand-ink" : undefined} aria-current={last ? "page" : undefined}>
                {crumb}
              </span>
            </span>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold leading-tight text-ink">{title}</h1>
            {badge ? <span className="rounded-full bg-brand-soft px-3 py-1 text-xs text-brand-ink">{badge}</span> : null}
          </div>
          {description ? <p className="mt-0.5 text-sm text-ink-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
```

`empty-state.tsx` (DESIGN.md §11.6):

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-[20px] bg-brand-soft">
        <Icon className="size-[22px] text-brand-ink" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 text-xs text-ink-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 6: ເພີ່ມ export ໃນ `src/index.ts`**

```ts
export * from "./components/data-table-footer";
export * from "./components/empty-state";
export * from "./components/page-header";
export * from "./components/pagination";
```

- [ ] **Step 7: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/ui test && pnpm --filter @oca/ui typecheck && pnpm --filter @oca/ui lint`
Expected: PASS ທັງໝົດ.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): add pagination, data table footer, page header and empty state" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `apps/storefront` — Next.js placeholder

**Files:**
- Delete: `apps/storefront/.gitkeep`
- Modify: `apps/storefront/package.json`
- Create: `apps/storefront/{next.config.ts,postcss.config.mjs,tsconfig.json,eslint.config.mjs}`
- Create: `apps/storefront/public/oca-mark.png` (ສຳເນົາ), `src/app/{globals.css,layout.tsx,page.tsx}`

- [ ] **Step 1: ແທນ `apps/storefront/package.json`**

```json
{
  "name": "@oca/storefront",
  "version": "0.0.0",
  "private": true,
  "description": "Next.js public storefront (SSR/SEO)",
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "start": "next start --port 3002",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@oca/ui": "workspace:*",
    "next": "^16.3.8",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@oca/config": "workspace:*",
    "@tailwindcss/postcss": "^4.3.3",
    "@types/node": "^26.6.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "eslint": "^9.39.5",
    "tailwindcss": "^4.3.3",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 2: ໄຟລ໌ config**

`apps/storefront/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@oca/ui"],
};

export default nextConfig;
```

`apps/storefront/postcss.config.mjs`:

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

`apps/storefront/tsconfig.json`:

```json
{
  "extends": "@oca/config/tsconfig.next.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "next.config.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/storefront/eslint.config.mjs`:

```js
import base from "@oca/config/eslint";

export default [...base, { ignores: ["next-env.d.ts"] }];
```

- [ ] **Step 3: ໜ້າ ແລະ layout**

```bash
git rm -q apps/storefront/.gitkeep
mkdir -p apps/storefront/public apps/storefront/src/app
cp docs/assets/oca-mark.png apps/storefront/public/oca-mark.png
```

`apps/storefront/src/app/globals.css`:

```css
@import "@oca/ui/globals.css";
@source "../../../../packages/ui/src";
```

`apps/storefront/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter, Noto_Sans_Lao } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const notoSansLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-lao",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "OmniCommerce AI",
  description: "OmniCommerce AI storefront",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lo" className={`${notoSansLao.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

`apps/storefront/src/app/page.tsx`:

```tsx
import { Card } from "@oca/ui";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-4">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <Image src="/oca-mark.png" alt="OmniCommerce AI" width={64} height={64} priority />
        <h1 className="text-2xl font-bold text-ink">OmniCommerce AI</h1>
        <p className="text-sm text-ink-secondary">ຮ້ານຄ້າອອນລາຍກຳລັງຈະມາໄວໆນີ້ · Storefront coming soon</p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: ຕິດຕັ້ງ ແລະ ກວດ**

Run: `pnpm install && pnpm --filter @oca/storefront build && pnpm --filter @oca/storefront lint`
Expected: `next build` ສຳເລັດ (ເຫັນ route `/`); lint ບໍ່ມີ error.
ຖ້າ build ລົ້ມຍ້ອນ font subset `lao` ໃຫ້ກວດຊື່ subset ທີ່ `next/font` ຮອງຮັບ (ມັນບອກໃນ error) ແລ້ວແກ້ໃນ `layout.tsx` (ແລະ admin ໃນ Task 7 ໃຫ້ຄືກັນ).
ຖ້າ build ແກ້ `tsconfig.json` (Next ເພີ່ມ field ອັດຕະໂນມັດ) ໃຫ້ຮັບການແກ້ນັ້ນ.

ກວດວ່າ Tailwind ສະແກນ class ຂອງ `@oca/ui`: `grep -l "bg-brand\|rounded-2xl" apps/storefront/.next/static/chunks/*.css | head -1` ຕ້ອງມີຜົນ (ຖ້າບໍ່ມີ ແຕ່ page ໃຊ້ `bg-app`/`rounded-2xl` ແປວ່າ `@source` ຜິດ path).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront pnpm-lock.yaml
git commit -m "feat(storefront): add Next.js placeholder using @oca/ui tokens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `apps/admin` — scaffold ແລະ `turbo.json`

**Files:**
- Delete: `apps/admin/.gitkeep`
- Modify: `apps/admin/package.json`, `turbo.json`
- Create: `apps/admin/{next.config.ts,postcss.config.mjs,tsconfig.json,eslint.config.mjs,vitest.config.ts,vitest.setup.ts}`
- Create: `apps/admin/public/{oca-mark.png,oca-logo.png}`, `apps/admin/src/app/{globals.css,layout.tsx,page.tsx}`

- [ ] **Step 1: ແທນ `apps/admin/package.json`**

```json
{
  "name": "@oca/admin",
  "version": "0.0.0",
  "private": true,
  "description": "Next.js back-office: login, staff and roles (Phase 0)",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.9.1",
    "@oca/shared": "workspace:*",
    "@oca/ui": "workspace:*",
    "@tanstack/react-query": "^5.104.1",
    "lucide-react": "^1.52.0",
    "next": "^16.3.8",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-hook-form": "^7.89.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@oca/config": "workspace:*",
    "@tailwindcss/postcss": "^4.3.3",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/node": "^26.6.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^9.39.5",
    "jsdom": "^30.1.1",
    "tailwindcss": "^4.3.3",
    "typescript": "~5.9.3",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: ໄຟລ໌ config**

`apps/admin/next.config.ts` (proxy `/api/*` → API; ບໍ່ມີ CORS):

```ts
import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@oca/ui"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
```

`apps/admin/postcss.config.mjs`:

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

`apps/admin/tsconfig.json`:

```json
{
  "extends": "@oca/config/tsconfig.next.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "next.config.ts",
    "vitest.config.ts",
    "vitest.setup.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/admin/eslint.config.mjs`:

```js
import base from "@oca/config/eslint";

export default [...base, { ignores: ["next-env.d.ts"] }];
```

`apps/admin/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`apps/admin/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
```

- [ ] **Step 3: `turbo.json` — `dev` ຕ້ອງ build package ທີ່ admin ໃຊ້ກ່ອນ**

ອ່ານ docs ກ່ອນ (ຕາມ AGENTS.md): `node_modules/.pnpm/turbo@*/node_modules/turbo/docs/crafting-your-repository/developing-applications.mdx` (ພາກ "Running setup tasks before dev"). ແລ້ວແກ້ `turbo.json`:

```json
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
```

ເຫດຜົນ: `@oca/shared` ຖືກ import ເປັນ `dist` (CJS) ຈຶ່ງຕ້ອງ build ກ່ອນ `next dev`.

- [ ] **Step 4: assets, CSS, layout, ໜ້າຫຼັກ**

```bash
git rm -q apps/admin/.gitkeep
mkdir -p apps/admin/public apps/admin/src/app
cp docs/assets/oca-mark.png docs/assets/oca-logo.png apps/admin/public/
```

`apps/admin/src/app/globals.css`:

```css
@import "@oca/ui/globals.css";
@source "../../../../packages/ui/src";
```

`apps/admin/src/app/layout.tsx` (ຍັງບໍ່ມີ Providers; ຈະເພີ່ມໃນ Task 10):

```tsx
import type { Metadata } from "next";
import { Inter, Noto_Sans_Lao } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const notoSansLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-lao",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "OmniCommerce AI · Admin",
  description: "OmniCommerce AI back-office",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lo" className={`${notoSansLao.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

`apps/admin/src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage(): never {
  redirect("/staff");
}
```

- [ ] **Step 5: ຕິດຕັ້ງ ແລະ ກວດ**

Run: `pnpm install && pnpm --filter @oca/shared build && pnpm --filter @oca/admin build && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: build ສຳເລັດ; typecheck/lint ບໍ່ມີ error. (ຍັງບໍ່ແລ່ນ `vitest` ເພາະຍັງບໍ່ມີ test; ຈະມີຕັ້ງແຕ່ Task 8.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin turbo.json pnpm-lock.yaml
git commit -m "feat(admin): scaffold Next.js app with API proxy and test setup" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin — i18n (dictionary lo/en) ແລະ test helper

**Files:**
- Create: `apps/admin/src/lib/i18n/dictionary.ts`, `language-provider.tsx`, `i18n.test.tsx`
- Create: `apps/admin/src/test/render.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `src/lib/i18n/i18n.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { dictionaries, translate } from "./dictionary";
import { LanguageProvider, useT } from "./language-provider";

const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort().join(",");

describe("translate", () => {
  it("ແທນ {param} ດ້ວຍຄ່າ", () => {
    expect(translate("en", "page.showing", { from: 1, to: 10, total: 142 })).toBe("Showing 1-10 of 142 items");
    expect(translate("lo", "staff.count", { count: 3 })).toBe("3 ຄົນ");
  });

  it("param ທີ່ຂາດ ປະ placeholder ໄວ້ຕາມເດີມ", () => {
    expect(translate("en", "staff.count")).toBe("{count} people");
    expect(translate("en", "staff.count", {})).toBe("{count} people");
  });
});

describe("dictionaries", () => {
  it("lo ແລະ en ມີ key ຄືກັນ, ບໍ່ມີຄ່າຫວ່າງ ແລະ ມີ placeholder ຊຸດດຽວກັນ", () => {
    const loKeys = Object.keys(dictionaries.lo).sort();
    expect(Object.keys(dictionaries.en).sort()).toEqual(loKeys);
    for (const key of loKeys) {
      const lo = dictionaries.lo[key as keyof typeof dictionaries.lo];
      const en = dictionaries.en[key as keyof typeof dictionaries.en];
      expect(lo.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
      expect(placeholders(lo), key).toBe(placeholders(en));
    }
  });
});

function Probe() {
  const { t, language, setLanguage } = useT();
  return (
    <div>
      <p data-testid="label">{t("common.cancel")}</p>
      <p data-testid="lang">{language}</p>
      <button type="button" onClick={() => setLanguage("en")}>
        switch
      </button>
    </div>
  );
}

describe("LanguageProvider", () => {
  it("ເລີ່ມເປັນລາວ, ປ່ຽນເປັນ en ແລ້ວຈື່ໃນ localStorage ແລະ ຕັ້ງ <html lang>", async () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("label")).toHaveTextContent("ຍົກເລີກ");
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("label")).toHaveTextContent("Cancel");
    expect(window.localStorage.getItem("oca_lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ອ່ານພາສາທີ່ບັນທຶກໄວ້ເມື່ອບໍ່ມີ initialLanguage", async () => {
    window.localStorage.setItem("oca_lang", "en");
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("en"));
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin test`
Expected: FAIL (`Cannot find module './dictionary'`).

- [ ] **Step 3: ຂຽນ `dictionary.ts`**

ທຸກ key ທີ່ໜ້າຈໍໃຊ້ຢູ່ທີ່ນີ້ (ຕົວ `en` ຖືກ type ໃຫ້ຕ້ອງມີ key ຄົບ → ຂາດແລ້ວ compile ບໍ່ຜ່ານ). ຄຳສັບຕາມ DESIGN.md §16.3.

```ts
const lo = {
  "app.name": "OmniCommerce AI",

  "nav.home": "ໜ້າຫຼັກ",
  "nav.menu": "ເມນູ",
  "nav.collapse": "ຫຍໍ້ເມນູ",
  "nav.expand": "ຂະຫຍາຍເມນູ",
  "nav.group.settings": "ການຕັ້ງຄ່າ",
  "nav.staff": "ພະນັກງານ",
  "nav.roles": "ບົດບາດ ແລະ ສິດ",

  "user.menu": "ເມນູໂປຣໄຟລ໌",
  "user.logout": "ອອກຈາກລະບົບ",

  "common.cancel": "ຍົກເລີກ",
  "common.save": "ບັນທຶກ",
  "common.saving": "ກຳລັງບັນທຶກ...",
  "common.edit": "ແກ້ໄຂ",
  "common.view": "ເບິ່ງ",
  "common.delete": "ລຶບ",
  "common.close": "ປິດ",
  "common.retry": "ລອງໃໝ່",
  "common.actions": "ຈັດການ",
  "common.language": "ປ່ຽນພາສາ",
  "common.loading": "ກຳລັງໂຫຼດ...",
  "common.clearSearch": "ລ້າງການຄົ້ນຫາ",
  "common.deleteConfirm": "ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບຂໍ້ມູນນີ້? ການກະທຳນີ້ບໍ່ສາມາດກູ້ຄືນໄດ້.",
  "common.error.generic": "ເກີດຂໍ້ຜິດພາດ ກະລຸນາລອງໃໝ່",
  "common.error.load": "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ",

  "page.show": "ສະແດງ",
  "page.perPage": "ຕໍ່ໜ້າ",
  "page.all": "ທັງໝົດ",
  "page.showing": "ສະແດງ {from}-{to} ຈາກ {total} ລາຍການ",
  "page.previous": "ກ່ອນໜ້າ",
  "page.next": "ໜ້າຕໍ່ໄປ",

  "forbidden.title": "ບໍ່ມີສິດເຂົ້າເຖິງ",
  "forbidden.description": "ບັນຊີຂອງທ່ານບໍ່ມີສິດເບິ່ງໜ້ານີ້",

  "login.title": "ເຂົ້າສູ່ລະບົບ",
  "login.subtitle": "ໃຊ້ອີເມວ ແລະ ລະຫັດຜ່ານຂອງພະນັກງານ",
  "login.email": "ອີເມວ",
  "login.password": "ລະຫັດຜ່ານ",
  "login.submit": "ເຂົ້າສູ່ລະບົບ",
  "login.submitting": "ກຳລັງເຂົ້າສູ່ລະບົບ...",
  "login.showPassword": "ສະແດງລະຫັດຜ່ານ",
  "login.hidePassword": "ເຊື່ອງລະຫັດຜ່ານ",
  "login.invalid": "ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ",
  "login.tooMany": "ລອງຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ ແລ້ວລອງໃໝ່",

  "validation.required": "ຂໍ້ມູນນີ້ຈຳເປັນ",
  "validation.email": "ອີເມວບໍ່ຖືກຕ້ອງ",
  "validation.passwordMin": "ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ {min} ໂຕອັກສອນ",

  "status.active": "ໃຊ້ງານ",
  "status.inactive": "ປິດໃຊ້ງານ",

  "staff.title": "ພະນັກງານ",
  "staff.description": "ຈັດການບັນຊີພະນັກງານ ແລະ ບົດບາດ",
  "staff.count": "{count} ຄົນ",
  "staff.add": "ເພີ່ມພະນັກງານ",
  "staff.search": "ຄົ້ນຫາຊື່, ອີເມວ ຫຼື ບົດບາດ...",
  "staff.col.name": "ຊື່",
  "staff.col.email": "ອີເມວ",
  "staff.col.role": "ບົດບາດ",
  "staff.col.status": "ສະຖານະ",
  "staff.col.lastLogin": "ເຂົ້າລະບົບຄັ້ງສຸດທ້າຍ",
  "staff.empty.title": "ຍັງບໍ່ມີພະນັກງານ",
  "staff.empty.noResults": "ບໍ່ພົບພະນັກງານທີ່ຄົ້ນຫາ",
  "staff.edit": "ແກ້ໄຂພະນັກງານ",
  "staff.deactivate": "ປິດໃຊ້ງານບັນຊີ",
  "staff.activate": "ເປີດໃຊ້ງານບັນຊີ",
  "staff.deactivateTitle": "ປິດໃຊ້ງານບັນຊີນີ້?",
  "staff.deactivateDescription": "{name} ຈະເຂົ້າລະບົບບໍ່ໄດ້ຈົນກວ່າຈະເປີດໃຊ້ງານຄືນ.",
  "staff.form.createTitle": "ເພີ່ມພະນັກງານ",
  "staff.form.createDescription": "ສ້າງບັນຊີ ແລະ ກຳນົດບົດບາດ",
  "staff.form.editDescription": "ແກ້ໄຂຊື່, ບົດບາດ ຫຼື ລະຫັດຜ່ານ",
  "staff.form.password": "ລະຫັດຜ່ານ",
  "staff.form.passwordKeep": "ເວັ້ນໄວ້ຖ້າບໍ່ປ່ຽນ",
  "staff.form.rolePlaceholder": "ເລືອກບົດບາດ",
  "staff.toast.created": "ເພີ່ມພະນັກງານແລ້ວ",
  "staff.toast.updated": "ບັນທຶກການແກ້ໄຂແລ້ວ",
  "staff.toast.deactivated": "ປິດໃຊ້ງານບັນຊີແລ້ວ",
  "staff.toast.activated": "ເປີດໃຊ້ງານບັນຊີແລ້ວ",

  "roles.title": "ບົດບາດ ແລະ ສິດ",
  "roles.description": "ກຳນົດວ່າແຕ່ລະບົດບາດເຮັດຫຍັງໄດ້ແດ່",
  "roles.count": "{count} ບົດບາດ",
  "roles.add": "ເພີ່ມບົດບາດ",
  "roles.search": "ຄົ້ນຫາບົດບາດ...",
  "roles.col.name": "ຊື່ບົດບາດ",
  "roles.col.description": "ຄຳອະທິບາຍ",
  "roles.col.permissions": "ສິດ",
  "roles.col.users": "ຜູ້ໃຊ້",
  "roles.system": "ລະບົບ",
  "roles.empty.title": "ຍັງບໍ່ມີບົດບາດ",
  "roles.empty.noResults": "ບໍ່ພົບບົດບາດທີ່ຄົ້ນຫາ",
  "roles.deleteTitle": "ລຶບບົດບາດນີ້?",
  "roles.form.createTitle": "ເພີ່ມບົດບາດ",
  "roles.form.editTitle": "ແກ້ໄຂບົດບາດ",
  "roles.form.viewTitle": "ເບິ່ງບົດບາດ",
  "roles.form.createDescription": "ຕັ້ງຊື່ ແລະ ເລືອກສິດການໃຊ້ງານ",
  "roles.form.editDescription": "ແກ້ໄຂຊື່ ຫຼື ສິດການໃຊ້ງານ",
  "roles.form.systemDescription": "ບົດບາດຂອງລະບົບ ແກ້ໄຂບໍ່ໄດ້",
  "roles.form.permissions": "ສິດການໃຊ້ງານ",
  "roles.toast.created": "ສ້າງບົດບາດແລ້ວ",
  "roles.toast.updated": "ບັນທຶກບົດບາດແລ້ວ",
  "roles.toast.deleted": "ລຶບບົດບາດແລ້ວ",

  "perm.module": "ໂມດູນ",
  "perm.read": "ເບິ່ງ",
  "perm.write": "ແກ້ໄຂ",
  "perm.all": "ທັງໝົດ",

  "module.inbox": "ກ່ອງຂໍ້ຄວາມ",
  "module.posting": "ໂພສ",
  "module.image-studio": "ສະຕູດິໂອຮູບ",
  "module.live-cf": "ໄລຟ໌ ແລະ CF",
  "module.promotion": "ໂປຣໂມຊັນ",
  "module.affiliate": "ນາຍໜ້າ",
  "module.inventory": "ສະຕ໊ອກ",
  "module.logistics": "ຂົນສົ່ງ",
  "module.automation": "ອັດຕະໂນມັດ",
  "module.analytics": "ວິເຄາະ",
  "module.crm": "ລູກຄ້າ (CRM)",
  "module.staff": "ພະນັກງານ",
} as const;

export type TranslationKey = keyof typeof lo;
export type Language = "lo" | "en";
export type TranslateParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslateParams) => string;

const en: Record<TranslationKey, string> = {
  "app.name": "OmniCommerce AI",

  "nav.home": "Home",
  "nav.menu": "Menu",
  "nav.collapse": "Collapse menu",
  "nav.expand": "Expand menu",
  "nav.group.settings": "Settings",
  "nav.staff": "Staff",
  "nav.roles": "Roles & permissions",

  "user.menu": "Profile menu",
  "user.logout": "Log out",

  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving...",
  "common.edit": "Edit",
  "common.view": "View",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.retry": "Retry",
  "common.actions": "Actions",
  "common.language": "Change language",
  "common.loading": "Loading...",
  "common.clearSearch": "Clear search",
  "common.deleteConfirm": "Are you sure you want to delete this? This action cannot be undone.",
  "common.error.generic": "Something went wrong. Please try again.",
  "common.error.load": "Could not load data",

  "page.show": "Show",
  "page.perPage": "per page",
  "page.all": "All",
  "page.showing": "Showing {from}-{to} of {total} items",
  "page.previous": "Previous",
  "page.next": "Next",

  "forbidden.title": "No access",
  "forbidden.description": "Your account does not have permission to view this page.",

  "login.title": "Sign in",
  "login.subtitle": "Use your staff email and password",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in...",
  "login.showPassword": "Show password",
  "login.hidePassword": "Hide password",
  "login.invalid": "Incorrect email or password",
  "login.tooMany": "Too many attempts. Please wait and try again.",

  "validation.required": "This field is required",
  "validation.email": "Enter a valid email",
  "validation.passwordMin": "Password must be at least {min} characters",

  "status.active": "Active",
  "status.inactive": "Inactive",

  "staff.title": "Staff",
  "staff.description": "Manage staff accounts and roles",
  "staff.count": "{count} people",
  "staff.add": "Add staff",
  "staff.search": "Search name, email or role...",
  "staff.col.name": "Name",
  "staff.col.email": "Email",
  "staff.col.role": "Role",
  "staff.col.status": "Status",
  "staff.col.lastLogin": "Last login",
  "staff.empty.title": "No staff yet",
  "staff.empty.noResults": "No staff match your search",
  "staff.edit": "Edit staff",
  "staff.deactivate": "Deactivate account",
  "staff.activate": "Activate account",
  "staff.deactivateTitle": "Deactivate this account?",
  "staff.deactivateDescription": "{name} will not be able to sign in until the account is reactivated.",
  "staff.form.createTitle": "Add staff",
  "staff.form.createDescription": "Create an account and assign a role",
  "staff.form.editDescription": "Change the name, role or password",
  "staff.form.password": "Password",
  "staff.form.passwordKeep": "Leave blank to keep the current one",
  "staff.form.rolePlaceholder": "Select a role",
  "staff.toast.created": "Staff member added",
  "staff.toast.updated": "Changes saved",
  "staff.toast.deactivated": "Account deactivated",
  "staff.toast.activated": "Account activated",

  "roles.title": "Roles & permissions",
  "roles.description": "Define what each role can do",
  "roles.count": "{count} roles",
  "roles.add": "Add role",
  "roles.search": "Search roles...",
  "roles.col.name": "Role name",
  "roles.col.description": "Description",
  "roles.col.permissions": "Permissions",
  "roles.col.users": "Users",
  "roles.system": "System",
  "roles.empty.title": "No roles yet",
  "roles.empty.noResults": "No roles match your search",
  "roles.deleteTitle": "Delete this role?",
  "roles.form.createTitle": "Add role",
  "roles.form.editTitle": "Edit role",
  "roles.form.viewTitle": "View role",
  "roles.form.createDescription": "Name the role and choose permissions",
  "roles.form.editDescription": "Change the name or permissions",
  "roles.form.systemDescription": "System roles cannot be modified",
  "roles.form.permissions": "Permissions",
  "roles.toast.created": "Role created",
  "roles.toast.updated": "Role saved",
  "roles.toast.deleted": "Role deleted",

  "perm.module": "Module",
  "perm.read": "Read",
  "perm.write": "Write",
  "perm.all": "All",

  "module.inbox": "Inbox",
  "module.posting": "Posting",
  "module.image-studio": "Image Studio",
  "module.live-cf": "Live & CF",
  "module.promotion": "Promotion",
  "module.affiliate": "Affiliate",
  "module.inventory": "Inventory",
  "module.logistics": "Logistics",
  "module.automation": "Automation",
  "module.analytics": "Analytics",
  "module.crm": "CRM",
  "module.staff": "Staff",
};

export const dictionaries: Record<Language, Record<TranslationKey, string>> = { lo, en };

export function translate(language: Language, key: TranslationKey, params?: TranslateParams): string {
  const template = dictionaries[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
```

- [ ] **Step 4: ຂຽນ `language-provider.tsx`**

```tsx
"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Language, type Translate, translate } from "./dictionary";

const STORAGE_KEY = "oca_lang";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "lo" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** ໃຊ້ໃນ test; ຖ້າບໍ່ໃສ່ ຈະອ່ານຈາກ localStorage ແລ້ວ default ເປັນລາວ. */
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage ?? "lo");

  useEffect(() => {
    if (initialLanguage) return;
    const stored = readStoredLanguage();
    if (stored) setLanguageState(stored);
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage ໃຊ້ບໍ່ໄດ້ (private mode ຯລຯ): ຍັງໃຊ້ໄດ້ໃນ session ນີ້
    }
  }, []);

  const t = useCallback<Translate>((key, params) => translate(language, key, params), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useT(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useT must be used within LanguageProvider");
  return context;
}
```

- [ ] **Step 5: test helper `src/test/render.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/lib/i18n/language-provider";

/** render ພ້ອມ QueryClient (ບໍ່ retry) ແລະ ພາສາອັງກິດ ເພື່ອໃຫ້ assert ຂໍ້ຄວາມໄດ້ຊັດເຈນ. */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLanguage="en">{ui}</LanguageProvider>
    </QueryClientProvider>,
  );
  return { user, queryClient, ...result };
}
```

- [ ] **Step 6: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS (5 test); ບໍ່ມີ error.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add lo/en dictionary, language provider and test helper" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Admin — API client (`apiFetch`) ພ້ອມ refresh ອັດຕະໂນມັດ

**ສັນຍາ:** access token ຢູ່ໃນ memory. ໄດ້ 401 → refresh ຄັ້ງດຽວ (ຫຼາຍ request ພ້ອມກັນຮວມເປັນ promise ດຽວ ເພາະ refresh token ເປັນ rotation ໃຊ້ໄດ້ຄັ້ງດຽວ) → ລອງໃໝ່; ຍັງ 401 → ແຈ້ງ handler (ໄປ `/login`). `/auth/login|refresh|logout` ບໍ່ refresh.

**Files:**
- Create: `apps/admin/src/lib/api.ts`, `api.test.ts`, `errors.ts`, `types.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `src/lib/api.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  getAccessToken,
  loginRequest,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
} from "./api";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const session = (token: string) => ({
  accessToken: token,
  user: { id: "u1", email: "o@example.com", name: "Owner", roleId: "r1", roleName: "OWNER", permissions: ["staff:read"] },
});

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("ແນບ Bearer token ແລະ JSON body ໄປທີ່ /api", async () => {
    setAccessToken("tok");
    const fetchMock = mockFetch(() => json(200, { ok: true }));

    await expect(apiFetch("/staff", { method: "POST", body: { a: 1 } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/staff");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(headersOf(init).Authorization).toBe("Bearer tok");
    expect(headersOf(init)["Content-Type"]).toBe("application/json");
  });

  it("ໄດ້ 401 → refresh → ລອງໃໝ່ດ້ວຍ token ໃໝ່", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return json(200, session("new"));
      return headersOf(init).Authorization === "Bearer new" ? json(200, [{ id: "s1" }]) : json(401, { message: "Unauthorized" });
    });

    await expect(apiFetch("/staff")).resolves.toEqual([{ id: "s1" }]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/staff", "/api/auth/refresh", "/api/staff"]);
    expect(getAccessToken()).toBe("new");
  });

  it("refresh ລົ້ມ → ແຈ້ງ handler, ລ້າງ token ແລະ throw ApiError 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken("old");
    mockFetch((url) =>
      url === "/api/auth/refresh" ? json(401, { message: "Invalid refresh token" }) : json(401, { message: "Unauthorized" }),
    );

    await expect(apiFetch("/staff")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("ຫຼາຍ request ໄດ້ 401 ພ້ອມກັນ → refresh ພຽງຄັ້ງດຽວ", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch(async (url, init) => {
      if (url === "/api/auth/refresh") {
        await Promise.resolve();
        return json(200, session("new"));
      }
      return headersOf(init).Authorization === "Bearer new" ? json(200, { ok: true }) : json(401, {});
    });

    await Promise.all([apiFetch("/staff"), apiFetch("/roles")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("204 ໄດ້ undefined; error body ຖືກແປງເປັນ ApiError ພ້ອມ issues", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiFetch("/roles/x", { method: "DELETE" })).resolves.toBeUndefined();

    mockFetch(() => json(400, { message: "Validation failed", issues: [{ path: "name", message: "Required" }] }));
    await expect(apiFetch("/roles", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      message: "Validation failed",
      issues: [{ path: "name", message: "Required" }],
    });
  });
});

describe("auth requests", () => {
  it("login 401 ບໍ່ refresh ແລະ ບໍ່ແຈ້ງ handler", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetchMock = mockFetch(() => json(401, { message: "Invalid credentials" }));

    await expect(loginRequest({ email: "a@b.co", password: "password123" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("login ສຳເລັດເກັບ access token", async () => {
    mockFetch(() => json(200, session("tok")));
    const result = await loginRequest({ email: "a@b.co", password: "password123" });
    expect(result.user.email).toBe("o@example.com");
    expect(getAccessToken()).toBe("tok");
  });

  it("refreshSession: 401 ຫຼື network ລົ້ມ ໄດ້ null", async () => {
    mockFetch(() => json(401, {}));
    await expect(refreshSession()).resolves.toBeNull();

    mockFetch(() => {
      throw new Error("offline");
    });
    await expect(refreshSession()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/api.test.ts`
Expected: FAIL (`Cannot find module './api'`).

- [ ] **Step 3: ຂຽນ `src/lib/api.ts`**

```ts
import type { LoginInput, Permission } from "@oca/shared";

export const API_BASE = "/api";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
}

export interface Session {
  accessToken: string;
  user: SessionUser;
}

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
}

/** Endpoint ທີ່ບໍ່ຄວນ refresh ເມື່ອໄດ້ 401 (ຜິດ credentials ຫຼື refresh ເອງລົ້ມ). */
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshInFlight: Promise<Session | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** ຖືກເອີ້ນເມື່ອ session ໝົດແທ້ (refresh ລົ້ມ). AuthProvider ໃຊ້ເພື່ອສົ່ງໄປ /login. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || `HTTP ${response.status}`;
  let issues: ApiIssue[] = [];
  try {
    const body = (await response.json()) as { message?: unknown; issues?: unknown };
    if (typeof body.message === "string") message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join(", ");
    if (Array.isArray(body.issues)) issues = body.issues as ApiIssue[];
  } catch {
    // body ບໍ່ແມ່ນ JSON: ໃຊ້ statusText
  }
  return new ApiError(response.status, message, issues);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });
}

/** Refresh ຄັ້ງດຽວຕໍ່ເທື່ອ (single-flight). network ລົ້ມ ຫຼື ບໍ່ ok = ບໍ່ມີ session. */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) {
        setAccessToken(null);
        return null;
      }
      const session = (await response.json()) as Session;
      setAccessToken(session.accessToken);
      return session;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const usedToken = accessToken;
  const response = await send(path, options);
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) return parse<T>(response);

  // 401: ຖ້າ request ອື່ນ refresh ໄປແລ້ວ (token ປ່ຽນ) ລອງໃໝ່ເລີຍ; ບໍ່ດັ່ງນັ້ນ refresh (single-flight).
  const recovered = accessToken !== null && accessToken !== usedToken ? true : (await refreshSession()) !== null;
  if (!recovered) {
    onUnauthorized?.();
    return parse<T>(response);
  }
  const retry = await send(path, options);
  if (retry.status === 401) onUnauthorized?.();
  return parse<T>(retry);
}

export async function loginRequest(input: LoginInput): Promise<Session> {
  const session = await apiFetch<Session>("/auth/login", { method: "POST", body: input });
  setAccessToken(session.accessToken);
  return session;
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}
```

- [ ] **Step 4: `src/lib/errors.ts` ແລະ `src/lib/types.ts`**

`errors.ts`:

```ts
import type { Translate } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";

/** ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້: ໃຊ້ message ຈາກ API ຖ້າມີ, ບໍ່ດັ່ງນັ້ນຂໍ້ຄວາມກາງ. */
export function errorMessage(error: unknown, t: Translate): string {
  return error instanceof ApiError && error.message ? error.message : t("common.error.generic");
}
```

`types.ts` (ຕົງກັບ DTO ຂອງ API; ວັນທີມາເປັນ string ຜ່ານ JSON):

```ts
import type { Permission } from "@oca/shared";

export interface StaffDto {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}
```

- [ ] **Step 5: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS (ທັງ api test 8 ອັນ + i18n).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add API client with single-flight token refresh" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin — AuthProvider, `useCan`, Providers

**Files:**
- Create: `apps/admin/src/components/auth/auth-provider.tsx`, `auth-provider.test.tsx`
- Create: `apps/admin/src/app/providers.tsx`
- Modify: `apps/admin/src/app/layout.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `auth-provider.test.tsx`**

```tsx
import type { Permission } from "@oca/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginRequest, logoutRequest, refreshSession } from "@/lib/api";
import { AuthProvider, useAuth } from "./auth-provider";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  refreshSession: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
}));

function makeSession(accessToken: string, email: string, roleName: string, permissions: Permission[]) {
  return { accessToken, user: { id: email, email, name: roleName, roleId: roleName, roleName, permissions } };
}
const owner = makeSession("t1", "owner@example.com", "OWNER", ["staff:read", "staff:write"]);
const viewer = makeSession("t2", "viewer@example.com", "VIEWER", ["staff:read"]);

function Probe() {
  const { status, user, can, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.email ?? "-"}</p>
      <p data-testid="can-write">{String(can("staff:write"))}</p>
      <button type="button" onClick={() => void login({ email: "viewer@example.com", password: "password123" })}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId("status");

beforeEach(() => {
  vi.mocked(refreshSession).mockReset();
  vi.mocked(loginRequest).mockReset();
  vi.mocked(logoutRequest).mockReset();
});

describe("AuthProvider", () => {
  it("ເລີ່ມ loading ແລ້ວເປັນ authenticated ເມື່ອ refresh ສຳເລັດ ແລະ can() ຕາມ permission", async () => {
    vi.mocked(refreshSession).mockResolvedValue(owner);
    renderProbe();
    expect(status()).toHaveTextContent("loading");
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("owner@example.com");
    expect(screen.getByTestId("can-write")).toHaveTextContent("true");
  });

  it("can() ເປັນ false ເມື່ອບໍ່ມີ permission", async () => {
    vi.mocked(refreshSession).mockResolvedValue(viewer);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("can-write")).toHaveTextContent("false");
  });

  it("ເປັນ unauthenticated ເມື່ອ refresh ໄດ້ null", async () => {
    vi.mocked(refreshSession).mockResolvedValue(null);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("-");
  });

  it("login ປ່ຽນເປັນ authenticated", async () => {
    vi.mocked(refreshSession).mockResolvedValue(null);
    vi.mocked(loginRequest).mockResolvedValue(viewer);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    await userEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("viewer@example.com");
  });

  it("logout ເອີ້ນ API ແລ້ວກັບເປັນ unauthenticated (ເຖິງ API ຈະລົ້ມ)", async () => {
    vi.mocked(refreshSession).mockResolvedValue(owner);
    vi.mocked(logoutRequest).mockRejectedValue(new Error("network"));
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    expect(logoutRequest).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/auth/auth-provider.test.tsx`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: ຂຽນ `auth-provider.tsx`**

```tsx
"use client";

import { type LoginInput, type Permission, hasPermission } from "@oca/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type SessionUser,
  loginRequest,
  logoutRequest,
  refreshSession,
  setUnauthorizedHandler,
} from "@/lib/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
}

interface AuthContextValue extends AuthState {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const UNAUTHENTICATED: AuthState = { status: "unauthenticated", user: null };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  // ຕອນເປີດໜ້າ: ຟື້ນ session ດ້ວຍ refresh cookie. refreshSession ເປັນ single-flight
  // ຈຶ່ງປອດໄພກັບ React Strict Mode ທີ່ mount ສອງຄັ້ງ.
  useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => {
      queryClient.clear();
      setState(UNAUTHENTICATED);
    });
    void refreshSession().then((session) => {
      if (active) setState(session ? { status: "authenticated", user: session.user } : UNAUTHENTICATED);
    });
    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, [queryClient]);

  const login = useCallback(async (input: LoginInput) => {
    const session = await loginRequest(input);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // ເຖິງ API ລົ້ມ ກໍລ້າງ session ຝັ່ງ client
    }
    queryClient.clear();
    setState(UNAUTHENTICATED);
  }, [queryClient]);

  const can = useCallback(
    (permission: Permission) => state.user !== null && hasPermission(state.user.permissions, permission),
    [state.user],
  );

  const value = useMemo(() => ({ ...state, login, logout, can }), [state, login, logout, can]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

/** ຊ່ອນເມນູ/ປຸ່ມຕາມສິດ. API ຍັງເປັນຜູ້ບັງຄັບສິດຈິງ. */
export function useCan(permission: Permission): boolean {
  return useAuth().can(permission);
}
```

- [ ] **Step 4: `src/app/providers.tsx` ແລະ ແກ້ `layout.tsx`**

`providers.tsx`:

```tsx
"use client";

import { Toaster } from "@oca/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { LanguageProvider, useT } from "@/lib/i18n/language-provider";

function AppToaster() {
  const { t } = useT();
  return <Toaster dismissLabel={t("common.close")} />;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // ບໍ່ retry error 4xx (ສິດ/ຂໍ້ມູນຜິດ); retry ສູງສຸດ 2 ຄັ້ງກັບ network/5xx
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
          <AppToaster />
        </AuthProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
```

`layout.tsx`: ເພີ່ມ `import { Providers } from "./providers";` (ຕໍ່ຈາກ `import type { ReactNode } ...`) ແລະ ແກ້ `<body>`:

```tsx
      <body>
        <Providers>{children}</Providers>
      </body>
```

- [ ] **Step 5: ແລ່ນ test + typecheck + lint + build**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint && pnpm --filter @oca/admin build`
Expected: PASS ທັງໝົດ; build ສຳເລັດ.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add AuthProvider with session restore, useCan and app providers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Admin — ໜ້າ `/login`

ຕາມ DESIGN.md §11.7 (ພື້ນ gradient ມ່ວງ, ກ່ອງຂາວ `max-w-[480px]`, input `h-11 rounded-lg`, ປຸ່ມ `w-full h-11`, ປຸ່ມສະແດງລະຫັດຜ່ານ).

**Files:**
- Create: `apps/admin/src/lib/validation-text.ts`
- Create: `apps/admin/src/components/shell/{chrome.ts,language-toggle.tsx}`
- Create: `apps/admin/src/components/auth/{login-form.tsx,login-form.test.tsx,login-shell.tsx}`
- Create: `apps/admin/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ — `login-form.test.tsx`**

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("email/ລະຫັດຜິດຮູບແບບ: ສະແດງ error ແລະ ບໍ່ເອີ້ນ onSubmit", async () => {
    const onSubmit = vi.fn();
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ສົ່ງຄ່າທີ່ຜ່ານ schema ແລ້ວ (email ເປັນຕົວນ້ອຍ, ຕັດຊ່ອງວ່າງ)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), " Owner@Example.COM ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: "owner@example.com", password: "password123" });
  });

  it("401 ຈາກ API: ສະແດງຂໍ້ຄວາມ credentials ຜິດ", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(401, "Invalid credentials"));
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
  });

  it("429: ສະແດງຂໍ້ຄວາມລອງຫຼາຍເກີນໄປ; ປຸ່ມເບິ່ງລະຫັດຜ່ານສະຫຼັບ type", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(429, "Too Many Requests"));
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(password, "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/auth/login-form.test.tsx`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: ໄຟລ໌ຊ່ວຍ**

`src/lib/validation-text.ts` (ແປຂໍ້ຄວາມ validation ຂອງ zod ເປັນພາສາປັດຈຸບັນ):

```ts
import { PASSWORD_MIN_LENGTH } from "@oca/shared";
import type { Translate } from "@/lib/i18n/dictionary";

export function validationText(field: string, t: Translate): string {
  if (field === "email") return t("validation.email");
  if (field === "password") return t("validation.passwordMin", { min: PASSWORD_MIN_LENGTH });
  return t("validation.required");
}
```

`src/components/shell/chrome.ts`:

```ts
/** ປຸ່ມ topbar ທຸກອັນໃຊ້ chrome ດຽວກັນ (DESIGN.md §8.2). */
export const TOPBAR_BUTTON =
  "inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-brand/15 bg-brand/5 text-brand-ink transition-colors hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
```

`src/components/shell/language-toggle.tsx`:

```tsx
"use client";

import { cn } from "@oca/ui";
import { Languages } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import { TOPBAR_BUTTON } from "./chrome";

export function LanguageToggle({ className }: { className?: string }) {
  const { t, language, setLanguage } = useT();
  return (
    <button
      type="button"
      aria-label={t("common.language")}
      onClick={() => setLanguage(language === "lo" ? "en" : "lo")}
      className={cn(TOPBAR_BUTTON, "w-auto gap-1.5 px-3 text-sm font-medium", className)}
    >
      <Languages className="size-5" aria-hidden="true" />
      {language === "lo" ? "EN" : "ລາວ"}
    </button>
  );
}
```

- [ ] **Step 4: `login-form.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, loginSchema } from "@oca/shared";
import { Button, Field, Input } from "@oca/ui";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { validationText } from "@/lib/validation-text";

function loginErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.status === 401) return t("login.invalid");
  if (error instanceof ApiError && error.status === 429) return t("login.tooMany");
  return errorMessage(error, t);
}

export function LoginForm({ onSubmit }: { onSubmit: (values: LoginInput) => Promise<void> }) {
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(loginErrorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{t("login.subtitle")}</p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      <Field
        label={t("login.email")}
        htmlFor="login-email"
        required
        error={errors.email ? validationText("email", t) : undefined}
      >
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          className="h-11 rounded-lg px-4"
          invalid={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field
        label={t("login.password")}
        htmlFor="login-password"
        required
        error={errors.password ? validationText("password", t) : undefined}
      >
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="h-11 rounded-lg px-4 pr-11"
            invalid={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </Field>

      <Button type="submit" className="h-11 w-full rounded-lg text-base font-bold" loading={isSubmitting}>
        {isSubmitting ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: `login-shell.tsx` ແລະ ໜ້າ**

`login-shell.tsx`:

```tsx
import Image from "next/image";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/shell/language-toggle";

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-[#0c0030] via-[#1c0a47] to-brand-deep p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-purple-600/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 size-[380px] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 size-[300px] -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>
      <div className="absolute right-4 top-4 z-10">
        <LanguageToggle className="border-white/20 bg-white/10 text-white hover:bg-white/20" />
      </div>
      <div className="relative w-full max-w-[480px] rounded-2xl bg-surface p-8 shadow-2xl sm:p-10">
        <div className="mb-6 flex justify-center">
          <Image src="/oca-logo.png" alt="OmniCommerce AI" width={112} height={98} priority />
        </div>
        {children}
      </div>
    </main>
  );
}
```

`src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoginForm } from "@/components/auth/login-form";
import { LoginShell } from "@/components/auth/login-shell";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/staff");
  }, [status, router]);

  return (
    <LoginShell>
      <LoginForm onSubmit={login} />
    </LoginShell>
  );
}
```

- [ ] **Step 6: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. ຖ້າມີ type error ຂອງ `zodResolver` (input/output ຂອງ schema ທີ່ມີ transform) ໃຫ້ແກ້ດ້ວຍ generic ຂອງ `useForm<LoginInput, unknown, LoginInput>`; ຢ່າໃຊ້ `any`.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add login page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Admin — App shell (nav, sidebar, topbar, ກັນໜ້າ, PermissionGate)

ຕາມ DESIGN.md §8: sidebar fixed (280px, rail 72px), topbar fixed 64px, ມືຖື sidebar ເລື່ອນເຂົ້າ + backdrop + `Esc`; ເມນູຖືກກັ່ນຕອງຕາມສິດ.

**Files:**
- Create: `apps/admin/src/lib/nav.ts`, `nav.test.ts`
- Create: `apps/admin/src/components/shell/{sidebar.tsx,sidebar.test.tsx,topbar.tsx,profile-menu.tsx}`
- Create: `apps/admin/src/components/auth/{permission-gate.tsx,permission-gate.test.tsx}`
- Create: `apps/admin/src/app/(app)/layout.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`src/lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isActivePath, visibleNavGroups } from "./nav";

describe("visibleNavGroups", () => {
  it("ຜູ້ມີ staff:read ເຫັນ staff ແລະ roles", () => {
    const groups = visibleNavGroups(["staff:read"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/staff", "/roles"]);
  });

  it("ບໍ່ມີສິດ: ບໍ່ມີກຸ່ມເລີຍ (ກຸ່ມທີ່ບໍ່ມີລາຍການບໍ່ຖືກ render)", () => {
    expect(visibleNavGroups([])).toEqual([]);
    expect(visibleNavGroups(["inbox:read"])).toEqual([]);
  });
});

describe("isActivePath", () => {
  it("ກົງ ຫຼື ເປັນໜ້າຍ່ອຍ, ແຕ່ບໍ່ແມ່ນ prefix ທີ່ຊື່ຄ້າຍກັນ", () => {
    expect(isActivePath("/staff", "/staff")).toBe(true);
    expect(isActivePath("/staff/123", "/staff")).toBe(true);
    expect(isActivePath("/staffing", "/staff")).toBe(false);
    expect(isActivePath("/roles", "/staff")).toBe(false);
  });
});
```

`src/components/shell/sidebar.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Sidebar } from "./sidebar";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { permissions: auth.permissions } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/roles" }));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

beforeEach(() => {
  auth.permissions = [];
});

describe("Sidebar", () => {
  it("ສະແດງເມນູທີ່ມີສິດ ແລະ ໝາຍໜ້າປັດຈຸບັນດ້ວຍ aria-current", () => {
    auth.permissions = ["staff:read"];
    renderWithProviders(<Sidebar collapsed={false} mobileOpen={false} onCloseMobile={() => {}} />);

    expect(screen.getByRole("link", { name: "Staff" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Roles & permissions" })).toHaveAttribute("aria-current", "page");
  });

  it("ບໍ່ມີສິດ: ບໍ່ມີລິ້ງເມນູ", () => {
    renderWithProviders(<Sidebar collapsed={false} mobileOpen={false} onCloseMobile={() => {}} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ມືຖື: ກົດ Esc ປິດ sidebar", async () => {
    auth.permissions = ["staff:read"];
    const onCloseMobile = vi.fn();
    const { user } = renderWithProviders(<Sidebar collapsed={false} mobileOpen onCloseMobile={onCloseMobile} />);
    await user.keyboard("{Escape}");
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});
```

`src/components/auth/permission-gate.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PermissionGate } from "./permission-gate";

const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.allowed }));

beforeEach(() => {
  auth.allowed = true;
});

describe("PermissionGate", () => {
  it("ມີສິດ: ສະແດງເນື້ອໃນ", () => {
    renderWithProviders(
      <PermissionGate permission="staff:read">
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດ: ສະແດງໜ້າ 'ບໍ່ມີສິດ' ແທນ", () => {
    auth.allowed = false;
    renderWithProviders(
      <PermissionGate permission="staff:read">
        <p>secret</p>
      </PermissionGate>,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/nav.test.ts src/components/shell/sidebar.test.tsx src/components/auth/permission-gate.test.tsx`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: `src/lib/nav.ts`**

```ts
import { type Permission, hasPermission } from "@oca/shared";
import { type LucideIcon, ShieldCheck, Users } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/dictionary";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  permission: Permission;
}

export interface NavGroup {
  id: string;
  labelKey: TranslationKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "settings",
    labelKey: "nav.group.settings",
    items: [
      { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "staff:read" },
      { href: "/roles", labelKey: "nav.roles", icon: ShieldCheck, permission: "staff:read" },
    ],
  },
];

/** ກັ່ນຕອງຕາມສິດ; ກຸ່ມທີ່ບໍ່ມີລາຍການຈະບໍ່ຖືກ render (DESIGN.md §8.3). */
export function visibleNavGroups(permissions: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(permissions, item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: `permission-gate.tsx`**

```tsx
"use client";

import type { Permission } from "@oca/shared";
import { Card } from "@oca/ui";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";

/** ໜ້າ "ບໍ່ມີສິດ" ຕາມ DESIGN.md §11.8. API ຍັງບັງຄັບສິດຈິງ; ນີ້ເປັນພຽງ UX. */
export function PermissionGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useCan(permission);
  const { t } = useT();
  if (allowed) return children;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <AlertCircle className="mx-auto size-8 text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold text-ink">{t("forbidden.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("forbidden.description")}</p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: `sidebar.tsx`**

```tsx
"use client";

import { cn } from "@oca/ui";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import { isActivePath, visibleNavGroups } from "@/lib/nav";

export interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useT();
  const pathname = usePathname();
  const groups = visibleNavGroups(user?.permissions ?? []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <div aria-hidden="true" className="fixed inset-0 z-[1020] bg-black/40 lg:hidden" onClick={onCloseMobile} />
      ) : null}
      <aside
        className={cn(
          "fixed left-0 top-0 z-[1030] flex h-screen w-[280px] flex-col border-r border-chrome-line bg-chrome transition-all duration-300",
          collapsed ? "lg:w-[72px]" : "lg:w-[280px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-[124px] shrink-0 items-center justify-center">
          <Image
            src="/oca-mark.png"
            alt="OCA"
            width={92}
            height={92}
            priority
            className={cn("rounded-[22px] object-contain transition-all duration-300", collapsed ? "lg:size-10" : "size-[92px]")}
          />
        </div>

        <nav aria-label={t("nav.menu")} className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-3">
          {groups.map((group) => {
            const groupActive = group.items.some((item) => isActivePath(pathname, item.href));
            return (
              <div key={group.id} className="flex flex-col gap-1">
                <p
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider",
                    groupActive ? "font-semibold text-brand" : "text-brand-ink/60",
                    collapsed && "lg:hidden",
                  )}
                >
                  {groupActive ? <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" /> : null}
                  {t(group.labelKey)}
                </p>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? t(item.labelKey) : undefined}
                      onClick={onCloseMobile}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-xl px-3 text-[14px] transition-colors",
                        collapsed && "lg:mx-auto lg:h-10 lg:w-12 lg:justify-center lg:px-0",
                        active ? "bg-nav-active text-brand-ink" : "text-ink-secondary hover:bg-nav-hover",
                      )}
                    >
                      <Icon
                        className={cn("size-[18px] shrink-0", active ? "text-brand-ink" : "text-ink-muted")}
                        aria-hidden="true"
                      />
                      <span className={cn("truncate", collapsed && "lg:sr-only")}>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="flex h-7 shrink-0 items-center justify-center border-t border-chrome-line text-[11px] text-brand">
          OCA
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 6: `profile-menu.tsx` ແລະ `topbar.tsx`**

`profile-menu.tsx`:

```tsx
"use client";

import { Avatar } from "@oca/ui";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("user.menu")}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl p-1 hover:bg-nav-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={user.name} className="size-8 border border-chrome-line" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="mt-0.5 inline-flex h-4 items-center rounded bg-nav-active px-1.5 text-[10px] text-brand-ink">
            {user.roleName}
          </span>
        </span>
      </button>

      {open ? (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[290px] max-w-[92vw] overflow-hidden rounded-2xl border border-chrome-line bg-surface shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center gap-3 bg-linear-to-br from-brand to-brand-bright p-4 text-white">
              <Avatar name={user.name} className="size-14 border-[3px] border-white/40 text-lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{user.name}</p>
                <p className="truncate text-xs text-white/80">{user.email}</p>
                <span className="mt-1 inline-flex rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[11px]">
                  {user.roleName}
                </span>
              </div>
            </div>
            <div className="border-t border-line p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-danger hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {t("user.logout")}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

`topbar.tsx`:

```tsx
"use client";

import { cn } from "@oca/ui";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import { TOPBAR_BUTTON } from "./chrome";
import { LanguageToggle } from "./language-toggle";
import { ProfileMenu } from "./profile-menu";

export interface TopbarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobile: () => void;
}

export function Topbar({ collapsed, onToggleCollapsed, onOpenMobile }: TopbarProps) {
  const { t } = useT();
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-[1010] flex h-[64px] items-center justify-between gap-2 border-b border-chrome-line bg-chrome px-2 transition-all duration-300 sm:gap-3 sm:px-3",
        collapsed ? "lg:left-[72px]" : "lg:left-[280px]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" aria-label={t("nav.menu")} onClick={onOpenMobile} className={cn(TOPBAR_BUTTON, "lg:hidden")}>
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          onClick={onToggleCollapsed}
          className={cn(TOPBAR_BUTTON, "hidden lg:inline-flex")}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
        </button>
        <span className="truncate text-base font-semibold text-ink">{t("app.name")}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageToggle className="hidden sm:inline-flex" />
        <span aria-hidden="true" className="hidden h-10 w-px bg-line sm:block" />
        <ProfileMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 7: `src/app/(app)/layout.tsx` (ກັນໜ້າ + shell)**

```tsx
"use client";

import { cn } from "@oca/ui";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { useT } from "@/lib/i18n/language-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("common.loading")}
        className="flex min-h-screen items-center justify-center bg-app"
      >
        <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-app">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-300",
          collapsed ? "lg:ml-[72px]" : "lg:ml-[280px]",
        )}
      >
        <Topbar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-h-screen flex-1 pt-[64px]">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. ຖ້າ `next/link` ລົ້ມໃນ jsdom (router context) ໃຫ້ mock `next/link` ໃນ `sidebar.test.tsx` ເປັນ `<a href>` ແບບງ່າຍ.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add app shell with permission-filtered nav, topbar and route guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Admin — query hooks (`queries.ts`)

ຊັ້ນບາງໆລະຫວ່າງ UI ກັບ `apiFetch`. ທົດສອບຜ່ານ component test ຂອງ Task 14–15 (mock `apiFetch`).

**Files:** Create `apps/admin/src/lib/queries.ts`

- [ ] **Step 1: ຂຽນ `queries.ts`**

```ts
import type { CreateStaffInput, RoleInput, UpdateStaffInput } from "@oca/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { RoleDto, StaffDto } from "./types";

export const queryKeys = {
  staff: ["staff"] as const,
  roles: ["roles"] as const,
};

export function useStaffList() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: () => apiFetch<StaffDto[]>("/staff") });
}

export function useRoleList() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: () => apiFetch<RoleDto[]>("/roles") });
}

/** ພະນັກງານປ່ຽນ → userCount ຂອງ role ປ່ຽນ ຈຶ່ງ refresh ທັງສອງ. */
function useInvalidate(...keys: (readonly string[])[]) {
  const queryClient = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCreateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: (input: CreateStaffInput) => apiFetch<StaffDto>("/staff", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffInput }) =>
      apiFetch<StaffDto>(`/staff/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSaveRole() {
  const invalidate = useInvalidate(queryKeys.roles, queryKeys.staff);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoleInput }) =>
      id
        ? apiFetch<RoleDto>(`/roles/${id}`, { method: "PUT", body: input })
        : apiFetch<RoleDto>("/roles", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidate(queryKeys.roles);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: ບໍ່ມີ error.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/queries.ts
git commit -m "feat(admin): add staff and role query hooks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Admin — ໜ້າ `/staff`

ຕາມ DESIGN.md §11.2 (header + toolbar ຄົ້ນຫາ + ຕາຕະລາງ + footer pagination; loading/empty/error ແຍກກັນ), §9.10 (modal ຟອມ + confirm).

**Files:**
- Create: `apps/admin/src/components/staff/{staff-form-dialog.tsx,staff-form-dialog.test.tsx,staff-list.tsx,staff-list.test.tsx}`
- Create: `apps/admin/src/app/(app)/staff/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`staff-form-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto, StaffDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StaffFormDialog } from "./staff-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: null, isSystem: true, permissions: [], userCount: 1 },
  { id: "role-2", name: "MANAGER", description: null, isSystem: false, permissions: [], userCount: 0 },
];

const existing: StaffDto = {
  id: "s1",
  email: "somsak@example.com",
  name: "Somsak",
  isActive: true,
  roleId: "role-2",
  roleName: "MANAGER",
  lastLoginAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({} as never);
});

describe("StaffFormDialog (create)", () => {
  it("ສົ່ງຟອມຫວ່າງ: ສະແດງ error ຂອງທຸກ field ແລະ ບໍ່ເອີ້ນ API", async () => {
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={() => {}} staff={null} roles={roles} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getAllByText("This field is required")).toHaveLength(2); // name, role
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ສ້າງພະນັກງານ: POST /staff ແລ້ວປິດ dialog", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={onOpenChange} staff={null} roles={roles} />,
    );

    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.selectOptions(screen.getByLabelText("Role"), "role-2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiFetch).toHaveBeenCalledWith("/staff", {
      method: "POST",
      body: { email: "new@example.com", name: "New Person", password: "password123", roleId: "role-2" },
    });
  });
});

describe("StaffFormDialog (edit)", () => {
  it("email ແກ້ບໍ່ໄດ້; ລະຫັດຜ່ານຫວ່າງບໍ່ຖືກສົ່ງ (PATCH ສະເພາະ name/roleId)", async () => {
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={() => {}} staff={existing} roles={roles} />,
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Somsak K");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/staff/s1", {
        method: "PATCH",
        body: { name: "Somsak K", roleId: "role-2" },
      }),
    );
  });

  it("ສະແດງ message ຂອງ API ເມື່ອລົ້ມ ແລະ ບໍ່ປິດ dialog", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "Email already in use"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <StaffFormDialog open onOpenChange={onOpenChange} staff={existing} roles={roles} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

`staff-list.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto, StaffDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StaffList } from "./staff-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: null, isSystem: true, permissions: [], userCount: 1 },
  { id: "role-2", name: "MANAGER", description: null, isSystem: false, permissions: [], userCount: 1 },
];
const staff: StaffDto[] = [
  { id: "s1", email: "owner@example.com", name: "Owner One", isActive: true, roleId: "role-1", roleName: "OWNER", lastLoginAt: "2026-10-04T18:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "s2", email: "mgr@example.com", name: "Manager Two", isActive: true, roleId: "role-2", roleName: "MANAGER", lastLoginAt: null, createdAt: "2026-10-02T00:00:00.000Z" },
];

function mockApi(staffRows: StaffDto[] = staff) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/staff") return staffRows;
    if (path === "/roles") return roles;
    return undefined;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StaffList", () => {
  it("ສະແດງພະນັກງານ ພ້ອມບົດບາດ, ສະຖານະ ແລະ ວັນທີເຂົ້າລະບົບ (ເຂດເວລາລາວ)", async () => {
    renderWithProviders(<StaffList />);

    expect(await screen.findByText("Owner One")).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
    const row = screen.getByTestId("row-staff-s1");
    expect(within(row).getByText("owner@example.com")).toBeInTheDocument();
    expect(within(row).getByText("OWNER")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByText("05/10/2026")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-staff-s2")).getByText("—")).toBeInTheDocument();
  });

  it("ຄົ້ນຫາກັ່ນຕອງຕາມຊື່/ອີເມວ/ບົດບາດ", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");

    await user.type(screen.getByPlaceholderText("Search name, email or role..."), "manager");
    expect(screen.queryByText("Owner One")).not.toBeInTheDocument();
    expect(screen.getByText("Manager Two")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search name, email or role..."));
    await user.type(screen.getByPlaceholderText("Search name, email or role..."), "zzz");
    expect(await screen.findByText("No staff match your search")).toBeInTheDocument();
  });

  it("ຍັງບໍ່ມີພະນັກງານ: ສະແດງ empty state ພ້ອມປຸ່ມເພີ່ມ", async () => {
    mockApi([]);
    renderWithProviders(<StaffList />);
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
  });

  it("ບໍ່ມີສິດ staff:write: ບໍ່ເຫັນປຸ່ມເພີ່ມ/ແກ້ໄຂ/ປິດໃຊ້ງານ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");

    expect(screen.queryByRole("button", { name: "Add staff" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit staff/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Deactivate account/ })).not.toBeInTheDocument();
  });

  it("ກົດເພີ່ມພະນັກງານ: ເປີດ dialog", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Owner One");
    await user.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByRole("dialog", { name: "Add staff" })).toBeInTheDocument();
  });

  it("ປິດໃຊ້ງານ: ຖາມຢືນຢັນກ່ອນ ແລ້ວ PATCH isActive=false", async () => {
    const { user } = renderWithProviders(<StaffList />);
    await screen.findByText("Manager Two");

    await user.click(screen.getByRole("button", { name: "Deactivate account Manager Two" }));
    const dialog = await screen.findByRole("dialog", { name: "Deactivate this account?" });
    expect(apiFetch).not.toHaveBeenCalledWith("/staff/s2", expect.anything());

    await user.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/staff/s2", { method: "PATCH", body: { isActive: false } }),
    );
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/staff`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: `staff-form-dialog.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateStaffInput, createStaffSchema, passwordSchema } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Select,
  toast,
} from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateStaff, useUpdateStaff } from "@/lib/queries";
import type { RoleDto, StaffDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

/** ແກ້ໄຂ: email ບໍ່ປ່ຽນ; ລະຫັດຜ່ານຫວ່າງ = ຄົງເດີມ. ໃຊ້ field ຈາກ schema ຂອງ @oca/shared. */
const editStaffSchema = createStaffSchema
  .pick({ name: true, roleId: true })
  .extend({ email: z.string(), password: z.union([z.literal(""), passwordSchema]) });

export interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່; ມີຄ່າ = ແກ້ໄຂ. */
  staff: StaffDto | null;
  roles: RoleDto[];
}

export function StaffFormDialog({ open, onOpenChange, staff, roles }: StaffFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <StaffForm
          key={staff?.id ?? "new"}
          staff={staff}
          roles={roles}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function StaffForm({ staff, roles, onDone }: { staff: StaffDto | null; roles: RoleDto[]; onDone: () => void }) {
  const { t } = useT();
  const isEdit = staff !== null;
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const [formError, setFormError] = useState<string | null>(null);

  const schema: z.ZodType<CreateStaffInput> = isEdit ? editStaffSchema : createStaffSchema;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: staff?.email ?? "",
      name: staff?.name ?? "",
      password: "",
      roleId: staff?.roleId ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (staff) {
        await updateStaff.mutateAsync({
          id: staff.id,
          input: { name: values.name, roleId: values.roleId, ...(values.password ? { password: values.password } : {}) },
        });
        toast.success(t("staff.toast.updated"));
      } else {
        await createStaff.mutateAsync(values);
        toast.success(t("staff.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={isEdit ? t("staff.edit") : t("staff.form.createTitle")}
        description={isEdit ? t("staff.form.editDescription") : t("staff.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("staff.col.name")}
            htmlFor="staff-name"
            required
            error={errors.name ? validationText("name", t) : undefined}
          >
            <Input id="staff-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label={t("staff.col.email")}
            htmlFor="staff-email"
            required={!isEdit}
            error={errors.email ? validationText("email", t) : undefined}
          >
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              readOnly={isEdit}
              invalid={!!errors.email}
              {...register("email")}
            />
          </Field>
          <Field
            label={t("staff.form.password")}
            htmlFor="staff-password"
            required={!isEdit}
            error={errors.password ? validationText("password", t) : undefined}
          >
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? t("staff.form.passwordKeep") : undefined}
              invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Field
            label={t("staff.col.role")}
            htmlFor="staff-role"
            required
            error={errors.roleId ? validationText("roleId", t) : undefined}
          >
            <Select id="staff-role" invalid={!!errors.roleId} {...register("roleId")}>
              <option value="">{t("staff.form.rolePlaceholder")}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
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

- [ ] **Step 4: `staff-list.tsx`**

```tsx
"use client";

import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  DataTableFooter,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  formatDate,
  paginate,
  toast,
} from "@oca/ui";
import { AlertCircle, CheckCircle2, Pencil, Plus, Search, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useRoleList, useStaffList, useUpdateStaff } from "@/lib/queries";
import type { StaffDto } from "@/lib/types";
import { StaffFormDialog } from "./staff-form-dialog";

const COLUMNS = 6;

export function StaffList() {
  const { t } = useT();
  const canWrite = useCan("staff:write");
  const staffQuery = useStaffList();
  const rolesQuery = useRoleList();
  const updateStaff = useUpdateStaff();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [formStaff, setFormStaff] = useState<StaffDto | null>(null);
  const [deactivating, setDeactivating] = useState<StaffDto | null>(null);

  const all = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((s) => [s.name, s.email, s.roleName].some((value) => value.toLowerCase().includes(query)));
  }, [all, search]);
  const slice = paginate(filtered, page, pageSize);

  function openCreate() {
    setFormStaff(null);
    setFormOpen(true);
  }

  function openEdit(staff: StaffDto) {
    setFormStaff(staff);
    setFormOpen(true);
  }

  async function setActive(staff: StaffDto, isActive: boolean) {
    try {
      await updateStaff.mutateAsync({ id: staff.id, input: { isActive } });
      toast.success(t(isActive ? "staff.toast.activated" : "staff.toast.deactivated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeactivating(null);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={openCreate}>
      <Plus aria-hidden="true" />
      {t("staff.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("staff.title")]}
        title={t("staff.title")}
        badge={staffQuery.data ? t("staff.count", { count: all.length }) : undefined}
        description={t("staff.description")}
        actions={addButton}
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="px-3 py-4 sm:px-6">
            <div className="relative max-w-md min-w-[240px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("staff.search")}
                aria-label={t("staff.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          {staffQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void staffQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("staff.col.name")}</TableHead>
                    <TableHead>{t("staff.col.email")}</TableHead>
                    <TableHead>{t("staff.col.role")}</TableHead>
                    <TableHead>{t("staff.col.status")}</TableHead>
                    <TableHead>{t("staff.col.lastLogin")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffQuery.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {slice.rows.map((staff) => (
                    <TableRow key={staff.id} data-testid={`row-staff-${staff.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={staff.name} className="size-8" />
                          <span className="font-medium text-ink">{staff.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-ink-secondary">{staff.email}</TableCell>
                      <TableCell>
                        <StatusPill tone="brand">{staff.roleName}</StatusPill>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={staff.isActive ? "success" : "neutral"} icon={staff.isActive ? CheckCircle2 : XCircle}>
                          {staff.isActive ? t("status.active") : t("status.inactive")}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="tabular-nums text-ink-secondary">{formatDate(staff.lastLoginAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("staff.edit")} ${staff.name}`}
                                title={t("staff.edit")}
                                onClick={() => openEdit(staff)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              {staff.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("staff.deactivate")} ${staff.name}`}
                                  title={t("staff.deactivate")}
                                  onClick={() => setDeactivating(staff)}
                                >
                                  <UserX aria-hidden="true" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("staff.activate")} ${staff.name}`}
                                  title={t("staff.activate")}
                                  onClick={() => void setActive(staff, true)}
                                >
                                  <UserCheck aria-hidden="true" />
                                </Button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!staffQuery.isPending && filtered.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={all.length === 0 ? t("staff.empty.title") : t("staff.empty.noResults")}
                  action={
                    all.length === 0 ? (
                      addButton
                    ) : (
                      <Button variant="outlinePrimary" className="rounded-lg" onClick={() => setSearch("")}>
                        {t("common.clearSearch")}
                      </Button>
                    )
                  }
                />
              ) : null}

              <DataTableFooter
                page={slice.page}
                totalPages={slice.totalPages}
                pageSize={pageSize}
                summary={t("page.showing", { from: slice.from, to: slice.to, total: slice.total })}
                labels={{
                  show: t("page.show"),
                  perPage: t("page.perPage"),
                  all: t("page.all"),
                  previous: t("page.previous"),
                  next: t("page.next"),
                }}
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

      <StaffFormDialog open={formOpen} onOpenChange={setFormOpen} staff={formStaff} roles={rolesQuery.data ?? []} />

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={t("staff.deactivateTitle")}
        description={t("staff.deactivateDescription", { name: deactivating?.name ?? "" })}
        confirmLabel={t("staff.deactivate")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={updateStaff.isPending}
        onConfirm={() => (deactivating ? setActive(deactivating, false) : undefined)}
      />
    </div>
  );
}
```

- [ ] **Step 5: ໜ້າ `src/app/(app)/staff/page.tsx`**

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { StaffList } from "@/components/staff/staff-list";

export default function StaffPage() {
  return (
    <PermissionGate permission="staff:read">
      <StaffList />
    </PermissionGate>
  );
}
```

- [ ] **Step 6: ແລ່ນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add staff list with create, edit and deactivate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Admin — ໜ້າ `/roles` (matrix permission)

**Files:**
- Create: `apps/admin/src/components/roles/{permission-matrix.tsx,permission-matrix.test.tsx,role-form-dialog.tsx,role-form-dialog.test.tsx,roles-list.tsx,roles-list.test.tsx}`
- Create: `apps/admin/src/app/(app)/roles/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`permission-matrix.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PermissionMatrix } from "./permission-matrix";

describe("PermissionMatrix", () => {
  it("ເລືອກ write ເພີ່ມເຂົ້າໃນລາຍການ (ລຽງຕາມລຳດັບ module/action)", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={["inbox:read"]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Write" }));
    expect(onChange).toHaveBeenCalledWith(["inbox:read", "inbox:write"]);
  });

  it("ເອົາ read ອອກ", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={["inbox:read"]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Read" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("ຄໍລຳ All ເລືອກທັງ read ແລະ write ຂອງ module", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<PermissionMatrix value={[]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Staff - All" }));
    expect(onChange).toHaveBeenCalledWith(["staff:read", "staff:write"]);
  });

  it("ເລືອກບາງສ່ວນ: All ເປັນ indeterminate", () => {
    renderWithProviders(<PermissionMatrix value={["crm:read"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "CRM - All" })).toHaveAttribute("aria-checked", "mixed");
  });

  it("disabled: ທຸກ checkbox ກົດບໍ່ໄດ້", () => {
    renderWithProviders(<PermissionMatrix value={[]} onChange={() => {}} disabled />);
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
  });
});
```

`role-form-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RoleFormDialog } from "./role-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const systemRole: RoleDto = {
  id: "role-1",
  name: "OWNER",
  description: "Full access",
  isSystem: true,
  permissions: ["staff:read", "staff:write"],
  userCount: 1,
};
const customRole: RoleDto = {
  id: "role-2",
  name: "Sales",
  description: null,
  isSystem: false,
  permissions: ["inbox:read"],
  userCount: 0,
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({} as never);
});

describe("RoleFormDialog", () => {
  it("ສ້າງ: ຊື່ວ່າງຖືກປະຕິເສດ", async () => {
    const { user } = renderWithProviders(<RoleFormDialog open onOpenChange={() => {}} role={null} readOnly={false} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ສ້າງ: POST /roles ພ້ອມສິດທີ່ເລືອກ ແລ້ວປິດ", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RoleFormDialog open onOpenChange={onOpenChange} role={null} readOnly={false} />,
    );
    await user.type(screen.getByLabelText("Role name"), "Support");
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Read" }));
    await user.click(screen.getByRole("checkbox", { name: "Inbox - Write" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiFetch).toHaveBeenCalledWith("/roles", {
      method: "POST",
      body: { name: "Support", permissions: ["inbox:read", "inbox:write"] },
    });
  });

  it("ແກ້ໄຂ: PUT /roles/:id", async () => {
    const { user } = renderWithProviders(
      <RoleFormDialog open onOpenChange={() => {}} role={customRole} readOnly={false} />,
    );
    expect(screen.getByRole("checkbox", { name: "Inbox - Read" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "CRM - Write" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/roles/role-2", {
        method: "PUT",
        body: { name: "Sales", permissions: ["inbox:read", "crm:write"] },
      }),
    );
  });

  it("role ລະບົບ/readOnly: ເບິ່ງໄດ້ຢ່າງດຽວ, ບໍ່ມີປຸ່ມບັນທຶກ", () => {
    renderWithProviders(<RoleFormDialog open onOpenChange={() => {}} role={systemRole} readOnly />);
    expect(screen.getByRole("dialog", { name: "View role" })).toBeInTheDocument();
    expect(screen.getByText("System roles cannot be modified")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Role name")).toHaveAttribute("readonly");
    expect(screen.getByRole("checkbox", { name: "Staff - Write" })).toBeDisabled();
  });
});
```

`roles-list.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { RoleDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RolesList } from "./roles-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const roles: RoleDto[] = [
  { id: "role-1", name: "OWNER", description: "Full access", isSystem: true, permissions: ["staff:read", "staff:write"], userCount: 1 },
  { id: "role-2", name: "Sales", description: null, isSystem: false, permissions: ["inbox:read"], userCount: 0 },
];

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => (path === "/roles" ? roles : undefined)) as typeof apiFetch);
});

describe("RolesList", () => {
  it("ສະແດງ role, ຈຳນວນສິດ/ຜູ້ໃຊ້ ແລະ ປ້າຍ System", async () => {
    renderWithProviders(<RolesList />);
    const owner = await screen.findByTestId("row-role-role-1");
    expect(within(owner).getByText("System")).toBeInTheDocument();
    expect(within(owner).getByText("2/24")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-role-role-2")).getByText("1/24")).toBeInTheDocument();
  });

  it("role ລະບົບ: ເບິ່ງໄດ້ ແຕ່ລຶບບໍ່ໄດ້; role ທົ່ວໄປ: ແກ້ໄຂ ແລະ ລຶບໄດ້", async () => {
    renderWithProviders(<RolesList />);
    await screen.findByText("Sales");
    expect(screen.getByRole("button", { name: "View OWNER" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete OWNER" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Sales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Sales" })).toBeInTheDocument();
  });

  it("ລຶບ: ຖາມຢືນຢັນກ່ອນ ແລ້ວ DELETE /roles/:id", async () => {
    const { user } = renderWithProviders(<RolesList />);
    await screen.findByText("Sales");

    await user.click(screen.getByRole("button", { name: "Delete Sales" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this role?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/roles/role-2", { method: "DELETE" }));
  });

  it("ບໍ່ມີສິດ staff:write: ເຫັນສະເພາະປຸ່ມເບິ່ງ", async () => {
    auth.canWrite = false;
    renderWithProviders(<RolesList />);
    await screen.findByText("Sales");
    expect(screen.queryByRole("button", { name: "Add role" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Sales" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ແລ່ນໃຫ້ເຫັນວ່າລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/roles`
Expected: FAIL (module ບໍ່ພົບ).

- [ ] **Step 3: `permission-matrix.tsx`**

```tsx
"use client";

import { ACTIONS, MODULES, PERMISSIONS, type Permission, type PermissionModule } from "@oca/shared";
import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

export interface PermissionMatrixProps {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
}

function permissionsOf(module: PermissionModule): Permission[] {
  return ACTIONS.map((action) => `${module}:${action}` as const);
}

/** Matrix ໂມດູນ × (ເບິ່ງ/ແກ້ໄຂ/ທັງໝົດ). ແຫຼ່ງຂໍ້ມູນສິດຄື @oca/shared; API ບັງຄັບສິດຈິງ. */
export function PermissionMatrix({ value, onChange, disabled = false }: PermissionMatrixProps) {
  const { t } = useT();
  const granted = new Set<Permission>(value);

  function commit(next: Set<Permission>) {
    onChange(PERMISSIONS.filter((permission) => next.has(permission)));
  }

  function toggle(permissions: Permission[], checked: boolean) {
    const next = new Set(granted);
    for (const permission of permissions) {
      if (checked) next.add(permission);
      else next.delete(permission);
    }
    commit(next);
  }

  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("perm.module")}</TableHead>
            <TableHead className="text-center">{t("perm.read")}</TableHead>
            <TableHead className="text-center">{t("perm.write")}</TableHead>
            <TableHead className="text-center">{t("perm.all")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODULES.map((module) => {
            const label = t(`module.${module}`);
            const [read, write] = permissionsOf(module) as [Permission, Permission];
            const count = [read, write].filter((permission) => granted.has(permission)).length;
            return (
              <TableRow key={module}>
                <TableCell className="py-2 font-medium text-ink">{label}</TableCell>
                {([read, write] as const).map((permission, index) => (
                  <TableCell key={permission} className="py-2 text-center">
                    <Checkbox
                      aria-label={`${label} - ${index === 0 ? t("perm.read") : t("perm.write")}`}
                      checked={granted.has(permission)}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggle([permission], checked === true)}
                    />
                  </TableCell>
                ))}
                <TableCell className="py-2 text-center">
                  <Checkbox
                    aria-label={`${label} - ${t("perm.all")}`}
                    checked={count === 2 ? true : count === 0 ? false : "indeterminate"}
                    disabled={disabled}
                    onCheckedChange={(checked) => toggle([read, write], checked === true)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: `role-form-dialog.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type RoleInput, roleSchema } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  toast,
} from "@oca/ui";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSaveRole } from "@/lib/queries";
import type { RoleDto } from "@/lib/types";
import { PermissionMatrix } from "./permission-matrix";

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່. */
  role: RoleDto | null;
  /** true = ເບິ່ງຢ່າງດຽວ (role ລະບົບ ຫຼື ບໍ່ມີສິດ staff:write). */
  readOnly: boolean;
}

export function RoleFormDialog({ open, onOpenChange, role, readOnly }: RoleFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t("common.close")}>
        <RoleForm key={role?.id ?? "new"} role={role} readOnly={readOnly} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({ role, readOnly, onDone }: { role: RoleDto | null; readOnly: boolean; onDone: () => void }) {
  const { t } = useT();
  const saveRole = useSaveRole();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissions: role?.permissions ?? [],
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await saveRole.mutateAsync({
        id: role?.id,
        input: { ...values, description: values.description || undefined },
      });
      toast.success(t(role ? "roles.toast.updated" : "roles.toast.created"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  const title = readOnly ? t("roles.form.viewTitle") : role ? t("roles.form.editTitle") : t("roles.form.createTitle");
  const description = readOnly
    ? t("roles.form.systemDescription")
    : role
      ? t("roles.form.editDescription")
      : t("roles.form.createDescription");

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={title} description={description} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("roles.col.name")}
            htmlFor="role-name"
            required={!readOnly}
            error={errors.name ? t("validation.required") : undefined}
          >
            <Input id="role-name" readOnly={readOnly} invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field label={t("roles.col.description")} htmlFor="role-description">
            <Input id="role-description" readOnly={readOnly} {...register("description")} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-secondary">{t("roles.form.permissions")}</p>
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <PermissionMatrix value={field.value} onChange={field.onChange} disabled={readOnly} />
            )}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {readOnly ? t("common.close") : t("common.cancel")}
        </Button>
        {readOnly ? null : (
          <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 5: `roles-list.tsx`**

```tsx
"use client";

import { PERMISSIONS } from "@oca/shared";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTableFooter,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  formatNumber,
  paginate,
  toast,
} from "@oca/ui";
import { AlertCircle, Eye, Lock, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useDeleteRole, useRoleList } from "@/lib/queries";
import type { RoleDto } from "@/lib/types";
import { RoleFormDialog } from "./role-form-dialog";

const COLUMNS = 5;

export function RolesList() {
  const { t } = useT();
  const canWrite = useCan("staff:write");
  const rolesQuery = useRoleList();
  const deleteRole = useDeleteRole();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [formRole, setFormRole] = useState<RoleDto | null>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const all = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((role) => [role.name, role.description ?? ""].some((value) => value.toLowerCase().includes(query)));
  }, [all, search]);
  const slice = paginate(filtered, page, pageSize);

  function openForm(role: RoleDto | null) {
    setFormRole(role);
    setFormOpen(true);
  }

  async function confirmDelete(role: RoleDto) {
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(t("roles.toast.deleted"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeleting(null);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("roles.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("roles.title")]}
        title={t("roles.title")}
        badge={rolesQuery.data ? t("roles.count", { count: all.length }) : undefined}
        description={t("roles.description")}
        actions={addButton}
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="px-3 py-4 sm:px-6">
            <div className="relative max-w-md min-w-[240px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("roles.search")}
                aria-label={t("roles.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          {rolesQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void rolesQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("roles.col.name")}</TableHead>
                    <TableHead>{t("roles.col.description")}</TableHead>
                    <TableHead className="text-right">{t("roles.col.permissions")}</TableHead>
                    <TableHead className="text-right">{t("roles.col.users")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesQuery.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {slice.rows.map((role) => {
                    const readOnly = !canWrite || role.isSystem;
                    return (
                      <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{role.name}</span>
                            {role.isSystem ? (
                              <StatusPill tone="info" icon={Lock}>
                                {t("roles.system")}
                              </StatusPill>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-ink-secondary">{role.description ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-ink-secondary">
                          {role.permissions.length}/{PERMISSIONS.length}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-ink-secondary">
                          {formatNumber(role.userCount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg"
                              aria-label={`${readOnly ? t("common.view") : t("common.edit")} ${role.name}`}
                              title={readOnly ? t("common.view") : t("common.edit")}
                              onClick={() => openForm(role)}
                            >
                              {readOnly ? <Eye aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                            </Button>
                            {canWrite && !role.isSystem ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg text-danger"
                                aria-label={`${t("common.delete")} ${role.name}`}
                                title={t("common.delete")}
                                onClick={() => setDeleting(role)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {!rolesQuery.isPending && filtered.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title={all.length === 0 ? t("roles.empty.title") : t("roles.empty.noResults")}
                  action={
                    all.length === 0 ? (
                      addButton
                    ) : (
                      <Button variant="outlinePrimary" className="rounded-lg" onClick={() => setSearch("")}>
                        {t("common.clearSearch")}
                      </Button>
                    )
                  }
                />
              ) : null}

              <DataTableFooter
                page={slice.page}
                totalPages={slice.totalPages}
                pageSize={pageSize}
                summary={t("page.showing", { from: slice.from, to: slice.to, total: slice.total })}
                labels={{
                  show: t("page.show"),
                  perPage: t("page.perPage"),
                  all: t("page.all"),
                  previous: t("page.previous"),
                  next: t("page.next"),
                }}
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

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={formRole}
        readOnly={!canWrite || formRole?.isSystem === true}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("roles.deleteTitle")}
        description={t("common.deleteConfirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={deleteRole.isPending}
        onConfirm={() => (deleting ? confirmDelete(deleting) : undefined)}
      />
    </div>
  );
}
```

- [ ] **Step 6: ໜ້າ `src/app/(app)/roles/page.tsx`**

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { RolesList } from "@/components/roles/roles-list";

export default function RolesPage() {
  return (
    <PermissionGate permission="staff:read">
      <RolesList />
    </PermissionGate>
  );
}
```

- [ ] **Step 7: ແລ່ນ test + typecheck + lint + build**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint && pnpm --filter @oca/admin build`
Expected: PASS ທັງໝົດ; build ສຳເລັດ ແລະ ເຫັນ route `/login`, `/staff`, `/roles`.
ໝາຍເຫດ test "role ລະບົບ": `Checkbox` ຂອງ Radix ທີ່ `disabled` ມີ `disabled` attribute ຈຶ່ງ `toBeDisabled()` ໃຊ້ໄດ້.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add roles page with permission matrix" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: ກວດຈິງ end-to-end, ເອກະສານ, ແລະ ກວດຄັ້ງສຸດທ້າຍ

**Files:** Modify `README.md`, `docs/superpowers/specs/2026-10-04-phase0-d-frontend-design.md`

- [ ] **Step 1: ກວດວ່າ infra dev ແລ່ນຢູ່ (ຫ້າມແຕະ 5432/6379)**

```bash
grep -E "^(DATABASE_URL|REDIS_URL)=" .env
nc -z localhost 5433 && echo "pg 5433 ok"; nc -z localhost 6380 && echo "redis 6380 ok"
```

ຖ້າພອດໃດບໍ່ຕອບ: ຢຸດ ແລ້ວແຈ້ງຜູ້ໃຊ້ (embedded Postgres 5433 / redis-memory-server 6380 ຕ້ອງສ້າງຄືນຕາມ memory `dev-database-isolation`; ຢ່າໃຊ້ Postgres 5432 ຫຼື Redis 6379 ຂອງຜູ້ໃຊ້).

- [ ] **Step 2: ຕັ້ງ `.env` ໃຫ້ cookie path ຖືກ (ໄຟລ໌ gitignored)**

ຖ້າຍັງບໍ່ມີ ໃຫ້ເພີ່ມບັນທັດ `REFRESH_COOKIE_PATH=/api/auth` ໃນ `.env`. ແລ້ວ seed (idempotent): `pnpm db:seed`.

- [ ] **Step 3: ເປີດ api ແລະ admin (background)**

```bash
pnpm --filter @oca/shared build
pnpm --filter @oca/api dev      # run_in_background; ລໍຈົນເຫັນ "API listening on :3001"
pnpm --filter @oca/admin dev    # run_in_background; ລໍຈົນເຫັນ "Ready"
```

- [ ] **Step 4: ກວດ proxy + cookie ດ້ວຍ curl (ຜ່ານ origin ຂອງ admin :3000)**

```bash
set -a; . ./.env; set +a
JAR=$(mktemp)
# login ຜ່ານ proxy: ຕ້ອງໄດ້ 200, accessToken, ແລະ Set-Cookie ມີ Path=/api/auth + HttpOnly
curl -s -i -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_OWNER_EMAIL\",\"password\":\"$SEED_OWNER_PASSWORD\"}" \
  http://localhost:3000/api/auth/login | grep -iE "^HTTP|set-cookie|accessToken" | cut -c1-160
# refresh ດ້ວຍ cookie jar: ຕ້ອງໄດ້ 200 ແລະ cookie ໃໝ່ (rotation)
curl -s -o /dev/null -w "refresh: %{http_code}\n" -b "$JAR" -c "$JAR" -X POST http://localhost:3000/api/auth/refresh
# ບໍ່ມີ token: 401
curl -s -o /dev/null -w "staff no token: %{http_code}\n" http://localhost:3000/api/staff
```

Expected: login `HTTP/1.1 200`, `Set-Cookie: oca_rt=...; Path=/api/auth; ... HttpOnly`; `refresh: 200`; `staff no token: 401`.

- [ ] **Step 5: ກວດໃນ browser (ໃຊ້ browser tool ທີ່ມີ ຫຼື ໃຫ້ຜູ້ໃຊ້ກວດ)**

ເປີດ `http://localhost:3000` ແລ້ວຢືນຢັນທຸກຂໍ້ (ບັນທຶກຜົນແຕ່ລະຂໍ້):
1. ຖືກ redirect ໄປ `/login` ເມື່ອຍັງບໍ່ login; ໜ້າ login ເປັນພື້ນມ່ວງ gradient, ປຸ່ມພາສາ "EN" ສະຫຼັບໄດ້.
2. login ດ້ວຍ OWNER (`SEED_OWNER_EMAIL`/`SEED_OWNER_PASSWORD`) → ເຂົ້າ `/staff`; ເຫັນ sidebar + topbar; ລະຫັດຜິດສະແດງຂໍ້ຄວາມ error.
3. **Refresh ໜ້າ (F5) ແລ້ວຍັງ login ຢູ່** (ພິສູດ cookie refresh ຜ່ານ proxy).
4. `/roles`: ເຫັນ OWNER (ປ້າຍ System, ເບິ່ງໄດ້ແຕ່ແກ້/ລຶບບໍ່ໄດ້); ເພີ່ມ role "Sales" ດ້ວຍ matrix ເລືອກ inbox read → ປາກົດໃນລາຍການ + toast ສຳເລັດ.
5. `/staff`: ເພີ່ມພະນັກງານໃໝ່ role "Sales" → ແກ້ໄຂຊື່ → ປິດໃຊ້ງານ (ມີ confirm) → ເປີດໃຊ້ງານຄືນ.
6. login ເປັນພະນັກງານ role ທີ່ມີ `staff:read` ແຕ່ບໍ່ມີ `staff:write` (ສ້າງ role "Viewer" ດ້ວຍ Staff-Read ກ່ອນ): ບໍ່ເຫັນປຸ່ມເພີ່ມ/ແກ້ໄຂ/ປິດໃຊ້ງານ; ແລະ `curl` POST `/api/staff` ດ້ວຍ token ຂອງຜູ້ນັ້ນໄດ້ 403.
7. ກົດ "Log out" ໃນ profile menu → ກັບໄປ `/login`; ເປີດ `/staff` ໂດຍກົງຈະຖືກສົ່ງໄປ `/login`.
8. ຫຍໍ້ໜ້າຈໍເປັນ 375px: sidebar ເຊື່ອງ, ກົດ hamburger ເປີດ, `Esc` ປິດ; ບໍ່ມີ scroll ແນວນອນຂອງໜ້າ.

ຢຸດ process api/admin ທີ່ເປີດໄວ້ເມື່ອກວດຈົບ. ຖ້າຂໍ້ໃດບໍ່ຜ່ານ ໃຫ້ແກ້ (ໃຊ້ systematic-debugging) ກ່ອນໄປຕໍ່.

- [ ] **Step 6: ກວດທັງ repo**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: ທັງ 3 ຜ່ານ (test ລວມ api e2e ທີ່ໃຊ້ DB ຈິງ). ຖ້າ `next build` ແກ້ `tsconfig.json`/`next-env.d.ts` ຂອງ admin ຫຼື storefront ໃຫ້ກວດ `git diff` ແລ້ວ commit ສະເພາະ tsconfig.

- [ ] **Step 7: ອັບເດດເອກະສານ**

`README.md` ແຖວ ~89 (ໝາຍເຫດສະຖານະ): ແກ້ປະໂຫຍກ "`apps/admin` ແລະ `apps/storefront` ຍັງເປັນໂຄງເປົ່າ (Phase 0 ກຳລັງດຳເນີນ ...)" ເປັນ:

```
`apps/admin` (login, shell, ພະນັກງານ, ບົດບາດ ແລະ ສິດ) ແລະ `apps/storefront` (placeholder) ພ້ອມໃຊ້; UI ທັງໝົດຢູ່ `packages/ui` ຕາມ `docs/DESIGN.md`. ເປີດໃຊ້: `pnpm dev` (admin :3000, api :3001, storefront :3002).
```
(ຮັກສາປະໂຫຍກທີ່ເຫຼືອກ່ຽວກັບ test ຂອງ api/worker ຕາມເດີມ.)

`docs/superpowers/specs/2026-10-04-phase0-d-frontend-design.md`: ແກ້ປະໂຫຍກ "matrix permission ຈັດກຸ່ມຕາມ module ຈາກ `GET /permissions`" ເປັນ "matrix permission ຈັດກຸ່ມຕາມ module ຈາກ `MODULES`/`ACTIONS` ໃນ `@oca/shared` (ແຫຼ່ງຄວາມຈິງດຽວ; API ຍັງບັງຄັບສິດ)". ແລະ ເພີ່ມພາກສັ້ນ "## ຂໍ້ຈຳກັດທີ່ຮູ້" ວ່າ: ຜ່ານ proxy API ເຫັນ IP ຂອງ Next server (rate limit ແລະ IP ໃນ AuditLog ບໍ່ແມ່ນ IP ແທ້; ແກ້ດ້ວຍ `trust proxy` ພາຍຫຼັງ).

- [ ] **Step 8: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-04-phase0-d-frontend-design.md
git commit -m "docs: update README status and D spec after frontend implementation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: ປິດ branch**

ແຈ້ງຜູ້ໃຊ້ວ່າ D ສຳເລັດ (ພ້ອມຜົນກວດ Step 4–6 ແລະ ຂໍ້ຈຳກັດທີ່ຮູ້), ອັບເດດ memory `phase0-progress` (D ສຳເລັດ; ຍັງເຫຼືອ C-2 worker ຖ້າຍັງບໍ່ເຮັດ), ແລ້ວໃຊ້ superpowers:finishing-a-development-branch ເພື່ອສະເໜີ merge/PR.

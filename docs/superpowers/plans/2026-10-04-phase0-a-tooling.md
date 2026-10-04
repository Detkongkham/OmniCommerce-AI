# Phase 0-A: Tooling (`packages/config`, `packages/shared`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ສ້າງ tsconfig/eslint ທີ່ໃຊ້ຮ່ວມ ແລະ `@oca/shared` (permission, constants, zod schema) ພ້ອມ test, ໃຫ້ `pnpm build`, `pnpm lint`, `pnpm test` ເຮັດວຽກຜ່ານ Turborepo.

**Architecture:** `@oca/config` ສົ່ງອອກ tsconfig 3 ແບບ (base/nest/next) ແລະ eslint flat config. `@oca/shared` compile ເປັນ CommonJS ໃນ `dist/` (NestJS ແລະ Next.js ໃຊ້ໄດ້ທັງຄູ່). Permission ເປັນ string `module:action` ທີ່ສ້າງຈາກລາຍການ module × action ໃນໂຄດ.

**Tech Stack:** TypeScript 5.9, ESLint 9 + typescript-eslint, zod 4, Vitest.

**ອ້າງອີງ spec:** [2026-10-04-phase0-foundation-design.md](../specs/2026-10-04-phase0-foundation-design.md) ສ່ວນ A.

---

## File Structure

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `packages/config/tsconfig.base.json` | compiler options ຫຼັກ (strict) |
| `packages/config/tsconfig.nest.json` | ສືບທອດ base + decorator metadata ສຳລັບ NestJS |
| `packages/config/tsconfig.next.json` | ສືບທອດ base + ຕັ້ງຄ່າ Next.js (bundler, jsx, noEmit) |
| `packages/config/eslint.config.mjs` | eslint flat config ທີ່ໃຊ້ຮ່ວມ |
| `packages/config/package.json` | exports ຂອງໄຟລ໌ຂ້າງເທິງ + dependency ຂອງ eslint |
| `packages/shared/src/permissions.ts` | `MODULES`, `ACTIONS`, `Permission`, `PERMISSIONS`, `isPermission`, `hasPermission` |
| `packages/shared/src/constants.ts` | `SYSTEM_ROLE_OWNER`, ຄ່າຄົງທີ່ຂອງ password |
| `packages/shared/src/schemas/auth.ts` | `loginSchema` |
| `packages/shared/src/schemas/staff.ts` | `createStaffSchema`, `updateStaffSchema` |
| `packages/shared/src/schemas/role.ts` | `permissionSchema`, `roleSchema` |
| `packages/shared/src/index.ts` | re-export ທັງໝົດ |
| `packages/shared/src/*.test.ts`, `src/schemas/*.test.ts` | test (Vitest) |

---

### Task 1: `@oca/config` (tsconfig + eslint)

**Files:**
- Create: `packages/config/tsconfig.base.json`, `packages/config/tsconfig.nest.json`, `packages/config/tsconfig.next.json`, `packages/config/eslint.config.mjs`
- Modify: `packages/config/package.json`
- Delete: `packages/config/.gitkeep`

- [ ] **Step 1: ຂຽນ `packages/config/tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: ຂຽນ `packages/config/tsconfig.nest.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "incremental": true
  }
}
```

- [ ] **Step 3: ຂຽນ `packages/config/tsconfig.next.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "declaration": false,
    "sourceMap": false,
    "incremental": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: ຂຽນ `packages/config/eslint.config.mjs`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".next/**", ".turbo/**", "coverage/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
```

- [ ] **Step 5: ແທນ `packages/config/package.json`**

```json
{
  "name": "@oca/config",
  "version": "0.0.0",
  "private": true,
  "description": "Shared tsconfig and eslint config",
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./tsconfig.nest.json": "./tsconfig.nest.json",
    "./tsconfig.next.json": "./tsconfig.next.json",
    "./eslint": "./eslint.config.mjs"
  },
  "dependencies": {
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

- [ ] **Step 6: ລຶບ `.gitkeep` ແລະ ຕິດຕັ້ງ dependency**

Run: `cd /Users/ta/oca && git rm -q packages/config/.gitkeep && pnpm install`
Expected: ຕິດຕັ້ງ `@eslint/js` ແລະ `typescript-eslint` ສຳເລັດ, ບໍ່ມີ error.

- [ ] **Step 7: Commit**

```bash
git add packages/config pnpm-lock.yaml
git commit -m "feat(config): add shared tsconfig and eslint config"
```

---

### Task 2: scaffold `@oca/shared` ແລະ ພິສູດ toolchain

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`, `packages/shared/eslint.config.mjs`, `packages/shared/src/index.ts`
- Delete: `packages/shared/src/.gitkeep`

- [ ] **Step 1: ແທນ `packages/shared/package.json`**

```json
{
  "name": "@oca/shared",
  "version": "0.0.0",
  "private": true,
  "description": "Shared types, zod schemas and constants",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: ຂຽນ `packages/shared/tsconfig.json`**

```json
{
  "extends": "@oca/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: ຂຽນ `packages/shared/eslint.config.mjs`**

```js
import base from "@oca/config/eslint";

export default base;
```

- [ ] **Step 4: ຂຽນ `packages/shared/src/index.ts` (ຊົ່ວຄາວໃຫ້ build ໄດ້)**

```ts
export {};
```

- [ ] **Step 5: ຕິດຕັ້ງ dependency**

Run:
```bash
cd /Users/ta/oca && git rm -q packages/shared/src/.gitkeep
pnpm --filter @oca/shared add zod
pnpm --filter @oca/shared add -D @oca/config@workspace:* typescript@~5.9 eslint@^9 vitest
```
Expected: ສຳເລັດ. ກວດ `pnpm --filter @oca/shared exec tsc -v` ໄດ້ `Version 5.9.x`.

- [ ] **Step 6: ກວດວ່າ build ແລະ lint ເຮັດວຽກ**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared build && pnpm --filter @oca/shared lint`
Expected: ບໍ່ມີ error; ມີ `packages/shared/dist/index.js`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): scaffold @oca/shared package"
```

---

### Task 3: `permissions.ts` (TDD)

**Files:**
- Create: `packages/shared/src/permissions.test.ts`, `packages/shared/src/permissions.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະ fail**

`packages/shared/src/permissions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ACTIONS, MODULES, PERMISSIONS, hasPermission, isPermission } from "./permissions";

describe("permissions", () => {
  it("ມີ 12 module ແລະ 2 action", () => {
    expect(MODULES).toHaveLength(12);
    expect(ACTIONS).toEqual(["read", "write"]);
  });

  it("PERMISSIONS ແມ່ນ module x action ທັງໝົດ ບໍ່ຊ້ຳ", () => {
    expect(PERMISSIONS).toHaveLength(24);
    expect(new Set(PERMISSIONS).size).toBe(24);
    expect(PERMISSIONS).toContain("staff:write");
    expect(PERMISSIONS).toContain("inventory:read");
  });

  it("isPermission ຮັບສະເພາະຄ່າທີ່ຖືກຕ້ອງ", () => {
    expect(isPermission("staff:write")).toBe(true);
    expect(isPermission("staff:delete")).toBe(false);
    expect(isPermission("nope:read")).toBe(false);
    expect(isPermission("")).toBe(false);
  });

  it("hasPermission ກົງກັນແບບຊັດເຈນ (write ບໍ່ໄດ້ implies read)", () => {
    expect(hasPermission(["staff:write"], "staff:write")).toBe(true);
    expect(hasPermission(["staff:write"], "staff:read")).toBe(false);
    expect(hasPermission([], "staff:read")).toBe(false);
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared test`
Expected: FAIL, ຫາ `./permissions` ບໍ່ເຫັນ.

- [ ] **Step 3: ຂຽນ `packages/shared/src/permissions.ts`**

```ts
export const MODULES = [
  "inbox",
  "posting",
  "image-studio",
  "live-cf",
  "promotion",
  "affiliate",
  "inventory",
  "logistics",
  "automation",
  "analytics",
  "crm",
  "staff",
] as const;

export const ACTIONS = ["read", "write"] as const;

export type PermissionModule = (typeof MODULES)[number];
export type PermissionAction = (typeof ACTIONS)[number];
export type Permission = `${PermissionModule}:${PermissionAction}`;

export const PERMISSIONS: readonly Permission[] = MODULES.flatMap((module) =>
  ACTIONS.map((action) => `${module}:${action}` as const),
);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}
```

- [ ] **Step 4: ແທນ `packages/shared/src/index.ts`**

```ts
export * from "./permissions";
```

- [ ] **Step 5: Run ເພື່ອເຫັນວ່າ pass**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add permission definitions"
```

---

### Task 4: `constants.ts` ແລະ zod schemas (TDD)

**Files:**
- Create: `packages/shared/src/constants.ts`, `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/role.ts`, `packages/shared/src/schemas/staff.ts`, `packages/shared/src/schemas/schemas.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະ fail**

`packages/shared/src/schemas/schemas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createStaffSchema, loginSchema, roleSchema, updateStaffSchema } from "../index";

describe("loginSchema", () => {
  it("ຮັບ email/password ທີ່ຖືກຕ້ອງ ແລະ ປ່ຽນ email ເປັນຕົວນ້ອຍ", () => {
    const r = loginSchema.parse({ email: "  Owner@Example.COM ", password: "password123" });
    expect(r.email).toBe("owner@example.com");
  });

  it("ປະຕິເສດ email ຜິດ ແລະ ລະຫັດສັ້ນເກີນ", () => {
    expect(loginSchema.safeParse({ email: "x", password: "password123" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });
});

describe("createStaffSchema", () => {
  const valid = { email: "a@b.co", name: "ສົມຊາຍ", password: "password123", roleId: "role1" };

  it("ຮັບຂໍ້ມູນທີ່ຖືກຕ້ອງ", () => {
    expect(createStaffSchema.safeParse(valid).success).toBe(true);
  });

  it("ປະຕິເສດເມື່ອຂາດ roleId ຫຼື name ເປົ່າ", () => {
    expect(createStaffSchema.safeParse({ ...valid, roleId: "" }).success).toBe(false);
    expect(createStaffSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });
});

describe("updateStaffSchema", () => {
  it("ທຸກ field ເປັນ optional ແຕ່ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateStaffSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateStaffSchema.safeParse({}).success).toBe(false);
  });

  it("ບໍ່ໃຫ້ແກ້ email", () => {
    expect(updateStaffSchema.safeParse({ email: "x@y.co" }).success).toBe(false);
  });
});

describe("roleSchema", () => {
  it("ຮັບ permission ທີ່ຖືກຕ້ອງ ແລະ ເອົາຄ່າຊ້ຳອອກ", () => {
    const r = roleSchema.parse({
      name: "Sales",
      permissions: ["inbox:read", "inbox:read", "inbox:write"],
    });
    expect(r.permissions).toEqual(["inbox:read", "inbox:write"]);
  });

  it("ປະຕິເສດ permission ທີ່ບໍ່ມີໃນລະບົບ ແລະ name ເປົ່າ", () => {
    expect(roleSchema.safeParse({ name: "X", permissions: ["staff:delete"] }).success).toBe(false);
    expect(roleSchema.safeParse({ name: "", permissions: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared test`
Expected: FAIL, schema ຍັງບໍ່ມີ.

- [ ] **Step 3: ຂຽນ `packages/shared/src/constants.ts`**

```ts
export const SYSTEM_ROLE_OWNER = "OWNER";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
```

- [ ] **Step 4: ຂຽນ `packages/shared/src/schemas/auth.ts`**

```ts
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../constants";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 5: ຂຽນ `packages/shared/src/schemas/role.ts`**

```ts
import { z } from "zod";
import { type Permission, isPermission } from "../permissions";

export const permissionSchema = z.custom<Permission>(
  (value) => typeof value === "string" && isPermission(value),
  "permission ບໍ່ຖືກຕ້ອງ",
);

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionSchema).transform((list) => [...new Set(list)]),
});

export type RoleInput = z.infer<typeof roleSchema>;
```

- [ ] **Step 6: ຂຽນ `packages/shared/src/schemas/staff.ts`**

```ts
import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

const nameSchema = z.string().trim().min(1).max(100);

export const createStaffSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  roleId: z.string().min(1),
});

export const updateStaffSchema = z
  .strictObject({
    name: nameSchema.optional(),
    password: passwordSchema.optional(),
    roleId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
```

- [ ] **Step 7: ແທນ `packages/shared/src/index.ts`**

```ts
export * from "./constants";
export * from "./permissions";
export * from "./schemas/auth";
export * from "./schemas/role";
export * from "./schemas/staff";
```

- [ ] **Step 8: Run ເພື່ອເຫັນວ່າ pass**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared test`
Expected: PASS, ທຸກ test (permissions 4 + schemas 8).

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add constants and zod schemas for auth, staff and role"
```

---

### Task 5: ເຊື່ອມ Turborepo ແລະ ກວດທັງ monorepo

**Files:**
- Modify: `turbo.json` (ບໍ່ຕ້ອງແກ້ຖ້າ task ມີຢູ່ແລ້ວ), `README.md` (ແກ້ໝາຍເຫດທ້າຍ)

- [ ] **Step 1: Run ທັງ monorepo**

Run: `cd /Users/ta/oca && pnpm build && pnpm lint && pnpm test`
Expected: ທັງ 3 ຄຳສັ່ງຜ່ານ; Turborepo ສະແດງ `@oca/shared` ເປັນ package ດຽວທີ່ມີ script ເຫຼົ່ານີ້. ຖ້າ package ອື່ນບໍ່ມີ script ກໍຖືກຂ້າມ.

- [ ] **Step 2: ແກ້ໝາຍເຫດທ້າຍ README.md**

ແທນບັນທັດ `> ໝາຍເຫດ: ...` ເປັນ:

```markdown
> ໝາຍເຫດ: `packages/database` ມີ Prisma schema ຂອງໂມດູນ 7 (ເບິ່ງ [DATABASE](docs/DATABASE.md)); `packages/config` ແລະ `packages/shared` ພ້ອມໃຊ້; `apps/*` ແລະ package ອື່ນຍັງເປັນໂຄງເປົ່າ (Phase 0 ກຳລັງດຳເນີນ, ເບິ່ງ `docs/superpowers/specs/`).
```

- [ ] **Step 3: Commit**

```bash
git add README.md turbo.json
git commit -m "docs: update README status after tooling setup"
```

---

## Self-Review

**Spec coverage (ສ່ວນ A):** `packages/config` ມີ tsconfig base/nest/next + eslint flat config → Task 1. `packages/shared` ມີ `permissions.ts` (`as const`), `schemas/` (login, staff, role), `constants.ts` → Task 2–4. Vitest ທຸກ package → Task 2 (shared), package ອື່ນເພີ່ມເອງເມື່ອສ້າງ app. ບໍ່ມີຊ່ອງຫວ່າງ.

**Placeholder scan:** ບໍ່ມີ TBD/TODO; ທຸກ step ມີໂຄດ ຫຼື ຄຳສັ່ງຕົວຈິງ.

**Type consistency:** `Permission`, `isPermission`, `emailSchema`, `passwordSchema` ຖືກກຳນົດໃນ Task 3–4 ກ່ອນຖືກນຳໃຊ້; ຊື່ export ໃນ `index.ts` ກົງກັບ test.

**ແຜນຕໍ່ໄປ:** B (Auth/RBAC schema + seed), C (backend), D (frontend) ແຕ່ລະອັນມີແຜນແຍກ, ຂຽນຫຼັງ A ສຳເລັດ ເພື່ອໃຫ້ອີງໃສ່ໂຄດຈິງ.

# Phase 0-B: Auth/RBAC schema ແລະ seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ເພີ່ມ model User/Role/RolePermission/RefreshToken/AuditLog, migration, client factory ທີ່ NestJS (CommonJS) ໃຊ້ໄດ້, ແລະ seed (role ເລີ່ມຕົ້ນ + OWNER ຄົນທຳອິດ) ທີ່ run ຊ້ຳໄດ້.

**Architecture:** `@oca/database` ສົ່ງອອກ `createPrismaClient()` (ໃຊ້ `@prisma/adapter-pg`) ແລະ type ຂອງ Prisma. Client ຖືກ generate ເປັນ CommonJS. ເຫດຜົນ seed (`seedAuth`) ຮັບ `db` ເຂົ້າມາ ແລະ ຮັບ password hash ທີ່ hash ແລ້ວ ເພື່ອທົດສອບໄດ້ໂດຍບໍ່ຕ້ອງມີ DB; script `prisma/seed.ts` ເປັນຕົວປະກອບ env + argon2 + client.

**Tech Stack:** Prisma 7.10 (`prisma-client` generator), `@prisma/adapter-pg`, `@node-rs/argon2`, tsx, Vitest, `@oca/shared`.

**ອ້າງອີງ spec:** [2026-10-04-phase0-foundation-design.md](../specs/2026-10-04-phase0-foundation-design.md) ສ່ວນ B. ແຜນ A ສຳເລັດແລ້ວ (`@oca/config`, `@oca/shared` ພ້ອມໃຊ້).

> **ຂໍ້ຈຳກັດຂອງເຄື່ອງ:** ບໍ່ມີ Docker/Postgres. ຂັ້ນຕອນທີ່ຕ້ອງໃຊ້ DB ຈິງ (`migrate deploy`, ຮັນ seed ຈົນຈົບ) ບັນທຶກໄວ້ໃນ "ການກວດທີ່ຍັງຄ້າງ" ທ້າຍແຜນ, ບໍ່ຖືວ່າຜ່ານ. ຢ່າອ້າງວ່າ migration/seed ໃຊ້ກັບ DB ໄດ້ຈົນກວ່າຈະກວດຂໍ້ນັ້ນ.

---

## File Structure

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `packages/database/prisma/schema.prisma` | ເພີ່ມ 5 model + ຕັ້ງ generator ເປັນ CJS |
| `packages/database/prisma/migrations/20261004010000_auth_rbac/migration.sql` | SQL ຈາກ schema diff |
| `packages/database/src/index.ts` | `createPrismaClient()` + re-export type ຂອງ Prisma |
| `packages/database/src/seed/roles.ts` | `ROLE_DEFINITIONS` (OWNER + 4 role ຕົວຢ່າງ) |
| `packages/database/src/seed/seed-auth.ts` | `seedAuth(db, input)` (idempotent) |
| `packages/database/prisma/seed.ts` | entry: ອ່ານ env, hash, ເອີ້ນ `seedAuth` |
| `packages/database/tsconfig.json`, `eslint.config.mjs` | tooling ຂອງ package |
| `packages/database/src/*.test.ts`, `src/seed/*.test.ts` | test (Vitest) |

---

### Task 1: ເພີ່ມ model ໃນ schema ແລະ ຕັ້ງ generator ເປັນ CJS

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: ແກ້ generator block (ບັນທັດ 4–7)**

ແທນ:
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated"
}
```
ດ້ວຍ:
```prisma
generator client {
  provider            = "prisma-client"
  output              = "../src/generated"
  moduleFormat        = "cjs"
  importFileExtension = ""
}
```

- [ ] **Step 2: ຕໍ່ທ້າຍ schema ດ້ວຍ model ໃໝ່**

Run (ຈາກ `/Users/ta/oca/packages/database`):
```bash
cat >> prisma/schema.prisma <<'EOF'

// ---------------------------------------------------------------------------
// Auth & RBAC (Phase 0)
// ---------------------------------------------------------------------------

// Role ປັບແຕ່ງໄດ້; Role ລະບົບ (isSystem) ລຶບ ຫຼື ແກ້ permission ບໍ່ໄດ້
model Role {
  id          String           @id @default(cuid())
  name        String           @unique
  description String?
  isSystem    Boolean          @default(false)
  permissions RolePermission[]
  users       User[]
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}

// permission ເປັນ string "module:action" ທີ່ກຳນົດໃນ @oca/shared (ບໍ່ແມ່ນຕາຕະລາງ)
model RolePermission {
  id         String @id @default(cuid())
  roleId     String
  role       Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission String

  @@unique([roleId, permission])
}

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  name          String
  isActive      Boolean        @default(true)
  lastLoginAt   DateTime?
  roleId        String
  role          Role           @relation(fields: [roleId], references: [id], onDelete: Restrict)
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([roleId])
}

// Refresh token ແບບ rotation: ແຕ່ລະ login ເປັນ family ໜຶ່ງ. ຖ້າ token ທີ່ຖືກໃຊ້ແລ້ວ
// ຖືກນຳມາໃຊ້ຊ້ຳ ໃຫ້ revoke ທັງ family
model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  familyId  String
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  ip        String?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([familyId])
}

// ເພີ່ມຢ່າງດຽວ (append-only): ແອັບບໍ່ມີ endpoint ແກ້/ລຶບ
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  action    String // ເຊັ່ນ auth.login, staff.update
  entity    String
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([userId, createdAt])
}
EOF
```

- [ ] **Step 3: ກວດ schema ແລະ generate client**

Run: `cd /Users/ta/oca/packages/database && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` ແລະ `Generated Prisma Client`. ກວດວ່າໄຟລ໌ທີ່ generate ບໍ່ມີ `import.meta`: `grep -rn "import.meta" src/generated | wc -l` ໄດ້ `0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/ta/oca
git add packages/database/prisma/schema.prisma
git commit -m "feat(database): add auth and RBAC models, generate CJS client"
```

---

### Task 2: Migration SQL (offline, ຈາກ schema diff)

**Files:**
- Create: `packages/database/prisma/migrations/20261004010000_auth_rbac/migration.sql`

- [ ] **Step 1: ສ້າງ SQL ຈາກ schema ເກົ່າ (commit `d797e9d`) ໄປ schema ໃໝ່**

```bash
cd /Users/ta/oca/packages/database
git show d797e9d:packages/database/prisma/schema.prisma > /private/tmp/claude-501/-Users-ta-oca/66d8384f-b5da-4edc-a7ce-254c701b340c/scratchpad/old-schema.prisma
mkdir -p prisma/migrations/20261004010000_auth_rbac
npx prisma migrate diff \
  --from-schema /private/tmp/claude-501/-Users-ta-oca/66d8384f-b5da-4edc-a7ce-254c701b340c/scratchpad/old-schema.prisma \
  --to-schema prisma/schema.prisma \
  --script -o prisma/migrations/20261004010000_auth_rbac/migration.sql
```
Expected: ໄຟລ໌ migration.sql ຖືກສ້າງ.

- [ ] **Step 2: ກວດເນື້ອໃນ**

Run:
```bash
cd /Users/ta/oca/packages/database/prisma/migrations/20261004010000_auth_rbac
grep -c '^CREATE TABLE' migration.sql   # ຕ້ອງໄດ້ 5
grep -E 'CREATE TABLE "(User|Role|RolePermission|RefreshToken|AuditLog)"' migration.sql | wc -l   # ຕ້ອງໄດ້ 5
grep -ciE 'DROP|ALTER TABLE "(Product|Order|Customer|StockLevel)' migration.sql   # ຕ້ອງໄດ້ 0 (ບໍ່ແຕະຕາຕະລາງເກົ່າ)
```
ຖ້າຕົວເລກບໍ່ຕົງ ໃຫ້ຢຸດ ແລະ ລາຍງານ ບໍ່ຕ້ອງແກ້ SQL ດ້ວຍມື.

- [ ] **Step 3: Commit**

```bash
cd /Users/ta/oca
git add packages/database/prisma/migrations
git commit -m "feat(database): add auth_rbac migration"
```

---

### Task 3: Client factory + tooling ຂອງ `@oca/database` (TDD)

**Files:**
- Modify: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`, `packages/database/eslint.config.mjs`, `packages/database/src/index.test.ts`, `packages/database/src/index.ts`

- [ ] **Step 1: ຕິດຕັ້ງ dependency (ໃສ່ quote ໃຫ້ `@oca/shared@workspace:*` ເພາະ zsh ຈະ glob)**

```bash
cd /Users/ta/oca
pnpm --filter @oca/database add @prisma/adapter-pg "@oca/shared@workspace:*"
pnpm --filter @oca/database add -D "@oca/config@workspace:*" typescript@~5.9 eslint@^9 vitest tsx @node-rs/argon2
```
Expected: ສຳເລັດ. ຖ້າ pnpm ຖາມ/ເຕືອນເລື່ອງ build script ຂອງ package ໃດ ໃຫ້ລາຍງານ ຢ່າເດົາ.

- [ ] **Step 2: ຂຽນ `packages/database/tsconfig.json`**

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

- [ ] **Step 3: ຂຽນ `packages/database/eslint.config.mjs`**

```js
import base from "@oca/config/eslint";

export default base;
```

- [ ] **Step 4: ແກ້ `packages/database/package.json`**

ເພີ່ມ field `main`, `types`, `files` ແລະ script ໃໝ່ (ຮັກສາ script `db:*` ທີ່ມີຢູ່):
```json
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"files": ["dist", "prisma"],
```
ແລະໃນ `scripts` ເພີ່ມ:
```json
"build": "prisma generate && tsc -p tsconfig.json",
"lint": "eslint .",
"test": "prisma generate && vitest run",
"db:seed": "tsx --env-file-if-exists=../../.env prisma/seed.ts"
```
(`test` ຕ້ອງ generate ກ່ອນ ເພາະ `src/generated` ຖືກ gitignore ແລະ pnpm 11 ບໍ່ run `pretest`.)

- [ ] **Step 5: ຂຽນ test ທີ່ຈະ fail**

`packages/database/src/index.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createPrismaClient } from "./index";

describe("createPrismaClient", () => {
  it("throw ເມື່ອບໍ່ມີ connection string", () => {
    expect(() => createPrismaClient("")).toThrow("DATABASE_URL");
  });

  it("ສ້າງ client ໂດຍບໍ່ເຊື່ອມຕໍ່ DB ທັນທີ ແລະ ມີ model ໃໝ່", async () => {
    const db = createPrismaClient("postgresql://u:p@localhost:5432/x");
    expect(typeof db.user.findMany).toBe("function");
    expect(typeof db.role.findUnique).toBe("function");
    expect(typeof db.auditLog.create).toBe("function");
    await db.$disconnect();
  });
});
```

- [ ] **Step 6: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/shared build && pnpm --filter @oca/database test`
Expected: FAIL, ຫາ `./index` ບໍ່ເຫັນ.

- [ ] **Step 7: ຂຽນ `packages/database/src/index.ts`**

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export * from "./generated/client";

export function createPrismaClient(connectionString: string | undefined = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
```

- [ ] **Step 8: Run ເພື່ອເຫັນວ່າ pass, ແລ້ວ build ແລະ lint**

Run:
```bash
cd /Users/ta/oca
pnpm --filter @oca/database test
pnpm --filter @oca/database build
pnpm --filter @oca/database lint
node -e "const m=require('./packages/database/dist'); console.log(typeof m.createPrismaClient, typeof m.PrismaClient)"
```
Expected: 2 tests PASS; build ແລະ lint ສະອາດ; node ພິມ `function function` (ພິສູດວ່າ CommonJS ໂຫຼດໄດ້). ຖ້າ `tsc` ຟ້ອງ error ໃນ `src/generated` ໃຫ້ລາຍງານ ຢ່າແກ້ໄຟລ໌ generated.

- [ ] **Step 9: Commit**

```bash
cd /Users/ta/oca
git add packages/database pnpm-lock.yaml
git commit -m "feat(database): add createPrismaClient and package tooling"
```

---

### Task 4: ນິຍາມ role ເລີ່ມຕົ້ນ (TDD)

**Files:**
- Create: `packages/database/src/seed/roles.test.ts`, `packages/database/src/seed/roles.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະ fail**

`packages/database/src/seed/roles.test.ts`:
```ts
import { PERMISSIONS, SYSTEM_ROLE_OWNER, isPermission } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ROLE_DEFINITIONS } from "./roles";

describe("ROLE_DEFINITIONS", () => {
  it("ຊື່ role ບໍ່ຊ້ຳ ແລະ ມີ 5 role", () => {
    const names = ROLE_DEFINITIONS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([SYSTEM_ROLE_OWNER, "MANAGER", "CHAT_ADMIN", "WAREHOUSE", "ACCOUNTANT"]);
  });

  it("ມີແຕ່ OWNER ທີ່ເປັນ role ລະບົບ ແລະ ມີທຸກ permission", () => {
    const system = ROLE_DEFINITIONS.filter((r) => r.isSystem);
    expect(system.map((r) => r.name)).toEqual([SYSTEM_ROLE_OWNER]);
    expect(system[0]?.permissions).toEqual(PERMISSIONS);
  });

  it("ທຸກ permission ທີ່ໃຊ້ແມ່ນຄ່າທີ່ຖືກຕ້ອງ ແລະ ບໍ່ຊ້ຳໃນແຕ່ລະ role", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(role.permissions.every((p) => isPermission(p))).toBe(true);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it("MANAGER ບໍ່ມີ staff:write ແຕ່ມີ inventory:write", () => {
    const manager = ROLE_DEFINITIONS.find((r) => r.name === "MANAGER");
    expect(manager?.permissions).not.toContain("staff:write");
    expect(manager?.permissions).toContain("inventory:write");
  });

  it("role ຕົວຢ່າງມີສິດຕາມໜ້າທີ່", () => {
    const get = (name: string) => ROLE_DEFINITIONS.find((r) => r.name === name)?.permissions ?? [];
    expect(get("CHAT_ADMIN")).toEqual(expect.arrayContaining(["inbox:write", "live-cf:write", "crm:read"]));
    expect(get("WAREHOUSE")).toEqual(expect.arrayContaining(["inventory:write", "logistics:write"]));
    expect(get("ACCOUNTANT")).toEqual(expect.arrayContaining(["analytics:read"]));
    expect(get("ACCOUNTANT").some((p) => p.endsWith(":write"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/database test`
Expected: FAIL, ຫາ `./roles` ບໍ່ເຫັນ.

- [ ] **Step 3: ຂຽນ `packages/database/src/seed/roles.ts`**

```ts
import { PERMISSIONS, SYSTEM_ROLE_OWNER, type Permission, type PermissionModule } from "@oca/shared";

export interface RoleDefinition {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: readonly Permission[];
}

const readWrite = (...modules: PermissionModule[]): Permission[] =>
  modules.flatMap((m) => [`${m}:read` as const, `${m}:write` as const]);

const readOnly = (...modules: PermissionModule[]): Permission[] => modules.map((m) => `${m}:read` as const);

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    name: SYSTEM_ROLE_OWNER,
    description: "ເຈົ້າຂອງຮ້ານ: ເຂົ້າເຖິງໄດ້ທຸກຢ່າງ",
    isSystem: true,
    permissions: PERMISSIONS,
  },
  {
    name: "MANAGER",
    description: "ຜູ້ຈັດການ: ທຸກຢ່າງຍົກເວັ້ນການແກ້ໄຂພະນັກງານ ແລະ role",
    isSystem: false,
    permissions: PERMISSIONS.filter((p) => p !== "staff:write"),
  },
  {
    name: "CHAT_ADMIN",
    description: "ແອດມິນແຊັດ: ຕອບແຊັດ, ດູແລ Live/CF",
    isSystem: false,
    permissions: [...readWrite("inbox", "live-cf"), ...readOnly("crm", "inventory", "promotion")],
  },
  {
    name: "WAREHOUSE",
    description: "ພະນັກງານສາງ: ສະຕ໋ອກ ແລະ ການຈັດສົ່ງ",
    isSystem: false,
    permissions: readWrite("inventory", "logistics"),
  },
  {
    name: "ACCOUNTANT",
    description: "ບັນຊີ: ເບິ່ງລາຍງານ ແລະ ຂໍ້ມູນທີ່ກ່ຽວຂ້ອງ (ອ່ານຢ່າງດຽວ)",
    isSystem: false,
    permissions: readOnly("analytics", "inventory", "crm", "logistics"),
  },
];
```

- [ ] **Step 4: Run ເພື່ອເຫັນວ່າ pass**

Run: `cd /Users/ta/oca && pnpm --filter @oca/database test`
Expected: PASS (index 2 + roles 5).

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/seed
git commit -m "feat(database): add default role definitions"
```

---

### Task 5: `seedAuth` (TDD ດ້ວຍ DB ຈຳລອງ)

**Files:**
- Create: `packages/database/src/seed/seed-auth.test.ts`, `packages/database/src/seed/seed-auth.ts`

ກົດ: role ລະບົບ (OWNER) sync permission ທຸກຄັ້ງ (ເພື່ອໃຫ້ໄດ້ permission ໃໝ່ເມື່ອເພີ່ມ module); role ອື່ນສ້າງເມື່ອຍັງບໍ່ມີເທົ່ານັ້ນ ບໍ່ຂຽນທັບສິ່ງທີ່ Owner ປັບແຕ່ງ; user OWNER ສ້າງຄັ້ງດຽວ ບໍ່ປ່ຽນລະຫັດຜ່ານທີ່ມີຢູ່ແລ້ວ.

- [ ] **Step 1: ຂຽນ test ທີ່ຈະ fail**

`packages/database/src/seed/seed-auth.test.ts`:
```ts
import { PERMISSIONS, SYSTEM_ROLE_OWNER } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { type SeedDb, seedAuth } from "./seed-auth";

interface FakeRole {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}
interface FakeUser {
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
}

function createFakeDb() {
  const roles: FakeRole[] = [];
  const users: FakeUser[] = [];
  let seq = 0;

  const db = {
    role: {
      findUnique: async ({ where }: { where: { name: string } }) =>
        roles.find((r) => r.name === where.name) ?? null,
      create: async ({
        data,
      }: {
        data: { name: string; isSystem: boolean; permissions: { create: { permission: string }[] } };
      }) => {
        const role: FakeRole = {
          id: `role${++seq}`,
          name: data.name,
          isSystem: data.isSystem,
          permissions: data.permissions.create.map((p) => p.permission),
        };
        roles.push(role);
        return role;
      },
    },
    rolePermission: {
      deleteMany: async ({ where }: { where: { roleId: string } }) => {
        const role = roles.find((r) => r.id === where.roleId);
        if (role) role.permissions = [];
      },
      createMany: async ({ data }: { data: { roleId: string; permission: string }[] }) => {
        for (const row of data) roles.find((r) => r.id === row.roleId)?.permissions.push(row.permission);
      },
    },
    user: {
      upsert: async ({ where, create }: { where: { email: string }; create: FakeUser }) => {
        const existing = users.find((u) => u.email === where.email);
        if (existing) return existing;
        users.push(create);
        return create;
      },
    },
  };

  return { db: db as unknown as SeedDb, roles, users };
}

const input = { ownerEmail: "owner@example.com", ownerPasswordHash: "hash-1" };

describe("seedAuth", () => {
  it("ສ້າງ 5 role ແລະ OWNER ຄົນທຳອິດ ເມື່ອ DB ເປົ່າ", async () => {
    const { db, roles, users } = createFakeDb();
    await seedAuth(db, input);

    expect(roles).toHaveLength(5);
    const owner = roles.find((r) => r.name === SYSTEM_ROLE_OWNER);
    expect(owner?.isSystem).toBe(true);
    expect(owner?.permissions).toEqual(PERMISSIONS);
    expect(users).toEqual([
      { email: "owner@example.com", name: "Owner", passwordHash: "hash-1", roleId: owner?.id },
    ]);
  });

  it("run ຊ້ຳໄດ້ ບໍ່ສ້າງຊ້ຳ", async () => {
    const { db, roles, users } = createFakeDb();
    await seedAuth(db, input);
    await seedAuth(db, input);
    expect(roles).toHaveLength(5);
    expect(users).toHaveLength(1);
  });

  it("sync permission ຂອງ OWNER ກັບຄືນເປັນທັງໝົດທຸກຄັ້ງ", async () => {
    const { db, roles } = createFakeDb();
    await seedAuth(db, input);
    const owner = roles.find((r) => r.name === SYSTEM_ROLE_OWNER);
    if (owner) owner.permissions = ["staff:read"];
    await seedAuth(db, input);
    expect(owner?.permissions).toEqual(PERMISSIONS);
  });

  it("ບໍ່ຂຽນທັບ permission ຂອງ role ທີ່ Owner ປັບແຕ່ງແລ້ວ", async () => {
    const { db, roles } = createFakeDb();
    await seedAuth(db, input);
    const manager = roles.find((r) => r.name === "MANAGER");
    if (manager) manager.permissions = ["inbox:read"];
    await seedAuth(db, input);
    expect(manager?.permissions).toEqual(["inbox:read"]);
  });

  it("ບໍ່ປ່ຽນລະຫັດຜ່ານຂອງ user ທີ່ມີຢູ່ແລ້ວ", async () => {
    const { db, users } = createFakeDb();
    await seedAuth(db, input);
    await seedAuth(db, { ...input, ownerPasswordHash: "hash-2" });
    expect(users[0]?.passwordHash).toBe("hash-1");
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/database test`
Expected: FAIL, ຫາ `./seed-auth` ບໍ່ເຫັນ.

- [ ] **Step 3: ຂຽນ `packages/database/src/seed/seed-auth.ts`**

```ts
import { SYSTEM_ROLE_OWNER } from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import { ROLE_DEFINITIONS } from "./roles";

export type SeedDb = Pick<PrismaClient, "role" | "rolePermission" | "user">;

export interface SeedAuthInput {
  ownerEmail: string;
  ownerPasswordHash: string;
}

export async function seedAuth(db: SeedDb, input: SeedAuthInput): Promise<void> {
  for (const def of ROLE_DEFINITIONS) {
    const existing = await db.role.findUnique({ where: { name: def.name } });
    if (!existing) {
      await db.role.create({
        data: {
          name: def.name,
          description: def.description,
          isSystem: def.isSystem,
          permissions: { create: def.permissions.map((permission) => ({ permission })) },
        },
      });
    } else if (def.isSystem) {
      await db.rolePermission.deleteMany({ where: { roleId: existing.id } });
      await db.rolePermission.createMany({
        data: def.permissions.map((permission) => ({ roleId: existing.id, permission })),
      });
    }
  }

  const ownerRole = await db.role.findUnique({ where: { name: SYSTEM_ROLE_OWNER } });
  if (!ownerRole) {
    throw new Error(`Role ${SYSTEM_ROLE_OWNER} was not created`);
  }

  await db.user.upsert({
    where: { email: input.ownerEmail },
    create: {
      email: input.ownerEmail,
      name: "Owner",
      passwordHash: input.ownerPasswordHash,
      roleId: ownerRole.id,
    },
    update: {},
  });
}
```

- [ ] **Step 4: Run ເພື່ອເຫັນວ່າ pass, ແລ້ວ build ແລະ lint**

Run: `cd /Users/ta/oca && pnpm --filter @oca/database test && pnpm --filter @oca/database build && pnpm --filter @oca/database lint`
Expected: ທຸກ test PASS (index 2 + roles 5 + seed-auth 5); build ແລະ lint ສະອາດ. ຖ້າ `tsc` ຟ້ອງຊະນິດຂອງ `SeedDb` ໃຫ້ລາຍງານ.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/seed
git commit -m "feat(database): add idempotent seedAuth"
```

---

### Task 6: Seed entry, env ແລະ script ຮາກ

**Files:**
- Create: `packages/database/prisma/seed.ts`
- Modify: `.env.example`, `package.json` (ຮາກ)

- [ ] **Step 1: ຂຽນ `packages/database/prisma/seed.ts`**

```ts
import { hash } from "@node-rs/argon2";
import { emailSchema, passwordSchema } from "@oca/shared";
import { createPrismaClient } from "../src/index";
import { seedAuth } from "../src/seed/seed-auth";

async function main(): Promise<void> {
  const ownerEmail = emailSchema.parse(process.env.SEED_OWNER_EMAIL);
  const ownerPassword = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);

  const db = createPrismaClient();
  try {
    await seedAuth(db, { ownerEmail, ownerPasswordHash: await hash(ownerPassword) });
    console.log(`Seed ok: owner ${ownerEmail}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: ເພີ່ມໃນ `.env.example` ຕໍ່ຈາກ `REDIS_URL`**

```
# Seed: ຜູ້ໃຊ້ OWNER ຄົນທຳອິດ (ປ່ຽນລະຫັດຜ່ານກ່ອນໃຊ້ຈິງ; ຢ່າງໜ້ອຍ 8 ໂຕອັກສອນ)
SEED_OWNER_EMAIL=owner@example.com
SEED_OWNER_PASSWORD=change-me-please
```

- [ ] **Step 3: ເພີ່ມ script ໃນ `package.json` ຮາກ (ໃນ `scripts`, ຕໍ່ຈາກ `infra:down`)**

```json
"db:seed": "pnpm --filter @oca/database db:seed"
```
(ຢ່າລືມ comma ຕໍ່ທ້າຍ `infra:down`.)

- [ ] **Step 4: ກວດ seed entry (ບໍ່ມີ DB)**

Run:
```bash
cd /Users/ta/oca
pnpm db:seed 2>&1 | tail -15
```
Expected: ຟ້ອງ ZodError ເລື່ອງ `SEED_OWNER_EMAIL` (ຍ້ອນບໍ່ມີ `.env`); ພິສູດວ່າ script ໂຫຼດ TypeScript ແລະ import ທັງ `@node-rs/argon2`, `@oca/shared` ໄດ້.

ຈາກນັ້ນ:
```bash
SEED_OWNER_EMAIL=owner@example.com SEED_OWNER_PASSWORD=change-me-please pnpm db:seed 2>&1 | tail -15
```
Expected: ໄປຮອດຂັ້ນເຊື່ອມ DB ແລ້ວ fail ດ້ວຍ connection error (`ECONNREFUSED` ຫຼື ຄ້າຍກັນ) ຍ້ອນບໍ່ມີ Postgres. ນັ້ນຄືຜົນທີ່ຖືກຕ້ອງໃນເຄື່ອງນີ້; ບັນທຶກຂໍ້ຄວາມ error ທີ່ເຫັນໃນລາຍງານ. ຖ້າ fail ດ້ວຍເຫດຜົນອື່ນ (ເຊັ່ນ import ຜິດ) ໃຫ້ແກ້.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/seed.ts .env.example package.json
git commit -m "feat(database): add seed entry and db:seed script"
```

---

### Task 7: ເອກະສານ ແລະ ກວດທັງ monorepo

**Files:**
- Modify: `docs/DATABASE.md` (ຕໍ່ທ້າຍ), `README.md`

- [ ] **Step 1: ຕໍ່ທ້າຍ `docs/DATABASE.md`**

```markdown

## Auth & RBAC (Phase 0)

| ຕາຕະລາງ | ໜ້າທີ່ |
|---|---|
| `User` | ພະນັກງານ: email (unique), passwordHash (argon2id), 1 role ຕໍ່ 1 ຄົນ, `isActive` |
| `Role` | Role ປັບແຕ່ງໄດ້; `isSystem` (OWNER) ລຶບ ຫຼື ແກ້ permission ບໍ່ໄດ້ |
| `RolePermission` | permission ຂອງ role ເປັນ string `module:action` (ລາຍການຢູ່ `@oca/shared`, ບໍ່ແມ່ນຕາຕະລາງ) |
| `RefreshToken` | refresh token ແບບ rotation; ເກັບສະເພາະ hash; `familyId` ໃຊ້ revoke ທັງຕະກູນເມື່ອພົບການໃຊ້ຊ້ຳ |
| `AuditLog` | ບັນທຶກແບບເພີ່ມຢ່າງດຽວ: action, entity, before/after (JSON), ip |

Seed (`pnpm db:seed`) ສ້າງ role OWNER (ລະບົບ), MANAGER, CHAT_ADMIN, WAREHOUSE, ACCOUNTANT ແລະ ຜູ້ໃຊ້ OWNER ຈາກ `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`. Run ຊ້ຳໄດ້: sync permission ຂອງ OWNER ທຸກຄັ້ງ, ບໍ່ຂຽນທັບ role ອື່ນ ຫຼື ລະຫັດຜ່ານທີ່ມີຢູ່ແລ້ວ.
```

- [ ] **Step 2: ແກ້ໝາຍເຫດທ້າຍ `README.md`**

ແທນເນື້ອຫາຫຼັງ `> ໝາຍເຫດ:` ຂອງບັນທັດທ້າຍ ເປັນ:
```markdown
> ໝາຍເຫດ: `packages/database` ມີ Prisma schema ຂອງໂມດູນ 7 + Auth/RBAC (ເບິ່ງ [DATABASE](docs/DATABASE.md)), ແລະ `pnpm db:seed` ສ້າງ OWNER; `packages/config` ແລະ `packages/shared` ພ້ອມໃຊ້; `apps/*` ແລະ package ອື່ນຍັງເປັນໂຄງເປົ່າ (Phase 0 ກຳລັງດຳເນີນ, ເບິ່ງ `docs/superpowers/specs/`).
```

- [ ] **Step 3: ກວດທັງ monorepo**

Run: `cd /Users/ta/oca && pnpm build && pnpm lint && pnpm test`
Expected: ທັງ 3 ຜ່ານ; Turborepo ແລ່ນ `@oca/shared` ແລະ `@oca/database` (shared ກ່ອນ database).

- [ ] **Step 4: Commit**

```bash
git add docs/DATABASE.md README.md
git commit -m "docs: document auth/RBAC tables and seed"
```

---

## ການກວດທີ່ຍັງຄ້າງ (ຕ້ອງມີ Postgres ຈິງ)

ເມື່ອມີ Docker: `pnpm infra:up`, ຕັ້ງ `.env`, ແລ້ວ:
1. `pnpm --filter @oca/database db:deploy` ຕ້ອງ apply ທັງ migration `init` ແລະ `auth_rbac` ໂດຍບໍ່ມີ error.
2. `pnpm db:seed` ສອງຄັ້ງຕິດກັນ: ຄັ້ງທີ 2 ບໍ່ຟ້ອງ, ແລະ `SELECT count(*) FROM "Role"` = 5, `"User"` = 1.
3. `pnpm --filter @oca/database exec prisma migrate status` ບອກວ່າ database schema up to date.

## Self-Review

**Spec coverage (ສ່ວນ B):** User/Role/RolePermission/RefreshToken (ມີ familyId)/AuditLog → Task 1; migration ໃໝ່ບໍ່ແກ້ `init` → Task 2; seed ມີ OWNER + MANAGER, CHAT_ADMIN, WAREHOUSE, ACCOUNTANT, OWNER ຈາກ env, idempotent, `pnpm db:seed`, `.env.example` → Task 4–6. ສ່ວນເພີ່ມທີ່ spec ບໍ່ໄດ້ລະບຸແຕ່ຈຳເປັນ: client ເປັນ CJS ແລະ `createPrismaClient` (Task 1, 3) ເພື່ອໃຫ້ NestJS ໃຊ້ໄດ້ໃນແຜນ C.

**Placeholder scan:** ບໍ່ມີ TBD; ທຸກ step ມີໂຄດ ຫຼື ຄຳສັ່ງ. ສິ່ງທີ່ເຮັດບໍ່ໄດ້ໃນເຄື່ອງນີ້ (DB ຈິງ) ແຍກເປັນ "ການກວດທີ່ຍັງຄ້າງ".

**Type consistency:** `RoleDefinition`, `ROLE_DEFINITIONS` (Task 4) ຖືກໃຊ້ໃນ `seed-auth.ts` (Task 5); `SeedDb`, `seedAuth`, `SeedAuthInput` (Task 5) ຖືກໃຊ້ໃນ `prisma/seed.ts` (Task 6); `createPrismaClient` (Task 3) ຖືກໃຊ້ໃນ Task 6; `SYSTEM_ROLE_OWNER`, `PERMISSIONS`, `emailSchema`, `passwordSchema` ມາຈາກ `@oca/shared` (ແຜນ A).

**ແຜນຕໍ່ໄປ:** C (backend) ຂຽນຫຼັງ B ສຳເລັດ; ມັນຈະໃຊ້ `createPrismaClient` ແລະ model ຈາກແຜນນີ້.

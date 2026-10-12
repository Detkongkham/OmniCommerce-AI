# Phase 3 D3: Web Member (Phone + PIN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A storefront customer can set a 6-digit PIN from a paid web order, sign in with phone + PIN, see points / tier / order history at `/account`, and spend points at checkout.

**Architecture:** The API issues a stateless member JWT (HS256, 30 days, `{ sub: customerId, pv: pinVersion, aud: "member" }`). The browser never sees it: the storefront's existing `/api/store/[...path]` route handler stores it in an httpOnly cookie and forwards it upstream as `Authorization: Bearer`. Point redemption on the web reuses the D2 engine through `OrdersService.createFromStorefront`.

**Tech Stack:** NestJS 11 + `@nestjs/jwt` + `@node-rs/argon2`, Prisma 7, Zod 4, Next 16 route handlers, Vitest.

Spec: `docs/superpowers/specs/2026-10-12-phase3-d-crm-loyalty-design.md` §4.

## Decisions made while planning (recorded in the spec)

1. **A PIN can only be set from a web order that is already paid** (`PAID`..`COMPLETED`), not from any web order. Guest checkout accepts any phone number, so an unpaid order link proves nothing about who owns the phone; requiring a paid order means someone would have to pay for an order under another person's number to claim their account. Residual risk (documented): that is still possible for a determined attacker; the admin "reset PIN" action and the audit log are the recovery path until SMS OTP exists.
2. **No new required env var.** The member signing key is `MEMBER_JWT_SECRET` if set, otherwise `HMAC-SHA256(JWT_ACCESS_SECRET, "oca-member-session")`. A missing variable must not crash a running API.
3. `GET /store/orders/:token` exposes `pinSetup: "AVAILABLE" | "AFTER_PAYMENT" | "NONE"` instead of a boolean, so the order page can tell the buyer the PIN becomes available after payment.
4. Members cannot change their own PIN (spec); the admin resets it and the member sets a new one from any of their paid web order links.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/schemas/storefront.ts` (+ test) | PIN / login schemas, `pointsToRedeem` on cart check and order, lock constants |
| `packages/shared/src/error-codes.ts`, `apps/api/src/common/api-error.ts` | `PIN_ALREADY_SET` 409, `MEMBER_LOGIN_FAILED` 401, `MEMBER_LOCKED` 429, `MEMBER_REQUIRED` 401 |
| `schema.prisma`, migration `20261012020000_member_pin` | `pinHash`, `pinFailedCount`, `pinLockedUntil`, `pinVersion` |
| `apps/api/src/config/env.ts` | optional `MEMBER_JWT_SECRET`, `STORE_LOGIN_RATE_LIMIT` |
| `apps/api/src/modules/storefront/store-member.service.ts` (create) | set PIN, login + lockout, verify session, me / orders / points |
| `store-catalog.service.ts`, `store-orders.service.ts`, `storefront.mapper.ts`, `storefront.controller.ts` (modify) | loyalty in config, points in cart check / order / order DTO, member routes |
| `apps/api/src/modules/crm/*` (modify) | `hasPin`, `POST :id/pin/reset`, PIN rule in merge |
| `apps/api/test/storefront-member.e2e.test.ts` (create) | API tests |
| `apps/storefront/src/app/api/store/[...path]/route.ts` (+ test) | cookie ⇄ bearer, logout |
| `apps/storefront/src/lib/*`, `src/app/account/page.tsx`, checkout, order page, header | UI |
| admin `customer-detail.tsx` | PIN status + reset button |

## Tasks

- [ ] **T1 shared + schema.** Schemas, constants, error codes, migration, Prisma model. Tests: PIN must be exactly 6 digits; login needs phone + PIN; `pointsToRedeem` positive integer on both store schemas.
- [ ] **T2 member service + routes.** `POST /store/orders/:token/pin`, `POST /store/member/login`, `GET /store/member/me|orders|points`. Tests: set PIN only on a paid web order and only once (atomic `updateMany … WHERE pinHash IS NULL`); login success; unknown phone / no PIN / wrong PIN all answer `401 MEMBER_LOGIN_FAILED`; 5 consecutive failures → `429 MEMBER_LOCKED` with `retryAfterSeconds`, a correct PIN is refused while locked, success after the lock resets the counter; a staff access token or a tampered token is `401 MEMBER_REQUIRED`; responses never contain `pinHash`, customer ids or admin notes.
- [ ] **T3 points on the web.** `GET /store/config` → `loyalty`; `POST /store/cart/check` with a session returns `points { redeemed, discount, maxPoints }` / `pointsError`; `POST /store/orders` with `pointsToRedeem` requires a session (`401 MEMBER_REQUIRED`) whose phone equals the checkout phone (`409 POINTS_INVALID PHONE_MISMATCH`); order DTO gets `points`, `pointsEarned`, `pinSetup`. Tests cover each plus `expectedTotal` including the points discount and refund on expiry.
- [ ] **T4 CRM.** `hasPin` in detail; `POST /crm/customers/:id/pin/reset` (`crm:write`, audit, bumps `pinVersion` so old sessions die); merge keeps the target's PIN, or adopts the source's PIN only together with the source's phone. Admin UI: PIN row + reset button with confirmation.
- [ ] **T5 storefront proxy.** Cookie `oca_member` (httpOnly, SameSite=Lax, Secure in production, 30 days, path `/`): set from the `memberToken` of a successful login / PIN response (token stripped from the body), forwarded as bearer, cleared on `POST /api/store/member/logout` (handled locally) and whenever upstream answers `401 MEMBER_REQUIRED`.
- [ ] **T6 storefront UI.** Read the Next 16 docs in `apps/storefront/node_modules/next/dist/docs/` for route handlers and cookies first. Header "ບັນຊີ" link; `/account` (sign-in form with explanation of how to get an account, or dashboard: points, tier + progress to next tier, order history, point history, sign out); order page PIN card + points rows; checkout prefill + "ໃຊ້ແຕ້ມ" with "ໃຊ້ສູງສຸດ".
- [ ] **T7 verify + docs.** All suites, lint, typecheck; migrate dev DB (5433); Chrome smoke of the whole member journey at desktop and 390px; update `ROADMAP.md`, `DATABASE.md`, `DEPLOYMENT-NOTES.md`, spec status.

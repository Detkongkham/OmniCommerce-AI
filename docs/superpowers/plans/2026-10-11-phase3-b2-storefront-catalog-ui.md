# Storefront 3b-B2 (ໜ້າສິນຄ້າ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** ໜ້າເວັບສາທາລະນະສ່ວນເບິ່ງສິນຄ້າ: ໜ້າຫຼັກ, ລາຍການ (ໝວດໝູ່/ຄົ້ນຫາ/ແບ່ງໜ້າ), ລາຍລະອຽດ (ເລືອກ variant), SEO ພື້ນຖານ.

**Architecture:** `apps/storefront` (Next.js 16 App Router, ບໍ່ເປີດ `cacheComponents`). Server Component ດຶງ `/store/*` ຜ່ານ `API_URL` ດ້ວຍ `fetch(..., { next: { revalidate: 60 } })`; ທຸກໜ້າເອີ້ນ `connection()` ກ່ອນ ເພື່ອບໍ່ prerender ຕອນ build (build ບໍ່ຕ້ອງມີ API). ຮູບສິນຄ້າ (`/media/files/*`) ແລະ ຄຳຂໍຝັ່ງ client (`/api/*`) ຜ່ານ rewrite ໄປ API. ສ່ວນໂຕ້ຕອບ (ເລືອກ variant, ຮູບ) ເປັນ Client Component ນ້ອຍໆ. ພາສາລາວຢ່າງດຽວ ຈຶ່ງຂຽນຂໍ້ຄວາມໃນ component ໂດຍກົງ (ບໍ່ມີ dictionary). Spec: `docs/superpowers/specs/2026-10-11-phase3-b-storefront-design.md` §4.

**Tech Stack:** Next.js 16.3, React 19, Tailwind 4 + token ຂອງ `@oca/ui`, Vitest + Testing Library (jsdom).

## File map (ທັງໝົດຢູ່ `apps/storefront/`)

**ສ້າງໃໝ່**
- `vitest.config.ts`, `vitest.setup.ts`
- `src/lib/types.ts` (ຮູບຮ່າງ DTO ຂອງ `/store/*`), `src/lib/store-api.ts` (+ test), `src/lib/format.ts` (+ test), `src/lib/variants.ts` (+ test), `src/lib/site.ts`
- `src/components/`: `site-header.tsx`, `site-footer.tsx`, `product-card.tsx` (+ test), `product-grid.tsx`, `category-nav.tsx`, `pagination-nav.tsx` (+ test), `stock-badge.tsx`, `price.tsx`, `product-gallery.tsx`, `variant-picker.tsx` (+ test)
- `src/app/`: `products/page.tsx`, `products/[slug]/page.tsx`, `not-found.tsx`, `error.tsx`, `sitemap.ts`, `robots.ts` (ບໍ່ມີ `loading.tsx`: ຂອບ Suspense ຂອງມັນເຮັດໃຫ້ສິນຄ້າທີ່ບໍ່ມີຕອບ 200 ແທນ 404)

**ແກ້**
- `package.json` (deps + script `test`), `next.config.ts` (rewrites), `src/app/layout.tsx`, `src/app/page.tsx`
- root `.env.example` (`STOREFRONT_URL`)

### Task 1: ໂຄງ + ເຄື່ອງມື
- [x] deps: `@oca/shared`, `lucide-react`; dev: vitest, jsdom, testing-library, plugin-react. `vitest.config.ts` + setup ແບບດຽວກັບ admin. script `test`.
- [x] `next.config.ts`: rewrite `/api/:path*` ແລະ `/media/:path*` → `API_URL`.
- [x] `format.test.ts` (RED→GREEN): `formatLak("12500.00")="12,500 ກີບ"`, ຕັດ `.00`, ເກັບທົດສະນິຍົມທີ່ບໍ່ແມ່ນ 0, `priceRange` (ຄ່າດຽວ/ຊ່ວງ).
- [x] `store-api.test.ts` (RED→GREEN): ສ້າງ URL + query ຖືກ, ສົ່ງ `next.revalidate`, 404 → `null`, status ອື່ນ throw, ບໍ່ຕັ້ງ `API_URL` ໃຊ້ `http://localhost:3001`. commit.

### Task 2: component ສະແດງຜົນ
- [x] `product-card.test.tsx` (RED→GREEN): ຊື່ + ລິ້ງ `/products/<slug>`, ຊ່ວງລາຄາ, ລາຄາກ່ອນຫຼຸດຂີດຂ້າ, ປ້າຍ "ໝົດ"/"ໃກ້ໝົດ", ບໍ່ມີຮູບ = placeholder.
- [x] `pagination-nav.test.tsx` (RED→GREEN): ຮັກສາ `category`/`q` ໃນລິ້ງ, ໜ້າ 1 ບໍ່ມີ `page`, ບໍ່ສະແດງເມື່ອມີໜ້າດຽວ, `aria-current`.
- [x] `stock-badge`, `price`, `product-grid`, `category-nav`, `site-header` (ຊື່ຮ້ານ + ຟອມຄົ້ນຫາ GET `/products`), `site-footer`. commit.

### Task 3: ເລືອກ variant
- [x] `variants.test.ts` (RED→GREEN): `findVariant` ຕາມ selection, `initialSelection` (variant ທຳອິດທີ່ມີຂອງ), `isValueAvailable` (ຄ່າທີ່ບໍ່ມີ variant ຮອງຮັບ ຫຼື ໝົດ).
- [x] `variant-picker.test.tsx` (RED→GREEN): ກົດຄ່າ → ລາຄາ + ສະຖານະສະຕ໋ອກປ່ຽນ, ຄ່າທີ່ເລືອກມີ `aria-pressed`, ຄ່າທີ່ບໍ່ມີ variant ຖືກ disable, ສິນຄ້າບໍ່ມີ option ສະແດງລາຄາເລີຍ, "ເຫຼືອ N ອັນ".
- [x] `product-gallery.tsx` (ຮູບຫຼັກ + thumbnail). commit.

### Task 4: ໜ້າ + SEO
- [x] `layout.tsx` (header/footer, metadata ຈາກ `/store/config`, `metadataBase`), `/`, `/products`, `/products/[slug]` (+ `generateMetadata`, `notFound()`), `not-found`, `error`, `loading`, `sitemap.ts`, `robots.ts` (`/orders/` ຖືກ disallow).
- [x] `pnpm --filter @oca/storefront test`, `typecheck`, `lint`, `build` (ບໍ່ມີ API ກໍ build ຜ່ານ).
- [x] ກວດຈິງ: ເປີດ API + storefront ກັບຖານ test, `curl` ໜ້າ `/`, `/products`, `/products/<slug>`, `/sitemap.xml` ແລ້ວກວດ HTML. commit.

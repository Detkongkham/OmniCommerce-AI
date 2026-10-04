# 🎨 DESIGN.md — ລະບົບການອອກແບບຂອງ OmniCommerce AI (OCA)

> ເອກະສານນີ້ແມ່ນ **ມາດຕະຖານການອອກແບບ UI** ຂອງ OCA. ທຸກຄ່າໃນນີ້ຖືກແກະອອກມາຈາກໂຄດຈິງຂອງ `mts-admin` (MTS Admin v3 — Vite + React 19 + Tailwind v4 + shadcn/ui, ~150 ໜ້າ, ~298,000 ແຖວ) ແລ້ວປັບໃຫ້ເຂົ້າກັບ OCA.
>
> - **ແຫຼ່ງອ້າງອີງ:** `/Users/ta/mts/mts-admin` — `src/index.css`, `src/components/ui/*`, `src/pages/Layout.tsx`, `src/pages/sections/*`, `src/pages/DesignSystemPage.tsx` ແລະ ໜ້າຕ່າງໆ.
> - **ວັນທີແກະ:** 2026-10-04
> - **ນຳໃຊ້ກັບ:** `apps/admin` (ຫຼັກ), `apps/storefront` (ສະເພາະ token), `packages/ui` (component ທີ່ໃຊ້ຮ່ວມ).
> - **Theme ສີ:** ໂຄງສ້າງມາຈາກ MTS ແຕ່ **ໂທນສີເປັນມ່ວງຕາມໂລໂກ້ OCA** ([`assets/oca-logo.jpg`](assets/oca-logo.jpg)) ແທນ indigo ຂອງ MTS — ເບິ່ງ §3.0.
> - ຕົວເລກ `×N` ໃນເອກະສານ = ຈຳນວນຄັ້ງທີ່ class ນັ້ນ (ຫຼື class ສີ indigo/navy ຝັ່ງ MTS ທີ່ມີບົດບາດດຽວກັນ) ຖືກໃຊ້ໃນ `mts-admin/src/**/*.tsx` (ບໍ່ນັບ test). ໃຊ້ເພື່ອບອກວ່າຄ່າໃດແມ່ນ "ຄ່າຫຼັກ" ແທ້ໆ.

---

## ສາລະບານ

1. [ຫຼັກການອອກແບບ](#1-ຫຼັກການອອກແບບ)
2. [Tech stack ດ້ານ UI](#2-tech-stack-ດ້ານ-ui)
3. [ສີ (Color)](#3-ສີ-color)
4. [ຕົວໜັງສື (Typography)](#4-ຕົວໜັງສື-typography)
5. [Spacing, ຂະໜາດ ແລະ Grid](#5-spacing-ຂະໜາດ-ແລະ-grid)
6. [Radius, Border, Shadow](#6-radius-border-shadow)
7. [Z-index ແລະ ຊັ້ນຂອງໜ້າຈໍ](#7-z-index-ແລະ-ຊັ້ນຂອງໜ້າຈໍ)
8. [ໂຄງໜ້າຈໍ (App Shell)](#8-ໂຄງໜ້າຈໍ-app-shell)
9. [Component ພື້ນຖານ](#9-component-ພື້ນຖານ)
10. [Component ສະເພາະລະບົບ](#10-component-ສະເພາະລະບົບ)
11. [Page pattern](#11-page-pattern)
12. [Motion ແລະ Animation](#12-motion-ແລະ-animation)
13. [Dark mode](#13-dark-mode)
14. [Icon ແລະ ຮູບພາບ](#14-icon-ແລະ-ຮູບພາບ)
15. [Chart ແລະ Data viz](#15-chart-ແລະ-data-viz)
16. [ພາສາ, ຕົວເລກ ແລະ ເນື້ອຫາ](#16-ພາສາ-ຕົວເລກ-ແລະ-ເນື້ອຫາ)
17. [Accessibility](#17-accessibility)
18. [Print](#18-print)
19. [ຈຸດບໍ່ສອດຄ່ອງໃນຕົ້ນສະບັບ ແລະ ຂໍ້ຕັດສິນສຳລັບ OCA](#19-ຈຸດບໍ່ສອດຄ່ອງໃນຕົ້ນສະບັບ-ແລະ-ຂໍ້ຕັດສິນສຳລັບ-oca)
20. [ການນຳໄປໃຊ້ໃນ OCA](#20-ການນຳໄປໃຊ້ໃນ-oca)
21. [ພາກຜະໜວກ: `globals.css` ພ້ອມໃຊ້](#21-ພາກຜະໜວກ-globalscss-ພ້ອມໃຊ້)

---

## 1. ຫຼັກການອອກແບບ

| # | ຫຼັກການ | ຄວາມໝາຍໃນທາງປະຕິບັດ |
|---|---|---|
| 1 | **ມ່ວງ (ຕາມໂລໂກ້) ເປັນສີດຽວທີ່ນຳ** | ສີຫຼັກ `#7e22ce` ໃຊ້ກັບ CTA, active state, link, focus ring. ສີອື່ນມີໄວ້ສື່ "ຄວາມໝາຍ" (ສຳເລັດ/ເຕືອນ/ຜິດພາດ) ເທົ່ານັ້ນ. |
| 2 | **ແບນ, ບໍ່ມີເງົາ** | Card ໃຊ້ `border` 1px + `shadow-none` (×399). ເງົາສະຫງວນໄວ້ໃຫ້ສິ່ງທີ່ "ລອຍ" ແທ້: dropdown, modal, toast. |
| 3 | **ພື້ນຫຼັງ 3 ຊັ້ນ** | App `#faf8ff` → Card `#ffffff` → ພື້ນຍ່ອຍໃນ card `#f8fafc`. ຄວາມເລິກມາຈາກສີພື້ນ, ບໍ່ແມ່ນເງົາ. |
| 4 | **ມົນຫຼາຍ** | Card `rounded-2xl`/`rounded-[20px]`, ປຸ່ມ-input `rounded-xl`/`rounded-lg`, badge `rounded-full`. ບໍ່ມີມຸມແຫຼມ ຍົກເວັ້ນ cell ຕາຕະລາງ. |
| 5 | **ໜາແໜ້ນ ແຕ່ອ່ານງ່າຍ** | ເປັນລະບົບຫຼັງບ້ານ: ແຖວຕາຕະລາງ `py-3`, ຕົວຄວບຄຸມສູງ 36px. ຟອນຖືກຂະຫຍາຍ +2px ເພາະໂຕອັກສອນລາວຕ້ອງການພື້ນທີ່ຫຼາຍກວ່າ Latin. |
| 6 | **ລາວກ່ອນ, ສອງພາສາສະເໝີ** | ທຸກ label ມີ `lo` ແລະ `en`. ຟອນຫຼັກແມ່ນ Noto Sans Lao. |
| 7 | **Sticky chrome** | Topbar ຕິດເທິງ (64px), sidebar ຕິດຊ້າຍ, ຫົວໜ້າ (ຊື່ໜ້າ + ປຸ່ມ) ຕິດໃຕ້ topbar ດ້ວຍ `backdrop-blur`. |
| 8 | **ສີອ່ອນ + ຂອບ + ຕົວໜັງສືເຂັ້ມ** ສຳລັບສະຖານະ | Badge/alert ທຸກອັນໃຊ້ສູດ 3 ສີ: ພື້ນ tint, ຂອບ tint ເຂັ້ມຂຶ້ນ, ຕົວໜັງສືສີເຕັມ. ບໍ່ໃຊ້ພື້ນສີເຕັມ ຍົກເວັ້ນ count badge. |
| 9 | **AI ມີພາສາພາບຂອງຕົນເອງ** | ສິ່ງທີ່ AI ສ້າງ/ກຳລັງສ້າງ ໃຊ້ຂອບ rainbow gradient + ໄອຄອນ Sparkles, ແຍກຈາກ UI ປົກກະຕິຢ່າງຊັດເຈນ. |
| 10 | **Light + Dark ເທົ່າທຽມກັນ** | ທຸກພື້ນຜິວຕ້ອງມີຄູ່ dark. Dark ບໍ່ແມ່ນສີດຳ ແຕ່ເປັນມ່ວງເຂັ້ມເກືອບດຳ `#100c1c`. |

---

## 2. Tech stack ດ້ານ UI

| ເລື່ອງ | mts-admin (ຕົ້ນສະບັບ) | OCA (ນຳໃຊ້) |
|---|---|---|
| Framework | Vite 7 + React 19 SPA, Wouter | Next.js App Router (`apps/admin`, `apps/storefront`) |
| Styling | Tailwind CSS v4 ຜ່ານ `@tailwindcss/vite`, ບໍ່ມີ `tailwind.config.js`, token ຢູ່ໃນ `@theme inline` | Tailwind v4 ຜ່ານ `@tailwindcss/postcss`, token ຢູ່ `globals.css` |
| Component | shadcn/ui style **`new-york`**, baseColor `neutral`, `cssVariables: true` | ຄືກັນ, ວາງໄວ້ໃນ `packages/ui` |
| Primitive | Radix UI (27 package) | ຄືກັນ |
| Variant | `class-variance-authority` + `cn()` (`clsx` + `tailwind-merge`) | ຄືກັນ |
| Animation | `tw-animate-css`, `framer-motion`, keyframe ໃນ CSS | ຄືກັນ |
| Icon | `lucide-react` (ຫຼັກ), `react-icons` (ສຳຮອງ) | `lucide-react` ເທົ່ານັ້ນ |
| Chart | `recharts` | `recharts` |
| Form | `react-hook-form` + `zod` | ຄືກັນ (schema ຢູ່ `packages/shared`) |
| Toast | Radix Toast ທີ່ແຕ່ງເອງ (`use-toast`) + `sonner` | ເລືອກ **ອັນດຽວ**: Radix Toast ແບບ MTS (ເບິ່ງ §9.11) |
| Theme | Hook `useTheme` ຂຽນເອງ, toggle class `.dark` ທີ່ `<html>` | `next-themes` (`attribute="class"`) |
| ອື່ນໆ | `cmdk`, `vaul`, `react-day-picker`, `embla-carousel`, `react-resizable-panels`, `input-otp`, `@tanstack/react-virtual`, `@xyflow/react`, `leaflet` | ຕິດຕັ້ງເມື່ອຕ້ອງການ; OCA ເພີ່ມ Fabric.js ສຳລັບ Image Studio |

`cn()` ຕ້ອງໃຊ້ທຸກຄັ້ງທີ່ລວມ class:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 3. ສີ (Color)

### 3.0 ສີຈາກໂລໂກ້ (ຕົ້ນກຳເນີດຂອງ theme)

ໂລໂກ້: [`docs/assets/oca-logo.jpg`](assets/oca-logo.jpg). ສີຂ້າງລຸ່ມຖືກວັດຈາກ pixel ຂອງຮູບໂດຍກົງ (ໂທນມ່ວງ hue 255°–280°):

| ສ່ວນຂອງໂລໂກ້ | ສີທີ່ວັດໄດ້ | Token ຂອງ OCA | ຄ່າທີ່ໃຊ້ |
|---|---|---|---|
| ເງົາເລິກສຸດຂອງຕົວ C | `#0c0030` – `#18003c` | ພື້ນຫຼັງໜ້າ Login (ຈຸດເລີ່ມ gradient) | `#0c0030` |
| ຕົວໜັງສື "OMNICOMMERCE AI", ສ່ວນເຂັ້ມຂອງ C (ສີທີ່ມີຫຼາຍສຸດ) | `#300c6c` / `#301068` | `brand-deep` — wordmark, ພື້ນ tint ໃນ dark | `#2e1065` |
| ສ່ວນກາງຂອງ C | `#481884` – `#541890` | `brand-pressed` | `#581c87` |
| ສ່ວນກາງ-ສະຫວ່າງ | `#60189c` | `brand-hover` | `#6b21a8` |
| — | (ລະຫວ່າງ `#60189c` ແລະ `#8430b4`) | **`brand` / primary** | **`#7e22ce`** |
| ຂອບສະຫວ່າງ, ວົງແຫວນ, ເສັ້ນເຄືອຂ່າຍ | `#8430b4` – `#9c3ccc` | `brand-bright` — ປາຍ gradient, accent | `#9333ea` |

Primary ຖືກເລືອກເປັນ `#7e22ce` (ບໍ່ແມ່ນສີເຂັ້ມສຸດຂອງໂລໂກ້) ເພາະຕ້ອງສົດພໍສຳລັບປຸ່ມ/link ແລະ ຍັງໄດ້ contrast ກັບຕົວໜັງສືຂາວ ~6.9:1.

**ຕາຕະລາງແປງຈາກ MTS → OCA** (ໂຄງສ້າງ ແລະ ບົດບາດຂອງສີຄືເກົ່າ, ປ່ຽນແຕ່ໂທນ). ຕົວເລກ `×N` ໃນເອກະສານນີ້ນັບຈາກ class ສີ **ຝັ່ງ MTS** ທີ່ມີບົດບາດດຽວກັນ:

| ບົດບາດ | MTS (indigo / navy) | OCA (ມ່ວງຕາມໂລໂກ້) |
|---|---|---|
| Primary | `#4f46e5` | `#7e22ce` |
| Primary hover / pressed | `#4338ca` / `#3f38b7` | `#6b21a8` / `#581c87` |
| Primary ໃນ dark (ຕົວໜັງສື) | `#a5b4fc` / `#818cf8` | `#d8b4fe` / `#c084fc` |
| Tint 100 / 200 | `#eef2ff` / `#e0e7ff` | `#faf5ff` / `#f3e8ff` |
| Nav active / chrome border | `#deddff` / `#dedcff` | `#e9d5ff` |
| Selected border | `#c7d2fe` | `#d8b4fe` |
| App background | `#f8faff` | `#faf8ff` |
| Dark: app / chrome / card | `#0f111a` / `#16192a` / `#1a1d2e` | `#100c1c` / `#17122a` / `#1c1630` |
| Dark: subtle / hover / border | `#141625` / `#1e2235` / `#2d3348` | `#151024` / `#241c3a` / `#33294d` |
| Dark: primary tint / nav active | `#1e1b4b` / `#312e5f` | `#2e1065` / `#3b1a6e` |

Indigo `#4f46e5` ຂອງ MTS ບໍ່ໄດ້ຖືກຖິ້ມ: ມັນກາຍເປັນ **ສີຮອງ** (§3.5, §3.7, §15) ສຳລັບສິ່ງທີ່ຕ້ອງແຍກອອກຈາກ brand.

### 3.1 ສີຫຼັກ — Purple (ຕາມໂລໂກ້)

| ຊື່ | Light | Dark | ໃຊ້ກັບ |
|---|---|---|---|
| **Primary** | `#7e22ce` — `hsl(272 72% 47%)` | ພື້ນ: `#7e22ce` ຄືເກົ່າ · ຕົວໜັງສື/ໄອຄອນ: `#d8b4fe` (ຫຼື `#c084fc`) | ປຸ່ມຫຼັກ, link, ໄອຄອນ active, focus ring, ໜ້າປັດຈຸບັນໃນ pagination |
| Primary hover | `#6b21a8` | `#6b21a8` | hover ຂອງປຸ່ມຫຼັກ |
| Primary pressed | `#581c87` | `#a855f7` | pressed / ຕົວເລືອກເຂັ້ມ |
| Primary 200 | `#e9d5ff` | `#3b1a6e` | ພື້ນ **nav item ທີ່ active**, ພື້ນ role badge |
| Primary 100 | `#faf5ff` (×778) | `#2e1065` | ພື້ນ tint: chip ທີ່ເລືອກ, ແຖວທີ່ເລືອກ, ກ່ອງໄອຄອນ, hover ຂອງເມນູ |
| Primary 50 | `#f3e8ff` / `#f7f0ff` / `#faf5ff` | `#251446` / `#1c1630` | hover ຂອງ nav, tag |
| Primary border | `#d8b4fe` (×169) | `#581c87` / `rgba(88,28,135,.7)` | ຂອບຂອງ element ທີ່ເລືອກ |
| Chrome border | `#e9d5ff` | `#241c3a` / `#3b1a6e` | ຂອບ sidebar, topbar, ປຸ່ມ row-action |
| Topbar button tint | `rgba(126,34,206,.05)` ພື້ນ, `.10` hover, `.15` ຂອບ | `rgba(216,180,254,.08)` / `.15` / `.20` | ປຸ່ມໃນ topbar |

**Gradient ຂອງ brand** (ໃຊ້ກັບ avatar fallback, ຫົວ profile panel, hero):

| Gradient | ×N | ໃຊ້ກັບ |
|---|---|---|
| `from-[#581c87] to-[#9333ea]` (`bg-gradient-to-br`) — ໄລ່ສີແບບຕົວ C ຂອງໂລໂກ້ | 37 | avatar, ໄອຄອນເດັ່ນ, banner |
| `from-[#7e22ce] via-[#8b2bdc] to-[#9333ea]` | 5 | ຫົວ profile dropdown |
| `from-[#faf5ff] via-[#f7f0ff] to-[#f3e8ff]` | 3 | ຫົວ card ແບບອ່ອນ (stepper, AI panel) |
| `from-[#0c0030] via-[#1c0a47] to-[#2e1065]` | — | ພື້ນຫຼັງໜ້າ Login |

### 3.2 ພື້ນຜິວ (Surface)

| ຊັ້ນ | Light | Dark | ໃຊ້ກັບ |
|---|---|---|---|
| **App background** | `#faf8ff` (×613) | `#100c1c` (×599) | ພື້ນຂອງທຸກໜ້າ, sticky page header (`/90` + blur) |
| **Chrome** (sidebar, topbar) | `#ffffff` | `#17122a` (×267) | sidebar, topbar, footer ຂອງ sidebar |
| **Card / Surface** | `#ffffff` | `#1c1630` (×1542 — class ທີ່ໃຊ້ຫຼາຍສຸດ) | card, modal, dropdown, input |
| **Subtle** (ໃນ card) | `#f8fafc` (×813) | `#151024` / `#151024` / `#120d20` | ຫົວຕາຕະລາງ, footer ຂອງ modal, ກ່ອງຍ່ອຍ, input ຄົ້ນຫາ |
| **Muted** | `#f1f5f9` (×578) | `#241c3a` / `#2a2145` | hover ຂອງແຖວ/ເມນູ, track ຂອງ progress, chip ກາງໆ |
| **Divider fill** | `#e2e8f0` | `#33294d` | ເສັ້ນຄັ່ນ, skeleton ເກົ່າ |
| Popover panel (ພິເສດ) | `#ffffff` | `#100c1c` | profile panel, notification panel (dark ໃຊ້ສີ app ເພື່ອໃຫ້ຕັດກັບ chrome) |
| Overlay | `bg-black/40`–`/60` + `backdrop-blur-sm` (modal ຂຽນເອງ) · `bg-black/80` (Radix Dialog) | ຄືກັນ | ພື້ນຫຼັງ modal |

### 3.3 ຕົວໜັງສື

| ບົດບາດ | Light | Dark | ×N (light) |
|---|---|---|---|
| **Heading / ເນັ້ນ** | `#1e293b` | `#ffffff` ຫຼື `#e2e8f0` | 1990 |
| Body ໃນຕາຕະລາງ/ຟອມ | `#202020` | `#e2e8f0` | 800 |
| Heading ເຂັ້ມສຸດ (modal title) | `#0f172a` | `#ffffff` | 120 |
| **Secondary** (ຄຳອະທິບາຍ, label) | `#64748b` | `#94a3b8` | 3583 |
| Secondary ເຂັ້ມ (nav ບໍ່ active, body ຮອງ) | `#475569` | `#94a3b8` | 550 |
| Table header | `#374151` | `#cbd5e1` | 379 |
| **Muted** (placeholder, ໄອຄອນບໍ່ active, hint) | `#94a3b8` | `#64748b` | 3536 |
| Disabled / ເສັ້ນຄັ່ນ breadcrumb | `#cbd5e1` | `#475569` | 346 |
| Link / accent | `#7e22ce` | `#d8b4fe` | 1715 |
| ເທິງພື້ນສີເຕັມ | `#ffffff` | `#ffffff` | — |

### 3.4 ຂອບ (Border)

| ບົດບາດ | Light | Dark | ×N |
|---|---|---|---|
| **Default** | `#e2e8f0` | `#33294d` | 3485 / 2248 |
| Hairline (ແຖວຕາຕະລາງ, divider ໃນ dropdown) | `#f1f5f9` | `#241c3a` | 352 |
| Strong (checkbox, input hover) | `#cbd5e1` | `#463a63` | 96 |
| Active / focus | `#7e22ce` | `#7e22ce` | 646 |
| Selected tint | `#d8b4fe` | `#581c87` | 169 |

### 3.5 ສີຄວາມໝາຍ (Semantic) — ສູດ 3 ສີ

ທຸກສະຖານະປະກອບດ້ວຍ **ພື້ນ tint + ຂອບ + ຕົວໜັງສື**. ນີ້ຄືຄ່າທີ່ໃຊ້ຈິງຫຼາຍທີ່ສຸດ:

| ຄວາມໝາຍ | ພື້ນ (light) | ພື້ນເຂັ້ມຂຶ້ນ | ຂອບ | ຕົວໜັງສື / ໄອຄອນ | ຕົວໜັງສືເຂັ້ມ | Solid (ປຸ່ມ, dot) |
|---|---|---|---|---|---|---|
| **Success** | `#f0fdf4` | `#dcfce7` | `#bbf7d0` | `#16a34a` | `#15803d` / `#166534` | `#16a34a`, `#059669` |
| **Warning** | `#fffbeb` | `#fef3c7` | `#fde68a` | `#d97706` | `#b45309` / `#92400e` | `#f59e0b` |
| **Orange** (ໃກ້ໝົດ, ຄ້າງ) | `#fff7ed` | — | `#fed7aa` | `#ea580c` | `#c2410c` / `#9a3412` | `#f97316` |
| **Danger** | `#fef2f2` | `#fee2e2` | `#fecaca` | `#dc2626` | `#b91c1c` / `#991b1b` | `#dc2626`, `#ef4444` |
| **Info** | `#eff6ff` | `#dbeafe` | `#bfdbfe` | `#2563eb` | `#1d4ed8` / `#1e40af` | `#2563eb`, `#0ea5e9` |
| **Sky / Cyan** | `#f0f9ff` / `#ecfeff` | `#e0f2fe` | `#bae6fd` / `#a5f3fc` | `#0284c7` / `#0891b2` | `#0369a1` / `#075985` | `#06b6d4` |
| **Primary** | `#faf5ff` | `#f3e8ff` | `#d8b4fe` | `#7e22ce` | `#6b21a8` / `#581c87` | `#7e22ce` |
| **Indigo** (ສີຮອງ, ແຍກຈາກ brand) | `#eef2ff` | `#e0e7ff` | `#c7d2fe` | `#4f46e5` | `#4338ca` / `#3730a3` | `#4f46e5` |
| **Neutral** | `#f8fafc` | `#f1f5f9` | `#e2e8f0` | `#64748b` | `#475569` | `#94a3b8` |

**ຄູ່ dark** (ມາຈາກຊັ້ນ override ໃນ `index.css`):

| ຄວາມໝາຍ | ພື້ນ dark | ຂອບ dark | ຕົວໜັງສື dark |
|---|---|---|---|
| Success | `rgba(20,50,35,.6)` · ເຂັ້ມ `rgba(6,78,59,.4)` | `rgba(40,100,65,.6)` | `#86efac` / `#6ee7b7` |
| Warning | `rgba(42,31,4,1)` · ເຂັ້ມ `rgba(69,26,3,1)` | `rgba(120,75,20,.6)` | `#fbbf24` / `#fcd34d` |
| Orange | `rgba(70,35,10,.5)` | `rgba(135,70,25,.6)` | `#fdba74` |
| Danger | `rgba(80,25,30,.5)` · ເຂັ້ມ `rgba(90,30,35,.55)` | `rgba(140,50,55,.6)` | `#fca5a5` |
| Info | `rgba(15,35,65,.55)` · ເຂັ້ມ `rgba(30,50,95,.55)` | `rgba(45,70,130,.6)` | `#93c5fd` |
| Sky / Cyan | `rgba(15,30,50,.5)` / `rgba(15,40,50,.5)` | `rgba(40,80,130,.6)` / `rgba(35,90,110,.6)` | `#7dd3fc` |
| Primary | `rgba(46,16,101,.6)` | `rgba(88,28,135,.7)` | `#d8b4fe` |
| Indigo | `rgba(35,33,70,1)` | `rgba(60,60,130,.6)` | `#a5b4fc` |

ເມື່ອໃຊ້ Tailwind palette ແທນ hex, ສູດທີ່ພົບຫຼາຍສຸດແມ່ນ: `bg-{c}-50 text-{c}-700 dark:bg-{c}-900/30 dark:text-{c}-400` (ເຊັ່ນ `bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`).

### 3.6 ສີສະຖານະ workflow (ສຳລັບ dot / label ສີດຽວ)

ຈາກ `lib/workflowStatusMap.ts` — ສີດຽວຕໍ່ສະຖານະ, ໃຊ້ກັບ dot, timeline, ຕົວໜັງສື:

| ສະຖານະ | ສີ | ລາວ | English |
|---|---|---|---|
| draft | `#94a3b8` | ຮ່າງ | Draft |
| submitted | `#0ea5e9` | ສົ່ງແລ້ວ | Submitted |
| ຂັ້ນກວດສອບ / ລໍອະນຸມັດ (ຕົ້ນສະບັບ: `manager_review`, `director_approval`) | `#f59e0b` | ກຳລັງກວດສອບ | In Review |
| approved | `#16a34a` | ອະນຸມັດແລ້ວ | Approved |
| rejected | `#dc2626` | ຖືກປະຕິເສດ | Rejected |
| ບໍ່ຮູ້ຈັກ | `#94a3b8` | (ສະແດງຄ່າດິບ ຫຼື `—`) | |

### 3.7 ສີ step (ສຳລັບ stepper / ຂັ້ນຕອນຫຼາຍຂັ້ນ)

ໝູນວຽນ 5 ສີຕາມລຳດັບ, ແຕ່ລະສີມີ 4 ຄ່າ (solid / text / tint / border):

| # | Solid & text | Tint | Border |
|---|---|---|---|
| 1 | `#7e22ce` | `#faf5ff` | `#d8b4fe` |
| 2 | `#0891b2` | `#ecfeff` | `#a5f3fc` |
| 3 | `#16a34a` | `#f0fdf4` | `#bbf7d0` |
| 4 | `#d97706` | `#fffbeb` | `#fde68a` |
| 5 | `#4f46e5` | `#eef2ff` | `#c7d2fe` |

### 3.8 ສີ AI

Rainbow gradient ສຳລັບທຸກສິ່ງທີ່ກ່ຽວກັບ AI:

```
linear-gradient(120deg, #06b6d4, #22c55e, #f59e0b, #ec4899, #7e22ce, #06b6d4)
```

- ຕົວໜັງສືປຸ່ມ AI: `#0f172a` (dark: `#e0f2fe`); ພື້ນ: `#ffffff` (dark: `#0f172a`)
- ເງົາ: `0 8px 20px rgba(14,165,233,.12)` → hover `0 10px 24px rgba(14,165,233,.18)`
- Label "AI ກຳລັງ generate": ຕົວໜັງສື `#075985` (dark `#bae6fd`), ຂອບ `rgba(14,165,233,.28)`, ພື້ນ `rgba(255,255,255,.9)` + blur 8px
- ປຸ່ມ AI ແບບ toggle (ບໍ່ rainbow): ຂອບ `#9333ea`, ພື້ນ `#faf5ff`, ຕົວໜັງສື `#9333ea`

### 3.9 shadcn token (HSL)

| Token | Light | Dark |
|---|---|---|
| `--background` | `0 0% 100%` | `255 40% 8%` |
| `--foreground` | `222.2 84% 4.9%` | `210 40% 98%` |
| `--card` / `--popover` | `0 0% 100%` | `254 37% 14%` |
| `--primary` | `272 72% 47%` | `272 72% 47%` |
| `--primary-foreground` | `210 40% 98%` | `210 40% 98%` |
| `--secondary` / `--muted` / `--accent` | `210 40% 96.1%` | `257 31% 23%` |
| `--secondary-foreground` / `--accent-foreground` | `222.2 47.4% 11.2%` | `210 40% 98%` |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` |
| `--destructive` | `0 84.2% 60.2%` | `0 62.8% 55%` |
| `--border` / `--input` | `214.3 31.8% 91.4%` | `257 31% 23%` |
| `--ring` | `272 72% 47%` | `270 95% 75%` |
| `--radius` | `0.5rem` | — |
| `--chart-1…5` | `12 76% 61%` · `173 58% 39%` · `197 37% 24%` · `43 74% 66%` · `27 87% 67%` | `220 70% 50%` · `160 60% 45%` · `30 80% 55%` · `280 65% 60%` · `340 75% 55%` |
| `--sidebar*` | ຄືກັບ card / accent / primary | ຄືກັບ card dark |

---

## 4. ຕົວໜັງສື (Typography)

### 4.1 ຟອນ

| ບົດບາດ | Stack | ທີ່ມາ |
|---|---|---|
| **Sans (ຫຼັກ)** | `"Noto Sans Lao", "Inter", Helvetica, sans-serif` | Google Fonts: Inter 300–700, Noto Sans Lao 300–700 + ຟາຍ local `/fonts/NotoSansLao-Regular.ttf` (`font-display: swap`) |
| ເອກະສານທາງການ | `"Phetsarath OT", "Noto Sans Lao", "Times New Roman", serif` — class `.font-phetsarath` | `/fonts/Phetsarath-Regular.ttf` |
| Serif | `Georgia, serif` | ລະບົບ |
| Mono | `Menlo, monospace` | ລະບົບ — ໃຊ້ກັບ ID, ລະຫັດ, ຈຳນວນເງິນໃນຕາຕະລາງ |

`*` ແລະ `body` ຖືກບັງຄັບເປັນ `"Noto Sans Lao", sans-serif`. Recharts ກໍຖືກບັງຄັບດ້ວຍ `!important`. `body` ເປີດ `-webkit-font-smoothing: antialiased`.

### 4.2 ຂະໜາດ — scale ທີ່ຖືກຂະຫຍາຍ +2px

ຕົ້ນສະບັບ override scale ຂອງ Tailwind ໃຫ້ໃຫຍ່ຂຶ້ນ 2px ທຸກຂັ້ນ ເພື່ອໃຫ້ອັກສອນລາວອ່ານງ່າຍ. **`text-xs` ບໍ່ແມ່ນ 12px ແຕ່ເປັນ 14px.**

| Class | Tailwind ປົກກະຕິ | **ໃນລະບົບນີ້** | Line-height | ×N |
|---|---|---|---|---|
| `text-xs` | 12 | **14px** | 18px | 4929 |
| `text-sm` | 14 | **16px** | 22px | 3268 |
| `text-base` | 16 | **18px** | 26px | 389 |
| `text-lg` | 18 | **20px** | 30px | 204 |
| `text-xl` | 20 | **22px** | 30px | 178 |
| `text-2xl` | 24 | **26px** | 34px | 199 |
| `text-3xl` | 30 | **32px** | 38px | 27 |
| `text-4xl` | 36 | **38px** | 42px | 3 |
| `text-5xl` / `6xl` | 48 / 60 | **50 / 62px** | 1 | — |

ຂະໜາດ arbitrary (`text-[Npx]`) **ບໍ່ຖືກຂະຫຍາຍ** — ໃຊ້ເມື່ອຕ້ອງການຄວາມແມ່ນຍຳລະດັບ pixel:

| Class | ×N | ໃຊ້ກັບ |
|---|---|---|
| `text-[10px]` | 1743 | micro label, count badge, table header ແບບ uppercase, chip ນ້ອຍ |
| `text-[11px]` | 1389 | caption, badge, hint, ຂໍ້ຄວາມຮອງໃນຕາຕະລາງ |
| `text-[12px]` | 342 | label ຂອງ KPI, ປຸ່ມນ້ອຍ |
| `text-[9px]` | 233 | ຕ່ຳສຸດທີ່ອະນຸຍາດ (tag ໃນ card ແໜ້ນໆ) |
| `text-[13px]` | 201 | ລາຍການເມນູ dropdown, ຄຳອະທິບາຍ modal |
| `text-[14px]` | 44 | ລາຍການ sidebar |
| `text-[15px]` | 40 | ຊື່ card, ຊື່ໃນ profile panel |
| `text-[24px]` | 35 | ຊື່ໜ້າ (ຕາມ Figma: 24px / line-height 1.334) |

### 4.3 ນ້ຳໜັກ

`font-semibold` ×2915 · `font-bold` ×2170 · `font-medium` ×1948 · `font-normal` ×744 · `font-extrabold` ×60 · `font-black` ×17.

### 4.4 ບົດບາດຂອງຕົວໜັງສື (ໃຊ້ອັນນີ້ເປັນມາດຕະຖານ)

| ບົດບາດ | Class | ຂະໜາດຈິງ |
|---|---|---|
| **Page title** | `text-2xl font-bold text-[#1e293b] dark:text-white leading-tight` | 26px / 700 |
| Page title (ແບບ Figma, responsive) | `text-base sm:text-[24px] font-semibold text-[#202020] leading-[1.334]` | 18 → 24px |
| Page subtitle | `text-sm text-[#64748b] mt-0.5` | 16px |
| Breadcrumb | `text-sm text-[#64748b]`; ໜ້າປັດຈຸບັນ `text-[#7e22ce] font-medium` | 16px |
| Section / card title | `text-base font-bold text-[#1e293b] dark:text-white` (ຫຼື `font-semibold`) | 18px |
| Card title ນ້ອຍ | `text-sm font-bold` ຫຼື `text-[15px] font-bold` | 16 / 15px |
| Card description | `text-xs text-[#94a3b8]` | 14px |
| **Body** | `text-sm text-[#1e293b]` | 16px |
| Body ໃນຕາຕະລາງ | `text-xs text-[#202020] dark:text-[#e2e8f0]` | 14px |
| ຂໍ້ຄວາມຮອງໃນ cell | `text-[11px] text-[#64748b] dark:text-[#94a3b8] leading-tight` | 11px |
| **Table header** | `text-xs font-semibold text-[#374151] whitespace-nowrap` | 14px |
| Table header (ແບບ uppercase) | `text-[10px] font-bold uppercase tracking-wider text-[#6b7280]` | 10px |
| **Form label** | `text-xs font-semibold text-[#64748b] mb-1 block` | 14px |
| Form label (ແບບໃຫຍ່) | `block text-sm font-medium text-[#1e293b] dark:text-white mb-1.5` | 16px |
| KPI value | `text-xl font-bold` (ນ້ອຍ) · `text-3xl font-bold` (ໃຫຍ່) | 22 / 32px |
| KPI label | `text-[12px] text-[#64748b] dark:text-[#94a3b8]` | 12px |
| Section eyebrow | `text-[10px]`–`[11px] font-bold uppercase tracking-wider text-[#9ca3af]` | 10–11px |
| Sidebar group title | `text-[11px] uppercase tracking-wider` | 11px |
| Sidebar item | `text-[14px] whitespace-nowrap` | 14px |
| Badge | `text-[10px]`–`[11px] font-medium`/`font-semibold`/`font-bold` | 10–11px |
| ID / ລະຫັດ / ເງິນ | `font-mono text-xs` (+ `text-[#7e22ce] font-medium` ຖ້າເປັນ link) | 14px |
| ຕົວເລກໃນ count | ເພີ່ມ `tabular-nums` | — |

ກົດ: ຂໍ້ຄວາມຍາວໃນ cell ໃຊ້ `truncate block max-w-[180px]`–`[230px]`; ຫົວຂໍ້ໃຊ້ `leading-tight` ຫຼື `leading-snug`; ຄຳອະທິບາຍໃຊ້ `leading-relaxed`.

---

## 5. Spacing, ຂະໜາດ ແລະ Grid

### 5.1 Spacing scale

ໃຊ້ scale ຂອງ Tailwind (1 ໜ່ວຍ = 4px). ຄ່າທີ່ໃຊ້ຫຼາຍ:

| ປະເພດ | ຄ່າຫຼັກ (×N) |
|---|---|
| Gap | `gap-2` (8px, ×2292) · `gap-3` (12px, ×1520) · `gap-1` (×1149) · `gap-1.5` (6px, ×1067) · `gap-4` (16px, ×585) |
| Padding ແນວນອນ | `px-3` (12px, ×3421) · `px-4` (×2066) · `px-2` (×1545) · `px-6` (×383) · `px-5` (×372) |
| Padding ແນວຕັ້ງ | `py-3` (×2877) · `py-2` (×1289) · `py-2.5` (×1087) · `py-0.5` (×613) · `py-1.5` (×418) |
| Padding ທັງໝົດ | `p-4` (16px, ×839) · `p-3` (×474) · `p-5` (20px, ×326) · `p-6` |

ຊື່ token: XS 4px (`p-1`) · SM 8px (`p-2`) · MD 12px (`p-3`) · LG 16px (`p-4`) · XL 24px (`p-6`) · 2XL 40px (`p-10`).

### 5.2 ຂະໜາດຕົວຄວບຄຸມ

| ຄວາມສູງ | Class | ×N | ໃຊ້ກັບ |
|---|---|---|---|
| 28px | `h-7` | 344 | ປຸ່ມ micro, ປຸ່ມປິດ toast, action ໃນ panel |
| 32px | `h-8` | 519 | ປຸ່ມ `sm`, ປຸ່ມ pagination, row-action, ລາຍການ sub-nav |
| **36px** | `h-9` | 858 | **ຄ່າ default**: ປຸ່ມ, input, ລາຍການ sidebar, chip ຈຳນວນທີ່ເລືອກ |
| 40px | `h-10` | 415 | ປຸ່ມ `lg`, ປຸ່ມ topbar, input ຄົ້ນຫາຫຼັກ, ປຸ່ມໃນ footer ຂອງ modal |
| 44px | `h-11` | 29 | input ແລະ ປຸ່ມໃນໜ້າ Login |

### 5.3 ຂະໜາດໄອຄອນ

`size-4` (16px, ×815) ເປັນ default · `size-3.5` (14px, ×393) ໃນປຸ່ມນ້ອຍ/dropdown · `size-5` (20px, ×228) ໃນ topbar · `size-3` (12px) ໃນ badge · sidebar ໃຊ້ `w-[18px] h-[18px]`.

ກ່ອງໄອຄອນ: `size-8 rounded-lg` (ນ້ອຍ) · `w-10 h-10 rounded-xl` (KPI) · `size-9 rounded-lg` (toast) · `size-11 rounded-full` (confirm dialog) · `w-14 h-14 rounded-full` (delete confirm).

### 5.4 Layout ຄົງທີ່

| ສ່ວນ | ຄ່າ |
|---|---|
| Topbar | ສູງ `64px` |
| Sidebar ເຕັມ | ກວ້າງ `280px` (`w-[280px] min-w-[280px] max-w-[280px]`) |
| Sidebar ຫຍໍ້ (rail) | ກວ້າງ `72px` |
| ຫົວ sidebar | `124px` (ໂລໂກ້ 92×92, `rounded-[22px]`) · rail: `76px` (ໂລໂກ້ 48×48, `rounded-xl`) |
| Footer sidebar | `h-7` (28px) |
| Content padding | `px-3 sm:px-6` (12 → 24px), ລຸ່ມ `pb-10` |
| ໄລຍະຫ່າງລະຫວ່າງ section | `space-y-6` / `gap-6` (24px); ໃນ card `gap-3`–`gap-4` |
| Breakpoint ຫຼັກ | `sm:` 640px (×1593) · `lg:` 1024px (×475, ຈຸດທີ່ sidebar ປາກົດ) · `md:` (×205) · `xl:` (×52) |

### 5.5 Grid

| Pattern | ×N | ໃຊ້ກັບ |
|---|---|---|
| `grid-cols-1 sm:grid-cols-2` | 95 | ຟອມ 2 ຖັນ |
| `grid-cols-1 lg:grid-cols-2` | 55 | chart ຄູ່ |
| `grid-cols-2 lg:grid-cols-4` / `grid-cols-2 sm:grid-cols-4` | 42 / 41 | KPI 4 ອັນ (2 ຖັນໃນມືຖື) |
| `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` | 40 | KPI 4 ອັນ (1 ຖັນໃນມືຖື) |
| `grid-cols-1 sm:grid-cols-3` / `grid-cols-1 lg:grid-cols-3` | 39 / 37 | card 3 ອັນ |

Gap ຂອງ grid: `gap-3` (KPI ແໜ້ນ) ຫຼື `gap-4` (ປົກກະຕິ).

---

## 6. Radius, Border, Shadow

### 6.1 Radius

`--radius: 0.5rem` → `rounded-sm` 4px · `rounded-md` 6px · `rounded-lg` 8px · `rounded-xl` 12px.

| Class | px | ×N | ໃຊ້ກັບ |
|---|---|---|---|
| `rounded-lg` | 8 | 2438 | ປຸ່ມໃນ toolbar, input, ປຸ່ມ pagination, ກ່ອງໄອຄອນນ້ອຍ, chip ສີ່ຫຼ່ຽມ |
| `rounded-xl` | 12 | 1864 | ປຸ່ມ CTA, input ຟອມ, ລາຍການ sidebar, dropdown panel, toast, card ຍ່ອຍ |
| `rounded-full` | ∞ | 1319 | badge ສະຖານະ, avatar, count, filter pill, dot |
| `rounded-2xl` | 16 | 661 | **card, modal, popover ໃຫຍ່** |
| `rounded-md` | 6 | 478 | default ຂອງ shadcn primitive, kbd, ປຸ່ມ micro |
| `rounded` | 4 | 319 | tag ນ້ອຍ, checkbox |
| `rounded-[20px]` | 20 | 149 | wrapper ຕາຕະລາງຫຼັກ, card ຕາມ design system ເດີມ |
| `rounded-[14px]` | 14 | 8 | ປຸ່ມໃນ topbar |
| `rounded-[22px]` | 22 | — | ໂລໂກ້ໃນ sidebar |

**ກົດຊ້ອນກັນ:** radius ຂອງລູກ ≤ radius ຂອງແມ່ − padding. Card `rounded-2xl` → ກ່ອງຂ້າງໃນ `rounded-xl` → ກ່ອງໄອຄອນ `rounded-lg`.

### 6.2 Border

| ແບບ | Class |
|---|---|
| Default | `border border-[#e2e8f0] dark:border-[#33294d]` |
| Active / selected | `border border-[#7e22ce]` |
| Accent ອ່ອນ | `border border-[#7e22ce]/30` (ຫຼື `/40` ສຳລັບປຸ່ມ `outlinePrimary`) |
| Selected tint | `border border-[#d8b4fe]` |
| Danger | `border border-[#fecaca]` ຫຼື `border-[#dc2626]/40` |
| Dashed (empty state, drop zone) | `border-2 border-dashed border-[#e2e8f0] dark:border-[#33294d]` |
| Accent ຊ້າຍ (alert banner) | `border-l-4 border-l-[#ef4444]` · `[#f59e0b]` · `[#22c55e]` · `[#3b82f6]` · `[#7e22ce]` |
| ເສັ້ນຄັ່ນຖັນຕາຕະລາງ | `divide-x divide-[#e2e8f0]` |
| ເສັ້ນຂ້າງຖັນ sticky | `shadow-[inset_1px_0_0_0_#e2e8f0]` (dark `#33294d`) |

### 6.3 Shadow

| Class / ຄ່າ | ×N | ໃຊ້ກັບ |
|---|---|---|
| `shadow-none` | 399 | **card ທັງໝົດ** (override default ຂອງ shadcn `Card`) |
| `shadow-sm` | 162 | KPI card ແບບເກົ່າ, ກ່ອງໄອຄອນໃນຫົວ card, embedded shell |
| `shadow-xl` | 41 | dropdown, row-action menu, page-size menu, ໜ້າຕ່າງ chatbot |
| `shadow-lg` | 100 | toast, FAB, avatar ເດັ່ນ |
| `shadow-2xl` | 136 | modal, ກ່ອງ Login, AI popover |
| `--MTS-drop-shadow` | — | `0 4px 24px 0 rgba(0,0,0,.08)` (`shadow-MTS-drop-shadow`) |
| `--shadow-small` | — | `0 1px 4px 0 rgba(0,0,0,.12)` (`shadow-shadow-small`) |
| Profile panel | — | `0 8px 32px rgba(126,34,206,.15)` (ເງົາສີມ່ວງ) |
| Date picker | — | `0 10px 30px rgba(16,24,40,.12), 0 2px 6px rgba(16,24,40,.06)` |
| Avatar ring | — | `0 0 0 4px rgba(255,255,255,.12)` |

---

## 7. Z-index ແລະ ຊັ້ນຂອງໜ້າຈໍ

| ຊັ້ນ | z-index | ສິ່ງທີ່ຢູ່ |
|---|---|---|
| ແຜນທີ່ (Leaflet) | `0` + `isolation: isolate` | ທຸກ map ຖືກກັກໄວ້ໃນ stacking context ຂອງຕົນເອງ |
| ເນື້ອໃນ | `1`–`2` | ຖັນ sticky ໃນຕາຕະລາງໃຊ້ `z-20` |
| Sticky page header | `z-10` (ໜ້າງ່າຍ) · `z-30` (ໜ້າທີ່ມີຕາຕະລາງ sticky) | ຊື່ໜ້າ + ປຸ່ມ |
| Popover ໃນ flow | `z-40` (backdrop ທີ່ຈັບ click) · `z-50` (panel, Radix popover/tooltip/select) | profile, notification |
| Date picker popover | `z-[1000]` | |
| **Topbar** | `z-[1010]` | |
| Backdrop sidebar ມືຖື | `z-[1020]` | `bg-black/40`, `lg:hidden` |
| **Sidebar** | `z-[1030]` | |
| Backdrop ຂອງ chatbot fullscreen | `z-[9998]` | |
| Modal, Dialog, Sheet, row-action menu, FAB, loading overlay | `z-[9999]` | |
| ຊັ້ນພິເສດເໜືອ modal | `z-[10000]` | dropdown ທີ່ເປີດຈາກໃນ modal |
| **Toast** | `z-[2147483647]` | ຢູ່ເໜືອທຸກຢ່າງສະເໝີ |

Dropdown ໃນຕາຕະລາງ/modal ຕ້ອງ **render ຜ່ານ portal** ໃສ່ `document.body` ດ້ວຍ `position: fixed` ເພື່ອບໍ່ໃຫ້ຖືກຕັດໂດຍ `overflow: hidden`.

---

## 8. ໂຄງໜ້າຈໍ (App Shell)

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │ Topbar  h-64  fixed  z-1010                          │
│  Sidebar   ├──────────────────────────────────────────────────────┤
│  w-280     │ Page header  sticky top-64  blur  z-10/30            │
│  (rail 72) │   breadcrumb · ຊື່ໜ້າ + badge · ຄຳອະທິບາຍ · [ປຸ່ມ]    │
│  fixed     ├──────────────────────────────────────────────────────┤
│  z-1030    │ Content  px-3 sm:px-6 pb-10                          │
│            │   KPI grid → toolbar → table card → pagination       │
└────────────┴──────────────────────────────────────────────────────┘
                                                    (FAB ລຸ່ມຂວາ) ●
```

### 8.1 Root

```tsx
<div className="flex w-full min-h-screen bg-[#faf8ff] dark:bg-[#100c1c]">
  {/* backdrop ມືຖື */}   <div className="fixed inset-0 bg-black/40 z-[1020] lg:hidden" />
  {/* sidebar */}        <div className="fixed left-0 top-0 h-screen z-[1030] transition-all duration-300 lg:translate-x-0 -translate-x-full" />
  {/* ຖັນຫຼັກ */}         <div className="flex flex-col flex-1 min-w-0 transition-all duration-300 lg:ml-[280px]">
    {/* topbar */}       <div className="fixed top-0 right-0 left-0 lg:left-[280px] z-[1010] transition-all duration-300" />
    {children}
  </div>
</div>
```

- ຫຍໍ້ sidebar: `lg:ml-[72px]` + `lg:left-[72px]`. ທຸກການປ່ຽນໃຊ້ `transition-all duration-300`.
- ຕ່ຳກວ່າ `lg`: sidebar ເລື່ອນອອກນອກຈໍ (`-translate-x-full`), ເປີດດ້ວຍປຸ່ມ hamburger, ປິດດ້ວຍການກົດ backdrop, ກົດ `Esc` ຫຼື ເລືອກເມນູ.
- ທຸກໜ້າຕ້ອງມີ `pt-[64px]` ເພື່ອຫຼົບ topbar.

### 8.2 Topbar

`h-[64px] px-2 sm:px-3 bg-white dark:bg-[#17122a] border-b border-[#e9d5ff] dark:border-[#241c3a]`, `flex items-center justify-between gap-2 sm:gap-3`.

**ຊ້າຍ → ຂວາ:**

1. ປຸ່ມເມນູ (ມືຖື, `lg:hidden`) / ປຸ່ມຫຍໍ້ sidebar (desktop, `hidden lg:flex`) — ໄອຄອນ SVG ຮູບແຜງ 22px ພ້ອມລູກສອນທີ່ປ່ຽນທິດ.
2. ຊື່ລະບົບ (16px, `truncate`) + ຊື່ອົງກອນ (14px, ສີ primary, `hidden sm:block`).
3. ປຸ່ມຄົ້ນຫາ: ໄອຄອນ + "ຄົ້ນຫາ..." (`text-[13px] text-[#94a3b8]`) + `<kbd>` `⌘K` — ເປີດ command palette. Shortcut: `⌘K` / `Ctrl+K`.
4. ປຸ່ມປ່ຽນພາສາ (`hidden sm:flex`): ໄອຄອນ Languages + "EN"/"ລາວ".
5. ກະດິ່ງແຈ້ງເຕືອນ + count badge.
6. ປຸ່ມ theme: ດວງຈັນ (`#7e22ce`) ໃນ light, ດວງອາທິດ (`#f59e0b`) ໃນ dark.
7. ເສັ້ນຄັ່ນຕັ້ງ `h-10` (`hidden sm:block`).
8. Profile: avatar 32px (`border-[0.79px] border-[#e9d5ff]`) + ຊື່ (14px) + role badge (`h-4 px-1.5 rounded`, ພື້ນ `#e9d5ff`, ຕົວໜັງສື primary 10px).

**ປຸ່ມ topbar ທຸກອັນໃຊ້ chrome ດຽວກັນ:**

```
w-10 h-10 rounded-[14px]
bg-[rgba(126,34,206,0.05)] hover:bg-[rgba(126,34,206,0.1)] border border-[rgba(126,34,206,0.15)]
dark:bg-[rgba(216,180,254,0.08)] dark:hover:bg-[rgba(216,180,254,0.15)] dark:border-[rgba(216,180,254,0.2)]
ໄອຄອນ: w-5 h-5 text-[#7e22ce] dark:text-[#d8b4fe]
```

**Profile panel** — `w-[290px] max-w-[92vw] rounded-2xl border border-[#e9d5ff] dark:border-[#33294d] bg-white dark:bg-[#100c1c]`, ເງົາສີມ່ວງ, `animate-in fade-in slide-in-from-top-2 duration-200`:

- **ຫົວ:** gradient `from-[#7e22ce] via-[#8b2bdc] to-[#9333ea]` + ວົງມົນຕົກແຕ່ງ 3 ວົງ (`bg-white/10`, `bg-white/5`); avatar 80px (`border-[3px] border-white/40`); ປຸ່ມກ້ອງ 24px ມຸມລຸ່ມຂວາ; ປຸ່ມລຶບຮູບປາກົດເມື່ອ hover; ຊື່ `text-[15px] font-bold text-white`; role pill `bg-white/20 border-white/30 text-[11px]`.
- **ຕົວ:** eyebrow `text-[10.5px] font-semibold uppercase tracking-widest text-[#a0aec0]`; ແຕ່ລະລາຍການ = `px-3 py-2.5 rounded-xl hover:bg-[#faf5ff]` + ກ່ອງໄອຄອນ `w-8 h-8 rounded-lg bg-[#faf5ff]` + ຂໍ້ຄວາມ `text-[13px]`.
- **ທ້າຍ:** ເສັ້ນຄັ່ນ + ປຸ່ມອອກຈາກລະບົບສີແດງ (`hover:bg-[#fef2f2]`, ໄອຄອນ/ຂໍ້ຄວາມ `#dc2626`) + ເລກເວີຊັນ `text-[10px] text-[#c4c9d4]`.

**Notification panel** — `w-[380px] max-w-[90vw] rounded-2xl`, ຫົວ `px-4 py-3 border-b`, count badge `bg-[#ef4444] text-[10px] h-5 rounded-full`, action ໃນຫົວ `h-7 text-xs rounded-lg`. Count ເທິງກະດິ່ງ: `absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#ef4444] text-white text-[10px] font-bold border-2 border-white`.

### 8.3 Sidebar

`h-screen flex flex-col bg-white dark:bg-[#17122a] border-r border-[#e9d5ff] dark:border-[#241c3a]`.

| ສ່ວນ | Spec |
|---|---|
| ຫົວ | `h-[124px]`, ໂລໂກ້ຢູ່ກາງ 92×92 `rounded-[22px] object-contain` |
| ພື້ນທີ່ scroll | `ScrollArea flex-1 px-2.5 pb-3`; `nav` = `flex flex-col gap-4` (ລະຫວ່າງກຸ່ມ) |
| ຫົວກຸ່ມ | `px-3 py-1.5 text-[11px] uppercase tracking-wider`; ສີ `#9b7fd1`; ຖ້າກຸ່ມມີໜ້າ active → `text-[#7e22ce] font-semibold` + dot `w-1.5 h-1.5 rounded-full bg-[#7e22ce]` ຢູ່ໜ້າ |
| ລາຍການ | `w-full h-9 justify-start gap-2 px-3 rounded-xl text-[14px]`; ລະຫວ່າງລາຍການ `gap-1` |
| — ບໍ່ active | ພື້ນ `bg-white dark:bg-transparent hover:bg-[#f7f0ff] dark:hover:bg-[#1c1630]`; ໄອຄອນ `#94a3b8`; ຂໍ້ຄວາມ `#475569` (dark `#94a3b8`) |
| — **active** | ພື້ນ `bg-[#e9d5ff] dark:bg-[#3b1a6e]`; ໄອຄອນ + ຂໍ້ຄວາມ `#7e22ce` (dark `#d8b4fe`) |
| — ແມ່ຂອງໜ້າ active | ພື້ນ `bg-[#faf5ff] dark:bg-[#221538]`; ຂໍ້ຄວາມ `#a593d6` |
| ໄອຄອນ | `w-[18px] h-[18px] shrink-0` |
| ລາຍການຍ່ອຍ | ຫຍັບເຂົ້າ `pl-6` + ເສັ້ນຕັ້ງ `w-px bg-[#e2e8f0]` + ປຸ່ມ `h-8 px-3 rounded-xl text-[14px]` (ບໍ່ມີໄອຄອນ) |
| ຕົວຂະຫຍາຍ | `ChevronRight w-4 h-4 text-[#94a3b8]`, ໝູນ `rotate-90` ເມື່ອເປີດ (`duration-200`) |
| Badge ຈຳນວນ | inline: `min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums`; dot ເທິງໄອຄອນ: `w-2 h-2 rounded-full absolute -top-0.5 -right-0.5`. ສີ: `bg-red-500` / `bg-amber-500` / `bg-blue-500` / `bg-emerald-500` + `text-white ring-2 ring-white dark:ring-[#100c1c]`. ເກີນ 99 ສະແດງ `99+`. |
| ທ້າຍ | `h-7 border-t`, ຂໍ້ຄວາມ `text-[11px]` ສີ primary, ຢູ່ກາງ |

**Rail (ຫຍໍ້, 72px):** ແຕ່ລະກຸ່ມເປັນປຸ່ມໄອຄອນ `w-12 h-10 rounded-xl` (ໄອຄອນ `w-5 h-5`); hover ຈະເປີດ `HoverCard` ທາງຂວາ (`side="right" sideOffset={10} w-60 p-1.5`, `openDelay 60ms / closeDelay 120ms`) ສະແດງຊື່ກຸ່ມ + ລາຍການ (`h-9 px-2.5 rounded-lg text-[13px]`).

ເມນູຖືກກັ່ນຕອງຕາມສິດ (RBAC) — ກຸ່ມທີ່ບໍ່ມີລາຍການໃຫ້ເບິ່ງຈະບໍ່ຖືກ render.

### 8.4 Loading overlay ທົ່ວລະບົບ

`fixed inset-0 z-[9999]`, ພື້ນ `bg-white/5 dark:bg-black/5 backdrop-blur-[2px]`, ໂລໂກ້ເຄື່ອນໄຫວ 160×160 (ປິດຂອບດ້ວຍ radial mask) + ຂໍ້ຄວາມ `text-sm font-medium text-[#475569]` "ກຳລັງໂຫຼດ...". ປາກົດເມື່ອ: ມີ query ກຳລັງ fetch **ຫຼື** ກຳລັງປ່ຽນ route (150ms). ໜ້າທີ່ມີ skeleton ຂອງຕົນເອງຕ້ອງປິດ overlay ນີ້; query ທີ່ refresh ໃນພື້ນຫຼັງຕ້ອງຕິດ `meta: { skipGlobalLoader: true }`.

### 8.5 FAB ຜູ້ຊ່ວຍ AI

`fixed bottom-12 right-6 z-[9999]`, ປຸ່ມ `h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 active:scale-95`, ໄອຄອນ Bot 26px. ມີວົງ pulse 2 ວົງ (`primary/0.3`, `primary/0.2`), shimmer ກວາດ, ໄອຄອນເດັ້ງ (ເບິ່ງ §12). Hover ຈະປາກົດປຸ່ມ × ນ້ອຍ (`h-6 w-6`) ເພື່ອ "ເກັບ" — ເມື່ອເກັບແລ້ວເຫຼືອແຖບ `h-12 w-7 rounded-l-lg` ຕິດຂອບຂວາ. ໜ້າຕ່າງ chat: `h-[520px] w-[360px]`, ຫົວພື້ນ primary, ຂະຫຍາຍເຕັມຈໍໄດ້ (`inset-4 sm:inset-8`).

---

## 9. Component ພື້ນຖານ

### 9.1 Button

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0`.

| Variant | Class | ໃຊ້ເມື່ອ |
|---|---|---|
| `default` | `bg-primary text-primary-foreground shadow hover:bg-primary/90` | CTA ຫຼັກ (ໜຶ່ງອັນຕໍ່ມຸມມອງ) |
| `outlinePrimary` | `border border-[#7e22ce]/40 bg-white text-[#1e293b] hover:bg-[#faf5ff] hover:border-[#7e22ce] [&_svg]:text-[#7e22ce]` | **ປຸ່ມຮອງມາດຕະຖານ**: filter, ດາວໂຫຼດ, ຕັ້ງຄ່າຖັນ, import, reset |
| `outlineDanger` | `border border-[#dc2626]/40 bg-white text-[#1e293b] hover:bg-[#fef2f2] hover:border-[#dc2626] [&_svg]:text-[#dc2626]` | ລ້າງ filter, ເອົາອອກ, ລຶບແຖວດຽວ |
| `outline` | `border border-input bg-background hover:bg-accent` | ຍົກເລີກ, ປຸ່ມກາງໆ |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90` | ຢືນຢັນການລຶບ |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | ທາງເລືອກຮອງ |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | ປຸ່ມໄອຄອນ, ລາຍການເມນູ |
| `link` | `text-primary underline-offset-4 hover:underline` | link ໃນຂໍ້ຄວາມ |

| Size | Class |
|---|---|
| `default` | `h-9 px-4 py-2` |
| `sm` | `h-8 rounded-md px-3 text-xs` |
| `lg` | `h-10 rounded-md px-8` |
| `icon` | `h-9 w-9` |

**ການປັບທີ່ໃຊ້ຈິງ** (ໃສ່ຜ່ານ `className`):

| ສະຖານະການ | Class ເພີ່ມ |
|---|---|
| CTA ໃນຫົວໜ້າ | `bg-[#7e22ce] hover:bg-[#6b21a8] text-white rounded-xl gap-2` |
| ປຸ່ມໃນ toolbar ຕາຕະລາງ | `h-9`/`h-10 px-3 rounded-lg text-xs gap-1.5` |
| ປຸ່ມໃນ footer modal | ຍົກເລີກ: `h-10 px-5 rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#64748b]` · ຢືນຢັນ: `h-10 px-6 rounded-xl bg-[#7e22ce] hover:bg-[#6b21a8] text-white text-sm font-bold` |
| ປຸ່ມລຶບ | `rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white` |
| ປຸ່ມໄອຄອນໃນແຖວ | `w-8 h-8 rounded-lg` (ghost) |
| ປຸ່ມເຕັມຄວາມກວ້າງ (Login) | `w-full h-11 rounded-lg font-bold text-base` |

**ປຸ່ມ semantic ແບບ tint:** `bg-{c}/10 border border-{c}/30 text-{c}`.
**ສະຖານະ loading:** ປ່ຽນໄອຄອນເປັນ `Loader2 size-4 animate-spin`, ປ່ຽນ label ("ກຳລັງບັນທຶກ..."), `disabled`.

### 9.2 Badge ແລະ Status pill

shadcn `Badge` base: `inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold`; variant: `default` / `secondary` / `destructive` / `outline`.

**ຮູບແບບທີ່ໃຊ້ຈິງ:**

| ປະເພດ | Class |
|---|---|
| **Status pill** (ມາດຕະຖານ) | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border` + ສີ 3 ຢ່າງ, ເຊັ່ນ `bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]` |
| Status pill ໃຫຍ່ | `gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border` |
| Status chip ສີ່ຫຼ່ຽມ | `<Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 rounded-lg text-[11px]">` |
| ໝວດໝູ່ / tag | `px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#f3e8ff] dark:bg-[#3b1a6e] text-[#7e22ce] dark:text-[#c084fc] border border-[#7e22ce]/20` |
| Badge ຂ້າງຊື່ໜ້າ | `bg-[#f3e8ff] text-[#7e22ce] px-3 py-1 rounded-full text-xs font-normal` |
| Count (solid) | `inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#7e22ce] text-white text-[10px] font-bold` (ແດງ: `bg-red-500`) |
| Count (tint, ກົດໄດ້) | `min-w-[24px] h-6 px-2 rounded-full bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#7e22ce] text-xs font-semibold` |

ໄອຄອນໃນ badge: 10–12px, ຢູ່ຊ້າຍ. ຄູ່ໄອຄອນ–ສະຖານະ: ✓ `CheckCircle2` (ສຳເລັດ) · `Clock` (ລໍຖ້າ) · `XCircle` (ປະຕິເສດ/ໝົດ) · `AlertTriangle` (ເຕືອນ/ໂຈະ).

### 9.3 Card

shadcn default ແມ່ນ `rounded-xl border bg-card shadow`, ແຕ່ **ທຸກບ່ອນ override ເປັນ**:

```
bg-white dark:bg-[#1c1630] shadow-none border border-[#e2e8f0] dark:border-[#33294d] rounded-2xl
```

| ປະເພດ | Padding / ໂຄງສ້າງ |
|---|---|
| Card ທົ່ວໄປ | `p-5` (ຫຼື `p-4` ຖ້າແໜ້ນ, `p-6` ຖ້າໂລ່ງ) |
| Card ຕາຕະລາງ | `overflow-hidden`, ບໍ່ມີ padding; ຫົວ `p-4 border-b`; ຕາຕະລາງ; footer `px-3 sm:px-6 py-3 border-t`. Radius `rounded-2xl` ຫຼື `rounded-[20px]` |
| Card ຍ່ອຍໃນ card | `p-4 rounded-xl border border-[#e2e8f0] dark:border-[#33294d] bg-[#f8fafc] dark:bg-[#151024]` |
| Card ທີ່ມີຫົວ gradient | ຫົວ `px-4 sm:px-5 py-3 bg-gradient-to-br from-[#faf5ff] via-[#f7f0ff] to-[#f3e8ff] border-b border-[#d8b4fe]` + ກ່ອງໄອຄອນ `size-8 rounded-lg bg-white border border-[#d8b4fe] shadow-sm`; ຕົວ `p-4 sm:p-5`; ຂອບ card `#e9d5ff` |
| Banner ຂໍ້ມູນ | `p-4 rounded-2xl bg-gradient-to-r from-[#ecfdf5] to-[#d1fae5] border border-[#a7f3d0]` (ປ່ຽນສີຕາມຄວາມໝາຍ) |
| Callout ໃນຟອມ | `rounded-xl border-2 border-[#fef3c7] bg-[#fffbeb] p-4` + ຫົວ `text-xs font-semibold text-[#b45309]` |

Sub-component: `CardHeader` `p-6 space-y-1.5` · `CardTitle` `font-semibold leading-none tracking-tight` · `CardDescription` `text-sm text-muted-foreground` · `CardContent` `p-6 pt-0` · `CardFooter` `flex items-center p-6 pt-0`.

### 9.4 KPI / Stat card

**ແບບ A — ແນວນອນ (ໃຊ້ຫຼາຍສຸດ):**

```tsx
<Card className="p-4 bg-white dark:bg-[#1c1630] shadow-none border border-[#e2e8f0] dark:border-[#33294d] rounded-2xl">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-[#faf5ff] flex items-center justify-center">
      <Icon className="w-5 h-5 text-[#7e22ce]" />
    </div>
    <div>
      <p className="text-[12px] text-[#64748b] dark:text-[#94a3b8]">{label}</p>
      <p className="text-xl font-bold text-[#1e293b] dark:text-white">{value}</p>
    </div>
  </div>
</Card>
```

ຄູ່ສີຂອງກ່ອງໄອຄອນ: primary `bg-[#faf5ff]`/`text-[#7e22ce]` · success `bg-emerald-50`/`text-emerald-600` · warning `bg-amber-50`/`text-amber-600` · info `bg-blue-50`/`text-blue-600` · danger `bg-red-50`/`text-red-600`.

**ແບບ B — ແນວຕັ້ງ + trend:** ກ່ອງໄອຄອນ `w-8 h-8 rounded-xl` (ພື້ນ = ສີ + alpha `18` hex ≈ 9%) ຢູ່ຊ້າຍເທິງ, trend ຢູ່ຂວາເທິງ (`text-[10px] font-bold` + `TrendingUp`/`TrendingDown` 10px, ຂຽວ/ແດງ), ຄ່າ `text-[20px] font-bold`, label `text-[11px] font-medium`, sub `text-[10px] text-[#9ca3af]`.

**ແບບ C — ໃຫຍ່ (`KpiCard`):** `rounded-2xl p-6 shadow-sm`, label `font-medium text-gray-500` ຊ້າຍ + ກ່ອງໄອຄອນ `p-3 rounded-xl` ຂວາ, ຄ່າ `text-3xl font-bold`, ການປ່ຽນແປງ `text-sm font-medium` + `ArrowUpRight`/`ArrowDownRight`.

**ແບບ D — Filter card (ກົດເພື່ອກັ່ນຕອງ):** `rounded-[20px] border p-4 cursor-pointer transition-all`; ປົກກະຕິ `border-[#e2e8f0] bg-white hover:border-[#d8b4fe]`; **active** `border-[#7e22ce] bg-[#7e22ce]/5` + ຄ່າເປັນສີ primary. ຄ່າ `text-[22px] font-bold`, label `text-[11px] text-[#6b7280] mt-1`.

### 9.5 Input, Textarea, Select

| Component | Base (shadcn) | ການປັບທີ່ໃຊ້ຈິງ |
|---|---|---|
| `Input` | `h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50` | `rounded-xl` ຫຼື `rounded-lg`; focus: `focus:ring-2 focus:ring-[#7e22ce]/20 focus:border-[#7e22ce]` |
| `Textarea` | `min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm focus-visible:ring-2` | `rounded-xl` |
| `SelectTrigger` | `h-10 rounded-md border border-input bg-background px-3 py-2 text-sm` + `ChevronDown h-4 w-4 opacity-50` | `h-9 rounded-xl` |
| `SelectContent` | `rounded-md border bg-popover`, `p-1`, animation zoom-95 + slide | `rounded-xl shadow-xl` |
| `SelectItem` | `rounded-sm py-1.5 pl-8 pr-2 text-sm focus:bg-accent` + ✓ ຢູ່ຊ້າຍ | — |

**Input ຄົ້ນຫາ:**

```tsx
<div className="relative flex-1 min-w-[240px] max-w-md">
  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#94a3b8]" />
  <input className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] text-sm text-[#202020]
                    placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#7e22ce]/20 focus:border-[#7e22ce]" />
</div>
```

**ໜ້າ Login:** `h-11 px-4 rounded-lg` + focus ດຽວກັນ. **Placeholder:** `#94a3b8`. **Disabled:** `opacity-50 cursor-not-allowed`. **Error:** ຂອບ `#dc2626` + ຂໍ້ຄວາມ `text-xs text-[#dc2626] mt-1`.

**Label:** `text-xs font-semibold text-[#64748b] mb-1 block`; ໝາຍບັງຄັບ: `<span className="text-[#dc2626]">*</span>`.

**Searchable dropdown** (combobox ຂຽນເອງ): trigger `w-full border rounded-xl px-3 py-2 text-sm` + ປຸ່ມລ້າງ `size-5 rounded-md` + chevron ໝູນ 180°; panel `rounded-xl shadow-xl border` (portal) + ຊ່ອງຄົ້ນຫາໃນຫົວ (`p-2 border-b border-[#f1f5f9]`) + ລາຍການ `max-h-[220px] overflow-y-auto py-1`; ແຕ່ລະ option `px-3 py-2 text-sm` + ✓ `size-4 text-[#7e22ce]`; ຫວ່າງ: "ບໍ່ພົບຜົນລັບ" `text-xs text-[#94a3b8]`.

**Date picker** (ຂຽນເອງ, ຮອງຮັບມຸມມອງ ວັນ/ເດືອນ/ປີ): popover `w-[300px] p-3.5 rounded-2xl border border-[#e5e8ef]` + ເງົາ 2 ຊັ້ນ; ປຸ່ມເລື່ອນ `size-8 rounded-lg`; ຫົວວັນ `text-[11px] font-bold text-[#7c8698]`; ວັນ `aspect-square rounded-lg text-[13px] hover:bg-[#faf5ff]`; ມື້ນີ້ = `ring-[1.5px] ring-[#7e22ce] font-bold text-[#7e22ce]`; ວັນທີເລືອກ = `bg-[#7e22ce] text-white font-bold`; ວັນນອກຊ່ວງ = `opacity-30 cursor-not-allowed`; footer ມີ "ມື້ນີ້" (`text-[13px] font-semibold text-[#7e22ce]`) ແລະ "ລ້າງ".

### 9.6 Checkbox, Radio, Switch

| Component | Spec |
|---|---|
| `Checkbox` | `h-4 w-4 rounded-sm border border-primary`; checked: `bg-primary text-primary-foreground` + ✓ |
| Checkbox ໃນຕາຕະລາງ (native) | `size-4 rounded border-[#cbd5e1]`, `accentColor: "#7e22ce"`, ຮອງຮັບ indeterminate, hit area `size-5`, ຢຸດ click ບໍ່ໃຫ້ໄປຮອດແຖວ |
| `RadioGroupItem` | `h-4 w-4 rounded-full border border-primary`; indicator: ວົງ `h-3.5 w-3.5 fill-primary` |
| `Switch` | track `h-6 w-11 rounded-full`; ປິດ `bg-input`, ເປີດ `bg-primary`; thumb `h-5 w-5 rounded-full bg-background`, ເລື່ອນ `translate-x-5` |

### 9.7 Tabs ແລະ Filter pill

| ແບບ | Spec |
|---|---|
| **Segmented** (shadcn) | List: `inline-flex h-9 rounded-lg bg-muted p-1 text-muted-foreground`; Trigger: `rounded-md px-3 py-1 text-sm font-medium`; active: `bg-background text-foreground shadow` |
| **Underline** | `border-b-2 px-3 py-3 text-xs font-semibold transition-colors`; active: `border-[#7e22ce] text-[#7e22ce]` (ອາດເພີ່ມ `bg-[#faf5ff]`); ບໍ່ active: `border-transparent text-[#64748b]` |
| **Filter pill** | `px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors`; active: `bg-[#faf5ff] dark:bg-[#2e1065] text-[#7e22ce] border-[#d8b4fe]`; ບໍ່ active: `bg-white border-[#e2e8f0] text-[#6b7280] hover:text-[#7e22ce] hover:border-[#d8b4fe]` |
| **Filter bar** | wrapper `flex items-center gap-2 flex-wrap p-3 bg-[#faf8ff] rounded-[20px] border`; ໄອຄອນ Filter 12px; pill; ຈຳນວນຜົນ `text-[11px] text-[#9ca3af] ml-auto` |
| **ປຸ່ມ Filter** | `inline-flex items-center gap-1 h-10 pl-2 pr-1.5 rounded-lg border text-sm`; ເມື່ອມີ filter ເປີດ: `border-[#d8b4fe] bg-[#faf5ff] text-[#7e22ce]` + count badge + chevron ໝູນ |

Tab ທີ່ສຳຄັນຕ້ອງ sync ກັບ URL (`?tab=...`) ເພື່ອໃຫ້ link ແລະ ປຸ່ມ back ໃຊ້ໄດ້.

### 9.8 Table

**Wrapper:** card `rounded-2xl`/`rounded-[20px] overflow-hidden` → `<div className="overflow-x-auto">` → `<table className="w-full text-sm">` (ຕັ້ງ `min-width` ຖ້າມີຫຼາຍຖັນ).

| ສ່ວນ | ແບບ A — ແໜ້ນ (ໜ້າ list ຫຼັກ) | ແບບ B — ໂລ່ງ (ຕາຕະລາງງ່າຍ) |
|---|---|---|
| ແຖວຫົວ | `border-t border-[#e2e8f0] bg-[#f8fafc] divide-x divide-[#e2e8f0]` | `bg-[#f8fafc] dark:bg-[#151024]` |
| `th` | `px-3 py-3 text-left` + `<span className="whitespace-nowrap font-semibold text-xs text-[#374151]">` | `px-4 py-3 text-left text-[#64748b] font-medium` |
| ແຖວ | `border-t border-[#e2e8f0] divide-x divide-[#e2e8f0] transition-colors cursor-pointer hover:bg-[#faf8ff]` | `border-t border-[#f1f5f9] dark:border-[#241c3a]` |
| `td` | `px-3 py-3` + `text-xs` | `px-4 py-3` |
| ຖັນຕົວເລກ | `text-right` + `font-mono` ຫຼື `tabular-nums` | ຄືກັນ |
| ຖັນ action | `sticky right-0 z-20 bg-[#f8fafc] text-center shadow-[inset_1px_0_0_0_#e2e8f0]` | `flex gap-1` ຂອງປຸ່ມໄອຄອນ `w-8 h-8 rounded-lg` |

**ສີພື້ນຂອງແຖວຕາມສະຖານະ:**

| ສະຖານະ | Class |
|---|---|
| ປົກກະຕິ | `bg-white dark:bg-[#1c1630] hover:bg-[#faf8ff]` |
| ຖືກເລືອກ | `bg-[#faf5ff] hover:bg-[#f3e8ff]` |
| ຍັງບໍ່ໄດ້ອ່ານ / ໃໝ່ | `bg-[#fffbeb] hover:bg-[#fef3c7]` |
| ຂໍ້ມູນບໍ່ຄົບ | `bg-[#fef9c3] hover:bg-[#fef08a]` |

**ຄຸນສົມບັດມາດຕະຖານ:** checkbox ຖັນທຳອິດ (40px) + ເລືອກທັງໝົດ · ຖັນລຳດັບ · ຈັດລຽງດ້ວຍການກົດຫົວ (▲/▼) · ເປີດ/ປິດຖັນ (ຈື່ໄວ້ຕໍ່ຜູ້ໃຊ້) · ກົດແຖວເພື່ອເຂົ້າລາຍລະອຽດ · ເມນູ ⋮ ທ້າຍແຖວ · ຕາຕະລາງໃຫຍ່ໃຊ້ virtual scroll (`@tanstack/react-virtual`).

**ຫວ່າງ:** `<td colSpan={n} className="px-6 py-8 text-center text-gray-500">ບໍ່ພົບຂໍ້ມູນ</td>` ຫຼື empty state ເຕັມ (§11.6).
**ກຳລັງໂຫຼດ:** ແຖວ skeleton (`.mts-skeleton`) ຫຼື overlay `bg-white/60` ເທິງຕາຕະລາງ; ກຳລັງ refetch: ຂໍ້ຄວາມ "ກຳລັງໂຫລດ…" `text-xs text-gray-500` ໃນ toolbar.

### 9.9 Pagination

**Footer ມາດຕະຖານ** (`px-3 sm:px-6 py-3 border-t border-[#e2e8f0] bg-white flex flex-col sm:flex-row items-center justify-between gap-3`):

- **ຊ້າຍ:** `ສະແດງ [10 ▾] ຕໍ່ໜ້າ │ ສະແດງ 1-10 ຈາກ 142 ລາຍການ` — `text-xs text-[#64748b]`; select `h-8 pl-3 pr-7 rounded-lg border`. ຕົວເລືອກ: **10 / 30 / 50 / ທັງໝົດ** (ຄ່າ `0` = ທັງໝົດ).
- **ຂວາ:** `‹ 1 … 4 5 6 … 12 ›` — ປຸ່ມ `size-8 rounded-lg text-xs font-semibold`; ໜ້າປັດຈຸບັນ `bg-primary text-primary-foreground`; ອື່ນໆ `border border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]`; disabled `opacity-40 cursor-not-allowed`.
- ຫຼາຍກວ່າ 7 ໜ້າ: ຫຍໍ້ເປັນ `1 … x-1 x x+1 … ສຸດທ້າຍ`. ຖ້າຂໍ້ມູນພໍດີໜ້າດຽວ ປຸ່ມຍັງສະແດງຢູ່ (disabled) ເພື່ອໃຫ້ຄວາມສູງ footer ຄົງທີ່.
- Page-size dropdown ຕ້ອງເປີດ **ຂຶ້ນເທິງ** ຜ່ານ portal (ເພາະຢູ່ footer).

### 9.10 Dialog, Modal, Sheet

| | Radix `Dialog` / `AlertDialog` | Modal ຂຽນເອງ (ພົບຫຼາຍ) |
|---|---|---|
| Overlay | `fixed inset-0 z-[9999] bg-black/80` + fade | `fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4` (ຫຼື `bg-black/40`) |
| Panel | `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg gap-4 border bg-background p-6 sm:rounded-lg` | `bg-white dark:bg-[#1c1630] rounded-2xl shadow-2xl w-full max-w-md p-6` |
| Animation | `duration-200 origin-center`, fade + `zoom-in-95` / `zoom-out-95` — **ປາກົດຈາກຈຸດກາງ, ບໍ່ slide ຈາກມຸມ** | `animate-in fade-in zoom-in-95 duration-200` |
| ປຸ່ມປິດ | `absolute right-4 top-4`, `X h-4 w-4`, `opacity-70 hover:opacity-100` | ຄືກັນ ຫຼື ປຸ່ມ `size-8 rounded-lg hover:bg-[#f1f5f9]` |

**Modal ຟອມ (ມາດຕະຖານ):**

```
DialogContent: max-w-2xl bg-white rounded-2xl border-0 shadow-2xl p-0 overflow-hidden
├─ Header:  px-5 pt-5 pb-3 border-b border-[#e2e8f0]   · title text-base font-bold text-[#1e293b] + ໄອຄອນ size-4 primary · subtitle text-xs text-[#64748b]
├─ Body:    px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto   · grid grid-cols-1 sm:grid-cols-2 gap-4
└─ Footer:  flex justify-end gap-2 px-5 py-4 border-t border-[#e2e8f0] bg-[#f8fafc]   · [ຍົກເລີກ] [ບັນທຶກ]
```

ຄວາມກວ້າງ: `max-w-sm` (ຢືນຢັນ) · `max-w-md` (ຟອມສັ້ນ) · `max-w-lg` (default) · `max-w-2xl` (ຟອມ) · `max-w-4xl`+ (ເບິ່ງເອກະສານ).

**Confirm dialog:**

- **ລຶບ:** ໄອຄອນຢູ່ກາງ `w-14 h-14 rounded-full bg-[#fef2f2]` + `Trash2 w-7 h-7 text-[#ef4444]`; ຫົວ `text-base font-bold text-center`; ຂໍ້ຄວາມ `text-sm text-[#64748b] text-center leading-relaxed mb-6`; 2 ປຸ່ມ `flex-1 h-10 rounded-xl` — ຍົກເລີກ (outline) + ລຶບ (`bg-[#ef4444] hover:bg-[#dc2626]`).
- **ທົ່ວໄປ:** `max-w-[400px] rounded-2xl`; ໄອຄອນຢູ່ຊ້າຍ `size-11 rounded-full bg-[#fef2f2]`; ຫົວ `text-[16px] font-bold text-[#0f172a]`; ຂໍ້ຄວາມ `text-[13px] text-[#64748b] mt-1`; ປຸ່ມ `rounded-xl`.
- ຂະນະກຳລັງດຳເນີນການ: ປິດ dialog ບໍ່ໄດ້, ປຸ່ມທັງສອງ disabled, ປຸ່ມຢືນຢັນສະແດງ spinner.

**Sheet:** `fixed z-[9999] bg-background p-6 gap-4`; ຂວາ/ຊ້າຍ `h-full w-3/4 sm:max-w-sm`; ເຂົ້າ 500ms, ອອກ 300ms, `ease-in-out`.

### 9.11 Toast

ຕຳແໜ່ງ: **ລຸ່ມຂວາ** (`fixed bottom-0 right-0 sm:bottom-4 sm:right-4 sm:max-w-[400px] flex-col-reverse gap-2 p-4 sm:p-0`), ອັນໃໝ່ຢູ່ເທິງ. ສູງສຸດ **5** ອັນ. ຄ້າງ **8 ວິນາທີ**; hover/focus ຈະຢຸດນັບ. Swipe ຂວາເພື່ອປິດ. ເຂົ້າຈາກລຸ່ມ, ອອກທາງຂວາ.

```
┌──────────────────────────────────────────┐
│ [■]  ຫົວຂໍ້ (text-sm font-semibold)      ✕ │   rounded-xl border p-4 pr-10 shadow-lg backdrop-blur bg-white
│      ຄຳອະທິບາຍ (text-sm text-[#475569])    │   gap-3
│      [action h-8 rounded-md border]        │
│▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ ← progress h-1, track #f1f5f9
└──────────────────────────────────────────┘
```

| Variant | ຂອບ card | ພື້ນກ່ອງໄອຄອນ | ໄອຄອນ + progress | ໄອຄອນ |
|---|---|---|---|---|
| `default` / `info` | `#bfdbfe` | `#dbeafe` | `#2563eb` | `Info` |
| `success` | `#bbf7d0` | `#dcfce7` | `#16a34a` | `CheckCircle2` |
| `warning` | `#fde68a` | `#fef3c7` | `#d97706` | `AlertTriangle` |
| `error` / `destructive` | `#fecaca` | `#fee2e2` | `#dc2626` | `AlertCircle` |

ກ່ອງໄອຄອນ `size-9 rounded-lg` (ໄອຄອນ `size-5`); ປຸ່ມປິດ `size-7 rounded-md text-[#64748b] hover:bg-[#f1f5f9]`.

### 9.12 Tooltip, Popover, HoverCard, Dropdown

| Component | Spec |
|---|---|
| Tooltip | `rounded-md border bg-popover px-3 py-1.5 text-sm`, `sideOffset 4`, fade + zoom-95 |
| Popover | `w-72 rounded-md border bg-popover p-4`, `sideOffset 4` |
| Dropdown ຂຽນເອງ | `bg-white dark:bg-[#1c1630] border border-[#e2e8f0] dark:border-[#33294d] rounded-xl shadow-xl overflow-hidden py-1`, `animate-in fade-in-0 zoom-in-95 duration-100` |
| ລາຍການ dropdown | `w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#475569] hover:bg-[#faf8ff] dark:hover:bg-[#241c3a]`; ທີ່ເລືອກ: `bg-[#faf5ff] text-[#7e22ce] font-semibold` + ✓ |
| ລາຍການອັນຕະລາຍ | `text-[#ef4444] hover:bg-[#fef2f2]` — ຢູ່ລຸ່ມສຸດສະເໝີ |
| Popover ທີ່ຍຶດກັບ header | `absolute right-0 top-[calc(100%+8px)] rounded-2xl`, `animate-in fade-in slide-in-from-top-2 duration-200` + backdrop ໂປ່ງໃສ `fixed inset-0 z-40` |

### 9.13 Progress, Skeleton, Spinner, Separator, Kbd, Avatar

| Component | Spec |
|---|---|
| Progress | track `h-2 rounded-full bg-primary/20`; fill `bg-primary transition-all` |
| **Skeleton** | ໃຊ້ `.mts-skeleton` (shimmer) **ບໍ່ແມ່ນ** `animate-pulse` — ເບິ່ງ §12 |
| Spinner | `Loader2 size-4 animate-spin`, `role="status" aria-label="Loading"`; ແບບ CSS: `w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin` |
| Separator | `bg-border`, `h-px w-full` ຫຼື `w-px h-full` |
| Kbd | `px-1.5 py-0.5 rounded-md bg-[#f1f5f9] dark:bg-[#1e293b] border border-[#e2e8f0] dark:border-[#334155] text-[11px] text-[#64748b]` |
| Avatar | `rounded-full`; ຂະໜາດ 32 (topbar) / 48 (ລາຍການ) / 80 (profile); fallback: gradient `from-[#7e22ce] to-[#9333ea]` + ຕົວອັກສອນທຳອິດ `text-white text-xs font-bold` |
| Alert | `rounded-lg border px-4 py-3 text-sm`; ໄອຄອນ `absolute left-4 top-4`, ເນື້ອໃນ `pl-7`; `destructive`: `border-destructive/50 text-destructive` |
| Empty | `flex flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 md:p-12 text-center`; media `size-10 rounded-lg bg-muted`; title `text-lg font-medium`; description `text-sm text-muted-foreground` |

---

## 10. Component ສະເພາະລະບົບ

### 10.1 Row actions menu (⋮)

Trigger: `w-8 h-8 rounded-xl border border-[#e9d5ff] dark:border-[#3b1a6e] bg-white dark:bg-[#17122a] text-[#7e22ce] hover:bg-[#f7f0ff]` + `MoreVertical w-4 h-4`.

Menu (portal, `position: fixed`, `min-width 160 / max-width 260`, `z-9999`): ຍຶດຂອບຂວາຂອງ trigger; **ພິກຂຶ້ນເທິງ** ຖ້າລົ້ນລຸ່ມຈໍ; ຕິດຕາມ scroll/resize; ປິດເມື່ອກົດນອກ.

ລຳດັບ ແລະ ສີໄອຄອນຄົງທີ່ (ໄອຄອນ `w-3.5 h-3.5`):

1. 👁 ເບິ່ງລາຍລະອຽດ — `#7e22ce`
2. ✏️ ແກ້ໄຂ — `#f59e0b`
3. action ເພີ່ມເຕີມ — `default` ສີມ່ວງ / `success` emerald-600 / `warning` amber-600
4. 🗑 ລຶບ — ທັງແຖວສີ `#ef4444`, ສະແດງສະເພາະຜູ້ມີສິດ, ຕ້ອງຜ່ານ confirm dialog ສະເໝີ

### 10.2 Bulk action bar

ເມື່ອເລືອກ ≥ 1 ແຖວ, ແຖບນີ້ **ແທນທີ່** ແຖວ search/filter (ບໍ່ປ່ຽນຄວາມສູງ); `animate-in fade-in slide-in-from-top-2 duration-200`, `role="toolbar"`.

- **ຊ້າຍ:** ປຸ່ມ × `size-9 rounded-lg border hover:text-[#dc2626]` + chip `px-3 h-9 rounded-lg bg-[#faf5ff] text-[#7e22ce] text-sm font-semibold` ("12 ລາຍການທີ່ເລືອກ").
- **ຂວາ:** ປຸ່ມ `h-9 px-3 rounded-lg text-xs gap-1.5` — ໝາຍວ່າອ່ານແລ້ວ (hover ຂຽວ) · ດາວໂຫຼດ (hover ສີມ່ວງ) · ລຶບທີ່ເລືອກ (`border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2]`).
- ຂະນະມີ action ກຳລັງເຮັດວຽກ: ທຸກປຸ່ມ disabled, ປຸ່ມທີ່ກົດສະແດງ spinner.

### 10.3 Stepper / Timeline

Card ຫົວ gradient (§9.3). ແຕ່ລະຂັ້ນ: `flex gap-3` — ຖັນຊ້າຍເປັນວົງ `w-8 h-8 rounded-full font-bold text-xs` + ເສັ້ນຕັ້ງເຊື່ອມ `w-0.5 min-h-[28px]`; ຖັນຂວາເປັນ card ຂອງຂັ້ນ `rounded-xl border p-3 mb-3`. ສະຖານະ: **ສຳເລັດ** — ວົງ `bg-[#16a34a] text-white` + ✓, ເສັ້ນ `bg-[#16a34a]/50`, card `bg-[#f0fdf4] border-[#bbf7d0]` · **ປັດຈຸບັນ** — ວົງເປັນສີຂອງຂັ້ນ (ໝູນວຽນຕາມ §3.7) + `ring-4`, card ເປັນ tint + ຂອບຂອງສີນັ້ນ · **ລໍຖ້າ** — ວົງ `bg-[#e2e8f0] text-[#94a3b8]` ສະແດງເລກຂັ້ນ. ຫວ່າງ: ກ່ອງ `rounded-xl border border-dashed bg-[#f8fafc] p-4 text-center`.

### 10.4 Component AI

| Component | ພຶດຕິກຳ |
|---|---|
| **AiMagicButton** | `Button variant="outline"` + class `.ai-magic-button`: ຂອບ rainbow 1px (ເທັກນິກ `padding-box` / `border-box`), ໄອຄອນ `Sparkles size-3.5` ເຕັ້ນ (`ai-spark-pulse`), hover ມີ shimmer ກວາດ. Loading: `Loader2 animate-spin` + ຂອບ rainbow ໝູນ + `aria-busy`. |
| **AiGeneratingFrame** | ຫໍ່ເນື້ອໃນທີ່ AI ກຳລັງຂຽນ: ຂອບ rainbow ໝູນ (`padding 2px`, `radius 0.75rem`) + label ມຸມຂວາເທິງ "AI ກຳລັງ generate..." (pill, blur). |
| `.ai-generating-row` | ແຖວທີ່ AI ກຳລັງຕື່ມ: ພື້ນ gradient ອ່ອນ (cyan/pink/green 8%) ເຄື່ອນໄຫວ. |
| **AiDraftUndo** | ຫຼັງ AI ຕື່ມຂໍ້ມູນ ຕ້ອງມີປຸ່ມ "ຍົກເລີກ" ສະເໝີ. |
| **AdminAiAssistPanel** | panel ຂ້າງຟອມ: ຫົວ gradient ອ່ອນ, ຂອບ `#d8b4fe`. |

**ກົດ:** ສິ່ງທີ່ AI ສ້າງຕ້ອງ (1) ເຫັນໄດ້ຊັດວ່າມາຈາກ AI, (2) ຍົກເລີກໄດ້, (3) ບໍ່ບັນທຶກເອງໂດຍບໍ່ມີຄົນຢືນຢັນ.

### 10.5 Chat (ຜູ້ຊ່ວຍ / Inbox)

ໜ້າຕ່າງ: ຫົວພື້ນ primary (`px-4 py-3`) + avatar `h-8 w-8 rounded-full bg-white/20` + ຊື່ `text-sm font-semibold`; ຕົວ `bg-background`; ຊ່ອງພິມຢູ່ລຸ່ມ. ຄຳຕອບແບບມີໂຄງສ້າງສະແດງເປັນ card ໃນຂໍ້ຄວາມ: `my-1.5 rounded-xl border bg-white/95 shadow-sm overflow-hidden`, ຫົວ `px-3 py-2 border-b` (ພື້ນ tint ຕາມ tone), badge `rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold`, ຊື່ `text-[13px] font-bold leading-snug`, ສະຫຼຸບ `text-[11px] leading-relaxed text-muted-foreground`; code inline `rounded bg-black/10 px-1 py-0.5 font-mono text-[12px]`. ສຳລັບ Inbox ຂອງ OCA (ຂໍ້ສະເໜີ, ບໍ່ມີໃນຕົ້ນສະບັບ): ຟອງຂອງຮ້ານຢູ່ຂວາ ພື້ນ primary, ຟອງຂອງລູກຄ້າຢູ່ຊ້າຍ ພື້ນ muted.

### 10.6 ອື່ນໆ

| Component | ສະຫຼຸບ |
|---|---|
| Command palette (`⌘K`) | modal ຄົ້ນຫາທົ່ວລະບົບ (ຂຽນເອງ): overlay `fixed inset-0 z-[9999] bg-black/50 backdrop-blur-[4px]`, panel ຢູ່ເທິງ-ກາງ (`items-start pt-[8vh] sm:pt-[12vh] px-4`), ຈັດກຸ່ມຜົນລັບ, ນຳທາງດ້ວຍ keyboard |
| Number input | ຈັດຮູບແບບຫຼັກພັນຂະນະພິມ, ຊິດຂວາ |
| Unit input cluster | input + dropdown ໜ່ວຍ ຕິດກັນ |
| Multi-select chips | ຄ່າທີ່ເລືອກເປັນ chip `rounded-full` ລຶບໄດ້ |
| Date range filter | ປຸ່ມ trigger ສະແດງຊື່ preset + ຊ່ວງວັນທີ; popover ມີ preset (ມື້ນີ້, ມື້ວານ, ອາທິດນີ້ — ອາທິດເລີ່ມວັນຈັນ ...) + ເລືອກຊ່ວງເອງ |
| Document preview pager | ເບິ່ງ PDF/ຮູບ + ປຸ່ມ ກ່ອນ/ຕໍ່ໄປ + ເລກໜ້າ |
| QR code | ສ້າງດ້ວຍ `qrcode`; ໃຊ້ໃນໃບບິນ/ເອກະສານ |
| Signature pad | canvas ເຊັນຊື່ + ປຸ່ມ ລ້າງ/ບັນທຶກ |
| OTP input | `input-otp`, ຊ່ອງແຍກ + caret ກະພິບ |

---

## 11. Page pattern

### 11.1 ໂຄງໜ້າມາດຕະຖານ

```tsx
<div className="flex-1 bg-[#faf8ff] dark:bg-[#100c1c] pt-[64px] min-h-screen">
  {/* Sticky page header */}
  <div className="sticky top-[64px] z-30 backdrop-blur-sm bg-[#faf8ff]/90 dark:bg-[#100c1c]/90
                  flex flex-col gap-3 pt-[18px] pb-3 px-3 sm:px-6 w-full">
    <nav className="flex items-center gap-1.5 text-sm text-[#64748b]">
      <span className="hover:text-[#7e22ce] cursor-pointer transition-colors">ໜ້າຫຼັກ</span>
      <ChevronRightIcon className="w-3.5 h-3.5 text-[#cbd5e1]" />
      <span className="text-[#7e22ce] font-medium">ສິນຄ້າ</span>
    </nav>
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-[#1e293b] dark:text-white text-2xl leading-tight">ສິນຄ້າ</h1>
          <Badge className="bg-[#f3e8ff] text-[#7e22ce] px-3 py-1 rounded-full text-xs font-normal">142 ລາຍການ</Badge>
        </div>
        <p className="text-sm text-[#64748b] mt-0.5">ຄຳອະທິບາຍສັ້ນໆ ວ່າໜ້ານີ້ໃຊ້ເຮັດຫຍັງ</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">{/* ປຸ່ມຮອງ … ປຸ່ມຫຼັກຢູ່ຂວາສຸດ */}</div>
    </div>
  </div>

  {/* Content */}
  <div className="px-3 sm:px-6 pb-10 space-y-6">…</div>
</div>
```

ໜ້າງ່າຍໆ (ບໍ່ຕ້ອງ sticky): `<div className="min-h-screen bg-[#faf8ff] dark:bg-[#100c1c] pt-[64px]"><div className="w-full p-6 space-y-6">…`.

### 11.2 ໜ້າ List (ຕາຕະລາງ)

ລຳດັບຈາກເທິງລົງລຸ່ມ:

1. **Page header** — breadcrumb, ຊື່ + count badge, ຄຳອະທິບາຍ, ປຸ່ມ (import/export/AI ເປັນ outline, "ເພີ່ມໃໝ່" ເປັນ primary).
2. **KPI grid** — `grid grid-cols-2 lg:grid-cols-4 gap-3`–`gap-4`; ຖ້າ KPI ໃຊ້ເປັນ filter ໃຫ້ໃຊ້ແບບ D.
3. **Table card** (`rounded-[20px] overflow-hidden`):
   - **Toolbar** `px-3 sm:px-6 py-4`: ຊ້າຍ = ຄົ້ນຫາ (`min-w-[240px] max-w-md`) + ປຸ່ມ Filter (ມີ count) · ຂວາ = ຕັ້ງຄ່າຖັນ, ດາວໂຫຼດ. ເມື່ອເລືອກແຖວ → ປ່ຽນເປັນ Bulk action bar.
   - **ແຖວ filter** (ຂະຫຍາຍລົງລຸ່ມ toolbar ເມື່ອກົດປຸ່ມ Filter): dropdown ຕ່າງໆ + ປຸ່ມ "ລ້າງ" (`outlineDanger`).
   - **ຕາຕະລາງ** (§9.8).
   - **Footer pagination** (§9.9).

> §11.3–§11.5 ແມ່ນການສະຫຼຸບໂຄງສ້າງທີ່ພົບຊ້ຳໆ ໃນໜ້າ detail / create / dashboard ຂອງຕົ້ນສະບັບ (ແຕ່ລະໜ້າມີລາຍລະອຽດຕ່າງກັນ) ເພື່ອໃຊ້ເປັນແມ່ແບບຂອງ OCA.

### 11.3 ໜ້າ Detail

Page header ມີປຸ່ມ ← ກັບຄືນ (`ArrowLeft`) + ຊື່ + status pill + ປຸ່ມ action. ຕົວໜ້າ: ແຖບ tab (underline) → ເນື້ອໃນ tab ເປັນ card ຊ້ອນກັນ `space-y-4`–`space-y-6`. ຂໍ້ມູນສະແດງເປັນ grid label–value: label `text-xs text-[#94a3b8] mb-1`, value `text-sm text-[#1e293b] font-medium`. ໜ້າຈໍກວ້າງ: 2 ຖັນ `grid-cols-1 lg:grid-cols-3` (ຫຼັກ 2 / ຂ້າງ 1 — timeline, ເອກະສານ, ປະຫວັດ).

### 11.4 ໜ້າ Form / Create

ຟອມສັ້ນ → modal (§9.10). ຟອມຍາວ → ໜ້າເຕັມ: ແບ່ງເປັນ card ຕາມໝວດ (ແຕ່ລະ card ມີຫົວ + ໄອຄອນ), field ໃນ `grid grid-cols-1 sm:grid-cols-2 gap-4`, ແຖບປຸ່ມຕິດລຸ່ມ `sticky bottom-0 z-10 min-h-16 border-t bg-white px-5 py-3 flex items-center justify-between gap-3` (ຍົກເລີກ ຊ້າຍ / ບັນທຶກຮ່າງ + ສົ່ງ ຂວາ). Field ບັງຄັບມີ `*` ແດງ. Validate ດ້ວຍ zod, ສະແດງ error ໃຕ້ field.

### 11.5 ໜ້າ Dashboard

1. Page header + ຕົວກັ່ນຕອງ (ປີ / ຊ່ວງວັນທີ / ໝວດ) ຢູ່ຂວາ.
2. ແຖວ KPI (4 ອັນ).
3. Grid chart `grid-cols-1 lg:grid-cols-2 gap-4`; chart card: ຫົວ (ຊື່ `text-base font-bold` + ຄຳອະທິບາຍ `text-xs text-[#94a3b8]` + ຕົວເລືອກຢູ່ຂວາ) + ພື້ນທີ່ chart ສູງ `h-[240px]`–`h-[320px]`.
4. ຕາຕະລາງ top-N / ລາຍການລ່າສຸດ.
5. ແຕ່ລະ section ໂຫຼດແຍກກັນ ດ້ວຍ skeleton ຂອງຕົນເອງ.

### 11.6 Empty state

```tsx
<div className="p-8 flex flex-col items-center gap-3 text-center">
  <div className="w-12 h-12 rounded-[20px] bg-[#f3e8ff] dark:bg-[#3b1a6e] flex items-center justify-center">
    <Icon size={22} className="text-[#7e22ce] dark:text-[#c084fc]" />
  </div>
  <div>
    <p className="text-[14px] font-semibold text-[#241c3a] dark:text-white">ບໍ່ພົບຂໍ້ມູນ</p>
    <p className="text-[12px] text-[#6b7280] dark:text-[#8892b0] mt-1">ລອງປ່ຽນ filter ຫຼື ຄົ້ນຫາໃໝ່</p>
  </div>
  <button className="h-9 px-4 rounded-[20px] border border-[#e2e8f0] text-[12px] text-[#7e22ce] flex items-center gap-1.5 hover:bg-[#faf5ff]">
    <RefreshCwIcon size={12} /> Reset Filter
  </button>
</div>
```

ແຍກ 3 ກໍລະນີ: **ຍັງບໍ່ມີຂໍ້ມູນ** (ປຸ່ມ "ສ້າງອັນທຳອິດ") · **ກັ່ນຕອງແລ້ວບໍ່ພົບ** (ປຸ່ມ "ລ້າງ filter") · **ຜິດພາດ** (ຂໍ້ຄວາມ + ປຸ່ມ "ລອງໃໝ່").

### 11.7 ໜ້າ Login

- ພື້ນຫຼັງ: `min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c0030] via-[#1c0a47] to-[#2e1065] p-4`.
- ຕົກແຕ່ງ: 3 ວົງແສງລອຍ (`size-[420px]`/`[380px] rounded-full blur-3xl` — `bg-purple-600/30`, `bg-violet-600/25`, `bg-fuchsia-500/15`) + ຕາຂ່າຍ 44px (`opacity-20`, ຈາງອອກດ້ວຍ radial mask) + effect ຈຸດເຊື່ອມທີ່ສະຫວ່າງຕາມ cursor.
- ກ່ອງ login: `bg-white dark:bg-[#1c1630] rounded-2xl p-8 sm:p-10 shadow-2xl max-w-[480px] w-full`; ໂລໂກ້ຢູ່ເທິງ; input `h-11 rounded-lg`; ປຸ່ມເບິ່ງລະຫັດຜ່ານຢູ່ຂວາໃນ input; ປຸ່ມ submit `w-full h-11 bg-[#7e22ce] hover:bg-[#6b21a8] rounded-lg font-bold text-base`.
- Panel ຮອງໃຕ້ກ່ອງ (glass): `bg-white/10 backdrop-blur-md rounded-2xl border border-white/20`; ລາຍການຂ້າງໃນ `rounded-xl border border-white/20 bg-white/5 hover:bg-white/15 active:scale-[0.99]`.

### 11.8 ໜ້າ error

404 / ບໍ່ມີສິດ: card ຢູ່ກາງຈໍ `max-w-md`, ໄອຄອນ `AlertCircle h-8 w-8 text-red-500` + ຫົວ `text-2xl font-bold` + ຄຳອະທິບາຍ `text-sm` + ປຸ່ມກັບໜ້າຫຼັກ.

---

## 12. Motion ແລະ Animation

### 12.1 Duration ແລະ easing

| Duration | ×N | ໃຊ້ກັບ |
|---|---|---|
| `duration-100` | 5 | dropdown ປາກົດ |
| `duration-150` | 25 | hover ຂອງປຸ່ມ/ລາຍການ, ໄລຍະ route transition |
| **`duration-200`** | 41 | **default**: dialog, popover, chevron ໝູນ, fade |
| `duration-300` | 21 | sidebar ຫຍໍ້/ຂະຫຍາຍ, layout ເລື່ອນ, sheet ປິດ |
| `duration-500` | 8 | sheet ເປີດ, progress |

Hover ສ່ວນໃຫຍ່ໃຊ້ `transition-colors` (ບໍ່ລະບຸ duration = 150ms). Layout ໃຊ້ `transition-all duration-300`.

### 12.2 ການເຂົ້າ/ອອກ (`tw-animate-css`)

| ອົງປະກອບ | ເຂົ້າ | ອອກ |
|---|---|---|
| Dialog / AlertDialog | `fade-in-0 zoom-in-95` (ຈາກຈຸດກາງ) | `fade-out-0 zoom-out-95` |
| Dropdown / Select / Tooltip | `fade-in-0 zoom-in-95` + `slide-in-from-{ດ້ານ}-2` | `fade-out-0 zoom-out-95` |
| Header popover, bulk bar | `fade-in slide-in-from-top-2 duration-200` | — |
| Toast | `slide-in-from-bottom-full` | `fade-out-80 slide-out-to-right-full` |
| Sheet | `slide-in-from-{ດ້ານ}` 500ms | `slide-out-to-{ດ້ານ}` 300ms |
| Loading overlay | `fade-in zoom-in duration-200` | — |

### 12.3 Keyframe ທີ່ກຳນົດເອງ

| ຊື່ | ພຶດຕິກຳ | ໄລຍະ |
|---|---|---|
| `mts-skeleton-shimmer` → OCA: `oca-skeleton-shimmer` | ແຖບແສງກວາດ ຊ້າຍ→ຂວາ; `background-position: 125% → -25%`, `background-size: 200% 100%` | 1.5s linear infinite |
| `mts-toast-progress` → `oca-toast-progress` | `scaleX(1 → 0)`, `transform-origin: left`; ຢຸດດ້ວຍ `animationPlayState` | = duration ຂອງ toast |
| `ai-rainbow-border` | `background-position: 0% → 100% → 0%` | 2.4–2.8s linear infinite |
| `ai-shimmer-sweep` | ແສງຂາວກວາດແບບສະຫຼຽງ (`translateX(-140% → 140%) skewX(-16deg)`) | 1.65s ease-in-out infinite |
| `ai-spark-pulse` | `scale(1 → 1.08)` + glow `drop-shadow(0 0 8px rgba(14,165,233,.65))` | 1.8s ease-in-out infinite |
| `mts-fab-pulse` → `oca-fab-pulse` | ວົງແຜ່ອອກ `scale(1 → 1.7)`, `opacity .55 → 0`; ວົງທີ 2 ຊ້າ 0.6s | 1.8s ease-out infinite |
| `mts-fab-shimmer` | `background-position: -200% → 200%` | 3s linear infinite |
| `mts-fab-bounce` | `translateY(0 → -5px → -2px → 0)` | 2.5s ease-in-out infinite |

**Skeleton** ຕ້ອງໃຊ້ class `.mts-skeleton` (ໃນ OCA: `.oca-skeleton`) ຢ່າງດຽວ — ບໍ່ຕ້ອງໃສ່ `animate-pulse` ຫຼື class ພື້ນຫຼັງ, ເພາະມັນກຳນົດສີພື້ນເອງ (`#e9eef6` / dark `#1c1630`). ແສງໃນ dark ອ່ອນລົງເປັນ 9% ເພື່ອບໍ່ໃຫ້ກະພິບ.

### 12.4 Micro-interaction

- ປຸ່ມ/card ທີ່ກົດໄດ້: `active:scale-[0.99]` (card) · `hover:scale-110 active:scale-95` (FAB) · `group-hover:scale-105` (avatar).
- Chevron: `transition-transform duration-200` + `rotate-90` / `rotate-180`.
- ປຸ່ມທີ່ປາກົດເມື່ອ hover: `opacity-0 group-hover:opacity-100 transition-opacity`.

### 12.5 Reduced motion

ທຸກ animation ທີ່ວົນຊ້ຳ (skeleton, AI, FAB) ຕ້ອງປິດໃນ `@media (prefers-reduced-motion: reduce)` — ຮັກສາຮູບຊົງໄວ້ ແຕ່ຢຸດການເຄື່ອນໄຫວ.

---

## 13. Dark mode

### 13.1 ກົນໄກ

- Class `.dark` ທີ່ `<html>`; Tailwind variant: `@custom-variant dark (&:is(.dark *));`
- ຄ່າເລີ່ມຕົ້ນ: ຄ່າທີ່ຜູ້ໃຊ້ບັນທຶກໄວ້ → ຖ້າບໍ່ມີ ໃຊ້ `prefers-color-scheme`.
- ຕ້ອງໃສ່ class **ກ່ອນ paint ທຳອິດ** ເພື່ອບໍ່ໃຫ້ກະພິບ (OCA: `next-themes` ຈັດການໃຫ້).
- ຄ່າຖືກບັນທຶກຕໍ່ຜູ້ໃຊ້ (server) + cache ໃນ `localStorage`.

### 13.2 ຕາຕະລາງແປງ Light → Dark

| ບົດບາດ | Light | Dark |
|---|---|---|
| App bg | `#faf8ff` | `#100c1c` |
| Chrome (sidebar/topbar) | `#ffffff` | `#17122a` |
| Card | `#ffffff` | `#1c1630` |
| Subtle (thead, footer) | `#f8fafc` | `#151024` (ຫຼື `#17122a`) |
| Muted / hover | `#f1f5f9` | `#241c3a` |
| Hover ຂອງ card | `#faf8ff` | `#241c3a` |
| Border | `#e2e8f0` | `#33294d` |
| Border hairline | `#f1f5f9` | `#241c3a` (ຫຼື `#33294d`) |
| Border strong | `#cbd5e1` | `#463a63` |
| Heading | `#1e293b` / `#0f172a` | `#ffffff` / `#e2e8f0` |
| Body | `#202020` / `#334155` | `#e2e8f0` / `#cbd5e1` |
| Secondary | `#64748b` / `#475569` | `#94a3b8` |
| Muted text | `#94a3b8` | `#64748b` |
| Primary (ຕົວໜັງສື/ໄອຄອນ) | `#7e22ce` | `#d8b4fe` |
| Primary (ພື້ນປຸ່ມ) | `#7e22ce` | `#7e22ce` |
| Primary tint | `#faf5ff` | `#2e1065` / `#251446` |
| Nav active | `#e9d5ff` | `#3b1a6e` |
| Focus ring | `hsl(272 72% 47%)` | `hsl(270 95% 75%)` |

### 13.3 ກົດການຂຽນ

1. **ທຸກ class ສີຕ້ອງມີຄູ່ `dark:`** ຫຼື ໃຊ້ semantic token (`bg-card`, `text-foreground`, `border-border`).
2. Tint ສີໃນ dark ໃຊ້ **ສີເຂັ້ມ + alpha** (`dark:bg-emerald-900/30`), ບໍ່ແມ່ນ tint ອ່ອນ.
3. ຕົວໜັງສືສີໃນ dark ໃຊ້ເສດ 300–400 (`dark:text-emerald-400`).
4. ເສັ້ນ accent ຊ້າຍ (`border-l-[#ef4444]`) ຮັກສາສີສົດໄວ້ທັງສອງ theme.
5. ຮູບ/ໂລໂກ້ສີດຽວ: `dark:invert dark:hue-rotate-180`.
6. Chart: tooltip `rgba(28,22,48,.95)` + ຂອບ `#33294d` + ຕົວໜັງສື `#e2e8f0`; tick `#94a3b8`; grid/axis `#33294d`.

### 13.4 ⚠️ ສິ່ງທີ່ OCA ຈະບໍ່ສືບທອດ

ຕົ້ນສະບັບໃຊ້ hex ຕາຍຕົວ (`bg-[#f8fafc]`) ເກືອບທຸກບ່ອນ, ຈຶ່ງຕ້ອງມີ **ຊັ້ນ override ~440 ແຖວ** ໃນ CSS ທີ່ຂຽນທັບ class hex ແຕ່ລະອັນດ້ວຍ `!important` ເມື່ອຢູ່ໃນ `.dark` (ແລະ ກົດ `:not([class*="dark:bg-"])` ສຳລັບ `bg-white`, `border-gray-200` ...). ວິທີນີ້ໃຊ້ໄດ້ ແຕ່ເປາະບາງ: hex ໃໝ່ທຸກອັນຕ້ອງເພີ່ມ override ເອງ.

**OCA ຕັດສິນ:** ໃຊ້ semantic token ຕັ້ງແຕ່ຕົ້ນ (§20.2) ແລະ ບໍ່ສ້າງຊັ້ນ override ນີ້.

---

## 14. Icon ແລະ ຮູບພາບ

**ໂລໂກ້ OCA** — [`docs/assets/oca-logo.png`](assets/oca-logo.png) (ມີ wordmark "OMNICOMMERCE AI" + "ການຄ້າທຸກຊ່ອງທາງດ້ວຍ AI").

| ບ່ອນໃຊ້ | ຮູບແບບ |
|---|---|
| Sidebar ເຕັມ | ສະເພາະສັນຍາລັກ (ຕົວ C + ເຄືອຂ່າຍ AI), 92×92, `rounded-[22px] object-contain` |
| Sidebar rail, favicon, avatar ຂອງລະບົບ | ສະເພາະສັນຍາລັກ, 48×48 / 32×32 |
| ໜ້າ Login, ໃບບິນ, ເອກະສານພິມ | ໂລໂກ້ເຕັມ (ສັນຍາລັກ + wordmark) |
| Loading overlay | ສັນຍາລັກ (ຖ້າມີເວີຊັນເຄື່ອນໄຫວ) ຫຼື spinner ສີ primary |

ກົດ: ບໍ່ຍືດ, ບໍ່ປ່ຽນສີ, ບໍ່ໃສ່ເງົາເພີ່ມ; ເວັ້ນພື້ນທີ່ວ່າງອ້ອມຮອບຢ່າງໜ້ອຍ ¼ ຂອງຄວາມສູງສັນຍາລັກ. Wordmark ທີ່ຂຽນດ້ວຍ text ໃຊ້ສີ `#2e1065` (dark: `#f3e8ff`), `font-bold`, ຕົວພິມໃຫຍ່, "AI" ເປັນສີ `#9333ea`.

**ຟາຍໂລໂກ້** (ຢູ່ `docs/assets/`, PNG ພື້ນໂປ່ງໃສ, ຕັດພື້ນຫຼັງຈາກ JPG ຕົ້ນສະບັບ):

| ຟາຍ | ຂະໜາດ | ໃຊ້ກັບ |
|---|---|---|
| `oca-logo.png` | 698×611 | ໂລໂກ້ເຕັມ ເທິງພື້ນສະຫວ່າງ |
| `oca-logo-dark.png` | 698×611 | ໂລໂກ້ເຕັມ ເທິງພື້ນເຂັ້ມ (ຕົວໜັງສືເປັນ `#f3e8ff`, "AI" ແລະ ສັນຍາລັກຄືເກົ່າ) |
| `oca-mark.png` | 460×460 | ສັນຍາລັກຢ່າງດຽວ (sidebar, avatar ຂອງລະບົບ) — ໃຊ້ໄດ້ທັງພື້ນສະຫວ່າງ ແລະ ເຂັ້ມ |
| `oca-mark-192.png` · `-64.png` · `-32.png` | 192 / 64 / 32 | app icon, sidebar rail, favicon |
| `oca-wordmark.png` · `oca-wordmark-dark.png` | 682×151 | ຕົວໜັງສືຢ່າງດຽວ (ສະຫວ່າງ / ເຂັ້ມ) |
| `oca-logo.jpg` | 1408×768 | ຕົ້ນສະບັບ (ພື້ນທຶບ) — ເກັບໄວ້ອ້າງອີງ, ບໍ່ໃຊ້ໃນ UI |

⚠️ **ຂໍ້ຈຳກັດ:** ທຸກຟາຍເປັນ raster ທີ່ຕັດຈາກ JPG 1408×768, ສັນຍາລັກມີລາຍລະອຽດຈິງພຽງ ~430px. ພໍສຳລັບ UI ໃນເວັບ ແຕ່ **ບໍ່ພໍສຳລັບງານພິມຂະໜາດໃຫຍ່** ແລະ ຍັງບໍ່ມີ SVG (ໂລໂກ້ມີ gradient ແລະ ໜ້າຕັດແບບເພັດ ຈຶ່ງ trace ອັດຕະໂນມັດບໍ່ໄດ້ຄຸນນະພາບ) — ຖ້າຕ້ອງການ vector ຕ້ອງແຕ້ມໃໝ່ ຫຼື ຂໍຟາຍຕົ້ນສະບັບຈາກຜູ້ອອກແບບ.

- **ຊຸດດຽວ:** `lucide-react`, stroke 2px (default). Import ແບບມີ suffix `Icon` (`SearchIcon`, `PlusIcon`).
- **ຂະໜາດ:** 12 (ໃນ badge) · 14 (ປຸ່ມ `sm`, dropdown) · **16 (default)** · 18 (sidebar) · 20 (topbar, KPI) · 22–28 (empty state, hero).
- **ສີ:** ບໍ່ active `#94a3b8` · active/accent `#7e22ce` · ຕາມຄວາມໝາຍຂອງ action.

**ໄອຄອນມາດຕະຖານຕໍ່ action** (ຮຽງຕາມຄວາມຖີ່ໃນຕົ້ນສະບັບ):

| ຄວາມໝາຍ | ໄອຄອນ | ຄວາມໝາຍ | ໄອຄອນ |
|---|---|---|---|
| ຄົ້ນຫາ | `Search` | ເພີ່ມ | `Plus` |
| ເຕືອນ | `AlertTriangle` | ດາວໂຫຼດ / export | `Download` |
| ຕໍ່ໄປ / ເຂົ້າເບິ່ງ | `ChevronRight` | ໂຫຼດໃໝ່ / sync | `RefreshCw` |
| ລຶບ | `Trash2` | ເບິ່ງ | `Eye` |
| ສຳເລັດ | `CheckCircle2` | ແກ້ໄຂ | `Pencil` |
| ຂະຫຍາຍ | `ChevronDown` | ປະຕິເສດ / ຜິດພາດ | `XCircle` |
| ລໍຖ້າ / ເວລາ | `Clock` | ເລືອກແລ້ວ | `Check` |
| ເອກະສານ | `FileText` | ປະຕິທິນ | `Calendar` |
| ຂົນສົ່ງ | `Truck` | ຕັ້ງຄ່າຖັນ | `SlidersHorizontal` |
| ເພີ່ມຂຶ້ນ / ຫຼຸດລົງ | `TrendingUp` / `TrendingDown` | ກັ່ນຕອງ | `Filter` |
| ທີ່ຢູ່ | `MapPin` | ບັນທຶກ | `Save` |
| ສິນຄ້າ / ພັດສະດຸ | `Package` | ກັບຄືນ | `ArrowLeft` |
| ເງິນ | `DollarSign` | ກຳລັງໂຫຼດ | `Loader2` (+ `animate-spin`) |
| ໃບບິນ | `Receipt` | ພິມ | `Printer` |
| ຜູ້ໃຊ້ / ທີມ | `User` / `Users` | ຂໍ້ມູນ | `Info` |
| ຄວາມປອດໄພ / ຢືນຢັນ | `ShieldCheck` | AI | `Sparkles`, `Bot` |
| ເມນູແຖວ | `MoreVertical` | ປິດ | `X` |

**ຮູບພາບ:** ໂລໂກ້ `object-contain` (ບໍ່ຕັດ) · avatar/ຮູບສິນຄ້າ `object-cover` · ຮູບທີ່ຜູ້ໃຊ້ອັບໂຫຼດ: ຈຳກັດ 5MB, ຫຍໍ້ຝັ່ງ client ໃຫ້ດ້ານຍາວສຸດ ≤ 300px (avatar), JPEG ຄຸນນະພາບ 0.85.

---

## 15. Chart ແລະ Data viz

Library: **Recharts**, ຫໍ່ດ້ວຍ `ChartContainer` ຂອງ shadcn (`aspect-video text-xs`).

| ອົງປະກອບ | Light | Dark |
|---|---|---|
| Grid | `stroke="#e2e8f0"` (ຫຼື `#f1f5f9` ຖ້າຕ້ອງການອ່ອນ) | `#33294d` |
| ເສັ້ນແກນ | `#e2e8f0` | `#33294d` |
| Tick | `#64748b` / `#94a3b8`, 11–12px | `#94a3b8` |
| Tooltip | ພື້ນຂາວ, ຂອບ `#e2e8f0`, `rounded-lg`/`rounded-xl` | ພື້ນ `rgba(28,22,48,.95)`, ຂອບ `#33294d`, ຕົວໜັງສື `#e2e8f0` |
| ຟອນ | Noto Sans Lao (ບັງຄັບ) | ຄືກັນ |

**ລຳດັບສີຂອງ series** (series ຫຼັກເປັນສີ brand; ສີຖັດໄປເລືອກໃຫ້ຫ່າງຈາກມ່ວງ ເພື່ອແຍກອອກງ່າຍ):

| # | ສີ | ຊື່ |
|---|---|---|
| 1 | `#7e22ce` | Purple (series ຫຼັກສະເໝີ) |
| 2 | `#f59e0b` | Amber |
| 3 | `#16a34a` / `#10b981` | Green |
| 4 | `#06b6d4` | Cyan |
| 5 | `#4f46e5` | Indigo |
| 6 | `#dc2626` | Red (ໃຊ້ສະເພາະຄ່າລົບ / ຜິດປົກກະຕິ) |

**ສີ categorical ສຳຮອງ** (ເມື່ອມີຫຼາຍໝວດ): `#0EA5E9` · `#10B981` · `#F59E0B` · `#EF4444` · `#14B8A6` · `#EC4899` · `#6366F1` · `#F97316` · `#84CC16` · `#06B6D4`. ໝວດ "ອື່ນໆ" ໃຊ້ `#CBD5E1`.

**ກົດ:** ສີໜຶ່ງ = ຄວາມໝາຍໜຶ່ງ ທົ່ວທັງລະບົບ (ຊ່ອງທາງຂາຍດຽວກັນຕ້ອງສີດຽວກັນໃນທຸກ chart) · ບໍ່ໃຊ້ສີຢ່າງດຽວສື່ຄວາມໝາຍ, ຕ້ອງມີ label/legend · ຄວາມສູງ chart: 200 / 240 / 280 / 320px · ຕົວເລກໃນ tooltip ຜ່ານ `formatNumber`.

---

## 16. ພາສາ, ຕົວເລກ ແລະ ເນື້ອຫາ

### 16.1 ສອງພາສາ

- ພາສາ: `lo` (default) ແລະ `en`. ສະຫຼັບໄດ້ຈາກ topbar; ບັນທຶກຕໍ່ຜູ້ໃຊ້.
- ຂໍ້ຄວາມທົ່ວລະບົບຢູ່ໃນ dictionary ກາງ: `t(key, language)`. ຂໍ້ຄວາມສະເພາະໜ້າ: `isLo ? "ລາວ" : "English"`.
- Model ຂໍ້ມູນທີ່ສະແດງຕໍ່ຜູ້ໃຊ້ມີ 2 field: `labelLo` / `labelEn`.
- ຄຳສັບເທັກນິກ/ຊື່ສະເພາະ ຄົງເປັນອັງກິດ (Dashboard, E-Wallet, QR, Live, AI, CF).
- Layout ຕ້ອງຮັບໄດ້ທັງສອງພາສາ: ໃຊ້ `truncate`, `min-w-0`, `whitespace-nowrap` ໃນ label ສັ້ນ; ຫ້າມກຳນົດຄວາມກວ້າງຕາຍຕົວໃຫ້ປຸ່ມ.

### 16.2 ຕົວເລກ ແລະ ວັນທີ

`formatNumber(value, { maxDecimals = 2, fallback = "—" })`:

- ຂັ້ນຫຼັກພັນດ້ວຍ `,` → `15,000`; ທົດສະນິຍົມສະແດງສະເພາະເມື່ອມີ (ບໍ່ບັງຄັບ `.00`).
- `0` ສະແດງເປັນ `0`; `null` / `undefined` / `""` → `—`.
- **ໃຊ້ກັບ:** ຈຳນວນ, ນ້ຳໜັກ, ເງິນ, ຍອດຂາຍ, ສະຕ໋ອກ. **ບໍ່ໃຊ້ກັບ:** ປີ, ID, ເບີໂທ, ລະຫັດ, ເລກ tracking.
- ສະກຸນເງິນ: `₭ 2,400,000` ຫຼື `2,400,000 ກີບ`; ຫົວຖັນລະບຸໜ່ວຍ "ຈຳນວນ (ກີບ)".
- ຕົວເລກໃນຕາຕະລາງ: ຊິດຂວາ + `font-mono` ຫຼື `tabular-nums`.
- ວັນທີ: `dd/MM/yyyy` (`toLocaleDateString("en-GB")`), ຄິດຕາມເຂດເວລາລາວ (`Asia/Vientiane`) ສະເໝີ ບໍ່ແມ່ນເຂດເວລາຂອງ browser. ຄ່າຫວ່າງ: `—` ຫຼື `-` ສີ `#94a3b8`.
- Count badge ເກີນ 99: `99+`.

### 16.3 ຄຳສັບມາດຕະຖານ

| English | ລາວ | English | ລາວ |
|---|---|---|---|
| Search… | ຄົ້ນຫາ... | Loading… | ກຳລັງໂຫຼດ... |
| Add new | ເພີ່ມໃໝ່ | No data found | ບໍ່ພົບຂໍ້ມູນ |
| Save | ບັນທຶກ | No results | ບໍ່ພົບຜົນລັບ |
| Cancel | ຍົກເລີກ | Filters | ຕົວກອງ |
| Delete | ລຶບ | All | ທັງໝົດ |
| Edit | ແກ້ໄຂ | Per page | ຕໍ່ໜ້າ |
| View details | ເບິ່ງລາຍລະອຽດ | Showing 1-10 of 142 items | ສະແດງ 1-10 ຈາກ 142 ລາຍການ |
| Download | ດາວໂຫຼດ | Previous / Next | ກ່ອນໜ້າ / ໜ້າຕໍ່ໄປ |
| Home | ໜ້າຫຼັກ | selected items | ລາຍການທີ່ເລືອກ |
| Status | ສະຖານະ | Delete selected | ລຶບທີ່ເລືອກ |
| Actions | ຄຳສັ່ງ / ຈັດການ | Mark as read | ໝາຍວ່າອ່ານແລ້ວ |
| Draft | ຮ່າງ | Confirm delete | ຢືນຢັນການລຶບ |
| Approved | ອະນຸມັດແລ້ວ | Log out | ອອກຈາກລະບົບ |
| Rejected | ຖືກປະຕິເສດ | Today | ມື້ນີ້ |
| Pending | ລໍຖ້າ | Paid | ຈ່າຍແລ້ວ |
| Overdue | ເກີນກຳນົດ | My profile | ຂໍ້ມູນສ່ວນຕົວ |

ຂໍ້ຄວາມຢືນຢັນການລຶບ: *"ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບຂໍ້ມູນນີ້? ການກະທຳນີ້ບໍ່ສາມາດກູ້ຄືນໄດ້."*

### 16.4 ນ້ຳສຽງ

ສັ້ນ, ກົງ, ສຸພາບ. ປຸ່ມໃຊ້ຄຳກິລິຍາ ("ບັນທຶກ", "ສ້າງໃບບິນ"). Error ບອກວ່າເກີດຫຍັງ ແລະ ຕ້ອງເຮັດຫຍັງຕໍ່. ຫຼີກລ່ຽງ emoji ໃນ UI ຂອງລະບົບ (ໄອຄອນ lucide ເຮັດໜ້າທີ່ນັ້ນ).

---

## 17. Accessibility

| ເລື່ອງ | ມາດຕະຖານ |
|---|---|
| Focus | `focus-visible:ring-1 focus-visible:ring-ring` (ປຸ່ມ) · `focus:ring-2 focus:ring-[#7e22ce]/20 focus:border-[#7e22ce]` (input) · `focus:ring-2 focus:ring-[#7e22ce]/40` (ປຸ່ມໃນ toast). ຫ້າມເອົາ outline ອອກໂດຍບໍ່ມີ ring ທົດແທນ. |
| ປຸ່ມໄອຄອນ | ຕ້ອງມີ `aria-label` (+ `title`) |
| Loading | `role="status" aria-live="polite" aria-busy="true"`; ປຸ່ມ loading: `aria-busy` + `disabled` |
| Toolbar | `role="toolbar" aria-label="…"`; ເມນູ: `role="menu"`; ປຸ່ມຂະຫຍາຍ: `aria-expanded` |
| Checkbox | ໃຊ້ `<input type="checkbox">` ຈິງ + `aria-label`; ຮອງຮັບ indeterminate |
| Keyboard | `Esc` ປິດ modal / popover / sidebar ມືຖື; `⌘K` / `Ctrl+K` ເປີດຄົ້ນຫາ; `Enter` ສົ່ງການຄົ້ນຫາ; Tab ຕາມລຳດັບທີ່ເຫັນ |
| Hit area | ຂັ້ນຕ່ຳ 32×32px (`h-8 w-8`); ມືຖືຄວນ ≥ 40px |
| Disabled | `disabled:opacity-50 disabled:pointer-events-none` (ຫຼື `cursor-not-allowed`) |
| ຂໍ້ຄວາມເຊື່ອງ | `sr-only` (ເຊັ່ນ "Close" ໃນປຸ່ມ ×) |
| ສີ | ບໍ່ໃຊ້ສີຢ່າງດຽວ: badge ມີ label + ໄອຄອນ |
| Motion | ເຄົາລົບ `prefers-reduced-motion` (§12.5) |
| Test hook | ທຸກ element ທີ່ໂຕ້ຕອບໄດ້ມີ `data-testid` (`button-…`, `input-…`, `row-…`, `card-…`) |

**ຈຸດທີ່ຕ້ອງລະວັງ:** ຂໍ້ຄວາມ `#94a3b8` ເທິງພື້ນຂາວ ມີ contrast ຕ່ຳ (~2.6:1) — ໃຊ້ໄດ້ກັບ placeholder ແລະ ໄອຄອນເທົ່ານັ້ນ; ຂໍ້ຄວາມທີ່ຕ້ອງອ່ານໃຫ້ໃຊ້ `#64748b` ຂຶ້ນໄປ. ຂະໜາດ 9–10px ໃຊ້ສະເພາະ label ເສີມ, ບໍ່ແມ່ນຂໍ້ມູນຫຼັກ.

---

## 18. Print

| ກົດ | ລາຍລະອຽດ |
|---|---|
| ພື້ນຫຼັງ | `@media print { body { background: white !important; } }` |
| ເຊື່ອງ chrome | ໃສ່ `print:hidden` ໃຫ້ sidebar, topbar, ປຸ່ມ, FAB |
| ເອກະສານທີ່ພິມໄດ້ | ຫໍ່ດ້ວຍ class `.mts-printable-doc` (OCA: `.oca-printable-doc`) — ພື້ນຂາວສະເໝີເມື່ອພິມ |
| ເບິ່ງໃນ dark | ໜ້າຈໍ: `filter: invert(.92) hue-rotate(180deg) brightness(1.8)` + ຂອບ + ເງົາ; ຮູບ/canvas/`[data-no-invert]` ຖືກ invert ກັບຄືນ; ພິມ: ເອົາ filter ອອກ |
| ຂອບເຈ້ຍ | default ຕາມ browser; ເຕັມຂອບ: `@page <name> { size: A4; margin: 0; }` + `[data-print-page="<name>"]` |
| **OCA ເພີ່ມ** | ໃບປະໜ້າພັດສະດຸ thermal **100×150mm**: `@page oca-label { size: 100mm 150mm; margin: 0; }` |
| ຟອນເອກະສານທາງການ | `.font-phetsarath` |

---

## 19. ຈຸດບໍ່ສອດຄ່ອງໃນຕົ້ນສະບັບ ແລະ ຂໍ້ຕັດສິນສຳລັບ OCA

ການແກະພົບວ່າຕົ້ນສະບັບມີຫຼາຍຈຸດທີ່ເອກະສານ, token ແລະ ໂຄດຈິງ ບໍ່ກົງກັນ. ຕາຕະລາງນີ້ບອກວ່າ OCA ເລືອກອັນໃດ.

| # | ເລື່ອງ | ສິ່ງທີ່ພົບ | **OCA ໃຊ້** |
|---|---|---|---|
| 1 | ຄວາມກວ້າງ sidebar | ໜ້າ Design System ບອກ 250px; ໂຄດຈິງ 280px | **280px** (rail 72px) |
| 2 | z-index ຂອງ topbar | ເອກະສານບອກ `z-20`; ໂຄດຈິງ `z-[1010]` | ຕາມ §7 |
| 3 | ສີ Danger | ໜ້າ Design System `#ff1744`; token CSS `rgba(252,66,66)`; ໂຄດຈິງ `#dc2626` (×561) + `#ef4444` (×191) | **`#dc2626`** (hover `#b91c1c`); `#ef4444` ສຳລັບ dot/count |
| 4 | ສີ Success / Warning / Info | ໜ້າ Design System `#00b248` / `#ff9100` / `#2196f3`; ໂຄດຈິງ `#16a34a` / `#d97706` / `#2563eb` | ຕາມໂຄດຈິງ (§3.5) |
| 5 | ສີຕົວໜັງສືຫຼັກ | ໜ້າ Design System `#1e2235` (×37); ໂຄດຈິງ `#1e293b` (×1990) | **`#1e293b`** |
| 6 | ສີຕົວໜັງສືຮອງ | `#6b7280` (×93) ທຽບກັບ `#64748b` (×3583) | **`#64748b`** (ຕະກູນ slate ທັງໝົດ) |
| 7 | Radius ຂອງ card | ເອກະສານ `rounded-[20px]` (×149); ໂຄດຈິງ `rounded-2xl` (×661) | **`rounded-2xl`** (16px); table card ຫຼັກອະນຸຍາດ `rounded-[20px]` |
| 8 | Radius ຂອງປຸ່ມ | ເອກະສານ `rounded-[20px]` (pill); ໂຄດຈິງ `rounded-xl` / `rounded-lg` | **`rounded-xl`** (CTA) · **`rounded-lg`** (toolbar) |
| 9 | Primary ໃນ dark | token `#8178ff`; ໜ້າ Design System `#818cf8`; ໂຄດຈິງ `#a5b4fc` (×111) | ສັດສ່ວນຄວາມສະຫວ່າງແບບ `#a5b4fc`, ແຕ່ເປັນໂທນມ່ວງ: **`#d8b4fe`** |
| 10 | ນ້ຳໜັກ "semibold" ຂອງ token Figma | `--english-*-semibold-font-weight` ຖືກຕັ້ງເປັນ `400` | ບໍ່ສືບທອດ token Figma; ໃຊ້ `font-semibold` (600) ຂອງ Tailwind |
| 11 | ສີ card ໃນ dark | `#1a1d2e` (×1542) ທຽບກັບ `#1a1d2d` (ໃນ `KpiCard`/`DataTable`) | ຄ່າຫຼັກ `#1a1d2e` → ປັບເປັນໂທນມ່ວງ **`#1c1630`** |
| 12 | Skeleton | shadcn `Skeleton` = `animate-pulse`; ຂອງໃໝ່ = shimmer | **shimmer** ຢ່າງດຽວ |
| 13 | Toast | ມີ 2 ລະບົບ (Radix Toast ແຕ່ງເອງ + sonner) | **ອັນດຽວ**: Radix Toast ຕາມ §9.11 |
| 14 | Pagination | 3 ແບບ (`TablePagination`, `MTSTableFooter`, ໃນ `DataTable`) | **ແບບດຽວ**: footer ຕາມ §9.9 |
| 15 | ສີ: hex ທຽບກັບ Tailwind palette | ປົນກັນ (`text-[#16a34a]` ແລະ `text-emerald-600`) | semantic token (§20.2) |
| 16 | ຊັ້ນ dark override | ~440 ແຖວ `!important` | ບໍ່ສືບທອດ (§13.4) |
| 17 | Modal overlay | `bg-black/80` (Radix) · `/60` · `/50` · `/40` | **`bg-black/60 backdrop-blur-sm`** |
| 18 | ຟອນຜ່ານ inline style | ໜ້າ Design System ໃສ່ `style={{fontFamily}}` ທຸກ element | ບໍ່ຈຳເປັນ — ຕັ້ງທີ່ `body` ພຽງຄັ້ງດຽວ |
| 19 | ໜ້າ 404 | ພາສາອັງກິດ, ບໍ່ມີ dark, ໃຊ້ `bg-gray-50` | ເຮັດໃໝ່ຕາມ §11.8 |
| 20 | ກົດຂອງໂຄງການທຽບກັບຄວາມຈິງ | `claude-rules` ຫ້າມ hardcode hex ແຕ່ໂຄດໃຊ້ hex ຫຼາຍກວ່າ 30,000 ຄັ້ງ; ຕົວຢ່າງ token ເປັນ OKLCH ແຕ່ໂຄດຈິງເປັນ HSL | OCA ບັງຄັບກົດ "ບໍ່ hardcode hex" ຕັ້ງແຕ່ມື້ທຳອິດ |
| 21 | ສີ brand | MTS ໃຊ້ indigo `#4f46e5` + ພື້ນ dark ໂທນ navy; ໂລໂກ້ OCA ເປັນມ່ວງ | **ມ່ວງຕາມໂລໂກ້** `#7e22ce` (§3.0); indigo ກາຍເປັນສີຮອງ |

---

## 20. ການນຳໄປໃຊ້ໃນ OCA

### 20.1 ສິ່ງທີ່ປ່ຽນຈາກ MTS

| MTS | OCA |
|---|---|
| ໂລໂກ້ MTS, ກາປະຈຳຊາດ, ຊື່ກະຊວງ | ໂລໂກ້ OCA (`docs/assets/oca-logo.png`, `oca-mark.png` ...) — ເບິ່ງ §14 |
| ສີ brand indigo `#4f46e5` + ພື້ນ dark ໂທນ navy | **ມ່ວງຕາມໂລໂກ້** `#7e22ce` + ພື້ນ dark ໂທນມ່ວງ (§3.0) |
| Prefix `mts-` (`.mts-skeleton`, `mts-toast-progress`, `mts_pref_theme`) | Prefix **`oca-`** |
| ຊື່ token `--mtsprimaryprimary-01`, `--english-body1-…` (ມາຈາກ Figma export) | ບໍ່ສືບທອດ; ໃຊ້ token ຂອງ shadcn + token ເພີ່ມໃນ §20.2 |
| ເອກະສານທາງການ, ໃບຢັ້ງຢືນ, ແຜນທີ່, CCTV, WIM | ບໍ່ມີໃນ OCA |
| Wouter + Vite | Next.js App Router; component ທີ່ມີ state ຕ້ອງໃສ່ `"use client"` |
| ຟອນຜ່ານ `<link>` Google Fonts | `next/font/google` (`Noto_Sans_Lao`, `Inter`) → CSS variable |

Indigo `#4f46e5` ຂອງ MTS ຖືກຍ້າຍໄປເປັນສີຮອງ (token `indigo`).

### 20.2 Semantic token ເພີ່ມເຕີມ (ທົດແທນ hex ຕາຍຕົວ)

| Token (utility) | Light | Dark | ທົດແທນ |
|---|---|---|---|
| `bg-app` | `#faf8ff` | `#100c1c` | `bg-[#faf8ff] dark:bg-[#100c1c]` |
| `bg-chrome` | `#ffffff` | `#17122a` | sidebar / topbar |
| `bg-card` | `#ffffff` | `#1c1630` | `bg-white dark:bg-[#1c1630]` |
| `bg-subtle` | `#f8fafc` | `#151024` | thead, footer |
| `bg-muted` | `#f1f5f9` | `#241c3a` | hover |
| `border-border` | `#e2e8f0` | `#33294d` | `border-[#e2e8f0] dark:border-[#33294d]` |
| `border-hairline` | `#f1f5f9` | `#241c3a` | ແຖວຕາຕະລາງ |
| `border-chrome` | `#e9d5ff` | `#241c3a` | sidebar / topbar |
| `text-foreground` | `#1e293b` | `#f1f5f9` | heading / body |
| `text-secondary-fg` | `#64748b` | `#94a3b8` | ຄຳອະທິບາຍ |
| `text-muted-foreground` | `#94a3b8` | `#64748b` | placeholder |
| `bg-primary` / `text-primary` | `#7e22ce` | `#7e22ce` / `#d8b4fe` | |
| `bg-primary-soft` / `border-primary-soft` | `#faf5ff` / `#d8b4fe` | `#2e1065` / `#581c87` | selected |
| `bg-nav-active` | `#e9d5ff` | `#3b1a6e` | sidebar active |
| `{success,warning,danger,info}` + `-soft` + `-border` | ຕາມ §3.5 | ຕາມ §3.5 | badge, alert, toast |

### 20.3 ການແບ່ງ package

| ບ່ອນ | ເນື້ອໃນ |
|---|---|
| `packages/ui/src/styles/globals.css` | token + keyframe + utility (§21) |
| `packages/ui/src/components/ui/*` | shadcn primitive (Button ທີ່ມີ `outlinePrimary` / `outlineDanger`, Card, Dialog, Toast ...) |
| `packages/ui/src/components/*` | component ລະບົບ: `PageHeader`, `StatCard`, `StatusBadge`, `DataTable`, `TableFooter`, `RowActionsMenu`, `BulkActionBar`, `EmptyState`, `ConfirmDialog`, `SearchInput`, `FilterPill`, `Stepper`, `AiMagicButton`, `AiGeneratingFrame`, `LoadingOverlay`, `Skeleton` |
| `packages/ui/src/lib/utils.ts` | `cn()`, `formatNumber()` |
| `apps/admin` | App shell (Sidebar, Topbar, Layout) + ໜ້າຕ່າງໆ |
| `apps/storefront` | ໃຊ້ token ແລະ primitive ດຽວກັນ; **ບໍ່ໃຊ້** app shell ຂອງ admin; ອອກແບບ mobile-first |

### 20.4 Pattern ໃດ ໃຊ້ກັບໂມດູນໃດ

| ໂມດູນ OCA | Pattern ຫຼັກຈາກເອກະສານນີ້ |
|---|---|
| 1. Omnichannel Inbox | Chat (§10.5) ຂະຫຍາຍເປັນ layout 3 ຖັນ; notification panel; count badge; `AiMagicButton` ສຳລັບ Smart Reply; ແຖວ "ຍັງບໍ່ໄດ້ອ່ານ" (§9.8) |
| 2. Social Posting | ໜ້າ form (§11.4); date picker; `AiGeneratingFrame` ສຳລັບແຄັບຊັນ; status pill (ຮ່າງ / ຕັ້ງເວລາ / ໂພສແລ້ວ / ລົ້ມເຫຼວ) |
| 3. AI Image Studio | Canvas ເຕັມຈໍ + panel ຂ້າງ; ພາສາພາບ AI (§3.8, §10.4); toolbar ປຸ່ມໄອຄອນ |
| 4. Live & Post CF | ໜ້າ real-time: ລາຍການ comment (ແຖວ highlight), KPI ສົດ, toast; ໃບບິນ QR + ໂມງນັບຖອຍຫຼັງ (`tabular-nums`, ສີ warning → danger) |
| 5. Promotion | ໜ້າ list + ຟອມ; filter card (§9.4 ແບບ D); ໂມງນັບຖອຍຫຼັງ |
| 6. Affiliate / Dropship | Dashboard (§11.5) + ໜ້າ list; `StatCard` ຄ່ານາຍໜ້າ |
| 7. Inventory | **ໜ້າ list ມາດຕະຖານ (§11.2)** — ໂມດູນທຳອິດທີ່ສ້າງ, ໃຊ້ເປັນຕົ້ນແບບຂອງ `DataTable`; ສີແຖວຕາມສະຖານະສະຕ໋ອກ |
| 8. Logistics | ໜ້າ list + bulk action (ພິມໃບປະໜ້າ); stepper ສະຖານະຂົນສົ່ງ; print 100×150mm (§18) |
| 9. Automation / Slip OCR | panel ກວດຜົນ OCR ຂ້າງຮູບ; ກົດ AI "ຍົກເລີກໄດ້ + ຄົນຢືນຢັນ"; stepper |
| 10. Analytics | Dashboard (§11.5); chart (§15); ສີຄົງທີ່ຕໍ່ຊ່ອງທາງຂາຍ |
| 11. CRM | ໜ້າ detail (§11.3); avatar; tag; timeline |
| 12. Staff / RBAC | ໜ້າ list; switch / checkbox ສິດ; ເມນູ sidebar ກັ່ນຕອງຕາມສິດ; audit log ເປັນຕາຕະລາງ |

**ສີທີ່ OCA ຕ້ອງກຳນົດເພີ່ມ** (ບໍ່ມີໃນຕົ້ນສະບັບ): ສີປະຈຳຊ່ອງທາງ (Facebook, Instagram, TikTok, LINE), ສີລະດັບສະມາຊິກ (Bronze, Silver, Gold, Platinum). ໃຫ້ກຳນົດເປັນ token ແລະ ໃຊ້ສູດ 3 ສີ ຂອງ §3.5.

### 20.5 Checklist ກ່ອນ merge UI

- [ ] ບໍ່ມີ hex ຕາຍຕົວໃນ `className` — ໃຊ້ token
- [ ] ເບິ່ງແລ້ວທັງ light ແລະ dark
- [ ] ເບິ່ງແລ້ວທີ່ 375px, 768px, 1280px; ບໍ່ມີ scroll ແນວນອນຂອງໜ້າ
- [ ] ທຸກຂໍ້ຄວາມມີ `lo` ແລະ `en`; ຂໍ້ຄວາມຍາວບໍ່ລົ້ນ
- [ ] ມີສະຖານະ loading (skeleton), empty, error
- [ ] ຕົວເລກຜ່ານ `formatNumber`; ຖັນຕົວເລກຊິດຂວາ
- [ ] ປຸ່ມໄອຄອນມີ `aria-label`; focus ring ເຫັນໄດ້; `Esc` ປິດ overlay
- [ ] ການລຶບຜ່ານ confirm dialog
- [ ] ມີ primary CTA ພຽງອັນດຽວຕໍ່ມຸມມອງ
- [ ] Card ໃຊ້ `shadow-none` + border; ເງົາສະເພາະສິ່ງທີ່ລອຍ
- [ ] Dropdown ໃນຕາຕະລາງ/modal ໃຊ້ portal
- [ ] ສິ່ງທີ່ AI ສ້າງ ເຫັນໄດ້ຊັດ ແລະ ຍົກເລີກໄດ້
- [ ] Element ທີ່ໂຕ້ຕອບໄດ້ມີ `data-testid`

---

## 21. ພາກຜະໜວກ: `globals.css` ພ້ອມໃຊ້

ວາງໄວ້ທີ່ `packages/ui/src/styles/globals.css`. ເປັນການລວມ token ຈາກ `mts-admin/src/index.css` ທີ່ຖືກຈັດລະບຽບໃໝ່ຕາມຂໍ້ຕັດສິນໃນ §19–§20.

```css
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

:root {
  /* shadcn (HSL) */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 272 72% 47%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 272 72% 47%;
  --radius: 0.5rem;
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;
  --chart-5: 27 87% 67%;

  /* OCA surface + text */
  --app: #faf8ff;
  --chrome: #ffffff;
  --surface: #ffffff;
  --subtle: #f8fafc;
  --hover: #f1f5f9;
  --line: #e2e8f0;
  --hairline: #f1f5f9;
  --line-strong: #cbd5e1;
  --chrome-line: #e9d5ff;
  --ink: #1e293b;
  --ink-secondary: #64748b;
  --ink-muted: #94a3b8;

  /* OCA brand */
  --brand: #7e22ce;          /* ຈາກໂລໂກ້ OCA */
  --brand-deep: #2e1065;     /* wordmark */
  --brand-bright: #9333ea;   /* ປາຍ gradient, accent */
  --brand-hover: #6b21a8;
  --brand-ink: #7e22ce;
  --brand-soft: #faf5ff;
  --brand-soft-line: #d8b4fe;
  --nav-active: #e9d5ff;
  --nav-hover: #f7f0ff;

  /* OCA semantic: solid / soft / line / ink */
  --success: #16a34a; --success-soft: #f0fdf4; --success-line: #bbf7d0; --success-ink: #15803d;
  --warning: #d97706; --warning-soft: #fffbeb; --warning-line: #fde68a; --warning-ink: #b45309;
  --danger:  #dc2626; --danger-soft:  #fef2f2; --danger-line:  #fecaca; --danger-ink:  #b91c1c;
  --info:    #2563eb; --info-soft:    #eff6ff; --info-line:    #bfdbfe; --info-ink:    #1d4ed8;
  --indigo:  #4f46e5; --indigo-soft:  #eef2ff; --indigo-line:  #c7d2fe; --indigo-ink:  #4338ca;

  /* shadow */
  --shadow-float: 0px 4px 24px 0px rgba(0, 0, 0, 0.08);
  --shadow-small: 0px 1px 4px 0px rgba(0, 0, 0, 0.12);
  --shadow-brand: 0 8px 32px rgba(126, 34, 206, 0.15);

  /* layout */
  --topbar-h: 64px;
  --sidebar-w: 280px;
  --sidebar-rail-w: 72px;

  /* font — ຄ່າຈິງມາຈາກ next/font */
  --app-font-sans: var(--font-noto-sans-lao), var(--font-inter), Helvetica, sans-serif;
  --app-font-serif: Georgia, serif;
  --app-font-mono: Menlo, monospace;
}

.dark {
  --background: 255 40% 8%;
  --foreground: 210 40% 98%;
  --card: 254 37% 14%;
  --card-foreground: 210 40% 98%;
  --popover: 254 37% 14%;
  --popover-foreground: 210 40% 98%;
  --primary: 272 72% 47%;
  --primary-foreground: 210 40% 98%;
  --secondary: 257 31% 23%;
  --secondary-foreground: 210 40% 98%;
  --muted: 257 31% 23%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 257 31% 23%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 55%;
  --destructive-foreground: 210 40% 98%;
  --border: 257 31% 23%;
  --input: 257 31% 23%;
  --ring: 270 95% 75%;
  --chart-1: 220 70% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;

  --app: #100c1c;
  --chrome: #17122a;
  --surface: #1c1630;
  --subtle: #151024;
  --hover: #241c3a;
  --line: #33294d;
  --hairline: #241c3a;
  --line-strong: #463a63;
  --chrome-line: #241c3a;
  --ink: #f1f5f9;
  --ink-secondary: #94a3b8;
  --ink-muted: #64748b;

  --brand-ink: #d8b4fe;
  --brand-soft: #2e1065;
  --brand-soft-line: #581c87;
  --nav-active: #3b1a6e;
  --nav-hover: #1c1630;

  --success-soft: rgba(20, 50, 35, 0.6);  --success-line: rgba(40, 100, 65, 0.6);  --success-ink: #86efac;
  --warning-soft: rgba(42, 31, 4, 1);     --warning-line: rgba(120, 75, 20, 0.6);  --warning-ink: #fbbf24;
  --danger-soft:  rgba(80, 25, 30, 0.5);  --danger-line:  rgba(140, 50, 55, 0.6);  --danger-ink:  #fca5a5;
  --info-soft:    rgba(15, 35, 65, 0.55); --info-line:    rgba(45, 70, 130, 0.6);  --info-ink:    #93c5fd;
  --indigo-soft:  rgba(35, 33, 70, 1);    --indigo-line:  rgba(60, 60, 130, 0.6);  --indigo-ink:  #a5b4fc;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-chart-1: hsl(var(--chart-1));
  --color-chart-2: hsl(var(--chart-2));
  --color-chart-3: hsl(var(--chart-3));
  --color-chart-4: hsl(var(--chart-4));
  --color-chart-5: hsl(var(--chart-5));

  /* OCA → utility: bg-app, bg-surface, text-ink, border-line, bg-brand-soft, text-success-ink … */
  --color-app: var(--app);
  --color-chrome: var(--chrome);
  --color-surface: var(--surface);
  --color-subtle: var(--subtle);
  --color-hover: var(--hover);
  --color-line: var(--line);
  --color-hairline: var(--hairline);
  --color-line-strong: var(--line-strong);
  --color-chrome-line: var(--chrome-line);
  --color-ink: var(--ink);
  --color-ink-secondary: var(--ink-secondary);
  --color-ink-muted: var(--ink-muted);
  --color-brand: var(--brand);
  --color-brand-deep: var(--brand-deep);
  --color-brand-bright: var(--brand-bright);
  --color-brand-hover: var(--brand-hover);
  --color-brand-ink: var(--brand-ink);
  --color-brand-soft: var(--brand-soft);
  --color-brand-soft-line: var(--brand-soft-line);
  --color-nav-active: var(--nav-active);
  --color-nav-hover: var(--nav-hover);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-success-line: var(--success-line);
  --color-success-ink: var(--success-ink);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-warning-line: var(--warning-line);
  --color-warning-ink: var(--warning-ink);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-line: var(--danger-line);
  --color-danger-ink: var(--danger-ink);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-info-line: var(--info-line);
  --color-info-ink: var(--info-ink);
  --color-indigo: var(--indigo);
  --color-indigo-soft: var(--indigo-soft);
  --color-indigo-line: var(--indigo-line);
  --color-indigo-ink: var(--indigo-ink);

  --font-sans: var(--app-font-sans);
  --font-serif: var(--app-font-serif);
  --font-mono: var(--app-font-mono);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-float: var(--shadow-float);
  --shadow-small: var(--shadow-small);
  --shadow-brand: var(--shadow-brand);

  /* Type scale: +2px ຈາກ Tailwind default ເພື່ອໃຫ້ອັກສອນລາວອ່ານງ່າຍ.
     text-[Npx] ບໍ່ຖືກກະທົບ. */
  --text-xs: 14px;   --text-xs--line-height: 18px;
  --text-sm: 16px;   --text-sm--line-height: 22px;
  --text-base: 18px; --text-base--line-height: 26px;
  --text-lg: 20px;   --text-lg--line-height: 30px;
  --text-xl: 22px;   --text-xl--line-height: 30px;
  --text-2xl: 26px;  --text-2xl--line-height: 34px;
  --text-3xl: 32px;  --text-3xl--line-height: 38px;
  --text-4xl: 38px;  --text-4xl--line-height: 42px;
  --text-5xl: 50px;  --text-5xl--line-height: 1;
  --text-6xl: 62px;  --text-6xl--line-height: 1;
}

@layer base {
  * {
    border-color: hsl(var(--border));
  }
  body {
    font-family: var(--app-font-sans);
    background-color: var(--app);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .recharts-text,
  .recharts-tooltip-wrapper,
  .recharts-surface text {
    font-family: var(--app-font-sans) !important;
  }
}

/* ── Skeleton shimmer ── ໃຊ້ .oca-skeleton ຢ່າງດຽວ (ບໍ່ຕ້ອງ animate-pulse / bg-*) */
@keyframes oca-skeleton-shimmer {
  from { background-position: 125% 0; }
  to   { background-position: -25% 0; }
}
.oca-skeleton {
  background-color: #e9eef6;
  background-image: linear-gradient(90deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 80%);
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: oca-skeleton-shimmer 1.5s linear infinite;
}
.dark .oca-skeleton {
  background-color: #1c1630;
  background-image: linear-gradient(90deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0) 80%);
}

/* ── Toast countdown ── */
@keyframes oca-toast-progress {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ── AI visual system ── */
@keyframes ai-rainbow-border {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes ai-shimmer-sweep {
  0%   { transform: translateX(-140%) skewX(-16deg); opacity: 0; }
  20%  { opacity: 0.85; }
  70%  { opacity: 0.35; }
  100% { transform: translateX(140%) skewX(-16deg); opacity: 0; }
}
@keyframes ai-spark-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(6,182,212,0)); transform: scale(1); }
  50%      { filter: drop-shadow(0 0 8px rgba(14,165,233,0.65)); transform: scale(1.08); }
}
.ai-magic-button {
  border-color: transparent;
  background:
    linear-gradient(var(--ai-button-bg, #ffffff), var(--ai-button-bg, #ffffff)) padding-box,
    linear-gradient(120deg, #06b6d4, #22c55e, #f59e0b, #ec4899, #7e22ce, #06b6d4) border-box;
  background-size: 100% 100%, 240% 240%;
  color: #0f172a;
  box-shadow: 0 8px 20px rgba(14,165,233,0.12);
  isolation: isolate;
}
.ai-magic-button::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.78) 46%, transparent 72%);
  transform: translateX(-140%) skewX(-16deg);
  pointer-events: none;
  z-index: 0;
}
.ai-magic-button:hover {
  background-size: 100% 100%, 180% 180%;
  box-shadow: 0 10px 24px rgba(14,165,233,0.18);
}
.ai-magic-button:hover::before,
.ai-magic-button-loading::before { animation: ai-shimmer-sweep 1.65s ease-in-out infinite; }
.ai-magic-button-loading { animation: ai-rainbow-border 2.6s linear infinite; }
.ai-magic-button-spark   { animation: ai-spark-pulse 1.8s ease-in-out infinite; }
.dark .ai-magic-button {
  --ai-button-bg: #0f172a;
  color: #e0f2fe;
  box-shadow: 0 10px 24px rgba(14,165,233,0.16);
}

.ai-generating-frame { border-radius: 0.75rem; }
.ai-generating-frame-active { padding: 2px; }
.ai-rainbow-border {
  background:
    linear-gradient(var(--ai-frame-bg, #ffffff), var(--ai-frame-bg, #ffffff)) padding-box,
    linear-gradient(120deg, #06b6d4, #22c55e, #f59e0b, #ec4899, #7e22ce, #06b6d4) border-box;
  background-size: 100% 100%, 260% 260%;
  border: 1px solid transparent;
  animation: ai-rainbow-border 2.8s linear infinite;
  box-shadow: 0 0 0 1px rgba(14,165,233,0.08), 0 12px 28px rgba(14,165,233,0.12);
}
.ai-generating-frame-content { border-radius: calc(0.75rem - 2px); overflow: hidden; }
.ai-generating-frame-label {
  position: absolute; top: 0.35rem; right: 0.45rem; z-index: 20;
  display: inline-flex; align-items: center; gap: 0.35rem;
  max-width: min(92%, 22rem);
  border-radius: 999px;
  border: 1px solid rgba(14,165,233,0.28);
  background: rgba(255,255,255,0.9);
  padding: 0.2rem 0.55rem;
  color: #075985; font-size: 0.68rem; font-weight: 700; line-height: 1.2;
  box-shadow: 0 8px 18px rgba(15,23,42,0.08);
  backdrop-filter: blur(8px);
}
.dark .ai-rainbow-border {
  --ai-frame-bg: #0f172a;
  box-shadow: 0 0 0 1px rgba(125,211,252,0.12), 0 12px 28px rgba(14,165,233,0.16);
}
.dark .ai-generating-frame-label {
  border-color: rgba(125,211,252,0.22);
  background: rgba(15,23,42,0.88);
  color: #bae6fd;
}
.ai-generating-row { position: relative; isolation: isolate; }
.ai-generating-row::after {
  content: "";
  position: absolute; inset: 0.25rem;
  border-radius: 0.75rem;
  pointer-events: none;
  background: linear-gradient(120deg, rgba(6,182,212,0.08), rgba(236,72,153,0.08), rgba(34,197,94,0.08));
  background-size: 220% 220%;
  animation: ai-rainbow-border 2.4s linear infinite;
  z-index: -1;
}

/* ── FAB ຜູ້ຊ່ວຍ AI ── */
@keyframes oca-fab-pulse   { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes oca-fab-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
@keyframes oca-fab-bounce  { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } 60% { transform: translateY(-2px); } }
.oca-fab-pulse       { animation: oca-fab-pulse 1.8s ease-out infinite; }
.oca-fab-pulse-delay { animation: oca-fab-pulse 1.8s ease-out 0.6s infinite; }
.oca-fab-shimmer     { animation: oca-fab-shimmer 3s linear infinite; }
.oca-fab-bounce      { animation: oca-fab-bounce 2.5s ease-in-out infinite; }

/* ── Recharts ໃນ dark (inline style ຂອງ library ຂ້າມ Tailwind) ── */
.dark .recharts-default-tooltip {
  background-color: rgba(28,22,48,0.95) !important;
  border-color: rgba(51,41,77,1) !important;
  color: rgba(226,232,240,1) !important;
}
.dark .recharts-tooltip-label,
.dark .recharts-tooltip-item { color: rgba(226,232,240,1) !important; }
.dark .recharts-cartesian-axis-tick-value { fill: rgba(148,163,184,1) !important; }
.dark .recharts-cartesian-grid line,
.dark .recharts-cartesian-axis-line { stroke: rgba(51,41,77,1) !important; }

/* ── Print ── */
@media print {
  body { background: white !important; }
  .print\:hidden { display: none !important; }
  .oca-printable-doc { filter: none !important; box-shadow: none !important; }
}
@page oca-label { size: 100mm 150mm; margin: 0; }
[data-print-page="oca-label"] { page: oca-label; }

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .oca-skeleton { animation: none; background-image: none; }
  .ai-magic-button::before,
  .ai-magic-button-loading,
  .ai-magic-button-spark,
  .ai-rainbow-border,
  .ai-generating-row::after,
  .oca-fab-pulse,
  .oca-fab-pulse-delay,
  .oca-fab-shimmer,
  .oca-fab-bounce { animation: none; }
}
```

`components.json` (ໃນ `packages/ui`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@oca/ui/components",
    "utils": "@oca/ui/lib/utils",
    "ui": "@oca/ui/components/ui",
    "lib": "@oca/ui/lib",
    "hooks": "@oca/ui/hooks"
  }
}
```

---

*ເອກະສານນີ້ອະທິບາຍ "ມາດຕະຖານທີ່ຕ້ອງການ". ເມື່ອໂຄດຂອງ OCA ແລະ ເອກະສານນີ້ຂັດກັນ ໃຫ້ແກ້ອັນໃດອັນໜຶ່ງໃຫ້ກົງກັນໃນ PR ດຽວກັນ.*

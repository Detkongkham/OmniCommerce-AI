# Dark mode (admin) — design

Date: 2026-10-07

## Goal
Let admin users switch between Light, Dark and System themes. Default is System. The choice persists in the browser.

## Context
- Dark tokens already exist in `packages/ui/src/styles/globals.css` (`.dark` block and `@custom-variant dark (&:is(.dark *))`).
- Missing: switching UI, applying the `dark` class to `<html>`, persistence, no-flash on load, and some hard-coded colors in components.

## Scope
In: `apps/admin`, plus a reusable provider in `packages/ui`.
Out (YAGNI): storefront, server/account-side persistence, themes other than light/dark.

## Approach
Custom provider with no new dependency (chosen over `next-themes`). It follows the existing `LanguageProvider` pattern.

## Components
1. `packages/ui/src/lib/theme.tsx` — `ThemeProvider`, `useTheme()`, exported via `@oca/ui`.
   - Value: `"light" | "dark" | "system"`; stored in localStorage key `oca-theme`; all storage access in try/catch.
   - Resolves `system` through `matchMedia("(prefers-color-scheme: dark)")` and listens for changes.
   - Toggles class `dark` and sets `color-scheme` on `document.documentElement`.
2. `ThemeScript` — inline `<head>` script that applies the class before first paint. `<html>` in `apps/admin/src/app/layout.tsx` gets `suppressHydrationWarning`.
3. `apps/admin/src/components/shell/theme-toggle.tsx` — topbar button beside `LanguageToggle`. Cycles Light → Dark → System. Has `aria-label` and Lao/English i18n strings.
4. `providers.tsx` wraps the tree in `ThemeProvider`.

## Hard-coded colors
Audit and replace `bg-white`, `text-gray-*`, hex values with tokens (`bg-surface`, `text-ink`, `border-line`, ...) in: product-list, login-shell, login-form, sidebar, profile-menu, roles-list, staff-list, order-list, stock-levels, date-field, and `packages/ui` dialog. Semantic colors (success/warning/danger/info) already have dark values.

## Error handling
Unavailable/blocked localStorage falls back to `system` and the page still renders. Missing `matchMedia` falls back to light.

## Testing
- Unit tests for `ThemeProvider`: default, persistence, system via matchMedia, class toggling.
- Unit test for `ThemeToggle` cycle and label.
- Manual check of each page in dark via the running app.
- Existing uncommitted edits (order-list, stock-movements, render helper) are left alone; any overlap is handled by editing minimally.

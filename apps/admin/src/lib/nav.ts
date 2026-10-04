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

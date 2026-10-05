import { type Permission, hasPermission } from "@oca/shared";
import { FolderTree, type LucideIcon, Package, Settings, ShieldCheck, Users, Warehouse } from "lucide-react";
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
    id: "inventory",
    labelKey: "nav.group.inventory",
    items: [
      { href: "/products", labelKey: "nav.products", icon: Package, permission: "inventory:read" },
      { href: "/warehouses", labelKey: "nav.warehouses", icon: Warehouse, permission: "inventory:read" },
      { href: "/categories", labelKey: "nav.categories", icon: FolderTree, permission: "inventory:read" },
    ],
  },
  {
    id: "settings",
    labelKey: "nav.group.settings",
    items: [
      { href: "/settings", labelKey: "nav.storeSettings", icon: Settings, permission: "inventory:read" },
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

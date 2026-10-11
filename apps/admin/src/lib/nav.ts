import { type Permission, hasPermission } from "@oca/shared";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FolderTree,
  Gauge,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
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
      { href: "/stock", labelKey: "nav.stock", icon: Boxes, permission: "inventory:read" },
      { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "orders:read" },
      { href: "/fulfillment", labelKey: "nav.fulfillment", icon: PackageCheck, permission: "logistics:read" },
      { href: "/warehouses", labelKey: "nav.warehouses", icon: Warehouse, permission: "inventory:read" },
      { href: "/categories", labelKey: "nav.categories", icon: FolderTree, permission: "inventory:read" },
    ],
  },
  {
    id: "chat",
    labelKey: "nav.group.chat",
    items: [{ href: "/inbox", labelKey: "nav.inbox", icon: MessageSquare, permission: "inbox:read" }],
  },
  // ຫຼັງ chat: ບົດບາດທີ່ມີທັງ inbox ແລະ live-cf ຍັງ landing ທີ່ /inbox ຄືເກົ່າ
  {
    id: "live",
    labelKey: "nav.group.live",
    items: [{ href: "/live", labelKey: "nav.live", icon: Radio, permission: "live-cf:read" }],
  },
  {
    id: "marketing",
    labelKey: "nav.group.marketing",
    items: [{ href: "/posts", labelKey: "nav.posts", icon: Megaphone, permission: "posting:read" }],
  },
  {
    id: "settings",
    labelKey: "nav.group.settings",
    items: [
      { href: "/settings", labelKey: "nav.storeSettings", icon: Settings, permission: "inventory:read" },
      { href: "/couriers", labelKey: "nav.couriers", icon: Truck, permission: "logistics:read" },
      { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "staff:read" },
      { href: "/roles", labelKey: "nav.roles", icon: ShieldCheck, permission: "staff:read" },
    ],
  },
  // ລາຍງານ (ໂມດູນ 10 + 12) ຢູ່ທ້າຍສຸດ: ບໍ່ປ່ຽນໜ້າຫຼັງ login ຂອງບົດບາດເດີມ (staff:read ຍັງໄປ /staff)
  {
    id: "reports",
    labelKey: "nav.group.reports",
    items: [
      { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3, permission: "analytics:read" },
      { href: "/staff-kpi", labelKey: "nav.staffKpi", icon: Gauge, permission: "staff:read" },
      { href: "/audit", labelKey: "nav.audit", icon: ScrollText, permission: "staff:read" },
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

/** ໜ້າທຳອິດທີ່ຜູ້ໃຊ້ເປີດໄດ້ (ລາຍການທຳອິດຂອງເມນູທີ່ເຫັນ) ໃຊ້ເປັນໜ້າຫຼັງ login; null ຖ້າບໍ່ມີເມນູທີ່ເຫັນເລີຍ. */
export function firstAllowedHref(permissions: readonly string[]): string | null {
  return visibleNavGroups(permissions)[0]?.items[0]?.href ?? null;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

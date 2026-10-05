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

/** ຮູບ response ຂອງລາຍການທີ່ແບ່ງໜ້າຝັ່ງ API (spec §5) */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  productCount: number;
}

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  /** string ສອງທົດສະນິຍົມ ("7.00") */
  vatRate: string;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}

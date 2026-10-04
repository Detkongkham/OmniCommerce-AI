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

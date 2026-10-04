import type { Permission } from "@oca/shared";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

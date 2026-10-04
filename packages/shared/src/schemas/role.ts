import { z } from "zod";
import { type Permission, isPermission } from "../permissions";

export const permissionSchema = z.custom<Permission>(
  (value) => typeof value === "string" && isPermission(value),
  "permission ບໍ່ຖືກຕ້ອງ",
);

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionSchema).transform((list) => [...new Set(list)]),
});

export type RoleInput = z.infer<typeof roleSchema>;

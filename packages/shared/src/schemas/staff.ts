import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

const nameSchema = z.string().trim().min(1).max(100);

export const createStaffSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  roleId: z.string().min(1),
});

export const updateStaffSchema = z
  .strictObject({
    name: nameSchema.optional(),
    password: passwordSchema.optional(),
    roleId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

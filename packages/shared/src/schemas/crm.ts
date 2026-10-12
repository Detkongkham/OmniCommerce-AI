import { z } from "zod";

/** ກຸ່ມ RFM (ລຳດັບ = ລຳດັບການສະແດງ). ກົດການຈັດກຸ່ມຢູ່ໃນ SQL ຂອງ API (customer-stats.sql.ts) */
export const RFM_SEGMENTS = ["CHAMPION", "LOYAL", "NEW", "AT_RISK", "LOST", "REGULAR"] as const;
export type RfmSegment = (typeof RFM_SEGMENTS)[number];

export const CRM_CUSTOMER_SORTS = ["lastOrder", "spent", "created"] as const;
export type CrmCustomerSort = (typeof CRM_CUSTOMER_SORTS)[number];

const pageShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const crmCustomerListQuerySchema = z.object({
  ...pageShape,
  q: z.string().trim().max(100).optional(),
  segment: z.enum(RFM_SEGMENTS).optional(),
  sort: z.enum(CRM_CUSTOMER_SORTS).default("lastOrder"),
});
export type CrmCustomerListQuery = z.infer<typeof crmCustomerListQuerySchema>;

export const crmPageQuerySchema = z.object(pageShape);
export type CrmPageQuery = z.infer<typeof crmPageQuerySchema>;

const PHONE = /^\+?[0-9]{6,15}$/;
/** ຄ່າເປົ່າ = ລ້າງ field (null) */
const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const updateCustomerSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    phone: blankToNull(16)
      .refine((value) => value === null || PHONE.test(value), "ເບີໂທບໍ່ຖືກຕ້ອງ")
      .optional(),
    email: blankToNull(200)
      .refine((value) => value === null || z.email().safeParse(value).success, "ອີເມວບໍ່ຖືກຕ້ອງ")
      .optional(),
    note: blankToNull(500).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const mergeCustomerSchema = z.strictObject({ sourceId: z.string().min(1) });
export type MergeCustomerInput = z.infer<typeof mergeCustomerSchema>;

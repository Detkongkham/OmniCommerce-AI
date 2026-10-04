# 🗺️ Roadmap: OmniCommerce AI (OCA)

ຂອບເຂດ: ຮ້ານດຽວ (ເບິ່ງ [ADR 0001](adr/0001-single-store-first.md)). ລຳດັບລຸ່ມນີ້ຈັດຕາມການຂຶ້ນຕໍ່ກັນຂອງໂມດູນ: ທຸກຊ່ອງທາງຂາຍຕ້ອງຕັດສະຕ໋ອກສູນກາງ ຈຶ່ງເລີ່ມຈາກໂມດູນ 7.

## Phase 0: ພື້ນຖານ
* Monorepo (pnpm + Turborepo), PostgreSQL + Redis, Prisma schema ຫຼັກ.
* Login ແລະ RBAC ຂັ້ນພື້ນຖານ (ສ່ວນໜຶ່ງຂອງໂມດູນ 12).

## Phase 1: MVP
| ລຳດັບ | ໂມດູນ | ຂອບເຂດ |
|---|---|---|
| 1 | 7. Inventory | ສິນຄ້າ, variants, ຕັດສະຕ໋ອກແບບ atomic, ຄຳສັ່ງຊື້ — **API + worker ສຳເລັດ (1a-api)**, ໜ້າ admin ຢູ່ລະຫວ່າງເຮັດ (1a-ui) |
| 2 | 1. Omnichannel Inbox | ເລີ່ມຈາກ Facebook Messenger, ເປີດບິນໃນແຊັດ |
| 3 | 4. Live & Post CF Engine | ດັກຄອມເມັ້ນ CF, ອອກບິນ QR ນັບຖອຍຫຼັງ |
| 4 | 9. Slip Verification | AI ອ່ານສະລິບ ແລະ ປັບສະຖານະບິນ |

## Phase 2: ປະຕິບັດການ
* 8. Smart Logistics Hub
* 12. Staff Management (KPI, Audit Trail ເຕັມຮູບແບບ)
* 10. Analytics & Financial Reports

## Phase 3: ການຕະຫຼາດ ແລະ ຂະຫຍາຍຊ່ອງທາງ
* 7. E-Commerce Storefront (ໜ້າຮ້ານສາທາລະນະ)
* 2. Social Multi-Posting & Scheduler
* 3. AI Image Studio
* 5. Promotion & Marketing Engine
* 11. CRM & Customer Loyalty
* ເພີ່ມຊ່ອງທາງ Instagram, TikTok, LINE ໃສ່ Inbox

## Phase 4: ເຄືອຂ່າຍຜູ້ຂາຍ
* 6. Affiliate & Dropship Portal

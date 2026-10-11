# 🗺️ Roadmap: OmniCommerce AI (OCA)

ຂອບເຂດ: ຮ້ານດຽວ (ເບິ່ງ [ADR 0001](adr/0001-single-store-first.md)). ລຳດັບລຸ່ມນີ້ຈັດຕາມການຂຶ້ນຕໍ່ກັນຂອງໂມດູນ: ທຸກຊ່ອງທາງຂາຍຕ້ອງຕັດສະຕ໋ອກສູນກາງ ຈຶ່ງເລີ່ມຈາກໂມດູນ 7.

## Phase 0: ພື້ນຖານ
* Monorepo (pnpm + Turborepo), PostgreSQL + Redis, Prisma schema ຫຼັກ.
* Login ແລະ RBAC ຂັ້ນພື້ນຖານ (ສ່ວນໜຶ່ງຂອງໂມດູນ 12).

## Phase 1: MVP
| ລຳດັບ | ໂມດູນ | ຂອບເຂດ |
|---|---|---|
| 1 | 7. Inventory | ສິນຄ້າ, variants, ຕັດສະຕ໋ອກແບບ atomic, ຄຳສັ່ງຊື້ — **ສຳເລັດ (1a)**: API + worker (1a-api) ແລະ ໜ້າ admin (1a-ui: ສິນຄ້າ, ສາງ, ໝວດໝູ່, ຕັ້ງຄ່າຮ້ານ, ສະຕ໋ອກ, ຄຳສັ່ງຊື້). ໂມດູນ Inbox, CF Engine ແລະ Slip ເປັນ sub-project ແຍກ ຢູ່ແຖວ 2–4 |
| 2 | 1. Omnichannel Inbox | ເລີ່ມຈາກ Facebook Messenger, ເປີດບິນໃນແຊັດ — **2a ສຳເລັດ**: ຮັບ/ຕອບ Messenger, ມອບໝາຍ/ລິ້ງລູກຄ້າ, ເປີດບິນຈາກແຊັດ + ສະຫຼຸບບິນເຂົ້າແຊັດ. ເຫຼືອ: payment link, AI, ຊ່ອງທາງອື່ນ |
| 3 | 4. Live & Post CF Engine | ດັກຄອມເມັ້ນ CF, ອອກບິນ QR ນັບຖອຍຫຼັງ — **4a ສຳເລັດ**: 4a-1 (backend: webhook ຄອມເມັ້ນ → ບິນ + Private Reply) ແລະ 4a-2 (ໜ້າ admin `/live`, `/live/:id`, ຂໍ້ມູນໂອນໃນ `/settings`). **4b ສຳເລັດ**: Host screen ເຕັມຈໍ `/live/:id/host` (ສິນຄ້ານຳສະເໜີ, ຈຳນວນຕໍ່ລະຫັດ, ຍອດລວມ, CF ລ່າສຸດ) realtime ຜ່ານ SSE + Redis. ເຫຼືອ: ຮູບ QR |
| 4 | 9. Slip Verification | **ຂັ້ນ 1 ສຳເລັດ**: ຮັບສະລິບ (ແຊັດ + ອັບໂຫຼດ), ກວດ 4 ຢ່າງ, ຄົນຢືນຢັນ → PAID, `SlipReader` interface (ມີແຕ່ fake). **ຂັ້ນ 2 ເລື່ອນໄປຫຼັງສຸດ** (ຫຼັງ Phase 4, ເບິ່ງລຸ່ມສຸດ): bake-off + ເລືອກ/host model OCR ເອງ + fine-tune (ເບິ່ງ `docs/superpowers/specs/2026-10-07-phase1-slip-verification-design.md`) |

## Phase 2: ປະຕິບັດການ
* 8. Smart Logistics Hub — **8a ສຳເລັດ**: ລາຍການລໍແພັກ, Scan-to-Pack (ເຄື່ອງຍິງ + ກ້ອງ), ໃບປະໜ້າ 100×150 mm, ສົ່ງອອກພ້ອມ tracking, ແຈ້ງລູກຄ້າທາງແຊັດ. ເຫຼືອ: API ບໍລິສັດຂົນສົ່ງ, ເລືອກສາງອັດຕະໂນມັດ, COD, ຕິດຕາມສະຖານະພັດສະດຸ
* 12. Staff Management (KPI, Audit Trail ເຕັມຮູບແບບ) — **ສຳເລັດ**: `/staff-kpi` (ຍອດປິດການຂາຍ, ເວລາຕອບແຊັດສະເລ່ຍ, ແພັກ/ສົ່ງ/ຍົກເລີກ, ປັບສະຕ໋ອກ + ລາຍວັນ) ແລະ `/audit` (ກັ່ນຕອງ + ກ່ອນ/ຫຼັງ). ເຫຼືອ: ໂມງເຮັດວຽກ, ແຈ້ງເຕືອນທຸຈະລິດອັດຕະໂນມັດ
* 10. Analytics & Financial Reports — **ສຳເລັດ**: `/analytics` (P&L ຂັ້ນຕົ້ນ, ລາຍວັນ, ຊ່ອງທາງ/ແຫຼ່ງບິນ, ສິນຄ້າຂາຍດີ, ຄ້າງສະຕ໋ອກ, ສົ່ງອອກ CSV). ເຫຼືອ: ຫັກຄ່າຂົນສົ່ງ/ຄ່າທຳນຽມຈິງ (ລໍໂມດູນ 8/9), ໄຟລ໌ .xlsx

## Phase 3: ການຕະຫຼາດ ແລະ ຂະຫຍາຍຊ່ອງທາງ
* 7. E-Commerce Storefront (ໜ້າຮ້ານສາທາລະນະ)
* 2. Social Multi-Posting & Scheduler — **2a ສຳເລັດ**: ອັບໂຫຼດຮູບ (disk), ໂພສ/ຕັ້ງເວລາລົງ Facebook Page, ເຊື່ອມ Post CF (start session ເອງ), ໜ້າ admin `/posts` (ລາຍການ + ປະຕິທິນເດືອນ, ຟອມພ້ອມຕົວຢ່າງ, ຮູບຈາກສິນຄ້າ/URL). ເຫຼືອ: ແພລັດຟອມອື່ນ, ວິດີໂອ, ປັບຂະໜາດຮູບ, AI ຂຽນແຄັບຊັນ, ປະຕິທິນ drag & drop, ລຶບໄຟລ໌ທີ່ບໍ່ໃຊ້
* 3. AI Image Studio
* 5. Promotion & Marketing Engine
* 11. CRM & Customer Loyalty
* ເພີ່ມຊ່ອງທາງ Instagram, LINE ໃສ່ Inbox (TikTok ປິດໄວ້ກ່ອນ)

ລຳດັບລົງມື (ຕັດສິນ 2026-10-11), ແຕ່ລະອັນມີ spec → plan ຂອງຕົນ:

| ລຳດັບ | Sub-project | ຂອບເຂດ |
|---|---|---|
| 3b | 7. Storefront | ລາຍການ/ລາຍລະອຽດສິນຄ້າ (SSR, SEO, ມືຖື), ກະຕ່າ, checkout, ຈອງສະຕ໋ອກ atomic, ໂອນ + ອັບໂຫຼດສະລິບ, ຕິດຕາມບິນ |
| 3c | 5. Promotion | ສ່ວນຫຼຸດໃນບິນ, Flash Sale, Bundle, ເຕືອນກະຕ່າຄ້າງ (ຕ້ອງມີກະຕ່າຈາກ 3b) |
| 3d | 11. CRM & Loyalty | Customer 360, RFM, ລະດັບສະມາຊິກ, ແຕ້ມ (ແລກແຕ້ມໃຊ້ສ່ວນຫຼຸດຈາກ 3c) |
| 3e | ຊ່ອງທາງ Inbox | Instagram → LINE (ລໍບັນຊີ ແລະ ການອະນຸມັດຈາກແພລັດຟອມ); ລວມ Social Posting ແພລັດຟອມອື່ນ |
| 3f | 3. Image Studio | Canvas, ລາຍນ້ຳເປັນຊຸດ, ຕັດພື້ນຫຼັງ + ສ້າງສາກດ້ວຍ Gemini API |

* Image Studio ສ່ວນ AI ໃຊ້ Gemini API (key ຂອງເຈົ້າຂອງຮ້ານ, ເກັບໃນ env) — ຕ່າງຈາກ Slip OCR ທີ່ຕ້ອງ host ເອງ.
* ຍັງບໍ່ມີ ແລະ ຈະຈັດຫາພາຍຫຼັງ: ໂດເມນໜ້າຮ້ານ, ບັນຊີ Instagram Business, LINE Official Account, TikTok Business.

## Phase 4: ເຄືອຂ່າຍຜູ້ຂາຍ
* 6. Affiliate & Dropship Portal

## ຫຼັງສຸດ: Slip Verification ຂັ້ນ 2 (OCR)
* ເລື່ອນມາເຮັດຫຼັງທຸກ Phase ສຳເລັດ (ຕັດສິນ 2026-10-11). ລະຫວ່າງນີ້ໃຊ້ `SLIP_READER=fake`: ແອດມິນຕື່ມຄ່າສະລິບເອງ ແລ້ວຢືນຢັນ.
* ເງື່ອນໄຂ: ຮອງຮັບພາສາລາວ, model ຂະໜາດນ້ອຍ ແລະ ໄວ, host ເອງ, ມີ fine-tune.

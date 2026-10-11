# Phase 1 · ໂມດູນ 4 — Slip Verification (ຂັ້ນ 1: flow + SlipReader interface)

ສະຖານະ: draft ລໍ review · ວັນທີ 2026-10-07 · branch `phase1-slip-verification`

## 1. ເປົ້າໝາຍ ແລະ ຂອບເຂດ

ຊ່ວຍແອດມິນກວດສະລິບໂອນເງິນ: ຮັບຮູບສະລິບ → ໃຫ້ເຄື່ອງອ່ານຄ່າ → ເຕືອນຄວາມຜິດປົກກະຕິ → **ຄົນກົດຢືນຢັນ** ແລ້ວບິນເປັນ PAID.

**ຢູ່ໃນຂັ້ນນີ້**
- ສະລິບເຂົ້າ 2 ທາງ: ຮູບໃນແຊັດ Inbox (Messenger) ແລະ ແອດມິນອັບໂຫຼດໃນໜ້າບິນ.
- `SlipReader` interface + `FakeSlipReader` (test/dev) ເທົ່ານັ້ນ. ບໍ່ມີ model ຈິງໃນຂັ້ນນີ້ (ເບິ່ງ §9).
- ກວດ 4 ຢ່າງອັດຕະໂນມັດ ແລ້ວສະແດງເປັນ flag: ຍອດຕົງບິນ, ສະລິບຊ້ຳ, ບັນຊີປາຍທາງຕົງຂອງຮ້ານ, ເວລາໂອນຫຼັງບິນສ້າງ.
- ເກັບຄູ່ (ຮູບ, ຄ່າທີ່ແອດມິນຢືນຢັນ) ເປັນຂໍ້ມູນ train/ປະເມີນສຳລັບຂັ້ນ 2.
- `StorageService` interface + local-disk implementation.

**ນອກຂອບເຂດ (ຕັດສິນແລ້ວ)**
- ປັບ PAID ອັດຕະໂນມັດ (ຄົນຢືນຢັນທຸກຄັ້ງ).
- webhook ຈາກທະນາຄານ/LAPNet.
- ຊຳລະບາງສ່ວນ/ຫຼາຍສະລິບຕໍ່ບິນ: ສະລິບຕໍ່ບິນໄດ້ຫຼາຍໃບ ແຕ່ການຢືນຢັນ = ເປັນ PAID ທັງບິນ; ບໍ່ມີ ledger ຍອດຄ້າງ.
- ໝົດເວລາຈອງ: ບໍ່ປັບເອງ (§5).
- ເລືອກ/host/fine-tune model ຈິງ → ຂັ້ນ 2 (spec ແຍກ).

## 2. ຂໍ້ມູນ

ເພີ່ມ `PaymentSlip` (migration ໃໝ່, ແບບເພີ່ມເທົ່ານັ້ນ):

| field | ໝາຍເຫດ |
|---|---|
| `id` | cuid |
| `orderId?` | ຜູກກັບບິນ (null = ຍັງບໍ່ຜູກ, ມາຈາກແຊັດ) |
| `conversationId?`, `messageId?` | ຕົ້ນທາງຖ້າມາຈາກ Inbox; `@@unique([messageId, attachmentIndex])` ກັນ ingest ຊ້ຳ |
| `source` | `CHAT` \| `UPLOAD` |
| `imageKey`, `imageMime`, `imageBytes`, `imageSha256` | ຮູບໃນ storage |
| `status` | `PENDING_READ` → `READ` \| `READ_FAILED` → `CONFIRMED` \| `REJECTED` |
| `readerName`, `readerVersion` | ຜູ້ອ່ານ/ເວີຊັນ (ໄວ້ທຽບ model ໃນຂັ້ນ 2) |
| `readAmount?`, `readCurrency?`, `readPaidAt?`, `readDestAccount?`, `readRefNo?`, `readRaw` (Json) | ຜົນອ່ານດິບ; `readRaw` = untrusted |
| `flags` | `String[]`: `AMOUNT_MISMATCH`, `DUPLICATE_REF`, `DUPLICATE_IMAGE`, `DEST_MISMATCH`, `PAID_BEFORE_ORDER`, `ORDER_NOT_PAYABLE`, `UNREADABLE_FIELDS` |
| `confirmedAmount?`, `confirmedCurrency?`, `confirmedPaidAt?`, `confirmedRefNo?`, `confirmedDestAccount?` | ຄ່າຫຼັງແອດມິນກວດ/ແກ້ = ປ້າຍກຳກັບສຳລັບຂັ້ນ 2; `confirmedCurrency` ມີເພາະຍອດບໍ່ມີຄວາມໝາຍຖ້າບໍ່ມີສະກຸນ |
| `reviewedByUserId?`, `reviewedAt?`, `rejectReason?` | |
| `createdAt`, `updatedAt` | `updatedAt` ອັບເດດອັດຕະໂນມັດ (`@updatedAt`) |

ຄວາມສຳພັນ `order`/`conversation`/`message`/`reviewedBy` ໃຊ້ `onDelete: SetNull`: ຖ້າບິນຖືກລຶບ ສະລິບຈະກາຍເປັນ orphan (`orderId = null`) ແລະ ຍັງຢູ່ ໂດຍເຈດຕະນາ ເພື່ອເກັບເປັນຂໍ້ມູນ train. ສະກຸນເງິນ (`readCurrency`/`confirmedCurrency`) ຈຳກັດ `LAK`/`THB`/`USD`. ໃນ patch ຂອງແອດມິນ `null` ລ້າງຄ່າ `confirmed*` ທີ່ຢືນຢັນໄວ້ ຍົກເວັ້ນ `orderId` (ລ້າງບໍ່ໄດ້).

index ເພີ່ມເຕີມ: `confirmedRefNo` ແລະ `conversationId` (ໄວ້ຄົ້ນສະລິບຊ້ຳ ແລະ ລາຍການຕາມແຊັດ).

`StoreSetting.receivingAccounts Json` — ລາຍການ `{ bank, accountNo, accountName }` ຂອງຮ້ານ. ເປັນ `[]` = ຂ້າມການກວດບັນຊີ (ບໍ່ໃສ່ flag ຜິດ).

ໝາຍເຫດ env: ການ validate env ຂອງ API/worker ຕ້ອງຍອມຮັບ `SLIP_FAKE_RESULT` ທີ່ເປັນສະຕຣິງ**ຫວ່າງ** (ຄ່າໃນ `.env.example` ເປັນຄ່າຫວ່າງ); `SLIP_READER=` ຫວ່າງ ຖືວ່າບໍ່ຕັ້ງ (= `fake`).

ກົດ: ການຢືນຢັນຕ້ອງ `READ` ຫຼື `READ_FAILED` ເທົ່ານັ້ນ, ແລະ ຕ້ອງຜູກບິນແລ້ວ. ການກັນສະລິບຊ້ຳ = ເຕືອນ **ບໍ່ບລັອກ** (ແອດມິນຕັດສິນ). ຢ່າງໃດກໍຕາມ ສະລິບທີ່ `CONFIRMED` ແລ້ວ ຢືນຢັນຊ້ຳບໍ່ໄດ້ (409).

## 3. Flow

1. **Ingest**
   - CHAT: webhook ບໍ່ປ່ຽນ ແລະ ບໍ່ເກັບຮູບ/ບໍ່ສ້າງ `PaymentSlip` ອັດຕະໂນມັດ (ເພື່ອບໍ່ອ່ານຮູບສິນຄ້າ ແລະ ບໍ່ເສຍຄ່າອ່ານ). ແອດມິນກົດ "ໃຊ້ເປັນສະລິບ" ໃນ thread ແລະ ເລືອກບິນ → API ດາວໂຫຼດຮູບຈາກ attachment ຂອງຂໍ້ຄວາມ (ຈຳກັດ https host/ຂະໜາດ/timeout) → ບັນທຶກ storage → ສ້າງ `PaymentSlip(source=CHAT, status=PENDING_READ)` → ຕໍ່ຄິວ. ຖ້າລິ້ງ Meta ໝົດອາຍຸແລ້ວ ດາວໂຫຼດບໍ່ໄດ້ → 422 `SLIP_FILE_INVALID` ແລະ ແອດມິນອັບໂຫຼດຮູບເອງ (ຂໍ້ຈຳກັດທີ່ຍອມຮັບ; ຍັງບໍ່ຮູ້ອາຍຸລິ້ງຈິງຂອງ Meta).
   - UPLOAD: ແອດມິນອັບໂຫຼດໃນໜ້າບິນ (`orderId` ຮູ້ຢູ່ແລ້ວ).
2. **Read (worker)**: job ໃນຄິວ `slips` ເອີ້ນ `SlipReader.read(image)` → ບັນທຶກ `read*` ແລະ ຄຳນວນ `flags` (§4) → `READ`; ຖ້າ reader ເອງລົ້ມ (reject)/ໝົດເວລາ → job retry; ຫຼັງ retry ຄົບຈຳກັດ → `READ_FAILED` (ແລ້ວແອດມິນກົດ retry ມື).
3. **Review (admin)**: ເຫັນຮູບ + ຄ່າທີ່ອ່ານ + flag ຂ້າງກັນ, ແກ້ຄ່າໄດ້ → **ຢືນຢັນ** ຫຼື **ປະຕິເສດ** (ເຫດຜົນບັງຄັບ).
4. **Confirm**: ໃນ transaction ດຽວ — ຂຽນ `confirmed*` + `status=CONFIRMED` + ເອີ້ນ `OrdersService.pay` (state machine ເດີມ; ສິດ `payments:write`; audit log ເດີມ). ຖ້າ `pay` ລົ້ມ (ບິນບໍ່ຢູ່ `PENDING_PAYMENT` / ໝົດເວລາຈອງ) → rollback ທັງໝົດ, ຕອບ 409 ດ້ວຍ code ທີ່ `pay` ໃຫ້ (`ORDER_INVALID_STATE` / `RESERVATION_EXPIRED`); `ORDER_NOT_PAYABLE` ເປັນ flag ເທົ່ານັ້ນ ບໍ່ແມ່ນ error code. ຖ້າ confirm ໂດຍບໍ່ມີຍອດ (ທັງ `confirmedAmount` ແລະ `readAmount` ຫວ່າງ) → 422 `SLIP_AMOUNT_REQUIRED`.

## 4. ການກວດ (ຄິດໃນ worker ຫຼັງອ່ານ ແລະ ຄິດໃໝ່ເມື່ອຜູກບິນ/ແກ້ຄ່າ)

ຫຼັກ: ຄ່າຄິດຈາກ `confirmed*` ຖ້າມີ ບໍ່ດັ່ງນັ້ນ `read*`. ຟັງຊັນ pure ໃນ `@oca/shared` ເພື່ອ test ງ່າຍ.

- `AMOUNT_MISMATCH`: ຍອດ ≠ ຍອດທີ່ຄາດຫວັງ = `Order.total ÷ Order.exchangeRate` ປັດ 2 ຕຳແໜ່ງ (`Order.total` ເກັບເປັນ baseCurrency; `currency` + `exchangeRate` ຂອງບິນບອກສະກຸນທີ່ລູກຄ້າຈ່າຍ). ສະກຸນຂອງສະລິບເປັນ null ຖືວ່າເທົ່າສະກຸນຂອງບິນ; ສະກຸນທີ່ບໍ່ null ແລະ ຕ່າງຈາກບິນ (ບໍ່ແຍກຕົວພິມ) = mismatch. ຖ້າຍອດເປັນ null ຈະໄດ້ `UNREADABLE_FIELDS` ບໍ່ແມ່ນ `AMOUNT_MISMATCH`. ຍອດ normalize ບໍ່ໄດ້, `Order.total` ເສຍ ຫຼື rate = 0 ນັບເປັນ mismatch (ບໍ່ throw). ໃຊ້ Decimal ບໍ່ແມ່ນ float. `normalizeSlipAmount` ປະຕິເສດຍອດສູນ ແລະ ຍອດທີ່ຈຸດທົດສະນິຍົມເປັນ comma ແບບກຳກວມ.
- `DUPLICATE_REF` / `DUPLICATE_IMAGE`: refNo ທີ່ມີຜົນ (`confirmedRefNo` ຖ້າມີ ບໍ່ດັ່ງນັ້ນ `readRefNo`) + ບັນຊີປາຍທາງ ຫຼື `imageSha256` ຊ້ຳກັບສະລິບອື່ນ (ບໍ່ນັບ `REJECTED`). ປຽບທຽບບັນຊີດ້ວຍ `sameAccount` ທີ່ທົນຕໍ່ຮູບແບບການຂຽນເລກບັນຊີຕ່າງກັນ; ຖ້າສະລິບໃດໜຶ່ງບໍ່ມີບັນຊີປາຍທາງ ນັບເປັນຊ້ຳ (ເປັນຄຳເຕືອນເທົ່ານັ້ນ). ການຫາ refNo ຊ້ຳພິຈາລະນາ candidate ສູງສຸດ 20 ລາຍການ, ເປັນຄຳແນະນຳ ແລະ ບໍ່ເປັນ transaction (ປະເມີນພ້ອມກັນອາດພາດກັນ; ປະເມີນຄືນຕອນແກ້/ຢືນຢັນ).
- `DEST_MISMATCH`: ບັນຊີປາຍທາງບໍ່ຢູ່ໃນ `receivingAccounts` (ປຽບທຽບຫຼັງ normalize ຕົວເລກ; ອະນຸຍາດ masked ເຊັ່ນ `xxx1234` ກັບ 4 ຕົວທ້າຍ).
- `PAID_BEFORE_ORDER`: `paidAt` < `Order.createdAt` (tolerance 5 ນາທີ ເພື່ອ clock skew).
- `ORDER_NOT_PAYABLE`: ບິນ `status != PENDING_PAYMENT` ຫຼື `reservedUntil <= now`.
- `UNREADABLE_FIELDS`: ຂາດ amount ຫຼື refNo; ແລະ ຖ້າຮ້ານຕັ້ງ `receivingAccounts` ແລ້ວ ແຕ່ອ່ານບັນຊີປາຍທາງບໍ່ໄດ້ ກໍໃສ່ flag ນີ້ (ແທນ `DEST_MISMATCH`).

ຖ້າສະລິບຍັງບໍ່ໄດ້ຜູກບິນ (ເຊັ່ນ CHAT ທີ່ຍັງບໍ່ເລືອກບິນ) ຈະຂ້າມ `AMOUNT_MISMATCH`, `PAID_BEFORE_ORDER` ແລະ `ORDER_NOT_PAYABLE`; flag ອື່ນຍັງຄິດຕາມປົກກະຕິ.

flag ທັງໝົດເປັນຂໍ້ມູນຊ່ວຍຕັດສິນ ບໍ່ບລັອກ; ສຳລັບ `ORDER_NOT_PAYABLE` ການ confirm ຖືກບລັອກໂດຍ `pay` (§3.4).

## 5. ບິນໝົດເວລາ/ຍົກເລີກ

ບໍ່ປັບສະຖານະເອງ ແລະ ບໍ່ຈອງສະຕ໋ອກໃໝ່. ສະລິບຍັງ `READ` ພ້ອມ flag `ORDER_NOT_PAYABLE`; ແອດມິນເລືອກ: (ກ) **ຜູກໃໝ່** ກັບບິນອື່ນທີ່ຍັງ `PENDING_PAYMENT` (ເຊັ່ນເປີດບິນໃໝ່ກ່ອນ), (ຂ) **ປະຕິເສດ** ພ້ອມເຫດຜົນ (ຕິດຕາມຄືນເງິນນອກລະບົບ). ການ re-open ບິນທີ່ໝົດເວລາ ບໍ່ຢູ່ໃນຂັ້ນນີ້.

## 6. Interface

```ts
// ຢູ່ packages/ai-engine
interface SlipReader {
  readonly name: string;
  readonly version: string;
  read(image: { bytes: Uint8Array; mime: string }, options?: { signal?: AbortSignal }): Promise<SlipReadResult>;
}
type SlipReadResult = {
  amount?: string; currency?: string; paidAt?: string /* ISO */;
  destAccount?: string; refNo?: string; raw: unknown;
};

// ຢູ່ packages/ai-engine (ບໍ່ແມ່ນ API; API ແລະ worker import ໄປໃຊ້)
interface StorageService {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; mime: string }>;
}
```
- ສັນຍາ error ຂອງ `SlipReader.read`: reject ຖ້າ reader ເອງລົ້ມເຫຼວ ເພື່ອໃຫ້ job retry (ຫຼັງ retry ຄົບ → `READ_FAILED`); ຖ້າສະລິບອ່ານບໍ່ອອກ ໃຫ້ຄືນຜົນທີ່ທຸກ field ເປັນ `undefined` (→ `READ` + `UNREADABLE_FIELDS`). `options.signal` ໃຊ້ຍົກເລີກເມື່ອໝົດເວລາ (`FakeSlipReader` rethrow `signal.reason` ເມື່ອຖືກຍົກເລີກ).
- `StorageService.put` ປະຕິເສດ key ທີ່ມີຢູ່ແລ້ວ (`ALREADY_EXISTS`); `get` ຕ້ອງມີທັງໄຟລ໌ຂໍ້ມູນ ແລະ sidecar `.mime` (ຂາດອັນໃດ → `NOT_FOUND`); mime ເກັບຕາມທີ່ໃຫ້ມາ ບໍ່ກວດ ແລະ ການຈຳກັດຂະໜາດເປັນໜ້າທີ່ຂອງຜູ້ເອີ້ນ.
- error ຂອງ `StorageService` ເປັນ class ມີ type (`StorageError` ແລະ subclass) ພ້ອມ `code`: `NOT_FOUND` / `INVALID_KEY` / `ALREADY_EXISTS`.
- `LocalDiskStorage` (root ຈາກ env `SLIP_STORAGE_DIR`; key = `<prefix>/<yyyy>/<mm>/<uuid>` (UTC) ຈາກ `newStorageKey` ທີ່ export ອອກມາ, ບໍ່ແມ່ນ cuid; ກັນ path traversal ໂດຍ key ມາຈາກລະບົບເທົ່ານັ້ນ).
- `FakeSlipReader`: ຄືນຜົນຕາມ fixture/ຕົວແປ env ສຳລັບ dev + test. ເລືອກ reader ຈາກ `SLIP_READER` (`fake` ເປັນຄ່າເລີ່ມຕົ້ນ; ຖ້າບໍ່ມີ reader ຈິງ ສະລິບຈະຄ້າງ `READ` ດ້ວຍຜົນວ່າງ → ແອດມິນຕື່ມມື ແລະ ກົດຢືນຢັນໄດ້ ຈຶ່ງໃຊ້ງານໄດ້ໂດຍບໍ່ມີ AI).

## 7. API (ໂມດູນ `payments` ທີ່ມີ stub ຢູ່)

| route | ສິດ | ໝາຍເຫດ |
|---|---|---|
| `POST /orders/:id/slips` (multipart) | `orders:write` | ຈຳກັດ MIME (jpeg/png/webp), ຂະໜາດ (ເຊັ່ນ 8MB), ກວດ magic bytes |
| `POST /conversations/:id/messages/:mid/slips` | `orders:write` + `inbox:write` | ຜູກຮູບ attachment ກັບບິນ (body: `orderId`, `attachmentIndex`) |
| `GET /orders/:id/slips`, `GET /slips/:id` | `orders:read` | |
| `GET /slips/:id/image` | `orders:read` | stream ຜ່ານ API ກວດສິດ, `Content-Type` ຈາກ `imageMime`, `nosniff`, ບໍ່ເປີດສາທາລະນະ |
| `PATCH /slips/:id` | `payments:write` | ແກ້ `confirmed*` ແລະ ຜູກບິນໃໝ່ (ຄິດ flag ໃໝ່) |
| `POST /slips/:id/retry` | `payments:write` | ຕໍ່ຄິວອ່ານໃໝ່ |
| `POST /slips/:id/confirm` | `payments:write` | §3.4 |
| `POST /slips/:id/reject` | `payments:write` | ຕ້ອງມີ `reason` |

ທຸກ id ບໍ່ພົບ = 404; error `code` ຄົງທີ່ໃນ `ERROR_CODES` (`SLIP_NOT_FOUND`, `SLIP_ALREADY_REVIEWED`, `SLIP_NOT_LINKED`, `SLIP_AMOUNT_REQUIRED`, `SLIP_FILE_INVALID`; ບໍ່ມີ `ORDER_NOT_PAYABLE` — confirm ໃຊ້ `ORDER_INVALID_STATE` / `RESERVATION_EXPIRED` ທີ່ມີຢູ່) ພ້ອມ i18n lo/en. `CostRedactionInterceptor` ບໍ່ກ່ຽວ.

## 8. UI (admin)

- ໜ້າ `/orders/[id]`: panel "ສະລິບ" — ປຸ່ມອັບໂຫຼດ, ລາຍການສະລິບ, ແຕ່ລະອັນມີຮູບ + ຄ່າທີ່ອ່ານ (ແກ້ໄດ້) + flag (ສີ + ຂໍ້ຄວາມ, ບໍ່ໃຊ້ສີຢ່າງດຽວ) + ປຸ່ມຢືນຢັນ/ປະຕິເສດ (ສະແດງສະເພາະຜູ້ມີ `payments:write`). ປຸ່ມຢືນຢັນມີ confirm dialog ທີ່ສະແດງຍອດ + ເລກບິນ.
- Inbox thread: ຮູບ attachment ມີປຸ່ມ "ໃຊ້ເປັນສະລິບ" → ເລືອກບິນຂອງເຄສນັ້ນ.
- ຮູບໃນໜ້າໂຫຼດຜ່ານ `/slips/:id/image` ດ້ວຍ auth. ຄ່າ `readRaw` ສະແດງເປັນຂໍ້ຄວາມເທົ່ານັ້ນ.

## 9. ເກັບຂໍ້ມູນ train ແລະ ຂັ້ນ 2 (ບໍ່ຢູ່ spec ນີ້)

ຄູ່ (`imageKey`, `confirmed*`) ຂອງສະລິບທີ່ `CONFIRMED` ຄືຊຸດ label; `readerName/Version` ເຮັດໃຫ້ທຽບຄວາມແມ່ນຍຳ reader ກັບຄ່າທີ່ຖືກໄດ້. ມີ script export ເປັນ JSONL (ຂັ້ນ 1 ພຽງ export).

ຂັ້ນ 2 (spec ແຍກ): bake-off ເທິງສະລິບລາວຈິງ (<50 ຮູບທີ່ເຈົ້າຂອງມີ) ລະຫວ່າງ PaddleOCR-VL, Qwen2.5-VL ແລະ baseline PP-OCR+regex; ເລືອກ model; host ເອງ (GPU/deploy); `SlipReader` implementation ຈິງ; fine-tune (LoRA) ເມື່ອມີຂໍ້ມູນຫຼາຍຮ້ອຍຮູບ. ຍັງບໍ່ໄດ້ພິສູດວ່າ model ໃດອ່ານຕົວອັກສອນລາວໄດ້ດີ ຈຶ່ງບໍ່ຕັດສິນກ່ອນ bake-off.

## 10. ຄວາມປອດໄພ ແລະ ຂໍ້ຈຳກັດ

- ຮູບເປັນຂໍ້ມູນລະອຽດອ່ອນ (ເລກບັນຊີ): ບໍ່ເປີດ public, ຜ່ານ API ກວດສິດ, ບໍ່ log ເນື້ອຮູບ/`readRaw`.
- ດາວໂຫຼດຮູບຈາກ Meta: ຈຳກັດ host (https), ຂະໜາດ, timeout, ບໍ່ຕາມ redirect ໄປ host ອື່ນ.
- ຂໍ້ຈຳກັດທີ່ຍອມຮັບ: ສະລິບປອມທີ່ເບິ່ງຖືກທຸກຢ່າງຜ່ານໄດ້ (ບໍ່ມີການຢືນຢັນກັບທະນາຄານ; ຄົນເປັນດ່ານສຸດທ້າຍ); ບໍ່ມີຢືນຢັນບາງສ່ວນ; ການເກັບໃນ disk ເຄື່ອງດຽວ (ບໍ່ scale ຫຼາຍ instance — ສະລັບ S3 ຜ່ານ interface ພາຍຫຼັງ); ຮູບເກົ່າບໍ່ມີ retention policy.

## 11. ທົດສອບ

- shared: ຟັງຊັນ flag ແຕ່ລະຕົວ + edge (Decimal, masked account, clock skew, ສະກຸນຕ່າງ).
- api: ແຕ່ລະ route (ສິດ, 404, MIME/size/magic bytes), confirm ຜ່ານ `pay` + rollback ເມື່ອ pay ລົ້ມ, confirm ແຂ່ງກັນ 2 ຄັ້ງ (ໄດ້ຜົນດຽວ), ຮູບບໍ່ເປີດໂດຍບໍ່ມີ token, permission sweep.
- worker: processor ດ້ວຍ Fake reader (ສຳເລັດ/throw → READ_FAILED).
- admin: panel + inbox action (loading/error/retry, role ບໍ່ມີ `payments:write` ບໍ່ເຫັນປຸ່ມ).
- smoke ໃນ Chrome ຈິງ (copy ແຍກ + ຖານແຍກ ຕາມແບບ 1a/2a).

## 12. ການຕັດສິນໃຈທີ່ບັນທຶກ

| ຫົວຂໍ້ | ຕັດສິນ |
|---|---|
| ແຫຼ່ງສະລິບ | Inbox + ອັບໂຫຼດມື |
| ການປັບບິນ | ຄົນຢືນຢັນທຸກຄັ້ງ |
| ການກວດ | ຍອດ, ຊ້ຳ, ບັນຊີ, ເວລາ (flag ບໍ່ບລັອກ) |
| ບິນໝົດເວລາ | ບໍ່ປັບເອງ, ແອດມິນຕັດສິນ |
| ເກັບຮູບ | disk + `StorageService` |
| OCR | `SlipReader` interface; model ເອງ (ບໍ່ເອີ້ນ API ພາຍນອກ) ຕັດສິນໃນຂັ້ນ 2 ຫຼັງ bake-off |

export interface SlipImage {
  bytes: Uint8Array;
  mime: string;
}

/**
 * ຜົນອ່ານສະລິບ: ທຸກ field ເປັນ optional (ອ່ານບໍ່ໄດ້ = ບໍ່ມີ). `raw` ເກັບໄວ້ debug/ປະເມີນ model ແລະ ເປັນ untrusted.
 * ຮູບແບບ field:
 * - amount: ສະຕຣິງທົດສະນິຍົມ ຄວນບໍ່ມີຕົວຂັ້ນຫຼັກພັນ (ຜູ້ເອີ້ນຈະ normalise ອີກຄັ້ງ)
 * - currency: ລະຫັດ ISO ເຊັ່ນ LAK/THB/USD
 * - paidAt: ISO 8601
 * - destAccount/refNo: ຂໍ້ຄວາມດິບຕາມທີ່ພິມໃນສະລິບ
 */
export interface SlipReadResult {
  amount?: string;
  currency?: string;
  /** ISO 8601 */
  paidAt?: string;
  destAccount?: string;
  refNo?: string;
  raw: unknown;
}

/** ຕົວເລືອກຕອນອ່ານ: `signal` ໃຊ້ຍົກເລີກ (ເຊັ່ນ timeout) */
export interface SlipReadOptions {
  signal?: AbortSignal;
}

/**
 * ຜູ້ອ່ານສະລິບ.
 * ສັນຍາ error:
 * - reader ເອງລົ້ມ (model ລົ່ມ/timeout/ເຄືອຂ່າຍ) → reject ດ້ວຍ Error ເພື່ອໃຫ້ job retry
 * - ອ່ານຮູບໄດ້ ແຕ່ບໍ່ແມ່ນສະລິບທີ່ຮູ້ຈັກ → ຄືນຜົນທີ່ທຸກ field ເປັນ undefined (ຫ້າມ throw ກໍລະນີນີ້)
 * - ອ່ານໄດ້ບາງສ່ວນ = ຄືນສະເພາະ field ທີ່ອ່ານໄດ້.
 * `name`/`version` ຖືກບັນທຶກໃນ PaymentSlip ເພື່ອທຽບຄວາມແມ່ນຍຳລະຫວ່າງ reader.
 */
export interface SlipReader {
  readonly name: string;
  readonly version: string;
  read(image: SlipImage, options?: SlipReadOptions): Promise<SlipReadResult>;
}

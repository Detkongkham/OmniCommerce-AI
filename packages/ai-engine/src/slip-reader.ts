export interface SlipImage {
  bytes: Uint8Array;
  mime: string;
}

/** ຜົນອ່ານສະລິບ: ທຸກ field ເປັນ optional (ອ່ານບໍ່ໄດ້ = ບໍ່ມີ). `raw` ເກັບໄວ້ debug/ປະເມີນ model ແລະ ເປັນ untrusted. */
export interface SlipReadResult {
  amount?: string;
  currency?: string;
  /** ISO 8601 */
  paidAt?: string;
  destAccount?: string;
  refNo?: string;
  raw: unknown;
}

/**
 * ຜູ້ອ່ານສະລິບ. ຕ້ອງ throw ເມື່ອລົ້ມທັງໝົດ (ເຄືອຂ່າຍ/model); ອ່ານໄດ້ບາງສ່ວນ = ຄືນສະເພາະ field ທີ່ອ່ານໄດ້.
 * `name`/`version` ຖືກບັນທຶກໃນ PaymentSlip ເພື່ອທຽບຄວາມແມ່ນຍຳລະຫວ່າງ reader.
 */
export interface SlipReader {
  readonly name: string;
  readonly version: string;
  read(image: SlipImage): Promise<SlipReadResult>;
}

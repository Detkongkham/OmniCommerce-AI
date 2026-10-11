/** ຕັດຕົວຄັ່ນທີ່ຄົນມັກພິມ (ຍະຫວ່າງ, -, ., ວົງເລັບ) ກ່ອນສົ່ງໃຫ້ API */
export function normalizePhone(input: string): string {
  return input.replace(/[\s\-.()]/g, "");
}

/** ກົດດຽວກັບ storeCreateOrderSchema ຂອງ API */
export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{6,15}$/.test(phone);
}

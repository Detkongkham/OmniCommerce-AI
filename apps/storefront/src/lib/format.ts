const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "12500.00" → "12,500 ກີບ". ຮັບ string ຈາກ API (ບໍ່ຜ່ານ float ສຳລັບສ່ວນຈຳນວນເຕັມທີ່ໃຫຍ່) */
export function formatLak(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return amount;
  const whole = GROUPED.format(BigInt(match[1] ?? "0"));
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${fraction === "00" ? whole : `${whole}.${fraction}`} ກີບ`;
}

/** ລາຄາຂອງສິນຄ້າທີ່ມີຫຼາຍ variant: ຄ່າດຽວ ຫຼື "ຕ່ຳສຸດ – ສູງສຸດ" */
export function priceRange(min: string, max: string): string {
  if (min === max) return formatLak(min);
  return `${formatLak(min).replace(" ກີບ", "")} – ${formatLak(max)}`;
}

/**
 * key ສຸ່ມສຳລັບ header Idempotency-Key. `crypto.randomUUID` ບໍ່ມີໃນ context ທີ່ບໍ່ປອດໄພ
 * (http ທີ່ບໍ່ແມ່ນ localhost) ຈຶ່ງມີທາງສຳຮອງດ້ວຍ getRandomValues.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

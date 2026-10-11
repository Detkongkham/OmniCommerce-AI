/** ISO → ຄ່າຂອງ <input type="datetime-local"> ຕາມເວລາຂອງເຄື່ອງ ("YYYY-MM-DDTHH:mm"); null/ຜິດ = "" */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ຄ່າຂອງ datetime-local (ເວລາຂອງເຄື່ອງ) → ISO; ວ່າງ/ຜິດ = null */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

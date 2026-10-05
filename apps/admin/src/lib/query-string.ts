export type QueryValue = string | number | boolean | null | undefined;

/** ສ້າງ `?a=1&b=2`; ຂ້າມ undefined/null/"" ເພື່ອໃຫ້ filter ທີ່ບໍ່ໄດ້ເລືອກບໍ່ຖືກສົ່ງ. ບໍ່ມີ param → "". */
export function toQueryString(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

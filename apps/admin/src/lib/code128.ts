/**
 * Code128 ຊຸດ B (ASCII 32–126) ສຳລັບເລກບິນ/tracking ເທິງໃບປະໜ້າ: ຄືນ module "1"/"0" (ກວ້າງ 1 ໜ່ວຍ).
 * ຕາຕະລາງ = ຄວາມກວ້າງ bar/space ຂອງຄ່າ 0–105 ຕາມມາດຕະຖານ (ISO/IEC 15417); STOP ແຍກ.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
] as const;
const START_B = 104;
const STOP = "2331112";

function widthsToModules(widths: string): string {
  let modules = "";
  for (let i = 0; i < widths.length; i += 1) modules += (i % 2 === 0 ? "1" : "0").repeat(Number(widths[i]));
  return modules;
}

export function code128Modules(text: string): string {
  const values = [...text].map((char) => {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code128 B cannot encode "${char}"`);
    return code - 32;
  });
  const checksum = values.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103;
  return [START_B, ...values, checksum].map((value) => widthsToModules(PATTERNS[value] as string)).join("") + widthsToModules(STOP);
}

/** module ດຳທີ່ຕິດກັນ → ແທ່ງ (ໃຊ້ວາດ SVG) */
export function code128Bars(text: string): { x: number; width: number }[] {
  const modules = code128Modules(text);
  const bars: { x: number; width: number }[] = [];
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] !== "1") continue;
    const last = bars.at(-1);
    if (last && last.x + last.width === i) last.width += 1;
    else bars.push({ x: i, width: 1 });
  }
  return bars;
}

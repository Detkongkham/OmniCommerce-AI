import { code128Bars, code128Modules } from "@/lib/code128";

/** ບາໂຄດ Code128 ເປັນ SVG (ບໍ່ມີ dependency). ລະຫັດທີ່ເຂົ້າລະຫັດບໍ່ໄດ້ (ບໍ່ແມ່ນ ASCII) ສະແດງເປັນຂໍ້ຄວາມຢ່າງດຽວ */
export function Barcode({ value, height = 48, className }: { value: string; height?: number; className?: string }) {
  let bars: { x: number; width: number }[];
  let width: number;
  try {
    width = code128Modules(value).length;
    bars = code128Bars(value);
  } catch {
    return <p className="font-mono text-sm">{value}</p>;
  }
  const quiet = 10;
  return (
    <svg
      role="img"
      aria-label={value}
      className={className}
      viewBox={`0 0 ${width + quiet * 2} ${height}`}
      preserveAspectRatio="none"
      height={height}
      width="100%"
    >
      <rect width={width + quiet * 2} height={height} fill="#fff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x + quiet} width={bar.width} height={height} fill="#000" />
      ))}
    </svg>
  );
}

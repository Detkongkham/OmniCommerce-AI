"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarDatum {
  label: string;
  value: number;
}

export interface SimpleBarChartProps {
  data: BarDatum[];
  /** ຄຳອະທິບາຍຂອງກາຟສຳລັບ screen reader (ຂໍ້ມູນເຕັມຢູ່ໃນຕາຕະລາງຄູ່ກັນ) */
  ariaLabel: string;
  seriesName: string;
  formatValue: (value: number) => string;
  height?: number;
  /** ແທ່ງແນວນອນ (ໝວດໝູ່) ແທນແນວຕັ້ງ (ເວລາ) */
  horizontal?: boolean;
}

// DESIGN §15: series ຫຼັກ = brand; grid/tick ໃຊ້ token ທີ່ປ່ຽນຕາມ dark mode
const BRAND = "var(--brand)";
const GRID = "var(--line)";
const TICK = { fill: "var(--ink-muted)", fontSize: 11 };

export function SimpleBarChart({ data, ariaLabel, seriesName, formatValue, height = 280, horizontal = false }: SimpleBarChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={TICK} stroke={GRID} tickFormatter={(value: number) => compact(value)} />
              <YAxis type="category" dataKey="label" tick={TICK} stroke={GRID} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={TICK} stroke={GRID} minTickGap={12} />
              <YAxis tick={TICK} stroke={GRID} width={56} tickFormatter={(value: number) => compact(value)} />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--hover)" }}
            formatter={(value) => [formatValue(Number(value)), seriesName]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              color: "var(--ink)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" name={seriesName} fill={BRAND} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** ແກນ: 1,200 → 1.2K, 3,400,000 → 3.4M */
export function compact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

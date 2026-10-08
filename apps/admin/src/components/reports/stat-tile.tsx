import { Card } from "@oca/ui";
import type { LucideIcon } from "lucide-react";

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
}

/** ຕົວເລກສະຫຼຸບ 1 ຕົວ (DESIGN §10): label ນ້ອຍ, ຄ່າໃຫຍ່ tabular */
export function StatTile({ label, value, hint, icon: Icon }: StatTileProps) {
  return (
    <Card className="rounded-[20px] p-4">
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        {Icon ? <Icon className="size-4 text-brand" aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
    </Card>
  );
}

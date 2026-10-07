import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export interface SelectProps extends ComponentProps<"select"> {
  invalid?: boolean;
}

/** `<select>` ພື້ນເມືອງທີ່ໃສ່ style ຕາມ Input (ເບິ່ງ "ຄວາມແຕກຕ່າງຈາກ DESIGN.md" ໃນ plan). */
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export interface InputProps extends ComponentProps<"input"> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-subtle aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

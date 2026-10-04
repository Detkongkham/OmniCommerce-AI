import { cn } from "../lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-brand-bright text-xs font-bold text-white",
        className,
      )}
    >
      {initial}
    </span>
  );
}

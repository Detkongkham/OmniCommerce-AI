import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** DESIGN.md §9.3: ແບນ, ບໍ່ມີເງົາ, ຂອບ 1px, ມົນ 2xl. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-none", className)} {...props} />;
}

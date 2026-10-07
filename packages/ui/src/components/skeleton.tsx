import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** ໃຊ້ `.oca-skeleton` (shimmer) ເທົ່ານັ້ນ, ບໍ່ແມ່ນ animate-pulse (DESIGN.md §9.13). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("oca-skeleton rounded-md", className)} {...props} />;
}

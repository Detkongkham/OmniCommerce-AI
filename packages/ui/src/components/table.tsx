import type { ComponentProps } from "react";
import { cn } from "../lib/utils";
import { Skeleton } from "./skeleton";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-subtle", className)} {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-t border-hairline transition-colors hover:bg-app", className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("whitespace-nowrap px-4 py-3 text-left font-medium text-ink-secondary", className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3", className)} {...props} />;
}

export function TableSkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row} className="hover:bg-transparent">
      {Array.from({ length: columns }, (_, column) => (
        <TableCell key={column}>
          <Skeleton className="h-4 w-full max-w-[160px]" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

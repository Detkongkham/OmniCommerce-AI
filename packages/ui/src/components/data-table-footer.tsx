import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { PAGE_SIZE_OPTIONS, getPageItems } from "./pagination";

export interface DataTableFooterLabels {
  show: string;
  perPage: string;
  all: string;
  previous: string;
  next: string;
}

export interface DataTableFooterProps {
  page: number;
  totalPages: number;
  pageSize: number;
  /** ຂໍ້ຄວາມສະຫຼຸບທີ່ແປແລ້ວ ເຊັ່ນ "ສະແດງ 1-10 ຈາກ 142 ລາຍການ". */
  summary: string;
  labels: DataTableFooterLabels;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const PAGE_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

/** DESIGN.md §9.9. ປຸ່ມສະແດງຢູ່ສະເໝີ (disabled) ເພື່ອໃຫ້ຄວາມສູງ footer ຄົງທີ່. */
export function DataTableFooter({
  page,
  totalPages,
  pageSize,
  summary,
  labels,
  onPageChange,
  onPageSizeChange,
}: DataTableFooterProps) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line bg-surface px-3 py-3 sm:flex-row sm:px-6">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <div className="flex items-center gap-2">
          <span>{labels.show}</span>
          <select
            aria-label={labels.perPage}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-line bg-surface pl-3 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size === 0 ? labels.all : size}
              </option>
            ))}
          </select>
          <span>{labels.perPage}</span>
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-line" />
        <span>{summary}</span>
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          aria-label={labels.previous}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(PAGE_BUTTON, "border border-line bg-surface text-ink-secondary hover:bg-subtle")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        {getPageItems(page, totalPages).map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                PAGE_BUTTON,
                item === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-line bg-surface text-ink-secondary hover:bg-subtle",
              )}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden="true" className="px-1 text-ink-muted">
              …
            </span>
          ),
        )}
        <button
          type="button"
          aria-label={labels.next}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={cn(PAGE_BUTTON, "border border-line bg-surface text-ink-secondary hover:bg-subtle")}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

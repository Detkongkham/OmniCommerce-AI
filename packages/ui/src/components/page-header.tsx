import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  breadcrumbs: string[];
  title: string;
  badge?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ breadcrumbs, title, badge, description, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-[64px] z-30 flex w-full flex-col gap-3 bg-app/90 px-3 pb-3 pt-[18px] backdrop-blur-sm sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-secondary">
        {breadcrumbs.map((crumb, index) => {
          const last = index === breadcrumbs.length - 1;
          return (
            <span key={`${index}-${crumb}`} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="size-3.5 text-line-strong" aria-hidden="true" /> : null}
              <span className={last ? "font-medium text-brand-ink" : undefined} aria-current={last ? "page" : undefined}>
                {crumb}
              </span>
            </span>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold leading-tight text-ink">{title}</h1>
            {badge ? <span className="rounded-full bg-brand-soft px-3 py-1 text-xs text-brand-ink">{badge}</span> : null}
          </div>
          {description ? <p className="mt-0.5 text-sm text-ink-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

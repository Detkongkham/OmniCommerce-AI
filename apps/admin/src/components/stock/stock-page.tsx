"use client";

import { PageHeader, cn } from "@oca/ui";
import { useSearchParams } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { StockLevels } from "./stock-levels";
import { StockMovements } from "./stock-movements";
import { type StockTab, parseStockSearchParams } from "./stock-search-params";

export type { StockTab };

const TAB_IDS: StockTab[] = ["levels", "movements"];

/** ອັບເດດ ?tab= ໂດຍບໍ່ navigate (ຮັກສາ ?q= ແລະ ຮັກສາ state ຂອງ panel). */
function syncTabToUrl(tab: StockTab) {
  try {
    const url = new URL(window.location.href);
    if (tab === "movements") url.searchParams.set("tab", "movements");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ບໍ່ມີ history API: ຂ້າມ */
  }
}

export function StockPage({ initialQuery, initialTab }: { initialQuery: string; initialTab: StockTab }) {
  const { t } = useT();
  const baseId = `stock-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const urlParams = useSearchParams();
  const url = parseStockSearchParams({ q: urlParams?.get("q"), tab: urlParams?.get("tab") });
  const [tab, setTab] = useState<StockTab>(initialTab);
  const [visited, setVisited] = useState<Set<StockTab>>(() => new Set([initialTab]));
  const [query, setQuery] = useState(initialQuery);
  // ຕາມ URL ເມື່ອມີ navigation ພາຍຫຼັງ (link sidebar, ?q=, ?tab=). ປ່ຽນສະເພາະເມື່ອຄ່າໃນ URL ປ່ຽນ ເພື່ອບໍ່ທັບການກົດແຖບເອງ.
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl.tab !== url.tab || seenUrl.q !== url.q) {
    setSeenUrl(url);
    if (seenUrl.tab !== url.tab) {
      setTab(url.tab);
      setVisited((prev) => (prev.has(url.tab) ? prev : new Set(prev).add(url.tab)));
    }
    if (seenUrl.q !== url.q) setQuery(url.q);
  }
  // panel ທີ່ເຄີຍເປີດຖືກເກັບໄວ້ (ຊ່ອນດ້ວຍ hidden) ເພື່ອບໍ່ໃຫ້ filter ຫາຍ ແລະ ບໍ່ ຍິງ API ຂອງແຖບທີ່ຍັງບໍ່ເປີດ.
  const tabRefs = useRef<Record<StockTab, HTMLButtonElement | null>>({ levels: null, movements: null });
  const labels: Record<StockTab, string> = {
    levels: t("stock.tab.levels"),
    movements: t("stock.tab.movements"),
  };

  const tabId = (id: StockTab) => `${baseId}-tab-${id}`;
  const panelId = (id: StockTab) => `${baseId}-panel-${id}`;

  function renderPanel(id: StockTab): ReactNode {
    if (!visited.has(id)) return null;
    return id === "levels" ? <StockLevels key={query} initialQuery={query} /> : <StockMovements />;
  }

  function select(next: StockTab, focus = false) {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    syncTabToUrl(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null;
    if (event.key === "ArrowRight") target = (index + 1) % TAB_IDS.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = TAB_IDS.length - 1;
    if (target === null) return;
    event.preventDefault();
    const next = TAB_IDS[target];
    if (next) select(next, true);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("stock.title")]}
        title={t("stock.title")}
        description={t("stock.description")}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div role="tablist" aria-label={t("stock.tabs.label")} className="flex gap-1 border-b border-line">
          {TAB_IDS.map((id, index) => (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[id] = node;
              }}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={tab === id}
              aria-controls={panelId(id)}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => select(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === id ? "border-brand text-brand-ink" : "border-transparent text-ink-secondary hover:text-ink",
              )}
            >
              {labels[id]}
            </button>
          ))}
        </div>
        {TAB_IDS.map((id) => (
          <div
            key={id}
            role="tabpanel"
            id={panelId(id)}
            aria-labelledby={tabId(id)}
            hidden={tab !== id}
          >
            {renderPanel(id)}
          </div>
        ))}
      </div>
    </div>
  );
}

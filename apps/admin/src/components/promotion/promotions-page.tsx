"use client";

import { PageHeader, cn } from "@oca/ui";
import { type KeyboardEvent, useRef, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { CouponList } from "./coupon-list";
import { FlashSaleList } from "./flash-sale-list";

const TAB_IDS = ["coupons", "flashSales"] as const;
type TabId = (typeof TAB_IDS)[number];
const tabId = (id: TabId) => `promotions-tab-${id}`;
const panelId = (id: TabId) => `promotions-panel-${id}`;

/** ໜ້າໂປຣໂມຊັ່ນ: ແຖບ "ໂຄດສ່ວນຫຼຸດ" ແລະ "Flash Sale" */
export function PromotionsPage() {
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("coupons");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TAB_IDS[(index + step + TAB_IDS.length) % TAB_IDS.length] ?? "coupons";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      <PageHeader breadcrumbs={[t("nav.home"), t("promotions.title")]} title={t("promotions.title")} description={t("promotions.description")} />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div role="tablist" aria-label={t("promotions.tabs.label")} className="flex gap-1 border-b border-line">
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
              onClick={() => setTab(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === id ? "border-brand text-brand-ink" : "border-transparent text-ink-secondary hover:text-ink",
              )}
            >
              {t(`promotions.tabs.${id}`)}
            </button>
          ))}
        </div>
        {TAB_IDS.map((id) => (
          <div key={id} role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id)} hidden={tab !== id}>
            {/* render ສະເພາະແຖບທີ່ເປີດ: ບໍ່ດຶງຂໍ້ມູນຂອງແຖບທີ່ຍັງບໍ່ໄດ້ເບິ່ງ */}
            {tab === id ? id === "coupons" ? <CouponList /> : <FlashSaleList /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

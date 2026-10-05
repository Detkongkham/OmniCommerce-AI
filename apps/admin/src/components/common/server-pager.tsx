"use client";

import { DataTableFooter } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

/** pageSize ສູງສຸດທີ່ API ຍອມ (spec §5). "ທັງໝົດ" ຂອງ footer ຖືກແປງເປັນຄ່ານີ້. */
export const MAX_SERVER_PAGE_SIZE = 100;

export interface ServerPagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** DataTableFooter ສຳລັບຂໍ້ມູນທີ່ແບ່ງໜ້າຝັ່ງ server (ຕ່າງຈາກ `paginate()` ທີ່ແບ່ງໃນ client). */
export function ServerPager({ page, pageSize, total, onPageChange, onPageSizeChange }: ServerPagerProps) {
  const { t } = useT();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <DataTableFooter
      page={page}
      totalPages={totalPages}
      pageSize={pageSize >= MAX_SERVER_PAGE_SIZE ? 0 : pageSize}
      summary={t("page.showing", { from, to, total })}
      labels={{
        show: t("page.show"),
        perPage: t("page.perPage"),
        all: t("page.all"),
        previous: t("page.previous"),
        next: t("page.next"),
      }}
      onPageChange={onPageChange}
      onPageSizeChange={(size) => onPageSizeChange(size === 0 ? MAX_SERVER_PAGE_SIZE : size)}
    />
  );
}

"use client";

import { PRODUCT_STATUSES } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, ImageOff, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { flattenCategories } from "@/lib/category-tree";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCategories, useProducts } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { ProductStatusPill } from "./product-status";

const COLUMNS = 5;

/** "min – max", ຄ່າດຽວເມື່ອເທົ່າກັນ ຫຼື ມີຄ່າດຽວ, "—" ເມື່ອບໍ່ມີ variant */
function priceRange(min: string | null, max: string | null): string {
  if (min === null || max === null || min === max) return formatMoney(min ?? max);
  return `${formatMoney(min)} – ${formatMoney(max)}`;
}

export function ProductList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useDebounced(search.trim(), 300);

  const query = useProducts({ q, status, categoryId, page, pageSize });
  const categories = useCategories();
  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const busy = query.isPending || query.isPlaceholderData;
  const filtered = q !== "" || status !== "" || categoryId !== "";

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const addButton = canWrite ? (
    <Link href="/products/new" className={cn(buttonVariants(), "rounded-xl")}>
      <Plus aria-hidden="true" />
      {t("products.add")}
    </Link>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title")]}
        title={t("products.title")}
        badge={query.data ? t("products.count", { count: query.data.total }) : undefined}
        description={t("products.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => resetPage(setSearch)(event.target.value)}
                placeholder={t("products.search")}
                aria-label={t("products.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("products.filter.status")}
              className="w-44"
              value={status}
              onChange={(event) => resetPage(setStatus)(event.target.value)}
            >
              <option value="">{t("products.filter.allStatuses")}</option>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`products.status.${value}`)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t("products.filter.category")}
              className="w-52"
              value={categoryId}
              onChange={(event) => resetPage(setCategoryId)(event.target.value)}
            >
              <option value="">{t("products.filter.allCategories")}</option>
              {categoryRows.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {`${"— ".repeat(depth)}${category.name}`}
                </option>
              ))}
            </Select>
          </div>

          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <p role="status" className="sr-only">
                {!busy && rows.length > 0 ? t("products.found", { count: total }) : ""}
              </p>
              <Table aria-label={t("products.table")} aria-busy={busy}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{t("products.col.product")}</TableHead>
                    <TableHead scope="col">{t("products.col.category")}</TableHead>
                    <TableHead scope="col">{t("products.col.status")}</TableHead>
                    <TableHead scope="col" className="text-right">{t("products.col.price")}</TableHead>
                    <TableHead scope="col" className="text-right">{t("products.col.available")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((product) => (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <ImageOff className="size-4 text-ink-muted" aria-hidden="true" />
                            )}
                          </div>
                          <div>
                            <Link href={`/products/${product.id}`} className="font-medium text-ink hover:text-brand-ink">
                              {product.name}
                            </Link>
                            <p className="text-xs text-ink-muted">{t("products.variantCount", { count: product.variantCount })}</p>
                          </div>
                        </div>
                      </th>
                      <TableCell className="text-ink-secondary">{product.category?.name ?? "—"}</TableCell>
                      <TableCell>
                        <ProductStatusPill status={product.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {priceRange(product.priceMin, product.priceMax)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(product.availableTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 && total === 0 ? (
                <div role="status">
                <EmptyState
                  icon={Package}
                  title={filtered ? t("products.empty.noResults") : t("products.empty.title")}
                  action={
                    filtered ? (
                      <Button
                        variant="outlinePrimary"
                        className="rounded-lg"
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                          setCategoryId("");
                          setPage(1);
                        }}
                      >
                        {t("common.clearSearch")}
                      </Button>
                    ) : (
                      addButton
                    )
                  }
                />
                </div>
              ) : null}
              <ServerPager
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

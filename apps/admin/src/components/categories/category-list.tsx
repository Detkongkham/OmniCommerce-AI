"use client";

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCategories, useDeleteCategory } from "@/lib/queries";
import type { CategoryDto } from "@/lib/types";
import { CategoryFormDialog } from "./category-form-dialog";

const COLUMNS = 5;

export function CategoryList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const query = useCategories();
  const remove = useDeleteCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<CategoryDto | null>(null);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);
  // ແຍກ open ອອກຈາກ deleting ເພື່ອໃຫ້ຊື່ຍັງຢູ່ໃນ dialog ຕອນມັນ fade out
  const [confirmOpen, setConfirmOpen] = useState(false);

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => flattenCategories(all), [all]);

  function openForm(category: CategoryDto | null) {
    setFormCategory(category);
    setFormOpen(true);
  }

  async function confirmDelete(category: CategoryDto) {
    try {
      await remove.mutateAsync(category.id);
      toast.success(t("categories.toast.deleted"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setConfirmOpen(false);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("categories.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("categories.title")]}
        title={t("categories.title")}
        badge={query.data ? t("categories.count", { count: all.length }) : undefined}
        description={t("categories.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
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
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("categories.col.name")}</TableHead>
                    <TableHead>{t("categories.col.slug")}</TableHead>
                    <TableHead className="text-right">{t("categories.col.products")}</TableHead>
                    <TableHead className="text-right">{t("categories.col.position")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map(({ category, depth }) => (
                    <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                      <TableCell>
                        <span className="font-medium text-ink" style={{ paddingLeft: `${depth * 20}px` }}>
                          {depth > 0 ? <span aria-hidden="true" className="mr-1 text-ink-muted">└</span> : null}
                          {category.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-ink-secondary">{category.slug}</TableCell>
                      <TableCell className="text-right tabular-nums">{category.productCount}</TableCell>
                      <TableCell className="text-right tabular-nums text-ink-secondary">{category.position}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("categories.edit")} ${category.name}`}
                                title={t("categories.edit")}
                                disabled={remove.isPending}
                                onClick={() => openForm(category)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("categories.delete")} ${category.name}`}
                                title={t("categories.delete")}
                                disabled={remove.isPending}
                                onClick={() => {
                                  setDeleting(category);
                                  setConfirmOpen(true);
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState icon={FolderTree} title={t("categories.empty.title")} action={addButton} />
              ) : null}
            </>
          )}
        </Card>
      </div>

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={formCategory} categories={all} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("categories.deleteTitle")}
        description={t("categories.deleteDescription", { name: deleting?.name ?? "" })}
        confirmLabel={t("categories.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={remove.isPending}
        onConfirm={() => (deleting ? confirmDelete(deleting) : undefined)}
      />
    </div>
  );
}

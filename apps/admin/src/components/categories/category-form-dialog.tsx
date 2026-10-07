"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createCategorySchema } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Select,
  toast,
} from "@oca/ui";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { descendantIds, flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import type { Translate, TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useSaveCategory } from "@/lib/queries";
import type { CategoryDto } from "@/lib/types";

/** slug ເປົ່າ = ໃຫ້ API ສ້າງເອງ; ມີຄ່າຕ້ອງຕາມຮູບແບບ slug (ຄືກັບ schema ຂອງ shared) */
const formSchema = z.object({
  name: createCategorySchema.shape.name,
  slug: z
    .string()
    .trim()
    .max(100)
    .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/),
  parentId: z.string(),
  position: z.coerce.number().int().min(0),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** ຂໍ້ຄວາມ error ຂອງ field ຕາມຊະນິດ issue ຂອງ zod (ບໍ່ແມ່ນ "required" ທຸກກໍລະນີ) */
function fieldError(
  error: { type?: string | undefined } | undefined,
  t: Translate,
  opts: { max?: number; format?: TranslationKey },
): string | undefined {
  if (!error) return undefined;
  if (error.type === "too_big" && opts.max) return t("validation.tooLong", { max: opts.max });
  if (opts.format) return t(opts.format);
  return t("validation.required");
}

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່ */
  category: CategoryDto | null;
  categories: CategoryDto[];
}

export function CategoryFormDialog({ open, onOpenChange, category, categories }: CategoryFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <CategoryForm
          key={category?.id ?? "new"}
          category={category}
          categories={categories}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  categories,
  onDone,
}: {
  category: CategoryDto | null;
  categories: CategoryDto[];
  onDone: () => void;
}) {
  const { t } = useT();
  const save = useSaveCategory();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      parentId: category?.parentId ?? "",
      position: category?.position ?? 0,
    },
  });

  // ໝວດແມ່ຕ້ອງບໍ່ແມ່ນໂຕເອງ/ລູກຫຼານ (API ຕອບ 400): ຕັດອອກຈາກຕົວເລືອກ
  const parentOptions = useMemo(() => {
    const blocked = category ? new Set([category.id, ...descendantIds(categories, category.id)]) : new Set<string>();
    return flattenCategories(categories).filter((row) => !blocked.has(row.category.id));
  }, [categories, category]);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (category) {
        await save.mutateAsync({
          id: category.id,
          input: {
            name: values.name,
            slug: values.slug || category.slug,
            parentId: values.parentId === "" ? null : values.parentId,
            position: values.position,
          },
        });
        toast.success(t("categories.toast.updated"));
      } else {
        await save.mutateAsync({
          input: {
            name: values.name,
            ...(values.slug ? { slug: values.slug } : {}),
            ...(values.parentId ? { parentId: values.parentId } : {}),
            position: values.position,
          },
        });
        toast.success(t("categories.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={category ? t("categories.edit") : t("categories.form.createTitle")}
        description={category ? t("categories.form.editDescription") : t("categories.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("categories.col.name")}
            htmlFor="category-name"
            required
            error={fieldError(errors.name, t, { max: 100 })}
          >
            <Input id="category-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label={t("categories.col.slug")}
            htmlFor="category-slug"
            error={fieldError(errors.slug, t, { max: 100, format: "categories.form.slugInvalid" })}
          >
            <Input
              id="category-slug"
              invalid={!!errors.slug}
              aria-describedby="category-slug-hint"
              {...register("slug")}
            />
            <p id="category-slug-hint" className="mt-1 text-xs text-ink-muted">{t("categories.form.slugHint")}</p>
          </Field>
          <Field label={t("categories.form.parent")} htmlFor="category-parent">
            <Select id="category-parent" {...register("parentId")}>
              <option value="">{t("categories.form.noParent")}</option>
              {parentOptions.map((row) => (
                <option key={row.category.id} value={row.category.id}>
                  {`${"— ".repeat(row.depth)}${row.category.name}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("categories.col.position")}
            htmlFor="category-position"
            error={fieldError(errors.position, t, { format: "categories.form.positionInvalid" })}
          >
            <Input id="category-position" type="number" min={0} invalid={!!errors.position} {...register("position")} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

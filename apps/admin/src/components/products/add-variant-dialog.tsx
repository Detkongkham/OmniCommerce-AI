"use client";

import { variantInputSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useRef, useState } from "react";
import type { z } from "zod";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { formatIssues } from "@/lib/product-form";
import { useAddVariant } from "@/lib/queries";
import type { ProductDetailDto } from "@/lib/types";
import { ProblemAlert } from "./problem-alert";

export interface AddVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetailDto;
}

export function AddVariantDialog({ open, onOpenChange, product }: AddVariantDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <AddVariantForm product={product} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function omitCost({ costPrice: _defaulted, ...rest }: z.output<typeof variantInputSchema>) {
  return rest;
}

function AddVariantForm({ product, onDone }: { product: ProductDetailDto; onDone: () => void }) {
  const { t } = useT();
  const canSetCost = useCan("costs:write");
  const add = useAddVariant();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(product.options.map((option) => [option.name, option.values[0]?.value ?? ""])),
  );
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  // state updates are async, so a ref is what actually blocks a second submit in the same tick
  const submitting = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;

    const sameCombination = product.variants.some((variant) =>
      product.options.every((option) => variant.optionValues[option.name] === values[option.name]),
    );
    if (sameCombination) {
      const name = product.options.map((option) => values[option.name]).join(" / ");
      setProblems([t("products.variants.duplicateCombo", { name })]);
      return;
    }

    const parsed = variantInputSchema.safeParse({
      sku: sku.trim(),
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      price: price.trim(),
      ...(canSetCost && cost.trim() ? { costPrice: cost.trim() } : {}),
      optionValues: values,
    });
    if (!parsed.success) {
      setProblems(formatIssues(parsed.error.issues));
      return;
    }
    // the schema fills costPrice "0" by default; without costs:write the field must not be sent at all
    const input = canSetCost ? parsed.data : omitCost(parsed.data);

    setProblems([]);
    submitting.current = true;
    try {
      await add.mutateAsync({ productId: product.id, input });
      toast.success(t("products.toast.variantAdded"));
      onDone();
    } catch (error) {
      setProblems([errorMessage(error, t)]);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("products.variants.addTitle")} description={t("products.variants.addDescription")} />
      <DialogBody>
        <ProblemAlert messages={problems} className="mb-4" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {product.options.map((option) => (
            <Field key={option.id} label={option.name} htmlFor={`add-variant-${option.id}`}>
              <Select
                id={`add-variant-${option.id}`}
                value={values[option.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [option.name]: event.target.value }))}
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.value}>
                    {value.value}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <Field label={t("products.variants.sku")} htmlFor="add-variant-sku" required>
            <Input id="add-variant-sku" value={sku} onChange={(event) => setSku(event.target.value)} />
          </Field>
          <Field label={t("products.variants.barcode")} htmlFor="add-variant-barcode">
            <Input id="add-variant-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
          </Field>
          <Field label={t("products.variants.price")} htmlFor="add-variant-price" required>
            <Input id="add-variant-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
          </Field>
          {canSetCost ? (
            <Field label={t("products.variants.cost")} htmlFor="add-variant-cost">
              <Input id="add-variant-cost" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
            </Field>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={add.isPending} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={add.isPending}>
          {add.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

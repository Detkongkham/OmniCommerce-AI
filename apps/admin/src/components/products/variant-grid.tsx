"use client";

import { Checkbox, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";
import type { VariantDraft } from "@/lib/variant-matrix";

export interface VariantGridProps {
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  /** Show the cost column (needs costs:read). */
  showCost: boolean;
  /** Cost is visible but not editable (costs:read without costs:write). */
  costReadOnly?: boolean;
  /**
   * The options would produce more than 100 variants. The parent must NOT regenerate rows in that
   * case (use `countCombinations`); the grid only shows the warning.
   */
  tooMany?: boolean;
}

/** Editable variant table used while creating a product (rows come from the option cartesian product). */
export function VariantGrid({ variants, onChange, showCost, costReadOnly = false, tooMany = false }: VariantGridProps) {
  const { t } = useT();
  const patch = (index: number, change: Partial<VariantDraft>) =>
    onChange(variants.map((variant, i) => (i === index ? { ...variant, ...change } : variant)));

  return (
    <div className="space-y-2">
      <p role="status" aria-live="polite" className="text-sm text-warning-ink empty:hidden">
        {tooMany ? t("products.variants.tooMany") : null}
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("products.variants.name")}</TableHead>
              <TableHead>{t("products.variants.sku")}</TableHead>
              <TableHead>{t("products.variants.barcode")}</TableHead>
              <TableHead>{t("products.variants.price")}</TableHead>
              {showCost ? <TableHead>{t("products.variants.cost")}</TableHead> : null}
              <TableHead className="text-center">{t("products.variants.active")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant, index) => {
              const label = Object.values(variant.optionValues).join(" / ") || t("products.variants.single");
              // variant names are unique within a product (cartesian); fall back to the row number if not
              const unique = variants.filter((other) => other.key === variant.key).length === 1;
              const suffix = unique ? label : `${label} ${index + 1}`;
              return (
                <TableRow key={variant.key} data-testid={`variant-row-${index}`}>
                  <TableCell className="whitespace-nowrap font-medium text-ink">{label}</TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("products.variants.sku")} ${suffix}`}
                      value={variant.sku}
                      onChange={(event) => patch(index, { sku: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("products.variants.barcode")} ${suffix}`}
                      value={variant.barcode}
                      onChange={(event) => patch(index, { barcode: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("products.variants.price")} ${suffix}`}
                      inputMode="decimal"
                      value={variant.price}
                      onChange={(event) => patch(index, { price: event.target.value })}
                    />
                  </TableCell>
                  {showCost ? (
                    <TableCell>
                      <Input
                        aria-label={`${t("products.variants.cost")} ${suffix}`}
                        inputMode="decimal"
                        readOnly={costReadOnly}
                        value={variant.costPrice}
                        onChange={(event) => patch(index, { costPrice: event.target.value })}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={`${t("products.variants.active")} ${suffix}`}
                      checked={variant.isActive}
                      onCheckedChange={(checked) => patch(index, { isActive: checked === true })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

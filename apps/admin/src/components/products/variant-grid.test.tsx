import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { VariantDraft } from "@/lib/variant-matrix";
import { renderWithProviders } from "@/test/render";
import { VariantGrid } from "./variant-grid";

const rows: VariantDraft[] = [
  { key: '["Red"]', sku: "TEE-Red", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: { Color: "Red" } },
  { key: '["Blue"]', sku: "TEE-Blue", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: { Color: "Blue" } },
];

function Harness({
  showCost,
  costReadOnly,
  tooMany,
}: {
  showCost: boolean;
  costReadOnly?: boolean;
  tooMany?: boolean;
}) {
  const [variants, setVariants] = useState(rows);
  return (
    <>
      <VariantGrid
        variants={variants}
        onChange={setVariants}
        showCost={showCost}
        costReadOnly={costReadOnly}
        tooMany={tooMany}
      />
      <pre data-testid="state">{JSON.stringify(variants)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as VariantDraft[];

describe("VariantGrid", () => {
  it("shows the variant name from option values and edits SKU/barcode/price/active per row", async () => {
    const { user } = renderWithProviders(<Harness showCost />);
    const red = screen.getByTestId("variant-row-0");
    expect(within(red).getByText("Red")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("SKU Red"));
    await user.type(screen.getByLabelText("SKU Red"), "R1");
    await user.type(screen.getByLabelText("Barcode Red"), "8850001");
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "250.50");
    await user.click(screen.getByRole("checkbox", { name: "For sale Blue" }));
    expect(state()[0]).toMatchObject({ sku: "R1", barcode: "8850001", price: "250.50" });
    expect(state()[1]).toMatchObject({ sku: "TEE-Blue", isActive: false });
  });

  it("keeps money as the typed string", async () => {
    const { user } = renderWithProviders(<Harness showCost />);
    await user.clear(screen.getByLabelText("Cost Red"));
    await user.type(screen.getByLabelText("Cost Red"), "12500.00");
    expect(state()[0]?.costPrice).toBe("12500.00");
  });

  it("gives every per-row control a unique accessible name", () => {
    renderWithProviders(<Harness showCost />);
    for (const label of ["SKU", "Barcode", "Price", "Cost"]) {
      expect(screen.getByLabelText(`${label} Red`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${label} Blue`)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "For sale Red" })).toBeInTheDocument();
  });

  it("falls back to the 1-based row number when two rows share a label", () => {
    function Single() {
      return (
        <VariantGrid
          variants={[{ key: "[]", sku: "", barcode: "", price: "", costPrice: "", isActive: true, optionValues: {} }]}
          onChange={() => {}}
          showCost={false}
        />
      );
    }
    renderWithProviders(<Single />);
    expect(screen.getByText("Single item (no options)")).toBeInTheDocument();
    expect(screen.getByLabelText("SKU Single item (no options)")).toBeInTheDocument();
  });

  it("no cost permission: no cost column", () => {
    renderWithProviders(<Harness showCost={false} />);
    expect(screen.queryByLabelText(/^Cost/)).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Cost" })).toBeNull();
  });

  it("costs:read only: cost is shown but read-only", async () => {
    const { user } = renderWithProviders(<Harness showCost costReadOnly />);
    const cost = screen.getByLabelText("Cost Red");
    expect(cost).toHaveAttribute("readonly");
    await user.type(cost, "9");
    expect(state()[0]?.costPrice).toBe("60");
  });

  it("costs:write: cost is editable on every row", () => {
    renderWithProviders(<Harness showCost />);
    expect(screen.getAllByLabelText(/^Cost /)).toHaveLength(2);
    expect(screen.getByLabelText("Cost Red")).not.toHaveAttribute("readonly");
  });

  it("always renders a live region; it fills when there are too many combinations", async () => {
    function Toggle() {
      const [tooMany, setTooMany] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setTooMany((value) => !value)}>
            toggle
          </button>
          <Harness showCost={false} tooMany={tooMany} />
        </>
      );
    }
    const { user } = renderWithProviders(<Toggle />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByRole("status")).toHaveTextContent(/more than 100 variants/);
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

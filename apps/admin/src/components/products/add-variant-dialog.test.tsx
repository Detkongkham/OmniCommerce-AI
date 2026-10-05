import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ProductDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { AddVariantDialog } from "./add-variant-dialog";

const auth = vi.hoisted(() => ({ costsWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "costs:write" ? auth.costsWrite : true),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: toasts.success } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const product: ProductDetailDto = {
  id: "p1",
  name: "Tee",
  slug: "tee",
  description: null,
  status: "DRAFT",
  categoryId: null,
  options: [
    { id: "o1", name: "Color", position: 0, values: [{ id: "a", value: "Red", position: 0 }, { id: "b", value: "Blue", position: 1 }] },
    { id: "o2", name: "Size", position: 1, values: [{ id: "c", value: "S", position: 0 }, { id: "d", value: "M", position: 1 }] },
  ],
  variants: [
    { id: "v1", sku: "TEE-R-S", barcode: null, name: "Red / S", price: "100.00", compareAtPrice: null, costPrice: "60.00", weightGrams: null, isActive: true, optionValues: { Color: "Red", Size: "S" }, stock: [] },
  ],
  images: [],
};

const onOpenChange = vi.fn();

function renderDialog() {
  return renderWithProviders(<AddVariantDialog open onOpenChange={onOpenChange} product={product} />);
}
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/products/p1/variants");

beforeEach(() => {
  auth.costsWrite = true;
  onOpenChange.mockReset();
  toasts.success.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ id: "v2" });
});

describe("AddVariantDialog", () => {
  it("posts the exact body for the chosen option values, toasts and closes", async () => {
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Color"), "Blue");
    await user.type(screen.getByLabelText(/^SKU/), " TEE-B-S ");
    await user.type(screen.getByLabelText("Barcode"), "8851");
    await user.type(screen.getByLabelText(/^Price/), "120");
    await user.type(screen.getByLabelText("Cost"), "70");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posts()).toEqual([
      [
        "/products/p1/variants",
        {
          method: "POST",
          body: { sku: "TEE-B-S", barcode: "8851", price: "120", costPrice: "70", isActive: true, optionValues: { Color: "Blue", Size: "S" } },
        },
      ],
    ]);
    expect(toasts.success).toHaveBeenCalledWith("Variant added");
  });

  it("without costs:write there is no cost field and costPrice is never sent (the schema default is stripped)", async () => {
    auth.costsWrite = false;
    const { user } = renderDialog();
    expect(screen.queryByLabelText("Cost")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Size"), "M");
    await user.type(screen.getByLabelText(/^SKU/), "TEE-R-M");
    await user.type(screen.getByLabelText(/^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.[1]).toEqual({
      method: "POST",
      body: { sku: "TEE-R-M", price: "100", isActive: true, optionValues: { Color: "Red", Size: "M" } },
    });
  });

  it("shows the real schema issues (not a generic message), focuses the alert and does not post", async () => {
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Size"), "M");
    await user.type(screen.getByLabelText(/^Price/), "12.345");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("sku:");
    expect(alert).toHaveTextContent("price: ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");
    expect(alert).toHaveFocus();
    expect(posts()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("rejects an option combination that already exists, naming it, without posting", async () => {
    const { user } = renderDialog();
    // defaults are Red / S, which TEE-R-S already is
    await user.type(screen.getByLabelText(/^SKU/), "TEE-X");
    await user.type(screen.getByLabelText(/^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("A variant with Red / S already exists");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(posts()).toHaveLength(0);
  });

  it("shows the translated API error, keeps the dialog open and the entered values", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Size"), "M");
    await user.type(screen.getByLabelText(/^SKU/), "TEE-R-S");
    await user.type(screen.getByLabelText(/^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This value already exists");
    expect(alert).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^SKU/)).toHaveValue("TEE-R-S");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a double click on Save posts once and the button is disabled while pending", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { user } = renderDialog();
    await user.selectOptions(screen.getByLabelText("Size"), "M");
    await user.type(screen.getByLabelText(/^SKU/), "TEE-R-M");
    await user.type(screen.getByLabelText(/^Price/), "100");
    const save = screen.getByRole("button", { name: "Save" });
    await user.dblClick(save);
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled());
    expect(posts()).toHaveLength(1);
    finish({ id: "v2" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posts()).toHaveLength(1);
  });

  it("Cancel closes without posting", async () => {
    const { user } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(posts()).toHaveLength(0);
  });
});

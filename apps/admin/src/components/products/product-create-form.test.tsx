import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { renderWithProviders } from "@/test/render";
import { QueryClientProvider } from "@tanstack/react-query";
import { ProductCreateForm } from "./product-create-form";

const auth = vi.hoisted(() => ({ costsRead: true, costsWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => {
    if (permission === "costs:write") return auth.costsWrite;
    if (permission === "costs:read") return auth.costsRead;
    return true;
  },
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toasts = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: toasts.success } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const categories = [
  { id: "c1", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 0 },
  { id: "c2", name: "Shirts", slug: "shirts", parentId: "c1", position: 0, productCount: 0 },
];

function defaultApi() {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/categories") return categories;
    if (path === "/products" && options?.method === "POST") return { id: "new-id" };
    return undefined;
  }) as typeof apiFetch);
}
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/products");

beforeEach(() => {
  auth.costsRead = true;
  auth.costsWrite = true;
  router.push.mockReset();
  toasts.success.mockReset();
  vi.mocked(apiFetch).mockReset();
  defaultApi();
});

const row = (index: number) => screen.getByTestId(`variant-row-${index}`);
const field = (index: number, label: RegExp) => within(row(index)).getByLabelText(label);
const rows = () => screen.queryAllByTestId(/^variant-row-/);
const valueInputs = () => screen.getAllByPlaceholderText("Type a value and press Enter");

describe("ProductCreateForm", () => {
  it("a product without options has 1 variant; saving posts the exact body, toasts and opens the product", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "MUG-1");
    await user.type(field(0, /^Price/), "25000");
    await user.type(field(0, /^Cost/), "9000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(posts()).toEqual([
      [
        "/products",
        {
          method: "POST",
          body: {
            name: "Mug",
            status: "DRAFT",
            options: [],
            variants: [{ sku: "MUG-1", price: "25000", costPrice: "9000", isActive: true, optionValues: {} }],
            images: [],
          },
        },
      ],
    ]);
    expect(toasts.success).toHaveBeenCalledWith("Product added");
  });

  it("two options (2x2) build 4 rows that inherit price/cost, keep edits, and post the full cartesian body", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(screen.getByLabelText("SKU prefix"), "TEE");
    await user.type(screen.getByLabelText("Description"), "Soft");
    await user.selectOptions(screen.getByLabelText("Category"), "c2");
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await user.type(field(0, /^Price/), "100");
    await user.type(field(0, /^Cost/), "40");

    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name 1"), "Color");
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    expect(rows()).toHaveLength(2);
    expect(field(0, /^SKU/)).toHaveValue("TEE-Red");

    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name 2"), "Size");
    await user.type(valueInputs()[1] as HTMLElement, "S{Enter}M{Enter}");
    expect(rows()).toHaveLength(4);
    expect(field(0, /^SKU/)).toHaveValue("TEE-Red-S");

    // edit one row, then change the option set again: the edit must survive
    await user.clear(field(1, /^Price/));
    await user.type(field(1, /^Price/), "120");
    await user.clear(field(1, /^SKU/));
    await user.type(field(1, /^SKU/), "MINE");

    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.type(screen.getByLabelText("Image URL (http/https) 1"), "https://x/y.png");
    await user.type(screen.getByLabelText("Image description 1"), "front");
    await user.selectOptions(screen.getByLabelText("Linked variant 1"), "Red / M");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.[1]).toEqual({
      method: "POST",
      body: {
        name: "Tee",
        description: "Soft",
        status: "ACTIVE",
        categoryId: "c2",
        options: [
          { name: "Color", values: ["Red", "Blue"] },
          { name: "Size", values: ["S", "M"] },
        ],
        variants: [
          { sku: "TEE-Red-S", price: "100", costPrice: "40", isActive: true, optionValues: { Color: "Red", Size: "S" } },
          { sku: "MINE", price: "120", costPrice: "40", isActive: true, optionValues: { Color: "Red", Size: "M" } },
          { sku: "TEE-Blue-S", price: "100", costPrice: "40", isActive: true, optionValues: { Color: "Blue", Size: "S" } },
          { sku: "TEE-Blue-M", price: "100", costPrice: "40", isActive: true, optionValues: { Color: "Blue", Size: "M" } },
        ],
        images: [{ url: "https://x/y.png", alt: "front", variantSku: "MINE" }],
      },
    });
  });

  it("typing an option name does not regenerate (and reset) rows until blur", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    await user.type(screen.getByLabelText("Option name 1"), "Color");
    // still the original single row: the option has values but is not synced yet
    expect(rows()).toHaveLength(1);
    await user.tab();
    expect(rows()).toHaveLength(2);
  });

  it("pressing Enter in the option name field syncs the rows first and posts the correct body", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(field(0, /^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    await user.type(screen.getByLabelText("Option name 1"), "Color{Enter}");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(posts()[0]?.[1]).toEqual({
      method: "POST",
      body: {
        name: "Tee",
        status: "DRAFT",
        options: [{ name: "Color", values: ["Red", "Blue"] }],
        variants: [
          { sku: "Red", price: "100", isActive: true, optionValues: { Color: "Red" }, costPrice: "0" },
          { sku: "Blue", price: "100", isActive: true, optionValues: { Color: "Blue" }, costPrice: "0" },
        ],
        images: [],
      },
    });
  });

  it("renaming an option keeps edited rows and image links, and posts the new name", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.type(field(0, /^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    await user.type(screen.getByLabelText("Option name 1"), "Color");
    await user.tab();
    await user.clear(field(1, /^SKU/));
    await user.type(field(1, /^SKU/), "MINE");
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.type(screen.getByLabelText("Image URL (http/https) 1"), "https://x/y.png");
    await user.selectOptions(screen.getByLabelText("Linked variant 1"), "Blue");

    await user.type(screen.getByLabelText("Option name 1"), "s");
    await user.tab();
    expect(field(1, /^SKU/)).toHaveValue("MINE");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const body = (posts()[0]?.[1] as { body: { variants: unknown[]; images: unknown[]; options: unknown[] } }).body;
    expect(body.options).toEqual([{ name: "Colors", values: ["Red", "Blue"] }]);
    expect(body.variants[1]).toMatchObject({ sku: "MINE", optionValues: { Colors: "Blue" } });
    expect(body.images).toEqual([{ url: "https://x/y.png", variantSku: "MINE" }]);
  });

  it("explains why Save is disabled when there are too many combinations", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole("button", { name: "Add option" }));
    for (let i = 0; i < 3; i += 1) await user.type(valueInputs()[i] as HTMLElement, "a{Enter}b{Enter}c{Enter}d{Enter}e{Enter}");
    for (const n of [1, 2, 3]) {
      await user.type(screen.getByLabelText(`Option name ${n}`), `O${n}`);
      await user.tab();
    }
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    const note = document.getElementById(save.getAttribute("aria-describedby") ?? "none");
    expect(note).toHaveTextContent(/more than 100 variants/);
  });

  it("indents child categories in the category select", async () => {
    renderWithProviders(<ProductCreateForm />);
    expect(await screen.findByRole("option", { name: "— Shirts" })).toBeInTheDocument();
  });

  it("still works when categories fail to load", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories") throw new ApiError(500, "boom", [], "INTERNAL_ERROR");
      if (options?.method === "POST") return { id: "new-id" };
      return undefined;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "M1");
    await user.type(field(0, /^Price/), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
  });

  it("without costs:read there is no cost column and costPrice is never posted", async () => {
    auth.costsRead = false;
    auth.costsWrite = false;
    const { user } = renderWithProviders(<ProductCreateForm />);
    expect(screen.queryByLabelText(/^Cost/)).toBeNull();
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "MUG-1");
    await user.type(field(0, /^Price/), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.stringify(posts()[0]?.[1])).not.toContain("costPrice");
  });

  it("with costs:read but not costs:write the cost is read-only and a typed cost is not posted", async () => {
    const { user, rerender, queryClient } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "MUG-1");
    await user.type(field(0, /^Price/), "100");
    await user.type(field(0, /^Cost/), "9000");
    // permission drops while the draft is on screen
    auth.costsWrite = false;
    rerender(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLanguage="en">
          <ProductCreateForm />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect(field(0, /^Cost/)).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.stringify(posts()[0]?.[1])).not.toContain("costPrice");
  });

  it("an invalid form posts nothing, lists the messages in the alert region and focuses it", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please fix the following");
    expect(within(alert).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(alert).toHaveFocus();
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("duplicate SKUs are reported client-side with the row numbers and nothing is posted", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Tee");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    await user.type(screen.getByLabelText("Option name 1"), "Color");
    await user.tab();
    for (const index of [0, 1]) {
      await user.clear(field(index, /^SKU/));
      await user.type(field(index, /^SKU/), "SAME");
      await user.type(field(index, /^Price/), "1");
    }
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent('SKU "SAME"');
    expect(posts()).toHaveLength(0);
  });

  it("an API DUPLICATE_VALUE error is shown in the alert, does not redirect, re-enables Save and can be retried", async () => {
    let attempt = 0;
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories") return [];
      if (options?.method === "POST") {
        attempt += 1;
        if (attempt === 1) throw new ApiError(409, "Duplicate value: sku", [], "DUPLICATE_VALUE");
        return { id: "new-id" };
      }
      return undefined;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "DUP");
    await user.type(field(0, /^Price/), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This value already exists"));
    expect(router.push).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("This value already exists");
  });

  it("protects against double submit while the request is in flight", async () => {
    let release: (value: { id: string }) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories") return [];
      if (options?.method === "POST") return new Promise<{ id: string }>((resolve) => {
          release = resolve;
        });
      return undefined;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    await user.type(field(0, /^SKU/), "M1");
    await user.type(field(0, /^Price/), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saving = await screen.findByRole("button", { name: "Saving..." });
    expect(saving).toBeDisabled();
    await user.click(saving);
    // a second submit that bypasses the disabled button (Enter in a field) must also be ignored
    fireEvent.submit(saving.closest("form") as HTMLFormElement);
    expect(posts()).toHaveLength(1);

    release({ id: "new-id" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(posts()).toHaveLength(1);
    // stays disabled after success so the redirect cannot be double-triggered
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("more than 100 combinations: warns, keeps the existing rows, disables Save, and recovers when reduced", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Big");
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole("button", { name: "Add option" }));
    // values first (unnamed options are inactive, so no rows yet), then names
    for (let i = 0; i < 3; i += 1) await user.type(valueInputs()[i] as HTMLElement, "a{Enter}b{Enter}c{Enter}d{Enter}e{Enter}");
    expect(rows()).toHaveLength(1);
    await user.type(screen.getByLabelText("Option name 1"), "A");
    await user.tab();
    await user.type(screen.getByLabelText("Option name 2"), "B");
    await user.tab();
    expect(rows()).toHaveLength(25);
    await user.type(screen.getByLabelText("Option name 3"), "C");
    await user.tab();

    expect(screen.getAllByText(/more than 100 variants/).length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(25);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Remove value e" })[2] as HTMLElement);
    expect(screen.queryAllByText(/more than 100 variants/)).toHaveLength(0);
    expect(rows()).toHaveLength(100);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("clears an image's variant link when its variant row disappears (and does not revive it)", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    await user.type(screen.getByLabelText("Option name 1"), "Color");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.selectOptions(screen.getByLabelText("Linked variant 1"), "Red");
    expect(screen.getByLabelText("Linked variant 1")).toHaveValue('[["Color","Red"]]');

    await user.click(screen.getByRole("button", { name: "Remove value Red" }));
    expect(screen.getByLabelText("Linked variant 1")).toHaveValue("");
    // the same combination coming back must not silently re-link the image
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}");
    expect(rows()).toHaveLength(2);
    expect(screen.getByLabelText("Linked variant 1")).toHaveValue("");
  });

  it("has labelled fields, section headings and a Cancel link back to /products", () => {
    renderWithProviders(<ProductCreateForm />);
    for (const label of ["Product name", "Category", "Status", "Slug", "SKU prefix", "Description"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    for (const heading of ["General", "Options (color, size ...)", "Variants and prices", "Images"]) {
      expect(screen.getByRole("heading", { name: new RegExp(heading.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/products");
  });

  it("incremental typing of Lao option values yields unique SKUs and Save posts", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Smoke");
    await user.type(screen.getByLabelText("SKU prefix"), "SMK");
    await user.type(field(0, /^Price/), "100");
    await user.type(field(0, /^Cost/), "40");

    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name 1"), "ສີ");
    await user.type(valueInputs()[0] as HTMLElement, "ແດງ{Enter}");
    await user.type(valueInputs()[0] as HTMLElement, "ຟ້າ{Enter}");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name 2"), "ໄຊສ໌");
    await user.type(valueInputs()[1] as HTMLElement, "S{Enter}");
    await user.type(valueInputs()[1] as HTMLElement, "M{Enter}");

    expect(rows()).toHaveLength(4);
    const skus = [0, 1, 2, 3].map((index) => (field(index, /^SKU/) as HTMLInputElement).value);
    expect(new Set(skus).size).toBe(4);
    expect(skus.every((sku) => sku !== "")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
    expect(posts()).toHaveLength(1);
  });
});

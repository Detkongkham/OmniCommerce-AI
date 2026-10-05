import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ProductDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ProductDetail } from "./product-detail";

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, ...toasts } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const baseProduct: ProductDetailDto = {
  id: "p1",
  name: "Tee",
  slug: "tee",
  description: "Soft",
  status: "DRAFT",
  categoryId: null,
  options: [{ id: "o1", name: "Color", position: 0, values: [{ id: "ov1", value: "Red", position: 0 }, { id: "ov2", value: "Blue", position: 1 }] }],
  variants: [
    { id: "v1", sku: "TEE-R", barcode: null, name: "Red", price: "100.00", compareAtPrice: null, costPrice: "60.00", weightGrams: null, isActive: true, optionValues: { Color: "Red" }, stock: [{ warehouseId: "w1", onHand: 5, reserved: 2, available: 3 }] },
    { id: "v2", sku: "TEE-B", barcode: null, name: "Blue", price: "100.00", compareAtPrice: null, costPrice: "60.00", weightGrams: null, isActive: true, optionValues: { Color: "Blue" }, stock: [] },
  ] as ProductDetailDto["variants"],
  images: [{ id: "i1", url: "https://x/a.png", alt: "front", position: 0, variantId: null }],
};

// a tiny stateful fake of the API: PATCH/PUT mutate `server.product` so the refetch returns the saved values
const server = { product: structuredClone(baseProduct) };
const categories = [{ id: "c1", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 1 }];
const warehouses = [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
type Handler = (path: string, options?: { method?: string; body?: Record<string, unknown> }) => unknown | undefined;
let override: Handler | undefined;

function install() {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
    const custom = override?.(path, options);
    if (custom !== undefined) return custom;
    const method = options?.method ?? "GET";
    if (path === "/products/p1" && method === "GET") return structuredClone(server.product);
    if (path === "/products/p1" && method === "PATCH") {
      Object.assign(server.product, options?.body);
      return structuredClone(server.product);
    }
    const variant = /^\/variants\/(\w+)$/.exec(path);
    if (variant && method === "PATCH") {
      const target = server.product.variants.find((item) => item.id === variant[1]);
      // the server normalises money to 2 decimals
      const body = { ...options?.body } as Record<string, unknown>;
      if (typeof body.price === "string") body.price = Number(body.price).toFixed(2);
      Object.assign(target ?? {}, body);
      return structuredClone(target);
    }
    if (path === "/products/p1/images" && method === "PUT") {
      const images = (options?.body?.images ?? []) as { url: string; alt?: string; variantId?: string }[];
      server.product.images = images.map((image, index) => ({
        id: `n${index}`,
        url: image.url,
        alt: image.alt ?? null,
        position: index,
        variantId: image.variantId ?? null,
      }));
      return structuredClone(server.product);
    }
    if (path === "/categories") return categories;
    if (path === "/warehouses") return warehouses;
    return undefined;
  }) as typeof apiFetch);
}

const writes = () => vi.mocked(apiFetch).mock.calls.filter((call) => (call[1] as { method?: string } | undefined)?.method);
const writesTo = (path: string) => writes().filter((call) => call[0] === path);
const gets = (path: string) => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === path && !(call[1] as { method?: string } | undefined)?.method);

beforeEach(() => {
  auth.perms = new Set(["inventory:read", "inventory:write", "costs:read", "costs:write"]);
  router.push.mockReset();
  for (const mock of Object.values(toasts)) mock.mockReset();
  server.product = structuredClone(baseProduct);
  override = undefined;
  vi.mocked(apiFetch).mockReset();
  install();
});

const row = (id: string) => screen.getByTestId(`detail-variant-${id}`);

describe("ProductDetail: display", () => {
  it("shows the product, read-only options with the explanation, variants with per-warehouse stock and a stock link", async () => {
    renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByDisplayValue("Tee")).toBeInTheDocument();
    expect(screen.getByText("Options cannot be changed after the product is created. Create a new product to change them.")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("DRAFT");

    const red = row("v1");
    expect(within(red).getByDisplayValue("TEE-R")).toBeInTheDocument();
    expect(await within(red).findByText("MAIN: 3 / 2")).toBeInTheDocument();
    expect(within(red).getByRole("link", { name: /^View \/ receive stock/ })).toHaveAttribute("href", "/stock?q=TEE-R");
    expect(within(row("v2")).getByText("No stock yet")).toBeInTheDocument();
  });

  it("every variant control has an accessible name that includes the variant", async () => {
    renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    for (const name of ["Red", "Blue"]) {
      for (const label of ["SKU", "Barcode", "Price", "Cost", "For sale"]) {
        expect(screen.getByLabelText(`${label} ${name}`)).toBeInTheDocument();
      }
      expect(screen.getByRole("button", { name: `Save row ${name}` })).toBeInTheDocument();
    }
  });

  it("shows a loading skeleton while the product loads", () => {
    override = (path) => (path === "/products/p1" ? new Promise(() => {}) : undefined);
    renderWithProviders(<ProductDetail id="p1" />);
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("404 PRODUCT_NOT_FOUND shows a clear not-found state without a retry button", async () => {
    override = (path) => {
      if (path === "/products/p1") throw new ApiError(404, "Product not found", [], "PRODUCT_NOT_FOUND");
      return undefined;
    };
    renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByText("This product was not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("a generic NOT_FOUND code is also the not-found state", async () => {
    override = (path) => {
      if (path === "/products/p1") throw new ApiError(404, "Not Found", [], "NOT_FOUND");
      return undefined;
    };
    renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByText("This product was not found")).toBeInTheDocument();
  });

  it("another error shows the load error with Retry that refetches and shows the product", async () => {
    let fail = true;
    override = (path) => {
      if (path === "/products/p1" && fail) throw new ApiError(500, "boom");
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue("Tee")).toBeInTheDocument();
  });
});

describe("ProductDetail: general information", () => {
  it("Save is disabled until something changes, then PATCHes only the changed fields and shows the saved values", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Product name"));
    await user.type(screen.getByLabelText("Product name"), "Tee 2");
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Product saved"));
    expect(writesTo("/products/p1")).toEqual([["/products/p1", { method: "PATCH", body: { name: "Tee 2", status: "ACTIVE" } }]]);
    expect(screen.getByRole("heading", { level: 1, name: "Tee 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("sends null for a cleared description and category", async () => {
    server.product.categoryId = "c1";
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("c1"));
    await user.clear(screen.getByLabelText("Description"));
    await user.selectOptions(screen.getByLabelText("Category"), "");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writesTo("/products/p1")).toHaveLength(1));
    expect(writesTo("/products/p1")[0]?.[1]).toEqual({ method: "PATCH", body: { description: null, categoryId: null } });
  });

  it("shows the real schema issue for an empty name, focuses the alert and does not PATCH", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Product name"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = screen.getAllByRole("alert").find((element) => element.textContent?.includes("name:"));
    expect(alert).toHaveTextContent("name: ຈຳເປັນຕ້ອງໃສ່");
    expect(alert).toHaveFocus();
    expect(writes()).toHaveLength(0);
  });

  it("shows a translated API error in an alert and keeps the typed value", async () => {
    override = (path, options) => {
      if (path === "/products/p1" && options?.method === "PATCH") throw new ApiError(409, "dup", [], "DUPLICATE_VALUE");
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.type(screen.getByLabelText("Slug"), "-x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByText("This value already exists");
    expect(alert.closest('[role="alert"]')).toHaveFocus();
    expect(screen.getByLabelText("Slug")).toHaveValue("tee-x");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a double click on Save sends one PATCH while it is pending and the button is disabled", async () => {
    let finish: (value: unknown) => void = () => {};
    override = (path, options) => {
      if (path === "/products/p1" && options?.method === "PATCH") return new Promise((resolve) => { finish = resolve; });
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.type(screen.getByLabelText("Product name"), "!");
    await user.dblClick(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled());
    expect(writesTo("/products/p1")).toHaveLength(1);
    finish({});
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    expect(writesTo("/products/p1")).toHaveLength(1);
  });
});

describe("ProductDetail: variants", () => {
  it("PATCHes only the changed price of that variant and resets the row to the server's normalised value", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.getByRole("button", { name: "Save row Red" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "120.5");
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Variant saved"));
    expect(writesTo("/variants/v1")).toEqual([["/variants/v1", { method: "PATCH", body: { price: "120.5" } }]]);
    // the draft was reset to what the server returned after the refetch ("120.5" -> "120.50")
    expect(screen.getByLabelText("Price Red")).toHaveValue("120.50");
    expect(screen.getByRole("button", { name: "Save row Red" })).toBeDisabled();
  });

  it("toggling the active checkbox and clearing the barcode PATCH isActive and a null barcode", async () => {
    server.product.variants[0]!.barcode = "885";
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Barcode Red"));
    await user.click(screen.getByLabelText("For sale Red"));
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(writesTo("/variants/v1")).toHaveLength(1));
    expect(writesTo("/variants/v1")[0]?.[1]).toEqual({ method: "PATCH", body: { barcode: null, isActive: false } });
  });

  it("with costs:write the cost is editable and sent when changed", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Cost Red"));
    await user.type(screen.getByLabelText("Cost Red"), "65");
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(writesTo("/variants/v1")).toHaveLength(1));
    expect(writesTo("/variants/v1")[0]?.[1]).toEqual({ method: "PATCH", body: { costPrice: "65" } });
  });

  it("costs:read without costs:write: cost is shown but disabled and never sent", async () => {
    auth.perms = new Set(["inventory:read", "inventory:write", "costs:read"]);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.getByLabelText("Cost Red")).toBeDisabled();
    expect(screen.getByLabelText("Cost Red")).toHaveValue("60.00");
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "99");
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(writesTo("/variants/v1")).toHaveLength(1));
    expect(writesTo("/variants/v1")[0]?.[1]).toEqual({ method: "PATCH", body: { price: "99" } });
  });

  it("without costs:read there is no cost column and costPrice is never sent", async () => {
    auth.perms = new Set(["inventory:read", "inventory:write"]);
    // the API drops costPrice for such users
    for (const variant of server.product.variants) delete (variant as { costPrice?: string }).costPrice;
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.queryByLabelText(/^Cost/)).toBeNull();
    await user.clear(screen.getByLabelText("Price Blue"));
    await user.type(screen.getByLabelText("Price Blue"), "80");
    await user.click(screen.getByRole("button", { name: "Save row Blue" }));
    await waitFor(() => expect(writesTo("/variants/v2")).toHaveLength(1));
    expect(writesTo("/variants/v2")[0]?.[1]).toEqual({ method: "PATCH", body: { price: "80" } });
  });

  it("a bad price shows the schema message in that row, focuses it and does not PATCH", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "12.345");
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    const alert = within(row("v1")).getByRole("alert");
    expect(alert).toHaveTextContent("price: ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");
    expect(alert).toHaveFocus();
    expect(within(row("v2")).getByRole("alert")).toBeEmptyDOMElement();
    expect(writes()).toHaveLength(0);
  });

  it("an API error is shown translated in that row only and the draft is kept", async () => {
    override = (path, options) => {
      if (path === "/variants/v1" && options?.method === "PATCH") throw new ApiError(409, "dup", [], "DUPLICATE_VALUE");
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("SKU Red"));
    await user.type(screen.getByLabelText("SKU Red"), "TEE-B");
    await user.click(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(within(row("v1")).getByRole("alert")).toHaveTextContent("This value already exists"));
    expect(within(row("v1")).getByRole("alert")).toHaveFocus();
    expect(within(row("v2")).getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("SKU Red")).toHaveValue("TEE-B");
  });

  it("saving one row neither disables another row's Save nor overwrites its unsaved edits", async () => {
    let finish: (value: unknown) => void = () => {};
    override = (path, options) => {
      if (path === "/variants/v2" && options?.method === "PATCH") return new Promise((resolve) => { finish = resolve; });
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "111");
    await user.clear(screen.getByLabelText("Price Blue"));
    await user.type(screen.getByLabelText("Price Blue"), "222");
    await user.click(screen.getByRole("button", { name: "Save row Blue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save row Blue" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Save row Red" })).toBeEnabled();
    server.product.variants[1]!.price = "222.00";
    finish({ id: "v2" });
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Variant saved"));
    await waitFor(() => expect(screen.getByLabelText("Price Blue")).toHaveValue("222.00"));
    // Red's unsaved edit survives Blue's save and the refetch
    expect(screen.getByLabelText("Price Red")).toHaveValue("111");
    expect(screen.getByRole("button", { name: "Save row Red" })).toBeEnabled();
    expect(writesTo("/variants/v1")).toHaveLength(0);
  });

  it("a double click on Save row sends one PATCH while it is pending and the row button is disabled", async () => {
    let finish: (value: unknown) => void = () => {};
    override = (path, options) => {
      if (path === "/variants/v1" && options?.method === "PATCH") return new Promise((resolve) => { finish = resolve; });
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Price Red"));
    await user.type(screen.getByLabelText("Price Red"), "105");
    await user.dblClick(screen.getByRole("button", { name: "Save row Red" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save row Red" })).toBeDisabled());
    expect(writesTo("/variants/v1")).toHaveLength(1);
    finish({});
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    expect(writesTo("/variants/v1")).toHaveLength(1);
  });

  it("Add variant opens the dialog (only for products that have options)", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    expect(await screen.findByRole("dialog", { name: "Add variant" })).toBeInTheDocument();
  });

  it("a product without options has no Add variant button", async () => {
    server.product.options = [];
    server.product.variants = [{ ...baseProduct.variants[0]!, optionValues: {} }];
    renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.queryByRole("button", { name: "Add variant" })).toBeNull();
    expect(screen.getByText("Single item (no options)", { selector: "span" })).toBeInTheDocument();
  });
});

describe("ProductDetail: images", () => {
  it("Save images is disabled until a change, then PUTs the images in order with variantId", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.getByRole("button", { name: "Save images" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Linked variant 1"), "v2");
    await user.click(screen.getByRole("button", { name: "Save images" }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Images saved"));
    expect(writesTo("/products/p1/images")).toEqual([
      ["/products/p1/images", { method: "PUT", body: { images: [{ url: "https://x/a.png", alt: "front", variantId: "v2" }] } }],
    ]);
    expect(screen.getByRole("button", { name: "Save images" })).toBeDisabled();
  });

  it("an invalid image URL shows the schema issue and does not PUT", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.type(screen.getByLabelText("Image URL (http/https) 2"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "Save images" }));
    const alert = screen.getAllByRole("alert").find((element) => element.textContent?.includes("images[2].url"));
    expect(alert).toBeDefined();
    expect(alert).toHaveFocus();
    expect(writes()).toHaveLength(0);
  });

  it("an API error is shown translated", async () => {
    override = (path, options) => {
      if (path === "/products/p1/images" && options?.method === "PUT") throw new ApiError(404, "gone", [], "PRODUCT_NOT_FOUND");
      return undefined;
    };
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.type(screen.getByLabelText("Image description 1"), "!");
    await user.click(screen.getByRole("button", { name: "Save images" }));
    expect(await screen.findByText("This product was not found (it may have been deleted)")).toBeInTheDocument();
  });

  it("removing every image PUTs an empty list", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Remove image 1" }));
    await user.click(screen.getByRole("button", { name: "Save images" }));
    await waitFor(() => expect(writesTo("/products/p1/images")).toHaveLength(1));
    expect(writesTo("/products/p1/images")[0]?.[1]).toEqual({ method: "PUT", body: { images: [] } });
  });
});

describe("ProductDetail: delete", () => {
  async function openConfirm(user: ReturnType<typeof renderWithProviders>["user"]) {
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Delete product" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Tee");
    return dialog;
  }

  it("204: DELETE after confirm, toast, go to the list and never refetch the deleted product", async () => {
    const base = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/products/p1" && options?.method === "DELETE") return undefined;
      return base?.(path, options as never);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products"));
    expect(toasts.success).toHaveBeenCalledWith("Product deleted");
    expect(writesTo("/products/p1")).toEqual([["/products/p1", { method: "DELETE" }]]);
    // let any (wrongly) triggered refetch settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gets("/products/p1")).toHaveLength(1);
    expect(screen.queryByText("This product was not found")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("200 { archived }: informs the user, stays on the page and shows the archived status", async () => {
    const base = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/products/p1" && options?.method === "DELETE") {
        server.product.status = "ARCHIVED";
        return { archived: true };
      }
      return base?.(path, options as never);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));
    await waitFor(() =>
      expect(toasts.info).toHaveBeenCalledWith("The product has been sold before, so it was archived instead of deleted"),
    );
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveValue("ARCHIVED"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("409 PRODUCT_HAS_STOCK_HISTORY: shows the translated error, closes the dialog and does not navigate", async () => {
    const base = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/products/p1" && options?.method === "DELETE") throw new ApiError(409, "has history", [], "PRODUCT_HAS_STOCK_HISTORY");
      return base?.(path, options as never);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));
    expect(await screen.findByText("Cannot delete: it has stock history. Archive it instead")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByDisplayValue("Tee")).toBeInTheDocument();
  });

  it("Cancel in the confirm dialog does not delete", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes()).toHaveLength(0);
  });

  it("a double click on the confirm button sends one DELETE", async () => {
    const base = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/products/p1" && options?.method === "DELETE") return undefined;
      return base?.(path, options as never);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const dialog = await openConfirm(user);
    await user.dblClick(within(dialog).getByRole("button", { name: "Delete product" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(writesTo("/products/p1")).toHaveLength(1);
  });
});

describe("ProductDetail: read-only (no inventory:write)", () => {
  it("disables every control and hides save, delete and add actions", async () => {
    auth.perms = new Set(["inventory:read", "costs:read"]);
    renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    for (const name of ["Save", "Save images", "Save row Red", "Delete product", "Add variant"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    for (const label of ["Product name", "Category", "Status", "Slug", "Description", "SKU Red", "Barcode Red", "Price Red", "Cost Red", "For sale Red", "Image URL (http/https) 1", "Linked variant 1"]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Add image" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "View / receive stock Red" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View / receive stock Blue" })).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
});

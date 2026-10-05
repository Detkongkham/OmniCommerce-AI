import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CategoryDto, Page, ProductListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ProductList } from "./product-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: ProductListItemDto[] = [
  { id: "p1", name: "Tee", slug: "tee", status: "ACTIVE", category: { id: "c1", name: "Apparel" }, imageUrl: "https://x/a.png", variantCount: 3, priceMin: "100.00", priceMax: "150.00", availableTotal: 12 },
  { id: "p2", name: "Mug", slug: "mug", status: "DRAFT", category: null, imageUrl: null, variantCount: 1, priceMin: "25000.00", priceMax: "25000.00", availableTotal: 0 },
  { id: "p3", name: "Gift", slug: "gift", status: "ARCHIVED", category: null, imageUrl: null, variantCount: 0, priceMin: null, priceMax: null, availableTotal: 1234 },
];
const categories: CategoryDto[] = [
  { id: "c1", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 1 },
  { id: "c2", name: "Shirts", slug: "shirts", parentId: "c1", position: 0, productCount: 0 },
];

function mockApi(page: Page<ProductListItemDto> = { items, total: 3, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/products")) return page;
    if (path === "/categories") return categories;
    return undefined;
  }) as typeof apiFetch);
}
const productUrls = () =>
  vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/products"));
const lastProductsUrl = () => productUrls().at(-1);
const SEARCH = "Search name, SKU or barcode...";

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ProductList", () => {
  it("ສະແດງແຖວ: ຊື່, ໝວດ, ສະຖານະ, ຊ່ວງລາຄາ, ສະຕ໋ອກຂາຍໄດ້ ແລະ ຈຳນວນ variant", async () => {
    renderWithProviders(<ProductList />);
    const tee = await screen.findByTestId("row-product-p1");
    expect(within(tee).getByText("Apparel")).toBeInTheDocument();
    expect(within(tee).getByText("Active")).toBeInTheDocument();
    expect(within(tee).getByText("100.00 – 150.00")).toBeInTheDocument();
    expect(within(tee).getByText("12")).toBeInTheDocument();
    expect(within(tee).getByText("3 variants")).toBeInTheDocument();
    expect(within(tee).getByRole("link", { name: "Tee" })).toHaveAttribute("href", "/products/p1");
    const mug = screen.getByTestId("row-product-p2");
    expect(within(mug).getByText("25,000.00")).toBeInTheDocument(); // min = max
    expect(within(mug).getByText("Draft")).toBeInTheDocument();
    const gift = screen.getByTestId("row-product-p3");
    expect(within(gift).getByText("1,234")).toBeInTheDocument();
    expect(within(gift).getAllByText("—")).toHaveLength(2); // no category, no price
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(lastProductsUrl()).toBe("/products?page=1&pageSize=10");
  });

  it("ກຳລັງໂຫຼດ: skeleton, ບໍ່ສະແດງ empty state", async () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => {})) as typeof apiFetch);
    const { container } = renderWithProviders(<ProductList />);
    expect(container.querySelector(".oca-skeleton")).not.toBeNull();
    expect(screen.queryByText("No products yet")).toBeNull();
    expect(screen.queryByTestId("row-product-p1")).toBeNull();
  });

  it("ໂຫຼດບໍ່ສຳເລັດ: ສະແດງ error ແລະ Retry ດຶງໃໝ່", async () => {
    let fail = true;
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/products")) {
        if (fail) throw new Error("boom");
        return { items, total: 3, page: 1, pageSize: 10 };
      }
      return categories;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductList />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.queryByText("No products yet")).toBeNull();
    const before = productUrls().length;
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("row-product-p1")).toBeInTheDocument();
    expect(productUrls().length).toBeGreaterThan(before);
    expect(screen.queryByText("Could not load data")).toBeNull();
  });

  it("ຄົ້ນຫາ (debounce): ບໍ່ສົ່ງທຸກ keystroke, ສົ່ງຄ່າ debounce ແລະ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?page=2&pageSize=10"));
    await user.type(screen.getByPlaceholderText(SEARCH), "tee");
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?q=tee&page=1&pageSize=10"));
    expect(productUrls().some((url) => url.includes("q=t&") || url.includes("q=te&"))).toBe(false);
  });

  it("ກັ່ນຕອງສະຖານະ/ໝວດ: ສົ່ງເປັນ query ແລະ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?status=ACTIVE&page=1&pageSize=10"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Category"), "c2");
    await waitFor(() =>
      expect(lastProductsUrl()).toBe("/products?status=ACTIVE&categoryId=c2&page=1&pageSize=10"),
    );
  });

  it("ໂຕເລືອກໝວດ: ຫຍໍ້ໜ້າຕາມລະດັບ (ລູກເຍື້ອງເຂົ້າ)", async () => {
    renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    const select = screen.getByLabelText("Category");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    const labels = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(labels).toEqual(["All categories", "Apparel", "— Shirts"]);
  });

  it("ໝວດໂຫຼດບໍ່ໄດ້: ລາຍການສິນຄ້າຍັງໃຊ້ໄດ້", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/products")) return { items, total: 3, page: 1, pageSize: 10 };
      throw new Error("categories down");
    }) as typeof apiFetch);
    renderWithProviders(<ProductList />);
    expect(await screen.findByTestId("row-product-p1")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Category")).getAllByRole("option")).toHaveLength(1);
  });

  it("ປ່ຽນໜ້າ: ສົ່ງ page=2", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?page=2&pageSize=10"));
  });

  it("ວ່າງ (ບໍ່ມີ filter): empty state ພ້ອມລິ້ງເພີ່ມສິນຄ້າ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<ProductList />);
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.queryByText("No products match your search")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Add product" }).length).toBeGreaterThan(0);
  });

  it("ວ່າງ (ມີ filter): ບໍ່ພົບ + ລ້າງ ກັບຄືນສູ່ການຄົ້ນຫາເລີ່ມຕົ້ນ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByText("No products yet");
    await user.type(screen.getByPlaceholderText(SEARCH), "zzz");
    expect(await screen.findByText("No products match your search")).toBeInTheDocument();
    expect(screen.queryByText("No products yet")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Status"), "DRAFT");
    await user.click(await screen.findByRole("button", { name: "Clear search" }));
    expect(screen.getByPlaceholderText(SEARCH)).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("");
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?page=1&pageSize=10"));
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີລິ້ງເພີ່ມສິນຄ້າ; ມີ: ຊີ້ໄປ /products/new", async () => {
    const { unmount } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    expect(screen.getByRole("link", { name: "Add product" })).toHaveAttribute("href", "/products/new");
    unmount();
    auth.canWrite = false;
    renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    expect(screen.queryByRole("link", { name: "Add product" })).toBeNull();
  });

  it("ບໍ່ມີ inventory:write ແລະ ວ່າງ: empty state ບໍ່ມີປຸ່ມເພີ່ມ", async () => {
    auth.canWrite = false;
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<ProductList />);
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add product" })).toBeNull();
  });

  it.each([
    ["ໝວດຢ່າງດຽວ", "Category", "c2", "categoryId=c2"],
    ["ສະຖານະຢ່າງດຽວ", "Status", "DRAFT", "status=DRAFT"],
  ])("ວ່າງ ແລະ ມີສະເພາະ filter %s: ສະແດງ 'ບໍ່ພົບ' ບໍ່ແມ່ນ 'ຍັງບໍ່ມີ'", async (_name, label, value, expected) => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByText("No products yet");
    await user.selectOptions(screen.getByLabelText(label), value);
    await waitFor(() => expect(lastProductsUrl()).toContain(expected));
    expect(await screen.findByText("No products match your search")).toBeInTheDocument();
    expect(screen.queryByText("No products yet")).toBeNull();
  });

  it("ໜ້າເກີນໜ້າສຸດທ້າຍ (ຂໍ້ມູນຫຼຸດ): ໂດດໄປໜ້າສຸດທ້າຍ ແລະ ບໍ່ສະແດງ 'ຍັງບໍ່ມີສິນຄ້າ'", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/products")) {
        return path.includes("page=3")
          ? { items: [], total: 15, page: 3, pageSize: 10 }
          : { items, total: 25, page: 1, pageSize: 10 };
      }
      return categories;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toContain("page=2"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(productUrls()).toContain("/products?page=3&pageSize=10"));
    await waitFor(() => expect(lastProductsUrl()).toBe("/products?page=2&pageSize=10"));
    expect(screen.queryByText("No products yet")).toBeNull();
    expect(await screen.findByTestId("row-product-p1")).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@oca/ui";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CategoryList } from "./category-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const rows: CategoryDto[] = [
  { id: "a", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 2 },
  { id: "a1", name: "Shirts", slug: "shirts", parentId: "a", position: 0, productCount: 0 },
];

function mockApi(list: CategoryDto[] = rows) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/categories" && !options?.method) return list;
    return undefined;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  mockApi();
});

describe("CategoryList", () => {
  it("ສະແດງເປັນ tree (ລູກຢູ່ລຸ່ມແມ່) ພ້ອມຈຳນວນສິນຄ້າ", async () => {
    renderWithProviders(<CategoryList />);
    const parent = await screen.findByTestId("row-category-a");
    const child = screen.getByTestId("row-category-a1");
    expect(within(parent).getByText("Apparel")).toBeInTheDocument();
    expect(within(parent).getByText("2")).toBeInTheDocument();
    expect(parent.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("2 categories")).toBeInTheDocument();
  });

  it("ລຶບ: ຢືນຢັນແລ້ວ DELETE /categories/:id ແລະ ແຈ້ງສຳເລັດ", async () => {
    const { user } = renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a1");
    await user.click(within(screen.getByTestId("row-category-a1")).getByRole("button", { name: /Delete category/ }));
    expect(apiFetch).not.toHaveBeenCalledWith("/categories/a1", expect.anything());
    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/categories/a1", { method: "DELETE" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Category deleted"));
  });

  it("ລຶບແລ້ວ API ຕອບ CATEGORY_IN_USE: toast ຂໍ້ຄວາມແປ ແລະ dialog ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories" && !options?.method) return rows;
      throw new ApiError(409, "x", [], "CATEGORY_IN_USE");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a");
    await user.click(within(screen.getByTestId("row-category-a")).getByRole("button", { name: /Delete category/ }));
    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cannot delete: the category still has products"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete category" })).toBeNull());
  });

  it("ກຳລັງລຶບ (pending): ປຸ່ມແຖວ disabled ແລະ ກົດຊ້ຳບໍ່ຍິງ API ຊ້ຳ", async () => {
    let release: () => void = () => {};
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories" && !options?.method) return rows;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return undefined;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a1");
    await user.click(within(screen.getByTestId("row-category-a1")).getByRole("button", { name: /Delete category/ }));
    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    // dialog ເປີດຢູ່ (modal) ເຮັດໃຫ້ແຖວຖືກຊ່ອນຈາກ a11y tree: ໃຊ້ hidden: true
    const rowButtons = (id: string, name: RegExp) =>
      within(screen.getByTestId(id)).getByRole("button", { name, hidden: true });
    await waitFor(() => expect(rowButtons("row-category-a", /Delete category/)).toBeDisabled());
    expect(rowButtons("row-category-a", /Edit category/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete category" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path === "/categories/a1")).toHaveLength(1);
    release();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Category deleted"));
  });

  it("load ລົ້ມ: ສະແດງ error ແລະ ປຸ່ມລອງໃໝ່ ທີ່ໂຫຼດຄືນໄດ້", async () => {
    vi.mocked(apiFetch).mockImplementation((async () => {
      throw new ApiError(500, "boom", [], "INTERNAL_ERROR");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CategoryList />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockApi();
    await user.click(retry);
    expect(await screen.findByTestId("row-category-a")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມເພີ່ມ/ແກ້/ລຶບ", async () => {
    auth.canWrite = false;
    renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a");
    expect(screen.queryByRole("button", { name: "Add category" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit category/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete category/ })).toBeNull();
  });

  it("ວ່າງ: empty state ພ້ອມປຸ່ມເພີ່ມ", async () => {
    mockApi([]);
    renderWithProviders(<CategoryList />);
    expect(await screen.findByText("No categories yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add category" }).length).toBeGreaterThan(0);
  });
});

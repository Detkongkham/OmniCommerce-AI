import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CategoryFormDialog } from "./category-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const cat = (id: string, parentId: string | null, name = id): CategoryDto => ({
  id,
  name,
  slug: id,
  parentId,
  position: 0,
  productCount: 0,
});
const all = [cat("a", null, "Alpha"), cat("a1", "a", "Alpha child"), cat("b", null, "Beta")];

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("CategoryFormDialog", () => {
  it("ສ້າງ: ສົ່ງ name + position ເທົ່ານັ້ນ ເມື່ອ slug ແລະ ໝວດແມ່ຫວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("n", null));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={onOpenChange} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "Shoes");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories", { method: "POST", body: { name: "Shoes", position: 0 } }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ເລືອກໝວດແມ່ ແລະ ກຳນົດ slug/ລຳດັບ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("n", "b"));
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "Hats");
    await user.type(screen.getByLabelText("Slug"), "hats");
    await user.selectOptions(screen.getByLabelText("Parent category"), "b");
    await user.clear(screen.getByLabelText("Order"));
    await user.type(screen.getByLabelText("Order"), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories", {
        method: "POST",
        body: { name: "Hats", slug: "hats", parentId: "b", position: 3 },
      }),
    );
  });

  it("ແກ້ໄຂ: dropdown ໝວດແມ່ບໍ່ມີໂຕເອງ; PATCH parentId=null ເມື່ອເລືອກ 'ບໍ່ມີ'", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("a1", null));
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={all[1] ?? null} categories={all} />,
    );
    const select = screen.getByLabelText("Parent category");
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["— None (top level) —", "Alpha", "Beta"]); // ບໍ່ມີ "Alpha child" (ໂຕເອງ)
    await user.selectOptions(select, "");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories/a1", {
        method: "PATCH",
        body: { name: "Alpha child", slug: "a1", parentId: null, position: 0 },
      }),
    );
  });

  it("ແກ້ໝວດ a: ບໍ່ມີ a ແລະ ລູກ a1 ໃນຕົວເລືອກໝວດແມ່", () => {
    renderWithProviders(<CategoryFormDialog open onOpenChange={vi.fn()} category={all[0] ?? null} categories={all} />);
    const options = within(screen.getByLabelText("Parent category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["— None (top level) —", "Beta"]);
  });

  it("ແກ້ໝວດ: ໝວດຍ່ອຍຂອງໝວດອື່ນສະແດງ prefix ຕາມ depth", () => {
    const deep = [...all, cat("b1", "b", "Beta child")];
    renderWithProviders(<CategoryFormDialog open onOpenChange={vi.fn()} category={all[0] ?? null} categories={deep} />);
    const options = within(screen.getByLabelText("Parent category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["— None (top level) —", "Beta", "— Beta child"]);
  });

  it("ຊື່ວ່າງ = required; slug ຜິດຮູບແບບ = ຂໍ້ຄວາມ slug; ບໍ່ສົ່ງ API", async () => {
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Slug"), "Bad Slug!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("Use only a–z, 0–9 and - (e.g. summer-shoes)")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toHaveAccessibleDescription(/Leave empty/);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ຊື່ຍາວເກີນ = too long (ບໍ່ແມ່ນ required); ລຳດັບຕິດລົບ = ຂໍ້ຄວາມລຳດັບ", async () => {
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={null} categories={all} />,
    );
    await user.click(screen.getByLabelText("Category"));
    await user.paste("a".repeat(101));
    await user.clear(screen.getByLabelText("Order"));
    await user.type(screen.getByLabelText("Order"), "-1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too long (up to 100 characters)")).toBeInTheDocument();
    expect(screen.getByText("Order must be a whole number, 0 or more")).toBeInTheDocument();
    expect(screen.queryByText("This field is required")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("slug ຊ້ຳ (DUPLICATE_VALUE) ສະແດງຂໍ້ຄວາມແປ ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={onOpenChange} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

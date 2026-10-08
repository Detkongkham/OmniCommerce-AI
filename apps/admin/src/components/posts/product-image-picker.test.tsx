import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { ProductImagePicker } from "./product-image-picker";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const PRODUCT = {
  id: "prod1",
  name: "Silk scarf",
  images: [
    { id: "i1", url: "https://cdn.test/1.jpg", alt: null, position: 0, variantId: null },
    { id: "i2", url: "http://cdn.test/insecure.jpg", alt: null, position: 1, variantId: null },
    { id: "i3", url: "https://cdn.test/3.jpg", alt: "back", position: 2, variantId: null },
  ],
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/products/prod1")) return PRODUCT;
    return { items: [{ id: "prod1", name: "Silk scarf", imageUrl: "https://cdn.test/1.jpg" }], total: 1, page: 1, pageSize: 20 };
  }) as typeof apiFetch);
});

describe("ProductImagePicker", () => {
  it("ເລືອກສິນຄ້າ → ສະແດງສະເພາະຮູບ https → ຕິກ (ບໍ່ເກີນທີ່ເຫຼືອ) → ເພີ່ມ", async () => {
    const onPick = vi.fn();
    const { user } = renderWithProviders(<ProductImagePicker open onOpenChange={() => {}} remaining={1} onPick={onPick} />);
    await user.click(await screen.findByRole("button", { name: "Silk scarf" }));
    const first = await screen.findByRole("checkbox", { name: "Select image 1" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    await user.click(first);
    expect(screen.getByRole("checkbox", { name: "Select image 2" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add 1 images" }));
    expect(onPick).toHaveBeenCalledWith(["https://cdn.test/1.jpg"]);
  });

  it("ຄົ້ນຫາສົ່ງ q", async () => {
    const { user } = renderWithProviders(<ProductImagePicker open onOpenChange={() => {}} remaining={5} onPick={() => {}} />);
    await user.type(screen.getByLabelText("Search products"), "silk");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products?q=silk&page=1&pageSize=20"));
  });
});

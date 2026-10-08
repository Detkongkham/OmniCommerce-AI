import { screen, waitFor } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ITEM } from "./fixtures";
import { ItemFormDialog } from "./item-form-dialog";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const VARIANT: VariantSearchItemDto = {
  id: "v2",
  sku: "SHIRT-WHT-L",
  barcode: null,
  name: "White / L",
  productId: "p1",
  productName: "Shirt",
  productStatus: "ACTIVE",
  imageUrl: null,
  price: "120000.00",
  isActive: true,
  availableTotal: 8,
  stock: [],
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) =>
    path.startsWith("/variants") ? { items: [VARIANT], total: 1, page: 1, pageSize: 8 } : ITEM) as typeof apiFetch);
  vi.mocked(toast.success).mockReset();
});

function setup(item: typeof ITEM | null = null) {
  const onOpenChange = vi.fn();
  const utils = renderWithProviders(<ItemFormDialog open onOpenChange={onOpenChange} sessionId="s1" item={item} />);
  return { ...utils, onOpenChange };
}

async function pickVariant(user: ReturnType<typeof setup>["user"]) {
  await user.type(screen.getByRole("combobox", { name: /^Product/ }), "shirt");
  await user.click(await screen.findByRole("option", { name: /White \/ L/ }));
}

const writes = () => vi.mocked(apiFetch).mock.calls.filter(([path]) => !String(path).startsWith("/variants"));

describe("ItemFormDialog", () => {
  it("ເພີ່ມ: ລະຫັດ normalize, ເລືອກສິນຄ້າ, limit ວ່າງ = null → POST ແລ້ວປິດ", async () => {
    const { user, onOpenChange } = setup();
    await user.type(screen.getByLabelText(/^Code/), " a1 ");
    await pickVariant(user);
    expect(screen.getByText("Shirt — White / L (SHIRT-WHT-L)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/items", {
        method: "POST",
        body: { code: "A1", variantId: "v2", limit: null },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Code added");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ບໍ່ເລືອກສິນຄ້າ, ລະຫັດມີ , ແລະ limit ບໍ່ແມ່ນຈຳນວນເຕັມ: error ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/^Code/), "A,1");
    await user.type(screen.getByLabelText(/^Quantity limit/), "1.5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Codes are 1–30 characters with no , ; or +")).toBeInTheDocument();
    expect(screen.getByText("Choose a product")).toBeInTheDocument();
    expect(screen.getByText("Must be a whole number from 1 to 100,000, or empty")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("ແກ້: ລະຫັດອ່ານຢ່າງດຽວ, ປ່ຽນສິນຄ້າ + limit → PATCH ສະເພາະທີ່ປ່ຽນ", async () => {
    const { user } = setup(ITEM);
    expect(screen.getByLabelText(/^Code/)).toHaveValue("A1");
    expect(screen.getByLabelText(/^Code/)).toBeDisabled();
    expect(screen.getByLabelText(/^Quantity limit/)).toHaveValue(10);
    await user.click(screen.getByRole("button", { name: "Change" }));
    await pickVariant(user);
    await user.clear(screen.getByLabelText(/^Quantity limit/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/items/i1", {
        method: "PATCH",
        body: { variantId: "v2", limit: null },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Code saved");
  });

  it("ແກ້ລະຫັດທີ່ມີ CF ຈອງແລ້ວ: ປ່ຽນສິນຄ້າບໍ່ໄດ້ ແລະ limit ຕ່ຳກວ່າທີ່ຈອງບໍ່ໄດ້", async () => {
    const { user } = setup({ ...ITEM, claimed: 4 });
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.getByText("Has CF claims; the product cannot change")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Quantity limit/));
    await user.type(screen.getByLabelText(/^Quantity limit/), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Cannot be lower than already claimed (4)")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await user.clear(screen.getByLabelText(/^Quantity limit/));
    await user.type(screen.getByLabelText(/^Quantity limit/), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/items/i1", { method: "PATCH", body: { limit: 4 } }));
  });

  it("API error (ລະຫັດຊ້ຳ): alert ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/variants")) return { items: [VARIANT], total: 1, page: 1, pageSize: 8 };
      throw new ApiError(409, "dup", [], "DUPLICATE_VALUE");
    }) as typeof apiFetch);
    const { user, onOpenChange } = setup();
    await user.type(screen.getByLabelText(/^Code/), "A1");
    await pickVariant(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/already/i, { selector: "[role=alert]" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

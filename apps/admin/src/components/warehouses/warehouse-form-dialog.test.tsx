import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { WarehouseDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const existing: WarehouseDto = { id: "w1", code: "MAIN", name: "Main", address: "Vientiane", isDefault: true, isActive: true };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("WarehouseFormDialog", () => {
  it("ສ້າງ: ປ່ຽນລະຫັດເປັນຕົວພິມໃຫຍ່ ແລະ POST ພ້ອມ address ທີ່ເປົ່າ = ບໍ່ສົ່ງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...existing, id: "w2" });
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={onOpenChange} warehouse={null} />);

    await user.type(screen.getByLabelText("Code"), "b2");
    await user.type(screen.getByLabelText("Name"), "Branch 2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses", { method: "POST", body: { code: "B2", name: "Branch 2", isActive: true } }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ແກ້ໄຂ: PATCH ພ້ອມ address ທີ່ລ້າງ = null", async () => {
    vi.mocked(apiFetch).mockResolvedValue(existing);
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={vi.fn()} warehouse={existing} />);

    await user.clear(screen.getByLabelText("Address"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w1", {
        method: "PATCH",
        body: { code: "MAIN", name: "Main", address: null },
      }),
    );
  });

  it("ລະຫັດຜິດຮູບແບບ ບໍ່ສົ່ງ API ແລະ ສະແດງ error ຂອງ field", async () => {
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={vi.fn()} warehouse={null} />);
    await user.type(screen.getByLabelText("Code"), "bad code!");
    await user.type(screen.getByLabelText("Name"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("API ຕອບ DUPLICATE_VALUE: ສະແດງຂໍ້ຄວາມແປໃນ dialog ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "Warehouse code already in use", [], "DUPLICATE_VALUE"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={onOpenChange} warehouse={null} />);
    await user.type(screen.getByLabelText("Code"), "MAIN");
    await user.type(screen.getByLabelText("Name"), "Dup");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

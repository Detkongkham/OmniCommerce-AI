import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { StockLevelDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ThresholdDialog } from "./threshold-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const level: StockLevelDto = {
  id: "s1", variantId: "v1", sku: "TEE-R", variantName: "Red", productName: "Tee", warehouseId: "w1", warehouseCode: "MAIN",
  onHand: 5, reserved: 0, available: 5, lowStockThreshold: 3, isLow: false,
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(level);
});

const patched = (value: number | null) => ["/stock/s1/threshold", { method: "PATCH", body: { lowStockThreshold: value } }];

describe("ThresholdDialog", () => {
  it("ໂຫຼດຄ່າເກົ່າ ແລະ ບັນທຶກຄ່າໃໝ່ເປັນຕົວເລກ", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText("Low-stock level");
    expect(input).toHaveValue(3);
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(...(patched(10) as [string, object])));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ເວັ້ນວ່າງ = null (ບໍ່ເຕືອນ)", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    await user.clear(screen.getByLabelText("Low-stock level"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(...(patched(null) as [string, object])));
  });

  it("0 ສົ່ງເປັນ 0 (ບໍ່ແມ່ນ null)", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(...(patched(0) as [string, object])));
  });

  it.each(["-2", "1.5", "2000000"])("ຄ່າ %s: ສະແດງຂໍ້ຄວາມແປ, aria-invalid, ບໍ່ສົ່ງ; ແກ້ແລ້ວຂໍ້ຄວາມຫາຍ", async (bad) => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    await user.clear(input);
    await user.type(input, bad);
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("whole number from 0 to 1,000,000");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(apiFetch).not.toHaveBeenCalled();
    await user.type(input, "1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("level = null: ບໍ່ render", () => {
    renderWithProviders(<ThresholdDialog level={null} onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText("Low-stock level")).toBeNull();
  });

  it("ກັນສົ່ງຊ້ຳ ແລະ ລັອກປິດຂະນະບັນທຶກ", async () => {
    let resolve!: (value: StockLevelDto) => void;
    vi.mocked(apiFetch).mockReturnValue(new Promise<StockLevelDto>((r) => (resolve = r)) as never);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={onOpenChange} />);
    const save = screen.getByRole("button", { name: /Save|Saving/ });
    await user.click(save);
    await user.click(screen.getByRole("button", { name: /Saving|Save/ }));
    await user.keyboard("{Escape}");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolve(level);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ຂໍ້ຜິດພາດ API ສະແດງແບບແປ ແລະ dialog ຍັງເປີດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "x", [], "STOCK_LEVEL_NOT_FOUND"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

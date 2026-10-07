import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

const patched = (value: number | null) => ({ method: "PATCH", body: { lowStockThreshold: value } });

describe("ThresholdDialog", () => {
  it("ໂຫຼດຄ່າເກົ່າ ແລະ ບັນທຶກຄ່າໃໝ່ເປັນຕົວເລກ", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText("Low-stock level");
    expect(input).toHaveValue(3);
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", patched(10)));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ເວັ້ນວ່າງ = null (ບໍ່ເຕືອນ)", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    await user.clear(screen.getByLabelText("Low-stock level"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", patched(null)));
  });

  it("0 ສົ່ງເປັນ 0 (ບໍ່ແມ່ນ null)", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", patched(0)));
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
    expect(await screen.findByRole("alert")).toHaveTextContent("This stock row was not found");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("badInput (ພິມ 'e' ໃນ input number) ບໍ່ເປັນ null: ສະແດງ error, ບໍ່ສົ່ງ; ແກ້ແລ້ວ reset", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    let bad = true;
    Object.defineProperty(input, "validity", { configurable: true, get: () => ({ badInput: bad }) });
    fireEvent.change(input, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("whole number from 0 to 1,000,000");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(apiFetch).not.toHaveBeenCalled();

    bad = false;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.change(input, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", patched(null)));
  });

  it("ຊ່ອງຫວ່າງລ້ວນ = null; 1e2 = 100", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    await user.clear(input);
    await user.type(input, "1e2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", patched(100)));
  });

  it("hint ຜູກກັບ input ດ້ວຍ aria-describedby", () => {
    renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Low-stock level");
    const hint = screen.getByText(/empty = no warning/);
    expect(input.getAttribute("aria-describedby")).toContain(hint.id);
  });

  it("ເປີດໃໝ່ດ້ວຍ level ອື່ນ ສະແດງຄ່າໃໝ່", async () => {
    function Harness() {
      const [current, setCurrent] = useState<StockLevelDto>(level);
      return (
        <>
          <button type="button" onClick={() => setCurrent({ ...level, id: "s2", lowStockThreshold: 8 })}>
            other
          </button>
          <ThresholdDialog level={current} onOpenChange={vi.fn()} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    expect(screen.getByLabelText("Low-stock level")).toHaveValue(3);
    fireEvent.click(screen.getByText("other"));
    expect(screen.getByLabelText("Low-stock level")).toHaveValue(8);
  });

  it("Enter ສົ່ງຊ້ຳບໍ່ໄດ້ຂະນະບັນທຶກ", async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    await user.click(screen.getByLabelText("Low-stock level"));
    await user.keyboard("{Enter}{Enter}");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

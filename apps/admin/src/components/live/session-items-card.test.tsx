import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { ITEM, SESSION } from "./fixtures";
import { SessionItemsCard } from "./session-items-card";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(undefined);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

const CLAIMED = { ...ITEM, id: "i2", code: "B2", limit: null, claimed: 3, sku: "MUG-01", productName: "Mug", variantName: null };

describe("SessionItemsCard", () => {
  it("ຕາຕະລາງ: ລະຫັດ, ສິນຄ້າ/variant/SKU, ຈອງແລ້ວ/ຈຳກັດ", () => {
    renderWithProviders(<SessionItemsCard session={{ ...SESSION, items: [ITEM, CLAIMED] }} />);
    const first = screen.getByTestId("row-item-i1");
    expect(within(first).getByText("A1")).toBeInTheDocument();
    expect(within(first).getByText("Shirt — Black / M")).toBeInTheDocument();
    expect(within(first).getByText("SHIRT-BLK-M")).toBeInTheDocument();
    expect(within(first).getByText("0 / 10")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-item-i2")).getByText("3 / no limit")).toBeInTheDocument();
  });

  it("ລຶບ: ລະຫັດທີ່ມີ CF ຈອງແລ້ວ disabled; ລະຫັດອື່ນ ຢືນຢັນແລ້ວ DELETE", async () => {
    const { user } = renderWithProviders(<SessionItemsCard session={{ ...SESSION, items: [ITEM, CLAIMED] }} />);
    const blocked = screen.getByRole("button", { name: "Delete code B2" });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAccessibleDescription("Has CF claims; cannot be deleted");
    await user.click(screen.getByRole("button", { name: "Delete code A1" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete code A1?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/items/i1", { method: "DELETE" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Code deleted");
  });

  it("ລຶບລົ້ມ (ມີ CF ເຂົ້າມາລະຫວ່າງນັ້ນ): toast error ແລະ ປິດ dialog", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "in use", [], "LIVE_ITEM_IN_USE"));
    const { user } = renderWithProviders(<SessionItemsCard session={SESSION} />);
    await user.click(screen.getByRole("button", { name: "Delete code A1" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ປຸ່ມເພີ່ມ/ແກ້ ເປີດ dialog ທີ່ຖືກ", async () => {
    const { user } = renderWithProviders(<SessionItemsCard session={SESSION} />);
    await user.click(screen.getByRole("button", { name: "Add code" }));
    expect(await screen.findByRole("dialog", { name: "Add CF code" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit code A1" }));
    expect(await screen.findByRole("dialog", { name: "Edit code A1" })).toBeInTheDocument();
  });

  it("ບໍ່ມີລະຫັດ: empty state", () => {
    renderWithProviders(<SessionItemsCard session={{ ...SESSION, items: [], itemCount: 0 }} />);
    expect(screen.getByText("No codes yet; add one before starting")).toBeInTheDocument();
  });

  it("session ຈົບແລ້ວ ຫຼື ບໍ່ມີ live-cf:write: ອ່ານຢ່າງດຽວ", () => {
    const { unmount } = renderWithProviders(<SessionItemsCard session={{ ...SESSION, status: "ENDED" }} />);
    expect(screen.queryByRole("button", { name: "Add code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit code A1" })).toBeNull();
    expect(screen.getByText("The session has ended; codes are read-only")).toBeInTheDocument();
    unmount();
    auth.canWrite = false;
    renderWithProviders(<SessionItemsCard session={SESSION} />);
    expect(screen.queryByRole("button", { name: "Add code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete code A1" })).toBeNull();
  });

  it("ນຳສະເໜີ: ແຖວທີ່ນຳສະເໜີມີປ້າຍ; ກົດ → PUT featured (ກົດອັນທີ່ນຳສະເໜີຢູ່ = ລ້າງ)", async () => {
    const { user } = renderWithProviders(<SessionItemsCard session={{ ...SESSION, items: [ITEM, CLAIMED], featuredItemId: "i2" }} />);
    expect(within(screen.getByTestId("row-item-i2")).getByText("Featured")).toBeInTheDocument();
    const feature = screen.getByRole("button", { name: "Feature A1" });
    expect(feature).toHaveAttribute("aria-pressed", "false");
    await user.click(feature);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/featured", { method: "PUT", body: { itemId: "i1" } }));
    expect(toast.success).toHaveBeenCalledWith("Featured product updated");
    const stop = screen.getByRole("button", { name: "Stop featuring B2" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    await user.click(stop);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/featured", { method: "PUT", body: { itemId: null } }));
  });
});

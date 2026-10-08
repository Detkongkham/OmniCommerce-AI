import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CourierDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CourierList } from "./courier-list";

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

const COURIERS: CourierDto[] = [
  { id: "c1", code: "AN", name: "Anousith", trackingUrlTemplate: "https://an.la/t/{tracking}", isActive: true, createdAt: "2026-10-08T00:00:00.000Z" },
  { id: "c2", code: "HAL", name: "HAL Express", trackingUrlTemplate: null, isActive: false, createdAt: "2026-10-08T00:00:00.000Z" },
];

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) =>
    options?.method ? COURIERS[0] : COURIERS) as typeof apiFetch);
  vi.mocked(toast.success).mockReset();
});

describe("CourierList", () => {
  it("ຕາຕະລາງ: ລະຫັດ, ຊື່, ລິ້ງ, ສະຖານະ", async () => {
    renderWithProviders(<CourierList />);
    const row = await screen.findByTestId("row-courier-c1");
    expect(within(row).getByText("AN")).toBeInTheDocument();
    expect(within(row).getByText("https://an.la/t/{tracking}")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    const hal = screen.getByTestId("row-courier-c2");
    expect(within(hal).getByText("None")).toBeInTheDocument();
    expect(within(hal).getByText("Inactive")).toBeInTheDocument();
  });

  it("ເພີ່ມ: POST ລະຫັດ/ຊື່/ລິ້ງ (ວ່າງ = null); ລະຫັດຜິດ/ລິ້ງຜິດ → error ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<CourierList />);
    await user.click(await screen.findByRole("button", { name: "Add courier" }));
    await user.type(screen.getByLabelText(/^Code/), "mi xay");
    await user.type(screen.getByLabelText(/^Name/), "Mixay");
    await user.type(screen.getByLabelText(/^Tracking link/), "http://x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Use A-Z 0-9 _ - only, up to 20 characters")).toBeInTheDocument();
    expect(screen.getByText("Must start with https:// and contain {tracking}")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/couriers", expect.objectContaining({ method: "POST" }));

    await user.clear(screen.getByLabelText(/^Code/));
    await user.type(screen.getByLabelText(/^Code/), "mixay");
    await user.clear(screen.getByLabelText(/^Tracking link/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/couriers", {
        method: "POST",
        body: { code: "MIXAY", name: "Mixay", trackingUrlTemplate: null, isActive: true },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Courier added");
  });

  it("ແກ້: ຄ່າເດີມໃນຟອມ → PATCH; API error → alert", async () => {
    const { user } = renderWithProviders(<CourierList />);
    await user.click(await screen.findByRole("button", { name: "Edit HAL Express" }));
    expect(screen.getByLabelText(/^Code/)).toHaveValue("HAL");
    await user.click(screen.getByRole("checkbox", { name: /^Active/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/couriers/c2", {
        method: "PATCH",
        body: { code: "HAL", name: "HAL Express", trackingUrlTemplate: null, isActive: true },
      }),
    );
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method) throw new ApiError(409, "dup", [], "DUPLICATE_VALUE");
      return COURIERS;
    }) as typeof apiFetch);
    await user.click(screen.getByRole("button", { name: "Edit Anousith" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This value already exists", { selector: "[role=alert]" })).toBeInTheDocument();
  });

  it("ບໍ່ມີ logistics:write: ບໍ່ມີປຸ່ມເພີ່ມ/ແກ້; ວ່າງ → empty", async () => {
    auth.canWrite = false;
    vi.mocked(apiFetch).mockImplementation((async () => []) as typeof apiFetch);
    renderWithProviders(<CourierList />);
    expect(await screen.findByText("No couriers yet; add one before shipping")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add courier" })).toBeNull();
  });
});

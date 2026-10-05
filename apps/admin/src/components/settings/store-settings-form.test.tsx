import { screen, waitFor } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { StoreSettingsDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StoreSettingsForm } from "./store-settings-form";

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

const settings: StoreSettingsDto = {
  name: "OCA Store",
  baseCurrency: "LAK",
  vatRate: "10.00",
  pricesIncludeVat: true,
  reservationMinutes: 30,
};

function mockApi() {
  vi.mocked(apiFetch).mockImplementation((async () => settings) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  mockApi();
});

const VAT_ERROR = "VAT must be a number from 0 to 100 (up to 2 decimals)";
const MINUTES_ERROR = "Must be a whole number from 1 to 10,080";

describe("StoreSettingsForm", () => {
  it("ໂຫຼດຄ່າເຂົ້າຟອມ ແລະ ສະແດງສະກຸນເງິນຫຼັກແບບອ່ານຢ່າງດຽວ", async () => {
    renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByDisplayValue("OCA Store")).toBeInTheDocument();
    expect(screen.getByLabelText("VAT (%)")).toHaveValue("10.00");
    expect(screen.getByLabelText("Stock reservation time (minutes)")).toHaveValue(30);
    expect(screen.getByLabelText("Base currency")).toHaveValue("LAK");
    expect(screen.getByLabelText("Base currency")).toBeDisabled();
    expect(screen.getByLabelText("VAT (%)")).toHaveAccessibleDescription(/up to 2 decimals/);
  });

  it("ບັນທຶກ: PATCH ພ້ອມ vatRate ເປັນ string ແລະ ນາທີເປັນຕົວເລກ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "7");
    await user.clear(screen.getByLabelText("Stock reservation time (minutes)"));
    await user.type(screen.getByLabelText("Stock reservation time (minutes)"), "45");
    await user.click(screen.getByRole("checkbox", { name: "Selling prices include VAT" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/settings/store", {
        method: "PATCH",
        body: { name: "OCA Store", vatRate: "7", pricesIncludeVat: false, reservationMinutes: 45 },
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Settings saved"));
  });

  it("VAT ເກີນ 100 ຫຼື ນາທີ 0: ສະແດງ error ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "101");
    await user.clear(screen.getByLabelText("Stock reservation time (minutes)"));
    await user.type(screen.getByLabelText("Stock reservation time (minutes)"), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(VAT_ERROR)).toBeInTheDocument();
    expect(screen.getByText(MINUTES_ERROR)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/settings/store", expect.objectContaining({ method: "PATCH" }));
  });

  it("VAT ທົດສະນິຍົມເກີນ 2 ຫຼັກ ແລະ ນາທີເກີນ 10080 ຖືກປະຕິເສດ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "7.555");
    await user.clear(screen.getByLabelText("Stock reservation time (minutes)"));
    await user.type(screen.getByLabelText("Stock reservation time (minutes)"), "10081");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(VAT_ERROR)).toBeInTheDocument();
    expect(screen.getByText(MINUTES_ERROR)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/settings/store", expect.objectContaining({ method: "PATCH" }));
  });

  it("ຊື່ວ່າງ = required, ຊື່ຍາວເກີນ = too long; VAT ວ່າງ = required", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("Store name"));
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findAllByText("This field is required")).toHaveLength(2);
    expect(screen.queryByText(VAT_ERROR)).toBeNull();

    await user.click(screen.getByLabelText("Store name"));
    await user.paste("a".repeat(101));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too long (up to 100 characters)")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/settings/store", expect.objectContaining({ method: "PATCH" }));
  });

  it("API error ສະແດງຂໍ້ຄວາມແປໃນຟອມ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") throw new ApiError(400, "invalid", [], "VALIDATION_FAILED");
      return settings;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the information you entered");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("load ລົ້ມ: ສະແດງ error ແລະ ປຸ່ມ Retry ທີ່ໂຫຼດຄືນໄດ້", async () => {
    vi.mocked(apiFetch).mockImplementation((async () => {
      throw new ApiError(500, "boom", [], "INTERNAL_ERROR");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StoreSettingsForm />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText("Could not load data")).toBeInTheDocument();
    mockApi();
    await user.click(retry);
    expect(await screen.findByDisplayValue("OCA Store")).toBeInTheDocument();
  });

  it("ກຳລັງບັນທຶກ: ກົດ Save ຊ້ຳບໍ່ສົ່ງຊ້ຳ", async () => {
    let release: () => void = () => {};
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return settings;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saving = await screen.findByRole("button", { name: "Saving..." });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(vi.mocked(apiFetch).mock.calls.filter(([, o]) => (o as { method?: string } | undefined)?.method === "PATCH")).toHaveLength(1);
    release();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("ຫຼັງບັນທຶກ: ຟອມຮີເຊັດເປັນຄ່າຈາກ server (7 -> 7.00)", async () => {
    let saved = false;
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") {
        saved = true;
        return { ...settings, vatRate: "7.00" };
      }
      return saved ? { ...settings, vatRate: "7.00" } : settings;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "7");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("VAT (%)")).toHaveValue("7.00"));
  });

  it("ບໍ່ມີ inventory:write: ທຸກ field ອ່ານຢ່າງດຽວ ແລະ ບໍ່ມີປຸ່ມບັນທຶກ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByDisplayValue("OCA Store")).toBeDisabled();
    expect(screen.getByLabelText("VAT (%)")).toBeDisabled();
    expect(screen.getByLabelText("Stock reservation time (minutes)")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Selling prices include VAT" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

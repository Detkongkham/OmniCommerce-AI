import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { FlashSaleDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { FlashSaleList, flashSaleStatus } from "./flash-sale-list";
import { PromotionsPage } from "./promotions-page";

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

const sale = (patch: Partial<FlashSaleDto> = {}): FlashSaleDto => ({
  id: "f1",
  name: "10.10",
  startsAt: "2020-01-01T00:00:00.000Z",
  endsAt: "2099-01-01T00:00:00.000Z",
  isActive: true,
  items: [{ variantId: "v1", sku: "TEE-R", productName: "Tee", variantName: "Red", regularPrice: "100.00", salePrice: "80.00" }],
  createdAt: "2026-10-11T00:00:00.000Z",
  ...patch,
});
const tee = { id: "v2", sku: "MUG-1", barcode: null, name: null, productId: "p2", productName: "Mug", productStatus: "ACTIVE", imageUrl: null, price: "40.00", regularPrice: "50.00", saleEndsAt: null, isActive: true, availableTotal: 5, stock: [] };

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    const key = options?.method ? `${options.method} ${path}` : path;
    if (key in overrides) {
      const value = overrides[key];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path.startsWith("/variants")) return { items: [tee], total: 1, page: 1, pageSize: 8 };
    if (path === "/flash-sales" && !options?.method) return [sale(), sale({ id: "f2", name: "Old", isActive: false })];
    if (path === "/coupons") return [];
    return sale();
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  mockApi();
});

describe("flashSaleStatus", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  it("ປິດ > ຈົບແລ້ວ > ຍັງບໍ່ເລີ່ມ > ກຳລັງດຳເນີນ (ເລີ່ມລວມ, ຈົບບໍ່ລວມ)", () => {
    const at = (startsAt: string, endsAt: string, isActive = true) => flashSaleStatus({ startsAt, endsAt, isActive }, now);
    expect(at("2026-10-11T10:00:00Z", "2026-10-11T11:00:00Z")).toBe("running");
    expect(at("2026-10-11T10:00:01Z", "2026-10-11T11:00:00Z")).toBe("scheduled");
    expect(at("2026-10-11T09:00:00Z", "2026-10-11T10:00:00Z")).toBe("ended");
    expect(at("2026-10-11T09:00:00Z", "2026-10-11T11:00:00Z", false)).toBe("inactive");
  });
});

describe("FlashSaleList", () => {
  it("ຕາຕະລາງ: ຊື່, ຈຳນວນສິນຄ້າ + SKU, ສະຖານະ", async () => {
    renderWithProviders(<FlashSaleList />);
    const row = await screen.findByTestId("row-flash-sale-f1");
    expect(within(row).getByText("10.10")).toBeInTheDocument();
    expect(within(row).getByText("1 items")).toBeInTheDocument();
    expect(within(row).getByText("TEE-R")).toBeInTheDocument();
    expect(within(row).getByText("Running")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-flash-sale-f2")).getByText("Off")).toBeInTheDocument();
  });

  it("ສ້າງ: validate (ຊື່, ເວລາ, ສິນຄ້າ, ລາຄາພິເສດຕ້ອງຕ່ຳກວ່າລາຄາປົກກະຕິ) ແລ້ວ POST", async () => {
    const { user } = renderWithProviders(<FlashSaleList />);
    await user.click(await screen.findByRole("button", { name: "New flash sale" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Add at least one product")).toBeInTheDocument();
    expect(screen.getAllByText("This field is required").length).toBe(3);
    expect(apiFetch).not.toHaveBeenCalledWith("/flash-sales", expect.objectContaining({ method: "POST" }));

    await user.type(screen.getByLabelText(/^Campaign name/), "11.11");
    await user.type(screen.getByLabelText(/^Starts/), "2026-11-11T00:00");
    await user.type(screen.getByLabelText(/^Ends/), "2026-11-10T00:00");
    await user.type(screen.getByLabelText("Add product (search SKU/name)"), "mug");
    await user.click(await screen.findByRole("option", { name: /MUG-1/ }));
    // ລາຄາປົກກະຕິ (50) ຖືກໃຊ້ເປັນເກນ ບໍ່ແມ່ນລາຄາ Flash Sale ປັດຈຸບັນ (40)
    expect(screen.getByText(/Regular 50.00/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Sale price MUG-1"), "50");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Must be after the start time")).toBeInTheDocument();
    expect(screen.getByText("Must be greater than 0 and lower than the regular price")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Ends/));
    await user.type(screen.getByLabelText(/^Ends/), "2026-11-12T00:00");
    await user.clear(screen.getByLabelText("Sale price MUG-1"));
    await user.type(screen.getByLabelText("Sale price MUG-1"), "45");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/flash-sales", expect.objectContaining({ method: "POST" })));
    const call = vi.mocked(apiFetch).mock.calls.find(([path, options]) => path === "/flash-sales" && (options as { method?: string } | undefined)?.method === "POST");
    expect((call?.[1] as { body: Record<string, unknown> }).body).toEqual({
      name: "11.11",
      startsAt: new Date("2026-11-11T00:00").toISOString(),
      endsAt: new Date("2026-11-12T00:00").toISOString(),
      isActive: true,
      items: [{ variantId: "v2", salePrice: "45" }],
    });
    expect(toast.success).toHaveBeenCalledWith("Flash sale created");
  });

  it("ແກ້: ຄ່າເດີມໃນຟອມ, ລຶບ/ແກ້ລາຍການ → PATCH; API ບອກ SKU ທີ່ຊ້ອນ → alert", async () => {
    mockApi({ "PATCH /flash-sales/f1": new ApiError(409, "x", [], "FLASH_SALE_OVERLAP", { skus: ["TEE-R"] }) });
    const { user } = renderWithProviders(<FlashSaleList />);
    await user.click(await screen.findByRole("button", { name: "Edit 10.10" }));
    expect(screen.getByLabelText(/^Campaign name/)).toHaveValue("10.10");
    expect(screen.getByLabelText("Sale price TEE-R")).toHaveValue("80");
    await user.clear(screen.getByLabelText("Sale price TEE-R"));
    await user.type(screen.getByLabelText("Sale price TEE-R"), "70");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Some products are already in another flash sale during this period");
    expect(alert).toHaveTextContent("Affected products: TEE-R");
    const call = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/flash-sales/f1");
    expect((call?.[1] as { body: { items: unknown[] } }).body.items).toEqual([{ variantId: "v1", salePrice: "70" }]);
    await user.click(screen.getByRole("button", { name: "Remove TEE-R" }));
    expect(screen.queryByLabelText("Sale price TEE-R")).toBeNull();
  });

  it("ບໍ່ມີ promotion:write: ບໍ່ມີປຸ່ມສ້າງ/ແກ້", async () => {
    auth.canWrite = false;
    renderWithProviders(<FlashSaleList />);
    await screen.findByTestId("row-flash-sale-f1");
    expect(screen.queryByRole("button", { name: "New flash sale" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit 10.10" })).toBeNull();
  });
});

describe("PromotionsPage", () => {
  it("ແຖບ: ເລີ່ມທີ່ໂຄດສ່ວນຫຼຸດ; ກົດ/ລູກສອນ ປ່ຽນໄປ Flash Sale ແລະ ດຶງຂໍ້ມູນສະເພາະແຖບທີ່ເປີດ", async () => {
    const { user } = renderWithProviders(<PromotionsPage />);
    const coupons = screen.getByRole("tab", { name: "Discount codes" });
    expect(coupons).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("No discount codes yet")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/flash-sales");
    coupons.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Flash sales" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("row-flash-sale-f1")).toBeInTheDocument();
    await user.click(coupons);
    expect(await screen.findByText("No discount codes yet")).toBeInTheDocument();
  });
});

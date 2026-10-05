import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@oca/ui";
import { ApiError, apiFetch } from "@/lib/api";
import type { WarehouseDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { WarehouseList } from "./warehouse-list";

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

const rows: WarehouseDto[] = [
  { id: "w1", code: "MAIN", name: "Main", address: "Vientiane", isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
  { id: "w3", code: "OLD", name: "Old", address: null, isDefault: false, isActive: false },
];

function mockApi(list: WarehouseDto[] = rows) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/warehouses" && !options?.method) return list;
    return {};
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  mockApi();
});

describe("WarehouseList", () => {
  it("ສະແດງລະຫັດ, ຊື່, ທີ່ຢູ່, ປ້າຍສາງຫຼັກ ແລະ ສະຖານະ", async () => {
    renderWithProviders(<WarehouseList />);
    const main = await screen.findByTestId("row-warehouse-w1");
    expect(within(main).getByText("MAIN")).toBeInTheDocument();
    expect(within(main).getByText("Vientiane")).toBeInTheDocument();
    expect(within(main).getByText("Default")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-warehouse-w3")).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("3 warehouses")).toBeInTheDocument();
  });

  it("ປຸ່ມ 'ຕັ້ງເປັນສາງຫຼັກ' ມີສະເພາະສາງທີ່ເປີດ ແລະ ບໍ່ແມ່ນ default; ກົດແລ້ວ POST /default", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(within(screen.getByTestId("row-warehouse-w1")).queryByRole("button", { name: /Make default/ })).toBeNull();
    expect(within(screen.getByTestId("row-warehouse-w3")).queryByRole("button", { name: /Make default/ })).toBeNull();

    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Make default/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/warehouses/w2/default", { method: "POST" }));
  });

  it("ປິດສາງຕ້ອງຢືນຢັນ ແລ້ວ PATCH isActive=false; ສາງ default ປິດບໍ່ໄດ້ (ບໍ່ມີປຸ່ມ)", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(within(screen.getByTestId("row-warehouse-w1")).queryByRole("button", { name: /Deactivate/ })).toBeNull();

    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Deactivate/ }));
    expect(apiFetch).not.toHaveBeenCalledWith("/warehouses/w2", expect.anything());
    await user.click(await screen.findByRole("button", { name: "Deactivate warehouse" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w2", { method: "PATCH", body: { isActive: false } }),
    );
  });

  it("ເປີດສາງທີ່ປິດ: PATCH isActive=true ທັນທີ", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w3");
    await user.click(within(screen.getByTestId("row-warehouse-w3")).getByRole("button", { name: /Activate/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w3", { method: "PATCH", body: { isActive: true } }),
    );
  });

  it("API ຕອບ error ເມື່ອປິດ: ບໍ່ crash (toast ຜ່ານ errorMessage)", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/warehouses" && !options?.method) return rows;
      throw new ApiError(409, "x", [], "WAREHOUSE_NOT_EMPTY");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w2");
    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Deactivate/ }));
    await user.click(await screen.findByRole("button", { name: "Deactivate warehouse" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cannot deactivate: the warehouse still holds or reserves stock"),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deactivate warehouse" })).toBeNull());
  });

  it("ກຳລັງປິດ/ຕັ້ງຄ່າ (pending): ປຸ່ມແຖວ disabled ແລະ ກົດຊ້ຳບໍ່ຍິງ API ຊ້ຳ", async () => {
    let release: () => void = () => {};
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/warehouses" && !options?.method) return rows;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {};
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w2");
    const makeDefault = within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Make default/ });
    await user.click(makeDefault);
    await waitFor(() => expect(makeDefault).toBeDisabled());
    await user.click(makeDefault);
    expect(within(screen.getByTestId("row-warehouse-w3")).getByRole("button", { name: /Activate/ })).toBeDisabled();
    expect(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Deactivate/ })).toBeDisabled();
    expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path === "/warehouses/w2/default")).toHaveLength(1);
    release();
    await waitFor(() => expect(makeDefault).not.toBeDisabled());
  });

  it("load ລົ້ມ: ສະແດງ error ແລະ ປຸ່ມລອງໃໝ່ ທີ່ໂຫຼດຄືນໄດ້", async () => {
    vi.mocked(apiFetch).mockImplementation((async () => {
      throw new ApiError(500, "boom", [], "INTERNAL_ERROR");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<WarehouseList />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockApi();
    await user.click(retry);
    expect(await screen.findByTestId("row-warehouse-w1")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມເພີ່ມ/ແກ້/ຕັ້ງຄ່າ", async () => {
    auth.canWrite = false;
    renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(screen.queryByRole("button", { name: "Add warehouse" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit warehouse/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Make default/ })).toBeNull();
  });

  it("ວ່າງ: empty state ພ້ອມປຸ່ມເພີ່ມ", async () => {
    mockApi([]);
    renderWithProviders(<WarehouseList />);
    expect(await screen.findByText("No warehouses yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add warehouse" }).length).toBeGreaterThan(0);
  });
});

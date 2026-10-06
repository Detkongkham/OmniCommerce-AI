import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { Page, StockMovementDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StockMovements } from "./stock-movements";

const auth = vi.hoisted(() => ({ canReadOrders: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => (permission === "orders:read" ? auth.canReadOrders : true) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const mv = (patch: Partial<StockMovementDto> = {}): StockMovementDto => ({
  id: "m1", type: "RECEIVE", quantity: 5, variantId: "v1", sku: "TEE-R", warehouseId: "w1", warehouseCode: "MAIN",
  orderId: null, orderNumber: null, note: "PO-1", actorId: "u1", actorName: "Owner", createdAt: "2026-10-05T05:30:00.000Z", ...patch,
});
const rows = [
  mv(),
  mv({ id: "m2", type: "SHIP", quantity: 3, orderId: "o1", orderNumber: "SO-000001", note: null }),
  mv({ id: "m3", type: "RELEASE", quantity: 2, actorId: null, actorName: null, note: null }),
];
const variantItem = { id: "v1", sku: "TEE-R", name: "Red", productName: "Tee", price: "100.00", available: 5, isActive: true, productStatus: "ACTIVE" };

const WH_ID = "cmuv0qtwo002ekm05tqu12uci";
const transferRows = (notes: Record<string, string | null>) =>
  Object.entries(notes).map(([id, note]) => mv({ id, type: id.startsWith("out") ? "TRANSFER_OUT" : "TRANSFER_IN", note }));

function mockApi(page: Page<StockMovementDto> = { items: rows, total: 3, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/stock/movements")) return page;
    if (path.startsWith("/variants")) return { items: [variantItem], total: 1, page: 1, pageSize: 8 };
    if (path === "/warehouses")
      return [
        { id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true },
        { id: WH_ID, code: "BKK", name: "Bangkok", address: null, isDefault: false, isActive: false },
      ];
    return {};
  }) as typeof apiFetch);
}
const movementUrls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/stock/movements"));
const lastUrl = () => movementUrls().at(-1);

beforeEach(() => {
  auth.canReadOrders = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StockMovements", () => {
  it("ສະແດງເວລາລາວ, ປະເພດ, SKU, ສາງ, ຈຳນວນມີເຄື່ອງໝາຍ, ລິ້ງບິນ, ໝາຍເຫດ ແລະ ຜູ້ເຮັດ (ລະບົບເມື່ອບໍ່ມີ)", async () => {
    renderWithProviders(<StockMovements />);
    const first = await screen.findByTestId("row-movement-m1");
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    expect(within(first).getByText("Receive")).toBeInTheDocument();
    expect(within(first).getByText("+5")).toBeInTheDocument();
    expect(within(first).getByText("PO-1")).toBeInTheDocument();
    expect(within(first).getByText("Owner")).toBeInTheDocument();
    expect(within(first).getByRole("rowheader", { name: "TEE-R" })).toBeInTheDocument();
    const ship = screen.getByTestId("row-movement-m2");
    expect(within(ship).getByText("−3")).toBeInTheDocument();
    expect(within(ship).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    const release = screen.getByTestId("row-movement-m3");
    expect(within(release).getByText("System")).toBeInTheDocument();
    expect(within(release).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Stock movement history" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("3 movements found");
  });

  it("ບໍ່ມີ orders:read: ເລກບິນເປັນຂໍ້ຄວາມທຳມະດາ ບໍ່ເປັນລິ້ງ (ໜ້າບິນຈະ 403)", async () => {
    auth.canReadOrders = false;
    renderWithProviders(<StockMovements />);
    const ship = await screen.findByTestId("row-movement-m2");
    expect(within(ship).getByText("SO-000001")).toBeInTheDocument();
    expect(within(ship).queryByRole("link")).toBeNull();
  });

  it("filter ປະເພດ, ສາງ ແລະ ວັນທີ ຖືກສົ່ງຕາມຄ່າ date-only (ບໍ່ແປງເປັນ ISO)", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.selectOptions(screen.getByLabelText("Type"), "SHIP");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?type=SHIP&page=1&pageSize=10"));
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    await waitFor(() => expect(lastUrl()).toContain("warehouseId=w1"));
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toContain("from=2026-10-01"));
    expect(lastUrl()).toContain("to=2026-10-05");
    expect(lastUrl()).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("ເລືອກ variant ສົ່ງ variantId; ປຸ່ມລ້າງ variant ມີຊື່ທີ່ບອກວ່າລ້າງຫຍັງ", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.type(screen.getByLabelText("Item"), "tee");
    await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
    await waitFor(() => expect(lastUrl()).toContain("variantId=v1"));
    const clear = screen.getByRole("button", { name: /Clear.*Item/ });
    expect(clear).toHaveFocus();
    await user.click(clear);
    await waitFor(() => expect(lastUrl()).not.toContain("variantId"));
    expect(screen.getByLabelText("Item")).toHaveFocus();
  });

  it("date, from/to ດຽວ, from=to: ບໍ່ມີ alert ແລະ URL ຖືກຕ້ອງ", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.type(screen.getByLabelText("From date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?from=2026-10-05&page=1&pageSize=10"));
    expect(lastUrl()).not.toContain("to=");
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?from=2026-10-05&to=2026-10-05&page=1&pageSize=10"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("date to ດຽວ: ບໍ່ມີ from ໃນ URL", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?to=2026-10-05&page=1&pageSize=10"));
    expect(lastUrl()).not.toContain("from=");
  });

  it("ປີ 5 ຫຼັກ: ຖືວ່າຜິດ, ສະແດງຂໍ້ຄວາມ ແລະ ບໍ່ສົ່ງ request", async () => {
    renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    const before = movementUrls().length;
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "20261-10-05" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(movementUrls()).toHaveLength(before);
  });

  it("filter ວັນທີ ແລະ variant ກັບໄປໜ້າ 1", async () => {
    mockApi({ items: rows, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    const next = async () => {
      await user.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(lastUrl()).toContain("page=2"));
    };
    await next();
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?from=2026-10-01&page=1&pageSize=10"));
    await next();
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?from=2026-10-01&to=2026-10-05&page=1&pageSize=10"));
    await next();
    await user.type(screen.getByLabelText("Item"), "tee");
    await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
    await waitFor(() => expect(lastUrl()).toContain("variantId=v1&"));
    expect(lastUrl()).toContain("page=1");
    await next();
    await user.click(screen.getByRole("button", { name: /Clear.*Item/ }));
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?from=2026-10-01&to=2026-10-05&page=1&pageSize=10"));
  });

  it("ປ່ຽນ filter: ກັບໄປໜ້າ 1", async () => {
    mockApi({ items: rows, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Type"), "SHIP");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?type=SHIP&page=1&pageSize=10"));
  });

  it("ວັນທີເລີ່ມຫຼັງວັນທີສິ້ນສຸດ: ສະແດງຂໍ້ຄວາມ ແລະ ບໍ່ສົ່ງ request ທີ່ຜິດ", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.type(screen.getByLabelText("From date"), "2026-10-05");
    await user.type(screen.getByLabelText("To date"), "2026-10-01");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The start date must not be after the end date");
    expect(movementUrls().some((url) => url.includes("from=2026-10-05") && url.includes("to=2026-10-01"))).toBe(false);
    expect(lastUrl()).toBe("/stock/movements?from=2026-10-05&page=1&pageSize=10");
    expect(screen.queryByTestId("row-movement-m1")).toBeNull();
    expect(screen.getByLabelText("To date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("To date")).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByLabelText("From date")).toHaveAttribute("aria-describedby", alert.id);
    // ແກ້ວັນທີ: ກັບມາສະແດງຕາຕະລາງ ແລະ ດຶງຂໍ້ມູນ
    await user.clear(screen.getByLabelText("To date"));
    await user.type(screen.getByLabelText("To date"), "2026-10-06");
    expect(await screen.findByTestId("row-movement-m1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lastUrl()).toBe("/stock/movements?from=2026-10-05&to=2026-10-06&page=1&pageSize=10");
  });

  it("ວ່າງ ແລະ ບໍ່ມີ filter: 'ບໍ່ພົບການເຄື່ອນໄຫວ' ບໍ່ມີປຸ່ມລ້າງ; ມີ filter: ມີປຸ່ມລ້າງທີ່ລ້າງທັນທີ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockMovements />);
    expect(await screen.findByText("No movements found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Type"), "SHIP");
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await user.click(await screen.findByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Type")).toHaveValue("");
    expect(screen.getByLabelText("From date")).toHaveValue("");
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?page=1&pageSize=10"));
  });

  it("ກຳລັງໂຫຼດ: skeleton + aria-busy ບໍ່ສະແດງ empty state", () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => {})) as typeof apiFetch);
    const { container } = renderWithProviders(<StockMovements />);
    expect(container.querySelector(".oca-skeleton")).not.toBeNull();
    expect(screen.getByRole("table", { name: "Stock movement history" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No movements found")).toBeNull();
  });

  it("load ລົ້ມ: ມີປຸ່ມລອງໃໝ່ ແລະ ດຶງໃໝ່ໄດ້", async () => {
    let fail = true;
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/stock/movements")) {
        if (fail) throw new Error("boom");
        return { items: rows, total: 3, page: 1, pageSize: 10 };
      }
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockMovements />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("row-movement-m1")).toBeInTheDocument();
  });

  it("ໜ້າເກີນໜ້າສຸດທ້າຍ: ໂດດໄປໜ້າສຸດທ້າຍ ບໍ່ສະແດງ empty", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/stock/movements")) {
        return path.includes("page=3") ? { items: [], total: 15, page: 3, pageSize: 10 } : { items: rows, total: 25, page: 1, pageSize: 10 };
      }
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(movementUrls()).toContain("/stock/movements?page=3&pageSize=10"));
    await waitFor(() => expect(lastUrl()).toBe("/stock/movements?page=2&pageSize=10"));
    expect(screen.queryByText("No movements found")).toBeNull();
  });

  describe("ໝາຍເຫດ transfer (ເກັບເປັນ `from <id>` / `to <id>`)", () => {
    it("TRANSFER_IN/OUT ສະແດງລະຫັດສາງ (ລວມສາງທີ່ປິດ) ແທນ id ດິບ", async () => {
      mockApi({ items: transferRows({ "in-1": `from ${WH_ID}`, "out-1": "to w1" }), total: 2, page: 1, pageSize: 10 });
      renderWithProviders(<StockMovements />);
      expect(await within(await screen.findByTestId("row-movement-in-1")).findByText("From BKK")).toBeInTheDocument();
      expect(within(screen.getByTestId("row-movement-out-1")).getByText("To MAIN")).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(WH_ID))).toBeNull();
    });

    it("ບໍ່ພົບ id ໃນລາຍການສາງ: ສະແດງ 'ສາງທີ່ບໍ່ຮູ້ຈັກ' ບໍ່ສະແດງ id ດິບ", async () => {
      mockApi({ items: transferRows({ "in-1": "from cmgone0000000000000000000" }), total: 1, page: 1, pageSize: 10 });
      renderWithProviders(<StockMovements />);
      const row = await screen.findByTestId("row-movement-in-1");
      expect(await within(row).findByText("From unknown warehouse")).toBeInTheDocument();
      expect(row).not.toHaveTextContent("cmgone");
    });

    it("ກຳລັງໂຫຼດລາຍການສາງ: ສະແດງ placeholder ກາງ ບໍ່ກະພິບ id ດິບ", async () => {
      vi.mocked(apiFetch).mockImplementation((async (path: string) => {
        if (path.startsWith("/stock/movements")) return { items: transferRows({ "in-1": `from ${WH_ID}` }), total: 1, page: 1, pageSize: 10 };
        if (path === "/warehouses") return new Promise(() => {});
        return {};
      }) as typeof apiFetch);
      renderWithProviders(<StockMovements />);
      const row = await screen.findByTestId("row-movement-in-1");
      expect(row).not.toHaveTextContent(WH_ID);
      expect(row).not.toHaveTextContent("unknown warehouse");
      expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    });

    it("ໝາຍເຫດຜູ້ໃຊ້ + ຕໍ່ທ້າຍດ້ວຍ ` | to <id>`: ສະແດງ prefix + ລະຫັດສາງ (prefix ມີ ` | ` ເອງກໍໄດ້) ບໍ່ມີ id ດິບ", async () => {
      mockApi({
        items: transferRows({ "out-1": `restock | to ${WH_ID}`, "in-1": "a | b | from w1", "out-2": `x | to cmgone0000000000000000000` }),
        total: 3, page: 1, pageSize: 10,
      });
      renderWithProviders(<StockMovements />);
      expect(await within(await screen.findByTestId("row-movement-out-1")).findByText("restock | To BKK")).toBeInTheDocument();
      expect(within(screen.getByTestId("row-movement-in-1")).getByText("a | b | From MAIN")).toBeInTheDocument();
      expect(within(screen.getByTestId("row-movement-out-2")).getByText("x | To unknown warehouse")).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(WH_ID))).toBeNull();
      expect(screen.queryByText(/cmgone/)).toBeNull();
    });

    it("ກຳລັງໂຫຼດສາງ: ຍັງສະແດງ prefix ຂອງຜູ້ໃຊ້ ແລະ ໃສ່ placeholder ສະເພາະສ່ວນ id", async () => {
      vi.mocked(apiFetch).mockImplementation((async (path: string) => {
        if (path.startsWith("/stock/movements")) return { items: transferRows({ "out-1": `restock | to ${WH_ID}` }), total: 1, page: 1, pageSize: 10 };
        if (path === "/warehouses") return new Promise(() => {});
        return {};
      }) as typeof apiFetch);
      renderWithProviders(<StockMovements />);
      const row = await screen.findByTestId("row-movement-out-1");
      expect(within(row).getByText("restock | —")).toBeInTheDocument();
      expect(row).not.toHaveTextContent(WH_ID);
    });

    it("cell ໝາຍເຫດທີ່ຖືກຕັດມີ title ເປັນຂໍ້ຄວາມເຕັມ", async () => {
      renderWithProviders(<StockMovements />);
      const first = await screen.findByTestId("row-movement-m1");
      expect(within(first).getByText("PO-1")).toHaveAttribute("title", "PO-1");
    });

    it("ໝາຍເຫດທີ່ບໍ່ກົງຮູບແບບ ຫຼື ບໍ່ແມ່ນ transfer: ສະແດງຕາມເດີມ", async () => {
      mockApi({
        items: [
          mv({ id: "in-typed", type: "TRANSFER_IN", note: "from the old shop" }),
          mv({ id: "in-prefix", type: "TRANSFER_IN", note: `from ${WH_ID} damaged` }),
          mv({ id: "in-plain", type: "TRANSFER_IN", note: "restock" }),
          mv({ id: "rcv", type: "RECEIVE", note: "from w1" }),
        ],
        total: 4, page: 1, pageSize: 10,
      });
      renderWithProviders(<StockMovements />);
      await screen.findByTestId("row-movement-in-typed");
      expect(screen.getByText("from the old shop")).toBeInTheDocument();
      expect(screen.getByText(`from ${WH_ID} damaged`)).toBeInTheDocument();
      expect(screen.getByText("restock")).toBeInTheDocument();
      expect(within(screen.getByTestId("row-movement-rcv")).getByText("from w1")).toBeInTheDocument();
    });
  });
});

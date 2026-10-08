import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { AuditLogPage } from "./audit-log-page";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items = [
  {
    id: "a1", createdAt: "2026-10-08T03:00:00.000Z", action: "variant.update", entity: "ProductVariant", entityId: "v1", ip: "10.0.0.1",
    user: { id: "u1", name: "Noy", email: "noy@x" }, before: { price: "10.00", sku: "A" }, after: { price: "12.00", sku: "A" },
  },
  { id: "a2", createdAt: "2026-10-08T02:00:00.000Z", action: "order.cancel", entity: "Order", entityId: "o1", ip: null, user: null, before: null, after: { status: "CANCELLED" } },
];

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/audit-logs/facets") return { actions: ["order.cancel", "order.create", "variant.update"], entities: ["Order", "ProductVariant"] };
    if (path === "/staff") return [{ id: "u1", name: "Noy", email: "noy@x", isActive: true, roleId: "r", roleName: "R", lastLoginAt: null, createdAt: "" }];
    if (path.startsWith("/audit-logs")) return { items, total: 2, page: 1, pageSize: 50 };
    return undefined;
  }) as typeof apiFetch);
});

const listCalls = () => vi.mocked(apiFetch).mock.calls.map(([path]) => path).filter((path) => path.startsWith("/audit-logs?"));

describe("AuditLogPage", () => {
  it("ລາຍການ: ເວລາລາວ, ຜູ້ກະທຳ/ລະບົບ, ລິ້ງໄປບິນ", async () => {
    renderWithProviders(<AuditLogPage />);
    const first = await screen.findByTestId("row-audit-a1");
    expect(within(first).getByText("08/10/2026 10:00")).toBeInTheDocument();
    expect(within(first).getByText("Noy")).toBeInTheDocument();
    const second = screen.getByTestId("row-audit-a2");
    expect(within(second).getByText("System")).toBeInTheDocument();
    expect(within(second).getByRole("link", { name: "o1" })).toHaveAttribute("href", "/orders/o1");
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("filter ສົ່ງເປັນ query; ກຸ່ມ order.*; ຄ່າເລີ່ມຈາກ URL", async () => {
    const { user } = renderWithProviders(<AuditLogPage initialEntity="Order" initialEntityId="o1" />);
    await screen.findByTestId("row-audit-a1");
    expect(listCalls()[0]).toBe("/audit-logs?entity=Order&entityId=o1&page=1&pageSize=50");
    await waitFor(() => expect(screen.getByRole("option", { name: "order.* (all actions)" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Action"), "order.*");
    await user.selectOptions(screen.getByLabelText("Staff"), "u1");
    await waitFor(() =>
      expect(listCalls()).toContain("/audit-logs?userId=u1&action=order.*&entity=Order&entityId=o1&page=1&pageSize=50"),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(listCalls().at(-1)).toBe("/audit-logs?page=1&pageSize=50"));
  });

  it("ລາຍລະອຽດ: ສະແດງກ່ອນ/ຫຼັງ ແລະ ໝາຍ field ທີ່ປ່ຽນ", async () => {
    const { user } = renderWithProviders(<AuditLogPage />);
    await screen.findByTestId("row-audit-a1");
    await user.click(screen.getByRole("button", { name: "View details of variant.update" }));
    const dialog = await screen.findByRole("dialog");
    const price = within(dialog).getByText("price").closest("tr");
    expect(price).toHaveAttribute("data-changed", "true");
    expect(price).toHaveTextContent("10.00");
    expect(price).toHaveTextContent("12.00");
    expect(within(dialog).getByText("sku").closest("tr")).not.toHaveAttribute("data-changed");
    expect(within(dialog).getByText("10.0.0.1")).toBeInTheDocument();
  });
});

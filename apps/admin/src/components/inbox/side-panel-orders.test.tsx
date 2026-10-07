import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SidePanel } from "./side-panel";

const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => !auth.denied.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c 1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: "hi",
  assignee: null,
  customer: { id: "cu1", name: "Dala", phone: "020111111" },
  createdAt: "2026-10-06T05:00:00.000Z",
};

const orderRow = {
  id: "o1",
  orderNumber: "SO-000001",
  status: "PENDING_PAYMENT",
  channel: "FACEBOOK",
  source: "CHAT",
  conversationId: "c 1",
  customer: null,
  total: "195.00",
  itemCount: 1,
  reservedUntil: null,
  createdAt: "2026-10-07T05:00:00.000Z",
};

const openOrder = () => screen.queryByRole("link", { name: "Open order" });

beforeEach(() => {
  auth.denied.clear();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url === "/inbox/assignees") return [];
    if (url.startsWith("/orders")) return { items: [orderRow], total: 1, page: 1, pageSize: 20 };
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("SidePanel: ບິນຂອງເຄສ + ເປີດບິນ", () => {
  it("ສະແດງບິນຂອງເຄສ ແລະ ປຸ່ມ 'ເປີດບິນ' ທີ່ຊີ້ໄປ /orders/new?conversationId= (id ຖືກ encode)", async () => {
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(screen.getByRole("region", { name: "Orders from this conversation" })).toBeInTheDocument();
    expect(openOrder()).toHaveAttribute("href", "/orders/new?conversationId=c%201");
    expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c%201&page=1&pageSize=20");
  });

  it("ບໍ່ມີ orders:read: ເຊື່ອງລາຍການບິນ (ບໍ່ຍິງ /orders) ແຕ່ປຸ່ມເປີດບິນຍັງຢູ່", () => {
    auth.denied.add("orders:read");
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(openOrder()).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "SO-000001" })).not.toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.some((call) => String(call[0]).startsWith("/orders"))).toBe(false);
  });

  it("ບໍ່ມີ inbox:write (canWrite=false): ບໍ່ມີປຸ່ມ ແຕ່ເຫັນລາຍການບິນ", async () => {
    renderWithProviders(<SidePanel conversation={conversation} canWrite={false} />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    expect(openOrder()).not.toBeInTheDocument();
  });

  it.each(["orders:write", "inventory:read"])("ບໍ່ມີ %s: ບໍ່ມີປຸ່ມເປີດບິນ", async (permission) => {
    auth.denied.add(permission);
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(await screen.findByRole("link", { name: "SO-000001" })).toBeInTheDocument();
    expect(openOrder()).not.toBeInTheDocument();
  });

  it("ບໍ່ມີທັງ orders:read ແລະ ສິດເປີດບິນ: ບໍ່ມີ section ບິນເລີຍ", () => {
    auth.denied.add("orders:read");
    renderWithProviders(<SidePanel conversation={conversation} canWrite={false} />);
    expect(screen.queryByRole("region", { name: "Orders from this conversation" })).not.toBeInTheDocument();
  });
});

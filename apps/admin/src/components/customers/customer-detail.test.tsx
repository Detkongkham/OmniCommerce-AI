import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CrmCustomerConversationDto, CrmCustomerDetailDto, CrmCustomerOrderDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CustomerDetail } from "./customer-detail";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
const auth = vi.hoisted(() => ({ canWrite: true, canOrders: true, canInbox: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "crm:write" ? auth.canWrite : permission === "orders:read" ? auth.canOrders : auth.canInbox),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const customer: CrmCustomerDetailDto = {
  id: "c1",
  name: "Mali",
  phone: "02055550001",
  email: "mali@x.co",
  createdAt: "2026-09-01T00:00:00.000Z",
  note: "Likes red",
  facebookLinked: true,
  orderCount: 12,
  totalSpent: "1250000.00",
  averageOrder: "104166.67",
  firstPaidAt: "2026-09-02T03:00:00.000Z",
  lastPaidAt: "2026-10-05T05:30:00.000Z",
  openOrderCount: 1,
  conversationCount: 1,
  segment: "CHAMPION",
  rfm: { recency: 5, frequency: 5, monetary: 4 },
};
const orders: Page<CrmCustomerOrderDto> = {
  items: [{ id: "o1", orderNumber: "SO-000001", status: "PAID", channel: "FACEBOOK", total: "195.00", createdAt: "2026-10-05T05:30:00.000Z" }],
  total: 13,
  page: 1,
  pageSize: 10,
};
const conversations: CrmCustomerConversationDto[] = [
  { id: "cv1", channel: "FACEBOOK", displayName: "Mali FB", status: "OPEN", lastMessageAt: "2026-10-06T05:30:00.000Z", lastMessagePreview: "ສະບາຍດີ" },
];

function mockApi(detail: CrmCustomerDetailDto | Error = customer) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (options?.method === "PATCH") return { ...customer, name: "Mali 2" };
    if (path.includes("/orders")) return orders;
    if (path.includes("/conversations")) return conversations;
    if (detail instanceof Error) throw detail;
    return detail;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  auth.canOrders = true;
  auth.canInbox = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  mockApi();
});

describe("CustomerDetail", () => {
  it("ຂໍ້ມູນ, ສະຖິຕິ, RFM ແລະ ກຸ່ມ", async () => {
    renderWithProviders(<CustomerDetail id="c1" />);
    expect(await screen.findByRole("heading", { name: "Mali" })).toBeInTheDocument();
    expect(screen.getByText("Champion")).toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("02055550001")).toBeInTheDocument();
    expect(within(profile).getByText("mali@x.co")).toBeInTheDocument();
    expect(within(profile).getByText("Likes red")).toBeInTheDocument();
    expect(within(profile).getByText("Linked to Facebook")).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "Purchase stats" });
    expect(within(stats).getByText("1,250,000.00")).toBeInTheDocument();
    expect(within(stats).getByText("104,166.67")).toBeInTheDocument();
    expect(within(stats).getByText("12")).toBeInTheDocument();
    const rfm = screen.getByRole("region", { name: "RFM score" });
    expect(within(rfm).getByText("Recency (R)").parentElement).toHaveTextContent("5");
    expect(within(rfm).getByText("Monetary (M)").parentElement).toHaveTextContent("4");
  });

  it("ແຖບບິນ (ລິ້ງໄປບິນ) ແລະ ແຖບແຊັດ (ລິ້ງໄປ inbox)", async () => {
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    const row = await screen.findByTestId("row-customer-order-o1");
    expect(within(row).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(within(row).getByText("195.00")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Orders (13)" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Chats (1)" }));
    expect(await screen.findByText("Mali FB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", "/inbox?c=cv1");
  });

  it("ບໍ່ມີ orders:read / inbox:read: ເລກບິນ ແລະ ແຊັດ ບໍ່ເປັນລິ້ງ", async () => {
    auth.canOrders = false;
    auth.canInbox = false;
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    const row = await screen.findByTestId("row-customer-order-o1");
    expect(within(row).queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Chats (1)" }));
    await screen.findByText("Mali FB");
    expect(screen.queryByRole("link", { name: "Open chat" })).toBeNull();
  });

  it("ແກ້ໄຂ: ກວດຟອມ, ສົ່ງ PATCH, toast", async () => {
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText(/Name/);
    await user.clear(name);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a name")).toBeInTheDocument();
    await user.type(name, "Mali 2");
    await user.clear(within(dialog).getByLabelText(/Email/));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Customer saved"));
    const patch = vi.mocked(apiFetch).mock.calls.find((call) => call[1]?.method === "PATCH");
    expect(patch?.[0]).toBe("/crm/customers/c1");
    expect(patch?.[1]?.body).toEqual({ name: "Mali 2", phone: "02055550001", email: "", note: "Likes red" });
  });

  it("ເບີຊ້ຳ: ຂໍ້ຄວາມ + ລິ້ງໄປລູກຄ້າເຈົ້າຂອງເບີ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") throw new ApiError(409, "taken", [], "CUSTOMER_PHONE_TAKEN", { customerId: "c9" });
      if (path.includes("/orders")) return orders;
      return customer;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This phone number already belongs to another customer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open that customer (to merge)" })).toHaveAttribute("href", "/customers/c9");
  });

  it("crm:read ຢ່າງດຽວ: ບໍ່ມີປຸ່ມແກ້ໄຂ/ລວມ; 404: ຂໍ້ຄວາມບໍ່ພົບ", async () => {
    auth.canWrite = false;
    const { unmount } = renderWithProviders(<CustomerDetail id="c1" />);
    await screen.findByRole("heading", { name: "Mali" });
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Merge customer" })).toBeNull();
    unmount();
    mockApi(new ApiError(404, "nope", [], "CUSTOMER_NOT_FOUND"));
    renderWithProviders(<CustomerDetail id="zz" />);
    expect(await screen.findByText(/Customer not found/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to customers" })).toHaveAttribute("href", "/customers");
  });
});

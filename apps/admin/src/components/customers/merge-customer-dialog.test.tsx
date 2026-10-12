import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CrmCustomerDetailDto, CrmCustomerListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { MergeCustomerDialog } from "./merge-customer-dialog";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const target = { id: "c1", name: "Mali", phone: "02055550001" } as CrmCustomerDetailDto;
const row = (patch: Partial<CrmCustomerListItemDto>): CrmCustomerListItemDto => ({
  id: "c2",
  name: "Mali FB",
  phone: null,
  email: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  orderCount: 2,
  totalSpent: "400.00",
  lastPaidAt: null,
  segment: "REGULAR",
  ...patch,
});
const results = [row({}), row({ id: "c1", name: "Mali" }), row({ id: "c3", name: "Mali Shop", phone: "02099990000", orderCount: 5 })];
const onOpenChange = vi.fn();

beforeEach(() => {
  onOpenChange.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) =>
    options?.method === "POST" ? target : { items: results, total: 3, page: 1, pageSize: 8 }) as typeof apiFetch);
});

describe("MergeCustomerDialog", () => {
  it("ຄົ້ນຫາ (ບໍ່ສະແດງລູກຄ້າປາຍທາງ) → ເລືອກ → ສະຫຼຸບ → ຢືນຢັນ", async () => {
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog", { name: "Merge a duplicate into Mali" });
    await user.type(within(dialog).getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await within(dialog).findByRole("button", { name: "Select Mali FB" }));
    expect(within(dialog).queryByRole("button", { name: "Select Mali" })).toBeNull();
    expect(within(dialog).getByText("2 orders of Mali FB will move to Mali")).toBeInTheDocument();
    expect(within(dialog).getByText("Merging cannot be undone")).toBeInTheDocument();
    expect(within(dialog).queryByText(/will be dropped/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Customers merged"));
    const post = vi.mocked(apiFetch).mock.calls.find((call) => call[1]?.method === "POST");
    expect(post?.[0]).toBe("/crm/customers/c1/merge");
    expect(post?.[1]?.body).toEqual({ sourceId: "c2" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ທັງສອງມີເບີຕ່າງກັນ: ເຕືອນວ່າເບີຂອງ source ຈະຖືກຖິ້ມ; ປ່ຽນໃຈເລືອກຄົນອື່ນໄດ້", async () => {
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await screen.findByRole("button", { name: "Select Mali Shop" }));
    expect(screen.getByText("Both have different phone numbers: 02099990000 of Mali Shop will be dropped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.getByLabelText("Search the duplicate (name or phone)")).toBeInTheDocument();
  });

  it("API ລົ້ມ: ສະແດງຂໍ້ຜິດພາດ ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new Error("down");
      return { items: results, total: 3, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await screen.findByRole("button", { name: "Select Mali FB" }));
    await user.click(screen.getByRole("button", { name: "Confirm merge" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

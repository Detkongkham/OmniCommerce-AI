import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import type { SlipDto } from "@/lib/types";
import { toast } from "@oca/ui";
import { renderWithProviders } from "@/test/render";
import { SlipCard } from "./slip-card";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("@oca/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@oca/ui")>();
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) };
});
vi.mock("./slip-image", () => ({ SlipImage: ({ slipId }: { slipId: string }) => <div data-testid={`image-${slipId}`} /> }));

const order = { id: "o1", orderNumber: "SO-000001", total: "100000.00", currency: "LAK" };
const base: SlipDto = {
  id: "s1", orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD",
  status: "READ", imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100000.00", currency: "LAK", paidAt: "2026-10-07T09:00:00.000Z", destAccount: "010-12", refNo: "R1" },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T08:00:00.000Z",
};
const slip = (patch: Partial<SlipDto> = {}): SlipDto => ({ ...base, ...patch });
// rerender ຂອງ RTL ບໍ່ຫໍ່ provider ໃຫ້ ຈຶ່ງຫໍ່ເອງດ້ວຍ queryClient ເດີມ
const wrap = (queryClient: Parameters<typeof QueryClientProvider>[0]["client"], ui: React.ReactElement) => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider initialLanguage="en">{ui}</LanguageProvider>
  </QueryClientProvider>
);
const confirmed = (patch: Partial<SlipDto["confirmed"]>) => ({ ...base.confirmed, ...patch });
const calls = (method: string) => vi.mocked(apiFetch).mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === method);

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.info).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({});
});

describe("SlipCard: ສະແດງ", () => {
  it("ສະຖານະ, ແຫຼ່ງ, ຄ່າທີ່ອ່ານ (ເງິນ/ວັນເວລາ ຈັດຮູບແບບ), ຄ່າທີ່ຢືນຢັນເປັນ —, ບໍ່ມີຄວາມຜິດປົກກະຕິ", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    expect(screen.getByTestId("image-s1")).toBeInTheDocument();
    expect(screen.getByText("To review")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    const read = screen.getByRole("table", { name: "Read by the reader" });
    expect(within(read).getByText("100,000.00")).toBeInTheDocument();
    expect(within(read).getByText("07/10/2026 16:00")).toBeInTheDocument();
    expect(within(read).getByText("R1")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Confirmed values" })).getAllByText("—").length).toBe(5);
    expect(screen.getByText("No anomalies found")).toBeInTheDocument();
  });

  it("flag ສະແດງເປັນຂໍ້ຄວາມ (ບໍ່ອີງສີ) ແລະ flag ທີ່ບໍ່ຮູ້ຈັກສະແດງຂໍ້ຄວາມທົ່ວໄປ", () => {
    renderWithProviders(<SlipCard slip={slip({ flags: ["AMOUNT_MISMATCH", "DUPLICATE_IMAGE", "FUTURE_FLAG"] })} order={order} canReview />);
    const list = screen.getByRole("list", { name: "Warnings" });
    expect(within(list).getByText("Amount does not match the order")).toBeInTheDocument();
    expect(within(list).getByText("Image duplicates another slip")).toBeInTheDocument();
    expect(within(list).getByText("Other warning")).toBeInTheDocument();
    expect(screen.queryByText("No anomalies found")).toBeNull();
  });

  it("PENDING_READ: ໝາຍເຫດ + ບໍ່ມີຟອມແກ້/ປຸ່ມຢືນຢັນ ແຕ່ມີ Read again; READ_FAILED: ໝາຍເຫດ + ຢືນຢັນໄດ້", () => {
    const { unmount } = renderWithProviders(<SlipCard slip={slip({ status: "PENDING_READ" })} order={order} canReview />);
    expect(screen.getByText(/Reading the slip/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByLabelText("Amount")).toBeNull();
    expect(screen.getByRole("button", { name: "Read again" })).toBeInTheDocument();
    unmount();
    renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeEnabled();
  });

  it("CONFIRMED/REJECTED: ອ່ານຢ່າງດຽວ (ບໍ່ມີຟອມ/ປຸ່ມ) ແລະ ສະແດງຜູ້ກວດ/ເຫດຜົນ", () => {
    const reviewedBy = { id: "u1", name: "Owner" };
    const { unmount } = renderWithProviders(<SlipCard slip={slip({ status: "CONFIRMED", reviewedBy, reviewedAt: "2026-10-07T10:00:00.000Z" })} order={order} canReview />);
    expect(screen.getByText("Reviewed by Owner")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    renderWithProviders(<SlipCard slip={slip({ status: "REJECTED", reviewedBy, rejectReason: "Wrong amount" })} order={order} canReview />);
    expect(screen.getByText("Reason: Wrong amount")).toBeInTheDocument();
  });

  it("ບໍ່ມີ payments:write: ເຫັນຂໍ້ມູນ ແຕ່ບໍ່ມີຟອມ/ປຸ່ມ", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview={false} />);
    expect(screen.getByText("To review")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });
});

describe("SlipCard: ແກ້ຄ່າ", () => {
  it("ຟອມເລີ່ມຈາກຄ່າສຸດທ້າຍ; ບັນທຶກສົ່ງສະເພາະ field ທີ່ປ່ຽນ (ຍອດ normalize ຝັ່ງ API)", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ confirmed: confirmed({ refNo: "R2" }) })} order={order} canReview />);
    expect(screen.getByLabelText("Amount")).toHaveValue("100000.00");
    expect(screen.getByLabelText("Currency")).toHaveValue("LAK");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "95,000");
    await user.clear(screen.getByLabelText("Reference no."));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(calls("PATCH")[0]).toEqual(["/slips/s1", { method: "PATCH", body: { confirmedAmount: "95,000", confirmedRefNo: null } }]);
  });

  it("ບໍ່ມີການປ່ຽນ → ບໍ່ຍິງ API; ຍອດຜິດຮູບແບບ → error ໃນຊ່ອງ ແລະ ບໍ່ຍິງ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(calls("PATCH")).toHaveLength(0);
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "abc");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Invalid amount")).toBeInTheDocument();
    expect(calls("PATCH")).toHaveLength(0);
  });

  it("ແກ້ລົ້ມ → ສະແດງ toast error (ບໍ່ crash)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "SLIP_ALREADY_REVIEWED"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.type(screen.getByLabelText("Destination account"), "9");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This slip was already confirmed or rejected"));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.getByLabelText("Destination account")).toHaveValue("010-129");
  });

  it("ບັນທຶກສຳເລັດ → toast success", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.type(screen.getByLabelText("Destination account"), "9");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Changes saved"));
  });

  it("ບໍ່ມີການປ່ຽນ → toast.info (ບໍ່ຍິງ API)", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(toast.info).toHaveBeenCalledWith("No changes");
  });

  it("ປ່ຽນສະກຸນຢ່າງດຽວ → ສົ່ງສະເພາະ confirmedCurrency", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.selectOptions(screen.getByLabelText("Currency"), "THB");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(calls("PATCH")[0]).toEqual(["/slips/s1", { method: "PATCH", body: { confirmedCurrency: "THB" } }]);
  });

  it("ລ້າງຄ່າທີ່ເຄື່ອງອ່ານໃສ່ເອງ (ບໍ່ມີຄ່າຢືນຢັນ) = ບໍ່ມີການປ່ຽນ; ຖ້າມີການປ່ຽນ field ອື່ນ ກໍບໍ່ສົ່ງ null ຂອງ field ນັ້ນ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.clear(screen.getByLabelText("Reference no."));
    await user.clear(screen.getByLabelText("Destination account"));
    await user.selectOptions(screen.getByLabelText("Currency"), "");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(calls("PATCH")).toHaveLength(0);
    expect(toast.info).toHaveBeenCalledWith("No changes");
    await user.type(screen.getByLabelText("Reference no."), "N1");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(calls("PATCH")[0]).toEqual(["/slips/s1", { method: "PATCH", body: { confirmedRefNo: "N1" } }]);
  });

  it("ສະກຸນທີ່ບໍ່ຢູ່ໃນລາຍການ ຖືກເພີ່ມເປັນຕົວເລືອກ ເພື່ອໃຫ້ select ສະທ້ອນຄ່າຈິງ", () => {
    renderWithProviders(<SlipCard slip={slip({ read: { ...base.read, currency: "EUR" } })} order={order} canReview />);
    expect(screen.getByLabelText("Currency")).toHaveValue("EUR");
  });
});

describe("SlipCard: ຢືນຢັນ / ປະຕິເສດ / ອ່ານໃໝ່", () => {
  it("ຢືນຢັນ: dialog ບອກຍອດ+ເລກບິນ (+ຈຳນວນ flag) ແລ້ວຍິງ POST confirm", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ flags: ["AMOUNT_MISMATCH"] })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm payment?" });
    expect(dialog).toHaveTextContent("Confirm 100,000.00 LAK for order SO-000001?");
    expect(dialog).toHaveTextContent("1 warning(s)");
    await user.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/confirm", { method: "POST" }]);
  });

  it("ບໍ່ມີຍອດ → ປຸ່ມຢືນຢັນໃນ dialog ຖືກປິດ ແລະ ບອກເຫດຜົນ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ read: { ...base.read, amount: null } })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Enter the amount before confirming");
    expect(within(dialog).getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });

  it.each(["ORDER_INVALID_STATE", "RESERVATION_EXPIRED", "SLIP_ALREADY_REVIEWED", "CONFLICT"])(
    "ຢືນຢັນລົ້ມແບບ state conflict (%s) → dialog ປິດ + toast error ຂໍ້ຄວາມຖືກຕ້ອງ",
    async (code) => {
      vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], code));
      const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
      await user.click(screen.getByRole("button", { name: "Confirm payment" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toBeTruthy();
    },
  );

  it("ຢືນຢັນລົ້ມ ORDER_INVALID_STATE → toast ເປັນຂໍ້ຄວາມຂອງ error code", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "ORDER_INVALID_STATE"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The order status does not allow this step"));
  });

  it("ຢືນຢັນລົ້ມຊົ່ວຄາວ (500) → dialog ຍັງເປີດ ໃຫ້ລອງໃໝ່ + toast error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "x", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Something went wrong. Please try again"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" })).toBeEnabled();
  });

  it("ຢືນຢັນລົ້ມເພາະເຄືອຂ່າຍ (TypeError) → dialog ຍັງເປີດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ຢືນຢັນສຳເລັດ → dialog ປິດ, toast success, focus ໄປທີ່ card (ປຸ່ມ Confirm ຫາຍ)", async () => {
    const { user, rerender, queryClient } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Payment confirmed; the order is now paid");
    rerender(wrap(queryClient, <SlipCard slip={slip({ status: "CONFIRMED" })} order={order} canReview />));
    await waitFor(() => expect(screen.getByTestId("slip-s1")).toHaveFocus());
  });

  it("ຢືນຢັນລົ້ມຊົ່ວຄາວ ບໍ່ລ້າງຄ່າທີ່ກຳລັງພິມໃນຟອມ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "x", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.type(screen.getByLabelText("Reference no."), "ZZ");
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Reference no.")).toHaveValue("R1ZZ");
  });

  it("ປະຕິເສດ: ເປີດ dialog ເຫດຜົນ ແລ້ວ POST reject", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText("Reason"), "Wrong amount");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/reject", { method: "POST", body: { reason: "Wrong amount" } }]);
  });

  it("Read again: POST retry", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Read again" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toEqual(["/slips/s1/retry", { method: "POST" }]);
  });

  it("ຂະນະມີ action ກຳລັງສົ່ງ ປຸ່ມອື່ນຖືກປິດ (ບໍ່ສົ່ງຊ້ອນ)", async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { user } = renderWithProviders(<SlipCard slip={slip({ status: "READ_FAILED" })} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Read again" }));
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  });
});
describe("SlipCard: ເພີ່ມເຕີມ", () => {
  it("data-testid ຂອງ Card ແລະ id ຂອງຊ່ອງບໍ່ຊ້ຳລະຫວ່າງ card", () => {
    renderWithProviders(
      <>
        <SlipCard slip={slip()} order={order} canReview />
        <SlipCard slip={slip({ id: "s2" })} order={order} canReview />
      </>,
    );
    expect(screen.getByTestId("slip-s1")).toBeInTheDocument();
    expect(screen.getByTestId("slip-s2")).toBeInTheDocument();
    const ids = screen.getAllByLabelText("Amount").map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("paidAt ອ່ານຢ່າງດຽວ: ບໍ່ມີຊ່ອງແກ້ເວລາໂອນ", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    expect(screen.queryByLabelText("Paid at")).toBeNull();
  });

  it("ລ້າງຄ່າທີ່ຢືນຢັນໄວ້ແລ້ວ (ສະກຸນ — ແລະ ບັນຊີປາຍທາງ) → ສົ່ງ null", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip({ confirmed: confirmed({ currency: "THB", destAccount: "X-1" })})} order={order} canReview />);
    await user.selectOptions(screen.getByLabelText("Currency"), "");
    await user.clear(screen.getByLabelText("Destination account"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls("PATCH")).toHaveLength(1));
    expect(calls("PATCH")[0]).toEqual(["/slips/s1", { method: "PATCH", body: { confirmedCurrency: null, confirmedDestAccount: null } }]);
  });

  it("ລ້າງຍອດ → ສະແດງ error ໃນຊ່ອງ (ບໍ່ ignore ແບບງຽບ) ແລະ ບໍ່ຍິງ API", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.clear(screen.getByLabelText("Amount"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Invalid amount")).toBeInTheDocument();
    expect(calls("PATCH")).toHaveLength(0);
  });

  it("ຟອມຣີເຊັດເມື່ອຄ່າຈາກ server ປ່ຽນ (rerender)", async () => {
    const { user, rerender, queryClient } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.type(screen.getByLabelText("Reference no."), "XYZ");
    expect(screen.getByLabelText("Reference no.")).toHaveValue("R1XYZ");
    rerender(wrap(queryClient, <SlipCard slip={slip({ confirmed: { ...base.confirmed, amount: "95000.00" } })} order={order} canReview />));
    expect(screen.getByLabelText("Amount")).toHaveValue("95000.00");
    expect(screen.getByLabelText("Reference no.")).toHaveValue("R1");
  });

  it("ຢືນຢັນ: ກົດຊ້ຳໄວໆ ສົ່ງຄັ້ງດຽວ ແລະ dialog ປິດຫຼັງສຳເລັດ", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm payment" });
    let resolve!: (value: unknown) => void;
    vi.mocked(apiFetch).mockReturnValue(new Promise((r) => (resolve = r)));
    // ສອງຄລິກແບບ synchronous (ກ່ອນ React ອັບເດດ disabled) ຕ້ອງຜ່ານໄດ້ແຕ່ຄັ້ງດຽວ
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    await act(async () => {});
    expect(calls("POST")).toHaveLength(1);
    resolve({});
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls("POST")).toHaveLength(1);
  });

  it("ປະຕິເສດລົ້ມ → dialog ຍັງເປີດ ສະແດງ error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "SLIP_ALREADY_REVIEWED"));
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText("Reason"), "Wrong");
    await user.click(screen.getByRole("button", { name: "Reject slip" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ປິດ dialog ປະຕິເສດ → focus ຄືນປຸ່ມ Reject", async () => {
    const { user } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Reject" })).toHaveFocus();
  });

  it("ປຸ່ມ Reject ຫາຍ (ສະລິບຖືກປະຕິເສດແລ້ວ) ຂະນະ dialog ເປີດ → focus ຕົກທີ່ card", async () => {
    const { user, rerender, queryClient } = renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    rerender(wrap(queryClient, <SlipCard slip={slip({ status: "REJECTED", rejectReason: "x" })} order={order} canReview />));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("slip-s1")).toHaveFocus();
  });
});


describe("SlipCard: ຂໍ້ຄວາມຍາວ/ບໍ່ໄວ້ໃຈ ແລະ a11y", () => {
  it("ຄ່າຍາວ 300 ໂຕ (refNo) ຕ້ອງຫໍ່ຂໍ້ຄວາມ (break) ແລະ ຢູ່ໃນ <bdi>", () => {
    const long = "A".repeat(300);
    renderWithProviders(<SlipCard slip={slip({ read: { ...base.read, refNo: long } })} order={order} canReview />);
    const cell = within(screen.getByRole("table", { name: "Read by the reader" })).getByText(long);
    expect(cell.tagName).toBe("BDI");
    expect(cell.parentElement?.className).toMatch(/break-all|\[overflow-wrap:anywhere\]/);
  });

  it("ໝາຍເຫດ/ສະຖານະຢູ່ໃນ role=status ທີ່ມີຕັ້ງແຕ່ mount ແລະ ຄົງຕົວເມື່ອ PENDING_READ → READ", () => {
    const { rerender, queryClient } = renderWithProviders(<SlipCard slip={slip({ status: "PENDING_READ" })} order={order} canReview />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Reading");
    expect(region).toHaveTextContent(/Reading the slip/);
    rerender(wrap(queryClient, <SlipCard slip={slip({ status: "READ" })} order={order} canReview />));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("To review");
  });

  it("ຕາຕະລາງມີຊື່ຈາກ caption (ບໍ່ມີ aria-label ຊ້ຳ)", () => {
    renderWithProviders(<SlipCard slip={slip()} order={order} canReview />);
    expect(screen.getByRole("table", { name: "Read by the reader" })).not.toHaveAttribute("aria-label");
  });
});

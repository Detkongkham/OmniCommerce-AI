import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@oca/ui";
import { ApiError, apiFetch } from "@/lib/api";
import type { SlipDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderSlipsCard } from "./order-slips-card";

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("@oca/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@oca/ui")>();
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) };
});
vi.mock("./slip-image", () => ({ SlipImage: ({ slipId }: { slipId: string }) => <div data-testid={`image-${slipId}`} /> }));

const order = { id: "o1", orderNumber: "SO-000001", total: "100000.00", currency: "LAK" };
const slip = (id: string, status: SlipDto["status"] = "READ"): SlipDto => ({
  id, orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD", status,
  imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100000.00", currency: "LAK", paidAt: null, destAccount: null, refNo: id },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T08:00:00.000Z",
});
const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>("input[type=file]") as HTMLInputElement;
const posts = () => vi.mocked(apiFetch).mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
const file = (type = "image/png", size = 10, name = "a.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

beforeEach(() => {
  auth.perms = new Set(["orders:read", "orders:write", "payments:write"]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue([]);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("OrderSlipsCard", () => {
  it("ໂຫຼດສະລິບຂອງບິນ ແລະ ສະແດງແຕ່ລະໃບ; ບໍ່ມີ = ຂໍ້ຄວາມວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([slip("s1"), slip("s2", "CONFIRMED")]);
    renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Payment slips" })).toBeInTheDocument();
    expect(await screen.findByTestId("slip-s1")).toBeInTheDocument();
    expect(screen.getByTestId("slip-s2")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/slips");
  });

  it("ໂຫຼດລົ້ມ → error + Retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, "x"));
    const { user } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No slips for this order yet")).toBeInTheDocument();
  });

  it("ອັບໂຫຼດ: ເລືອກຮູບ → POST multipart /orders/o1/slips ແລ້ວ refetch", async () => {
    const { user, container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    vi.mocked(apiFetch).mockResolvedValueOnce(slip("s9", "PENDING_READ"));
    await user.upload(fileInput(container), file());
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post?.[0]).toBe("/orders/o1/slips");
      expect((post?.[1] as { body: FormData }).body.get("file")).toBeInstanceOf(File);
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Slip uploaded; reading it now"));
  });

  it("ອັບໂຫຼດລົ້ມ (SLIP_FILE_INVALID) → toast.error ດ້ວຍຂໍ້ຄວາມແປ", async () => {
    const { user, container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(400, "bad", [], "SLIP_FILE_INVALID"));
    await user.upload(fileInput(container), file());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invalid image (must be JPG/PNG/WebP within the size limit) or the image could not be downloaded"),
    );
  });

  it("ເລືອກໄຟລ໌ດຽວກັນສອງເທື່ອໄດ້ (input ຖືກລ້າງຄ່າ)", async () => {
    const { user, container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    const input = fileInput(container);
    const same = file();
    vi.mocked(apiFetch).mockResolvedValue(slip("s9", "PENDING_READ"));
    await user.upload(input, same);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(input.value).toBe("");
    await user.upload(input, same);
    await waitFor(() => expect(posts()).toHaveLength(2));
  });

  it("ຂະນະອັບໂຫຼດ: ປຸ່ມຖືກ disable/loading ແລະ ກົດຊ້ຳບໍ່ເປີດ file picker ຊ້ຳ", async () => {
    const { user, container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    let resolve!: (value: SlipDto) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise<SlipDto>((r) => (resolve = r)) as never);
    await user.upload(fileInput(container), file());
    const button = screen.getByRole("button", { name: /Upload slip/ });
    await waitFor(() => expect(button).toBeDisabled());
    const click = vi.spyOn(fileInput(container), "click");
    await user.click(button);
    expect(click).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
    resolve(slip("s9", "PENDING_READ"));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("input ຂອງໄຟລ໌ບໍ່ເປັນ tab stop ທີສອງ (tabIndex -1 + aria-hidden)", async () => {
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    expect(fileInput(container)).toHaveAttribute("tabindex", "-1");
    expect(fileInput(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("ຮູບ HEIC ຈາກ iPhone → ຂໍ້ຄວາມສະເພາະ ແລະ ບໍ່ຍິງ API", async () => {
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    fireEvent.change(fileInput(container), { target: { files: [file("image/heic", 10, "IMG_1.HEIC")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("iPhone HEIC photos are not supported; send a screenshot or convert to JPG");
    expect(posts()).toHaveLength(0);
  });

  it("ໄຟລ໌ຜິດຊະນິດ/ໃຫຍ່ເກີນ → ບໍ່ຍິງ API ແລະ ບອກເຫດຜົນ", async () => {
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByText("No slips for this order yet");
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [file("image/gif")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only JPG, PNG and WebP images are supported");
    fireEvent.change(input, { target: { files: [file("image/png", 9 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 8MB");
    expect(posts()).toHaveLength(0);
  });

  it("ບໍ່ມີ orders:write → ບໍ່ມີປຸ່ມອັບໂຫຼດ; ບໍ່ມີ payments:write → ບໍ່ມີປຸ່ມຢືນຢັນ/ປະຕິເສດ", async () => {
    auth.perms = new Set(["orders:read"]);
    vi.mocked(apiFetch).mockResolvedValue([slip("s1")]);
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    await screen.findByTestId("slip-s1");
    expect(fileInput(container)).toBeNull();
    expect(screen.queryByRole("button", { name: /Upload slip/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("ບໍ່ມີ orders:read → ບໍ່ render ຫຍັງ ແລະ ບໍ່ຍິງ API", () => {
    auth.perms = new Set();
    const { container } = renderWithProviders(<OrderSlipsCard order={order} />);
    expect(container).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ຢືນຢັນສະລິບ → invalidate ບິນ ເພື່ອໃຫ້ສະຖານະບິນ refresh", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) =>
      options?.method === "POST" ? slip("s1", "CONFIRMED") : path.endsWith("/slips") ? [slip("s1")] : []) as typeof apiFetch);
    const { user, queryClient } = renderWithProviders(<OrderSlipsCard order={order} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await screen.findByTestId("slip-s1");
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm payment?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(spy.mock.calls.some((c) => c[0]?.queryKey?.[0] === "orders")).toBe(true));
  });
});

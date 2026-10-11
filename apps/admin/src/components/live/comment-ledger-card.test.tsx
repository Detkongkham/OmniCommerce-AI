import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CfCommentDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CommentLedgerCard } from "./comment-ledger-card";
import { COMMENT } from "./fixtures";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn(), info: vi.fn() } };
});
const auth = vi.hoisted(() => ({ permissions: ["live-cf:write", "orders:read"] as string[] }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.permissions.includes(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const FAILED: CfCommentDto = {
  ...COMMENT,
  id: "c2",
  authorName: "Kham",
  message: "B2",
  replyStatus: "FAILED",
  replyErrorCode: "OUTSIDE_WINDOW",
};
const REJECTED: CfCommentDto = {
  ...COMMENT,
  id: "c3",
  message: "how much?",
  outcome: "NO_MATCH",
  lines: null,
  orderId: null,
  orderNumber: null,
  replyStatus: "NONE",
};

function mockLedger(items: CfCommentDto[] = [COMMENT, FAILED, REJECTED], resendResult: Partial<CfCommentDto> = { replyStatus: "SENT" }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (options?.method === "POST") return { ...FAILED, replyErrorCode: null, ...resendResult };
    const page = path.includes("outcome=OUT_OF_STOCK") ? [] : items;
    return { items: page, total: page.length, page: 1, pageSize: 30 };
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.permissions = ["live-cf:write", "orders:read"];
  vi.mocked(apiFetch).mockReset();
  for (const fn of [toast.success, toast.error, toast.info]) vi.mocked(fn).mockReset();
  mockLedger();
});

describe("CommentLedgerCard", () => {
  it("ສະແດງຄອມເມັ້ນ, ຜົນ, ລິ້ງບິນ ແລະ ສະຖານະຂໍ້ຄວາມ", async () => {
    renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    const row = await screen.findByTestId("row-comment-c1");
    expect(within(row).getByText("Noy")).toBeInTheDocument();
    expect(within(row).getByText("A1 x2")).toBeInTheDocument();
    expect(within(row).getByText("Ordered")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "OCA-0001" })).toHaveAttribute("href", "/orders/o1");
    expect(within(row).getByText("Sent")).toBeInTheDocument();
    const rejected = screen.getByTestId("row-comment-c3");
    expect(within(rejected).getByText("Not a CF")).toBeInTheDocument();
    expect(within(rejected).queryByRole("link")).toBeNull();
    expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/comments?page=1&pageSize=30");
  });

  it("ສົ່ງລົ້ມ: ສະແດງເຫດຜົນ; ສົ່ງໃໝ່ສຳເລັດ → toast success", async () => {
    const { user } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    const row = await screen.findByTestId("row-comment-c2");
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText(/Over 7 days old/)).toBeInTheDocument();
    expect(within(screen.getByTestId("row-comment-c1")).queryByRole("button")).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Resend the message to Kham" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/comments/c2/resend", { method: "POST" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Message sent"));
  });

  it("ສົ່ງໃໝ່ແລ້ວຍັງ FAILED → toast error ພ້ອມເຫດຜົນ; SENDING → toast info", async () => {
    mockLedger(undefined, { replyStatus: "FAILED", replyErrorCode: "CHANNEL_AUTH" });
    const { user } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    await user.click(await screen.findByRole("button", { name: "Resend the message to Kham" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Still not delivered: The Page token is invalid or expired; check the configuration"),
    );
    mockLedger(undefined, { replyStatus: "SENDING" });
    await user.click(await screen.findByRole("button", { name: "Resend the message to Kham" }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Already being sent; check again shortly"));
  });

  it("ສົ່ງໃໝ່ API error (409) → toast error", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new ApiError(409, "Reply status is SENT; only FAILED replies can be resent", [], "CONFLICT");
      return { items: [FAILED], total: 1, page: 1, pageSize: 30 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    await user.click(await screen.findByRole("button", { name: "Resend the message to Kham" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reply status is SENT; only FAILED replies can be resent"));
  });

  it("ກອງຜົນ → ສົ່ງ outcome; ບໍ່ມີຜົນ = empty ແບບ filter", async () => {
    const { user } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    await screen.findByTestId("row-comment-c1");
    await user.selectOptions(screen.getByLabelText("Filter by outcome"), "OUT_OF_STOCK");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1/comments?outcome=OUT_OF_STOCK&page=1&pageSize=30"));
    expect(await screen.findByText("No comments with this outcome")).toBeInTheDocument();
  });

  it("ບໍ່ມີຄອມເມັ້ນ: empty; ໂຫຼດລົ້ມ: error + Retry", async () => {
    mockLedger([]);
    const { unmount } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    expect(await screen.findByText("No comments yet")).toBeInTheDocument();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom", [], "INTERNAL_ERROR"));
    const { user } = renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    mockLedger();
    await user.click(retry);
    expect(await screen.findByTestId("row-comment-c1")).toBeInTheDocument();
  });

  it("ບໍ່ມີ live-cf:write: ບໍ່ມີປຸ່ມສົ່ງໃໝ່; ບໍ່ມີ orders:read: ເລກບິນບໍ່ເປັນລິ້ງ", async () => {
    auth.permissions = [];
    renderWithProviders(<CommentLedgerCard sessionId="s1" live={false} />);
    const row = await screen.findByTestId("row-comment-c1");
    expect(within(row).getByText("OCA-0001")).toBeInTheDocument();
    expect(within(row).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
  });
});

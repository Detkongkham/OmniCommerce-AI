import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { Composer } from "./composer";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const sent: MessageDto = {
  id: "m9",
  direction: "OUT",
  text: "hello",
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: { id: "u1", name: "Chat" },
  createdAt: "2026-10-06T05:30:00.000Z",
};
const LABEL = "Reply to the customer";
const box = () => screen.getByRole("textbox", { name: LABEL });
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(sent);
});

describe("Composer", () => {
  it("Enter ສົ່ງຂໍ້ຄວາມທີ່ trim ແລ້ວ ແລະ ລ້າງຊ່ອງພິມ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "  hello  {Enter}");
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual(["/conversations/c1/messages", { method: "POST", body: { text: "hello" } }]);
    await waitFor(() => expect(box()).toHaveValue(""));
  });

  it("ປຸ່ມ ສົ່ງ ກໍສົ່ງໄດ້; ຊ່ອງວ່າງ/ມີແຕ່ຍະຫວ່າງ ປຸ່ມຖືກປິດ ແລະ Enter ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    await user.type(box(), "   {Enter}");
    expect(posts()).toHaveLength(0);
    await user.clear(box());
    await user.type(box(), "hi");
    await user.click(button);
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("Shift+Enter ຂຶ້ນແຖວໃໝ່ ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "a{Shift>}{Enter}{/Shift}b");
    expect(posts()).toHaveLength(0);
    expect(box()).toHaveValue("a\nb");
  });

  it("Enter ຕອນກຳລັງ compose ດ້ວຍ IME (ລາວ/CJK) ບໍ່ສົ່ງ; Enter ປົກກະຕິຫຼັງຈາກນັ້ນສົ່ງ", async () => {
    renderWithProviders(<Composer conversationId="c1" canWrite />);
    fireEvent.change(box(), { target: { value: "ສະບາຍດີ" } });
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posts()).toHaveLength(0);
    fireEvent.keyDown(box(), { key: "Enter" });
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("ຍາວເກີນ 2000 ຕົວອັກສອນ: ສະແດງ error ແລະ ບໍ່ສົ່ງ", async () => {
    renderWithProviders(<Composer conversationId="c1" canWrite />);
    fireEvent.change(box(), { target: { value: "a".repeat(2001) } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("The message is longer than 2000 characters");
    expect(posts()).toHaveLength(0);
  });

  it("ຂະນະສົ່ງ: ຊ່ອງພິມ/ປຸ່ມຖືກລັອກ ແລະ ກົດຊ້ຳບໍ່ສົ່ງຊ້ຳ", async () => {
    let resolve: (message: MessageDto) => void = () => undefined;
    vi.mocked(apiFetch).mockImplementation((() =>
      new Promise((r) => {
        resolve = r as (message: MessageDto) => void;
      })) as typeof apiFetch);
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    await waitFor(() => expect(box()).toBeDisabled());
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    fireEvent.keyDown(box(), { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posts()).toHaveLength(1);
    resolve(sent);
    await waitFor(() => expect(box()).not.toBeDisabled());
    expect(box()).toHaveValue("");
  });

  it("ສົ່ງບໍ່ໄດ້ (201 ແຕ່ FAILED): ເກັບຂໍ້ຄວາມໄວ້ໃນຊ່ອງ ແລະ ບອກເຫດຜົນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...sent, status: "FAILED", errorCode: "OUTSIDE_WINDOW" });
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not delivered: More than 24 hours since the customer's last message; Meta does not allow a reply (your text is still in the box)",
    );
    expect(box()).toHaveValue("hello");
  });

  it("HTTP error: ສະແດງຂໍ້ຄວາມຈາກ code ແລະ ເກັບຂໍ້ຄວາມໄວ້; ສົ່ງໃໝ່ແລ້ວ error ຫາຍ", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(404, "Conversation not found", [], "CONVERSATION_NOT_FOUND"));
    const { user } = renderWithProviders(<Composer conversationId="c1" canWrite />);
    await user.type(box(), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation was not found");
    expect(box()).toHaveValue("hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("ບໍ່ມີສິດຕອບ (inbox:write): ບໍ່ມີຊ່ອງພິມ ມີແຕ່ຄຳອະທິບາຍ", () => {
    renderWithProviders(<Composer conversationId="c1" canWrite={false} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("You can view conversations but not reply")).toBeInTheDocument();
  });
});

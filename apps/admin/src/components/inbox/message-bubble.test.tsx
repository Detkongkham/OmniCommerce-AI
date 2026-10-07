import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { MessageBubble } from "./message-bubble";

const base: MessageDto = {
  id: "m1",
  direction: "IN",
  text: "ສະບາຍດີ\nມີສິນຄ້າບໍ",
  attachments: [],
  status: "SENT",
  errorCode: null,
  sentBy: null,
  createdAt: "2026-10-06T05:30:00.000Z",
};
const renderBubble = (overrides: Partial<MessageDto> = {}) =>
  renderWithProviders(
    <ul>
      <MessageBubble message={{ ...base, ...overrides }} />
    </ul>,
  );

describe("MessageBubble", () => {
  it("ຂໍ້ຄວາມຂາເຂົ້າ: ຮັກສາຂຶ້ນແຖວໃໝ່, ເວລາລາວ, ມີຊື່ຜູ້ສົ່ງສຳລັບ screen reader", () => {
    renderBubble();
    const item = screen.getByTestId("message-m1");
    expect(within(item).getByText("Customer:")).toHaveClass("sr-only");
    const paragraph = within(item).getByText((content) => content.startsWith("ສະບາຍດີ"));
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    expect(paragraph.textContent).toBe("ສະບາຍດີ\nມີສິນຄ້າບໍ");
    expect(within(item).getByText("06/10/2026 12:30")).toBeInTheDocument();
  });

  it("ຂໍ້ຄວາມຂາອອກ: ສະແດງຜູ້ຕອບ", () => {
    renderBubble({ direction: "OUT", sentBy: { id: "u1", name: "Chat Admin" } });
    const item = screen.getByTestId("message-m1");
    expect(within(item).getByText("Store:")).toBeInTheDocument();
    expect(within(item).getByText("by Chat Admin")).toBeInTheDocument();
  });

  it("PENDING ສະແດງ 'Sending...'", () => {
    renderBubble({ direction: "OUT", status: "PENDING" });
    expect(screen.getByText("Sending...")).toBeInTheDocument();
  });

  it("FAILED ສະແດງເຫດຜົນເປັນຂໍ້ຄວາມ (ບໍ່ແມ່ນລະຫັດດິບ); errorCode ທີ່ບໍ່ຮູ້ຈັກ/ບໍ່ມີ ໃຊ້ UNKNOWN", () => {
    const { unmount } = renderBubble({ direction: "OUT", status: "FAILED", errorCode: "OUTSIDE_WINDOW" });
    expect(
      screen.getByText("Not delivered: More than 24 hours since the customer's last message; Meta does not allow a reply"),
    ).toBeInTheDocument();
    expect(screen.queryByText("OUTSIDE_WINDOW")).not.toBeInTheDocument();
    unmount();
    renderBubble({ direction: "OUT", status: "FAILED", errorCode: "SOMETHING_NEW" });
    expect(screen.getByText("Not delivered: Could not be sent (unknown reason)")).toBeInTheDocument();
  });

  it("ຮູບ https: ເປັນລິ້ງເປີດແຖບໃໝ່ (noopener, no-referrer) ພ້ອມ alt", () => {
    renderBubble({ text: null, attachments: [{ type: "image", url: "https://cdn.example/a.jpg" }] });
    const link = screen.getByRole("link", { name: "Image from the customer" });
    expect(link).toHaveAttribute("href", "https://cdn.example/a.jpg");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const image = within(link).getByRole("img", { name: "Image from the customer" });
    expect(image).toHaveAttribute("src", "https://cdn.example/a.jpg");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("ຮູບ http/javascript:/ບໍ່ມີ url ແລະ ໄຟລ໌ຊະນິດອື່ນ: ບໍ່ສ້າງລິ້ງ/ຮູບ ມີແຕ່ປ້າຍຊະນິດ", () => {
    renderBubble({
      text: null,
      attachments: [
        { type: "image", url: "http://cdn.example/a.jpg" },
        { type: "image", url: "javascript:alert(1)" },
        { type: "location", url: null },
        { type: "file", url: "https://cdn.example/doc.pdf" },
      ],
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("Attachment (image)")).toHaveLength(2);
    expect(screen.getByText("Attachment (location)")).toBeInTheDocument();
    expect(screen.getByText("Attachment (file)")).toBeInTheDocument();
  });
});

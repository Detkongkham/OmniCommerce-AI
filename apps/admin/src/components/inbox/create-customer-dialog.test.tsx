import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { clearToasts, getToasts } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { renderWithProviders } from "@/test/render";
import { CreateCustomerDialog } from "./create-customer-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const conversation: ConversationDto = {
  id: "c1",
  channel: "FACEBOOK",
  displayName: "Somchai Vong",
  status: "OPEN",
  unreadCount: 0,
  lastMessageAt: "2026-10-06T05:30:00.000Z",
  lastMessagePreview: null,
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const posts = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST");

function open(onOpenChange = vi.fn()) {
  const result = renderWithProviders(<CreateCustomerDialog open onOpenChange={onOpenChange} conversation={conversation} />);
  return { ...result, onOpenChange };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ ...conversation, customer: { id: "cu1", name: "Somchai Vong", phone: null } });
});

describe("CreateCustomerDialog", () => {
  it("ຊື່ເລີ່ມຕົ້ນ = ຊື່ໃນແຊັດ; ສົ່ງ name (ບໍ່ມີ phone ເມື່ອວ່າງ) ແລ້ວປິດ", async () => {
    const { user, onOpenChange } = open();
    expect(screen.getByLabelText(/Customer name/)).toHaveValue("Somchai Vong");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual(["/conversations/c1/customer", { method: "POST", body: { name: "Somchai Vong" } }]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ສົ່ງ phone ທີ່ trim ແລ້ວເມື່ອໃສ່", async () => {
    const { user } = open();
    await user.clear(screen.getByLabelText(/Customer name/));
    await user.type(screen.getByLabelText(/Customer name/), "  Dala  ");
    await user.type(screen.getByLabelText("Phone"), " +8562055550000 ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.[1]).toEqual({ method: "POST", body: { name: "Dala", phone: "+8562055550000" } });
  });

  it("ຊື່ວ່າງ / ເບີໂທຜິດ: ສະແດງ error ຂອງ field ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = open();
    await user.clear(screen.getByLabelText(/Customer name/));
    await user.type(screen.getByLabelText("Phone"), "12ab");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("Invalid phone (6-15 digits, optional leading +)")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("ເບີຊ້ຳ (409 DUPLICATE_VALUE): ສະແດງ error ໃນ dialog ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const { user, onOpenChange } = open();
    await user.type(screen.getByLabelText("Phone"), "020999999");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Cancel ປິດ dialog ໂດຍບໍ່ສົ່ງ", async () => {
    const { user, onOpenChange } = open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(posts()).toHaveLength(0);
  });

  it("ປ່ຽນ conversation: ຟອມ remount ດ້ວຍຊື່ໃໝ່ (ບໍ່ຕິດຄ່າເກົ່າ)", async () => {
    const { user, rerender } = open();
    await user.type(screen.getByLabelText("Phone"), "020123456");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider initialLanguage="en">
          <CreateCustomerDialog open onOpenChange={vi.fn()} conversation={{ ...conversation, id: "c2", displayName: "Other Person" }} />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText(/Customer name/)).toHaveValue("Other Person");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
  });

  it("ກົດບັນທຶກສອງຄັ້ງຕິດ: ສົ່ງ POST ຄັ້ງດຽວ", async () => {
    let release: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementation(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const { user } = open();
    const save = screen.getByRole("button", { name: "Save" });
    await user.dblClick(save);
    expect(posts()).toHaveLength(1);
    release(conversation);
  });

  it("ສຳເລັດ: ສະແດງ toast", async () => {
    clearToasts();
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(getToasts().map((item) => item.title)).toContain("Customer created and linked"));
  });

  it("ຊື່ຍາວເກີນ 100 ໂຕ: ສະແດງ validation.tooLong ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = open();
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: "x".repeat(101) } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too long (up to 100 characters)")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("ຂະນະກຳລັງສົ່ງ: Cancel ຖືກປິດ ແລະ Escape ບໍ່ປິດ dialog", async () => {
    let release: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementation(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const { user, onOpenChange } = open();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    release(conversation);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("dialog ມີຊື່ (title) ແລະ error ເປັນ role=alert", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Create customer from conversation" })).toBeInTheDocument();
  });
});

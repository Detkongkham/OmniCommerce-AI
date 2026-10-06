import { act, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearToasts, getToasts } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ConversationDto } from "@/lib/types";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { renderWithProviders } from "@/test/render";
import { SidePanel } from "./side-panel";

const auth = vi.hoisted(() => ({ canReadOrders: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "orders:read" ? auth.canReadOrders : true),
}));
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
  lastMessagePreview: "hi",
  assignee: null,
  customer: null,
  createdAt: "2026-10-06T05:00:00.000Z",
};
const assignees = [
  { id: "u1", name: "Chat Admin" },
  { id: "u2", name: "Manager" },
];
const patches = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "PATCH");

beforeEach(() => {
  auth.canReadOrders = true;
  clearToasts();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
    if (url === "/inbox/assignees") return assignees;
    if (url.startsWith("/customers")) return { items: [], total: 0, page: 1, pageSize: 8 };
    if (init?.method === "PATCH") return conversation;
    throw new Error(`unexpected ${url}`);
  }) as typeof apiFetch);
});

describe("SidePanel", () => {
  it("ສະແດງຊ່ອງທາງ, ລູກຄ້າ (ຊື່ + ເບີ) ແລະ ຖອນການລິ້ງໄດ້", async () => {
    const { user } = renderWithProviders(
      <SidePanel conversation={{ ...conversation, customer: { id: "cu1", name: "Dala", phone: "020111111" } }} canWrite />,
    );
    expect(screen.getByRole("heading", { name: "Conversation details" })).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("Dala")).toBeInTheDocument();
    expect(screen.getByText("020111111")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual(["/conversations/c1", { method: "PATCH", body: { customerId: null } }]);
    await waitFor(() => expect(getToasts().map((item) => item.title)).toContain("Conversation updated"));
  });

  it("ຍັງບໍ່ລິ້ງລູກຄ້າ: ມີຄຳບອກ, ຄົ້ນຫາລູກຄ້າທີ່ມີ (ເມື່ອມີ orders:read) ແລະ ປຸ່ມສ້າງໃໝ່ ທີ່ເປີດ dialog", async () => {
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(screen.getByText("Not linked to a customer yet")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search name or phone" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByRole("dialog", { name: "Create customer from conversation" })).toBeInTheDocument();
  });

  it("ບໍ່ມີ orders:read: ບໍ່ມີຕົວຄົ້ນຫາລູກຄ້າທີ່ມີ (ຍັງສ້າງໃໝ່ໄດ້)", () => {
    auth.canReadOrders = false;
    renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    expect(screen.queryByRole("combobox", { name: "Search name or phone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create customer" })).toBeInTheDocument();
  });

  it("ເລືອກລູກຄ້າທີ່ມີ → PATCH customerId", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (url.startsWith("/customers")) return { items: [{ id: "cu9", name: "Dala", phone: "020111111", email: null }], total: 1, page: 1, pageSize: 8 };
      if (init?.method === "PATCH") return conversation;
      throw new Error(`unexpected ${url}`);
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await user.type(screen.getByRole("combobox", { name: "Search name or phone" }), "dal");
    await user.click(await screen.findByRole("option", { name: /Dala/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { customerId: "cu9" } });
  });

  it("ຜູ້ຮັບຜິດຊອບ: ຕົວເລືອກມາຈາກ /inbox/assignees; ປ່ຽນ → PATCH assigneeId; ເລືອກ 'Unassigned' → null", async () => {
    const first = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    await first.user.selectOptions(select, "u2");
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { assigneeId: "u2" } });
    first.unmount();

    // render ໃໝ່ (ບໍ່ໃຊ້ rerender: ຈະເສຍ providers)
    const second = renderWithProviders(<SidePanel conversation={{ ...conversation, assignee: { id: "u2", name: "Manager" } }} canWrite />);
    const select2 = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect(select2).toBeEnabled());
    await second.user.selectOptions(select2, "");
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]?.[1]).toEqual({ method: "PATCH", body: { assigneeId: null } });
  });

  it("ຜູ້ຮັບທີ່ບໍ່ຢູ່ໃນລາຍຊື່ (ເຊັ່ນ ຖືກປິດໃຊ້ງານ) ຍັງສະແດງເປັນຕົວເລືອກປັດຈຸບັນ", async () => {
    renderWithProviders(<SidePanel conversation={{ ...conversation, assignee: { id: "gone", name: "Former Staff" } }} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    expect(select).toHaveValue("gone");
    expect(within(select).getByRole("option", { name: "Former Staff" })).toBeInTheDocument();
  });

  it("ປິດເຄສ / ເປີດຄືນ → PATCH status", async () => {
    const first = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await first.user.click(screen.getByRole("button", { name: "Close conversation" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.[1]).toEqual({ method: "PATCH", body: { status: "CLOSED" } });
    first.unmount();

    const second = renderWithProviders(<SidePanel conversation={{ ...conversation, status: "CLOSED" }} canWrite />);
    await second.user.click(screen.getByRole("button", { name: "Reopen conversation" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]?.[1]).toEqual({ method: "PATCH", body: { status: "OPEN" } });
  });

  it("ບໍ່ມີສິດຂຽນ: ຄວບຄຸມທຸກຢ່າງຖືກປິດ/ຊ່ອນ", () => {
    renderWithProviders(
      <SidePanel conversation={{ ...conversation, customer: { id: "cu1", name: "Dala", phone: null } }} canWrite={false} />,
    );
    expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Unlink" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create customer" })).not.toBeInTheDocument();
  });

  it("ບັນທຶກບໍ່ສຳເລັດ: toast error ຕາມ code", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (init?.method === "PATCH") throw new ApiError(404, "nf", [], "USER_NOT_FOUND");
      return { items: [], total: 0, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(select, "u1");
    await waitFor(() =>
      expect(getToasts().some((item) => item.variant === "error" && item.title === "This user was not found or is deactivated")).toBe(true),
    );
  });

  it("PATCH ລົ້ມເຫຼວ: select ຍັງສະແດງຄ່າຈາກ server (controlled)", async () => {
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (init?.method === "PATCH") throw new ApiError(404, "nf", [], "USER_NOT_FOUND");
      return { items: [], total: 0, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={{ ...conversation, assignee: { id: "u1", name: "Chat Admin" } }} canWrite />);
    const select = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(select, "u2");
    await waitFor(() => expect(getToasts().some((item) => item.variant === "error")).toBe(true));
    expect(select).toHaveValue("u1");
  });

  it("ຂະນະກຳລັງບັນທຶກ: ປຸ່ມ/select ຖືກປິດ ແລະ ກົດສອງຄັ້ງສົ່ງ PATCH ຄັ້ງດຽວ", async () => {
    let release: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
      if (url === "/inbox/assignees") return assignees;
      if (init?.method === "PATCH") return new Promise<unknown>((resolve) => { release = resolve; });
      return { items: [], total: 0, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await user.dblClick(screen.getByRole("button", { name: "Close conversation" }));
    expect(patches()).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close conversation" })).toBeDisabled();
    release(conversation);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close conversation" })).toBeEnabled());
  });

  it("ປ່ຽນ conversation: dialog ສ້າງລູກຄ້າປິດ ແລະ ບໍ່ຕິດຄ່າເກົ່າ", async () => {
    const { user, rerender } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    await user.type(await screen.findByLabelText("Phone"), "020123456");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider initialLanguage="en">
          <SidePanel conversation={{ ...conversation, id: "c2", displayName: "Other Person" }} canWrite />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByLabelText(/Customer name/)).toHaveValue("Other Person");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
  });

  describe("ສະຫຼັບ conversation / ສະຖານະກຳລັງໂຫຼດ", () => {
    function Harness() {
      const [id, setId] = useState("c1");
      return (
        <>
          <button onClick={() => setId("c1")}>go-a</button>
          <button onClick={() => setId("c2")}>go-b</button>
          <SidePanel conversation={{ ...conversation, id, displayName: id === "c1" ? "Person A" : "Person B" }} canWrite />
        </>
      );
    }

    it("A→B→A: dialog ສ້າງລູກຄ້າບໍ່ເປີດຄືນເມື່ອກັບມາ A", async () => {
      const { user } = renderWithProviders(<Harness />);
      await user.click(screen.getByRole("button", { name: "Create customer" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      // ປ່ຽນໄປ B (dialog ເປີດຢູ່ ໃຊ້ pointer ບໍ່ໄດ້ ຈຶ່ງໃຊ້ keyboard-less click ຜ່ານ DOM)
      act(() => screen.getByText("go-b").click());
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      act(() => screen.getByText("go-a").click());
      await waitFor(() => expect(screen.getByRole("button", { name: "Create customer" })).toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("PATCH ຄ້າງຢູ່ໃນ A ແລ້ວປ່ຽນໄປ B: ຄວບຄຸມຂອງ B ໃຊ້ໄດ້", async () => {
      vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
        if (url === "/inbox/assignees") return assignees;
        if (init?.method === "PATCH") return new Promise<unknown>(() => {});
        return { items: [], total: 0, page: 1, pageSize: 8 };
      }) as typeof apiFetch);
      const { user } = renderWithProviders(<Harness />);
      await user.click(screen.getByRole("button", { name: "Close conversation" }));
      expect(screen.getByRole("button", { name: "Close conversation" })).toBeDisabled();
      await user.click(screen.getByText("go-b"));
      expect(screen.getByRole("button", { name: "Close conversation" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "Assignee" })).toBeEnabled();
    });

    it("Unlink ແລະ ຕົວຄົ້ນຫາລູກຄ້າຖືກປິດຂະນະກຳລັງບັນທຶກ", async () => {
      vi.mocked(apiFetch).mockImplementation((async (url: string, init?: { method?: string }) => {
        if (url === "/inbox/assignees") return assignees;
        if (init?.method === "PATCH") return new Promise<unknown>(() => {});
        return { items: [], total: 0, page: 1, pageSize: 8 };
      }) as typeof apiFetch);
      const linked = renderWithProviders(
        <SidePanel conversation={{ ...conversation, customer: { id: "cu1", name: "Dala", phone: null } }} canWrite />,
      );
      await linked.user.click(screen.getByRole("button", { name: "Unlink" }));
      expect(screen.getByRole("button", { name: "Unlink" })).toBeDisabled();
      linked.unmount();

      const unlinked = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
      await unlinked.user.click(screen.getByRole("button", { name: "Close conversation" }));
      expect(screen.getByRole("combobox", { name: "Search name or phone" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Create customer" })).toBeDisabled();
    });
  });

  describe("ໂຫຼດລາຍຊື່ຜູ້ຮັບ", () => {
    it("ກຳລັງໂຫຼດ: select ຖືກປິດ", async () => {
      vi.mocked(apiFetch).mockImplementation((async (url: string) => {
        if (url === "/inbox/assignees") return new Promise<unknown>(() => {});
        return { items: [], total: 0, page: 1, pageSize: 8 };
      }) as typeof apiFetch);
      renderWithProviders(<SidePanel conversation={conversation} canWrite />);
      expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
    });

    it("ໂຫຼດບໍ່ສຳເລັດ: ສະແດງຂໍ້ຄວາມ + ປຸ່ມ Retry ທີ່ໂຫຼດໃໝ່", async () => {
      let fail = true;
      vi.mocked(apiFetch).mockImplementation((async (url: string) => {
        if (url === "/inbox/assignees") {
          if (fail) throw new ApiError(500, "boom", [], "INTERNAL");
          return assignees;
        }
        return { items: [], total: 0, page: 1, pageSize: 8 };
      }) as typeof apiFetch);
      const { user } = renderWithProviders(<SidePanel conversation={conversation} canWrite />);
      expect(await screen.findByText("Could not load data")).toBeInTheDocument();
      fail = false;
      await user.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(within(screen.getByRole("combobox", { name: "Assignee" })).getAllByRole("option")).toHaveLength(3));
      expect(screen.queryByText("Could not load data")).not.toBeInTheDocument();
    });
  });
});

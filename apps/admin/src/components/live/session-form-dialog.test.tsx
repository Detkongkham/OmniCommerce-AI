import { screen, waitFor } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { SESSION } from "./fixtures";
import { SessionFormDialog } from "./session-form-dialog";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(SESSION);
  vi.mocked(toast.success).mockReset();
});

function setup(session: typeof SESSION | null = null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const utils = renderWithProviders(<SessionFormDialog open onOpenChange={onOpenChange} session={session} onSaved={onSaved} />);
  return { ...utils, onSaved, onOpenChange };
}

describe("SessionFormDialog", () => {
  it("ສ້າງ: POST ພ້ອມ kind, id ໂພສວ່າງ = null, ແລ້ວແຈ້ງ onSaved ແລະ ປິດ", async () => {
    const { user, onSaved, onOpenChange } = setup();
    await user.type(screen.getByLabelText(/^Title/), "  Friday live ");
    await user.selectOptions(screen.getByLabelText(/^Type/), "POST");
    await user.click(screen.getByRole("checkbox", { name: "Reply publicly to comments" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/live-sessions", {
        method: "POST",
        body: { title: "Friday live", kind: "POST", externalPostId: null, publicReplyEnabled: false },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(SESSION);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("Session created");
  });

  it("ຊື່ວ່າງ ຫຼື id ໂພສຜິດຮູບ: error ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/^Facebook post\/video id/), "abc/def");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("Letters, digits, _ . - only (up to 200 characters)")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ແກ້: ຄ່າເດີມຢູ່ໃນຟອມ, ປະເພດປ່ຽນບໍ່ໄດ້, PATCH ບໍ່ສົ່ງ kind", async () => {
    const { user, onSaved } = setup(SESSION);
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Friday live");
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    await user.clear(screen.getByLabelText(/^Facebook post\/video id/));
    await user.type(screen.getByLabelText(/^Facebook post\/video id/), "333_444");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1", {
        method: "PATCH",
        body: { title: "Friday live", externalPostId: "333_444", publicReplyEnabled: true },
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Session saved");
  });

  it("session LIVE: id ໂພສອ່ານຢ່າງດຽວ ພ້ອມເຫດຜົນ ແລະ ບໍ່ສົ່ງໃນ PATCH", async () => {
    const { user } = setup({ ...SESSION, status: "LIVE" });
    const postId = screen.getByLabelText(/^Facebook post\/video id/);
    expect(postId).toBeDisabled();
    expect(postId).toHaveAccessibleDescription("The post id cannot change while the session is live");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/live-sessions/s1", {
        method: "PATCH",
        body: { title: "Friday live", publicReplyEnabled: true },
      }),
    );
  });

  it("API error: ສະແດງ alert ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const { user, onOpenChange } = setup(SESSION);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { type SocialPostDto, laosLocalToIso } from "@/lib/posts";
import { renderWithProviders } from "@/test/render";
import { POST } from "./fixtures";
import { PostForm } from "./post-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => !auth.denied.has(permission) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];
let current: SocialPostDto = POST;

const SESSIONS = {
  items: [
    { id: "s1", title: "Sale CF", kind: "POST", status: "DRAFT", externalPostId: null },
    { id: "s2", title: "Friday live", kind: "LIVE", status: "DRAFT", externalPostId: null },
    { id: "s3", title: "Has post id", kind: "POST", status: "DRAFT", externalPostId: "1_2" },
  ],
  total: 3,
  page: 1,
  pageSize: 100,
};

function mockApi(overrides: { failOn?: string; error?: ApiError } = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    calls.push({ path, method, body: options?.body });
    if (overrides.failOn && path.endsWith(overrides.failOn)) throw overrides.error;
    if (path.startsWith("/live-sessions")) return SESSIONS;
    if (path === "/media") return { id: "m9", path: "/media/files/new.png", mimeType: "image/png", size: 3, originalName: "a.png" };
    if (path === "/posts" && method === "POST") return { ...POST, id: "p-new" };
    if (method === "DELETE") return undefined;
    if (path.endsWith("/schedule")) return { ...current, status: "SCHEDULED" };
    if (path.endsWith("/cancel")) return { ...current, status: "DRAFT", scheduledAt: null };
    if (path.endsWith("/retry")) return { ...current, status: "SCHEDULED" };
    if (method === "PATCH") return current;
    return current;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.denied = new Set();
  router.replace.mockReset();
  calls = [];
  current = POST;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

const writes = () => calls.filter((call) => call.method !== "GET");

describe("PostForm (ໃໝ່)", () => {
  it("ບັນທຶກຮ່າງ: ສົ່ງຂໍ້ຄວາມ trim + ບໍ່ສົ່ງ liveSessionId ເມື່ອບໍ່ເລືອກ ແລ້ວໄປໜ້າໂພສ", async () => {
    const { user } = renderWithProviders(<PostForm id={null} />);
    await user.type(screen.getByLabelText("Message"), "  Hello Vientiane  ");
    expect(screen.getByText("Hello Vientiane", { selector: "p" })).toBeInTheDocument(); // preview
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/posts/p-new"));
    expect(writes()).toEqual([{ path: "/posts", method: "POST", body: { message: "Hello Vientiane", media: [] } }]);
  });

  it("ຟອມວ່າງ → ແຈ້ງ ແລະ ບໍ່ຍິງ API", async () => {
    const { user } = renderWithProviders(<PostForm id={null} />);
    await user.click(screen.getByRole("button", { name: "Publish now" }));
    expect(await screen.findByText("Add a message or at least one image")).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("ໂພສທັນທີ ພ້ອມຮູບ (ອັບໂຫຼດ + URL) ແລະ session Post CF: ສ້າງ → schedule ບໍ່ມີເວລາ", async () => {
    const { user } = renderWithProviders(<PostForm id={null} />);
    await user.type(screen.getByLabelText("Message"), "CF A1 50k");
    await user.upload(screen.getByTestId("post-image-input"), new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: "Image 1" })).toHaveAttribute("src", "/api/media/files/new.png");
    await user.click(screen.getByRole("button", { name: "Add from URL" }));
    await user.type(screen.getByLabelText("Image URL (https)"), "http://bad.test/x.jpg");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("URL must start with https://")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Image URL (https)"));
    await user.type(screen.getByLabelText("Image URL (https)"), "https://cdn.test/b.jpg{Enter}");
    expect(await screen.findByRole("img", { name: "Image 2" })).toHaveAttribute("src", "https://cdn.test/b.jpg");

    // ສະເພາະ session ແບບໂພສທີ່ຍັງບໍ່ມີ post id
    const select = screen.getByLabelText("Post CF session");
    await waitFor(() => expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Not linked", "Sale CF"]));
    await user.selectOptions(select, "s1");

    await user.click(screen.getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/posts/p-new"));
    const upload = calls.find((call) => call.path === "/media");
    expect(upload?.body).toBeInstanceOf(FormData);
    expect(writes().filter((call) => call.path !== "/media")).toEqual([
      {
        path: "/posts",
        method: "POST",
        body: { message: "CF A1 50k", media: [{ mediaFileId: "m9" }, { url: "https://cdn.test/b.jpg" }], liveSessionId: "s1" },
      },
      { path: "/posts/p-new/schedule", method: "POST", body: {} },
    ]);
  });

  it("ຕັ້ງເວລາ: ເວລາລາວ → ISO; ເວລາຜ່ານມາແລ້ວ → ແຈ້ງ", async () => {
    const { user } = renderWithProviders(<PostForm id={null} />);
    await user.type(screen.getByLabelText("Message"), "Later");
    await user.click(screen.getByLabelText("Schedule"));
    const input = screen.getByLabelText("Date and time (Laos time)");
    await user.clear(input);
    await user.type(input, "2020-01-01T10:00");
    await user.click(screen.getByRole("button", { name: "Schedule post" }));
    expect(await screen.findByText(/Pick a future time/)).toBeInTheDocument();
    expect(writes()).toEqual([]);

    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const local = new Date(future.getTime() + 7 * 3600_000).toISOString().slice(0, 13) + ":00";
    await user.clear(input);
    await user.type(input, local);
    await user.click(screen.getByRole("button", { name: "Schedule post" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/posts/p-new"));
    const schedule = writes().find((call) => call.path.endsWith("/schedule"));
    expect(schedule?.body).toEqual({ scheduledAt: laosLocalToIso(local) });
  });

  it("API ປະຕິເສດ (session ບໍ່ມີລະຫັດ) → ສະແດງຂໍ້ຄວາມ error", async () => {
    mockApi({ failOn: "/schedule", error: new ApiError(409, "x", [], "LIVE_SESSION_INVALID_STATE") });
    const { user } = renderWithProviders(<PostForm id={null} />);
    await user.type(screen.getByLabelText("Message"), "x");
    await user.click(screen.getByRole("button", { name: "Publish now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/.+/);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("PostForm (ມີຢູ່ແລ້ວ)", () => {
  it("SCHEDULED: ສະແດງເວລາ, ຍົກເລີກການຕັ້ງເວລາ", async () => {
    current = { ...POST, status: "SCHEDULED", scheduledAt: "2099-01-01T03:00:00.000Z" };
    const { user } = renderWithProviders(<PostForm id="p1" />);
    expect(await screen.findByText("Will be published at 01/01/2099 10:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Schedule")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancel schedule" }));
    await waitFor(() => expect(writes()).toEqual([{ path: "/posts/p1/cancel", method: "POST", body: undefined }]));
  });

  it("FAILED (PUBLISH_UNCERTAIN): ເຕືອນໃຫ້ກວດເພຈ + ລອງໃໝ່", async () => {
    current = { ...POST, status: "FAILED", errorCode: "PUBLISH_UNCERTAIN", errorMessage: "interrupted" };
    const { user } = renderWithProviders(<PostForm id="p1" />);
    expect(await screen.findByText(/Publishing was interrupted; it is unknown/)).toBeInTheDocument();
    expect(screen.getByText(/Check the Page first/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry publishing" }));
    await waitFor(() => expect(writes()).toEqual([{ path: "/posts/p1/retry", method: "POST", body: undefined }]));
  });

  it("PUBLISHED: ອ່ານຢ່າງດຽວ, ລິ້ງໂພສ, cfLinkError ພ້ອມລິ້ງ session", async () => {
    current = {
      ...POST,
      status: "PUBLISHED",
      publishedAt: "2026-10-08T05:00:00.000Z",
      externalPostId: "1_2",
      permalinkUrl: "https://www.facebook.com/1_2",
      liveSession: { id: "s1", title: "Sale CF", status: "DRAFT" },
      cfLinkError: "BAD_REQUEST",
    };
    renderWithProviders(<PostForm id="p1" />);
    expect(await screen.findByRole("link", { name: "Open post on Facebook" })).toHaveAttribute("href", "https://www.facebook.com/1_2");
    expect(screen.getByText(/CF capture could not start \(BAD_REQUEST\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute("href", "/live/s1");
    expect(screen.getByLabelText("Message")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove image 1" })).not.toBeInTheDocument();
  });

  it("ແກ້ຮ່າງ: PATCH ສົ່ງ liveSessionId null; ລຶບຜ່ານ confirm ແລ້ວກັບລາຍການ", async () => {
    const { user } = renderWithProviders(<PostForm id="p1" />);
    const message = await screen.findByLabelText("Message");
    await user.clear(message);
    await user.type(message, "Edited");
    await user.click(screen.getByRole("button", { name: "Remove image 1" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes()).toEqual([{ path: "/posts/p1", method: "PATCH", body: { message: "Edited", media: [], liveSessionId: null } }]));
    expect(router.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete post" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete post" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/posts"));
    expect(writes().at(-1)).toEqual({ path: "/posts/p1", method: "DELETE", body: undefined });
  });

  it("ບໍ່ມີ live-cf:read: ບໍ່ດຶງ session ແລະ ເລືອກໄດ້ແຕ່ 'ບໍ່ເຊື່ອມ'", async () => {
    auth.denied = new Set(["live-cf:read"]);
    renderWithProviders(<PostForm id="p1" />);
    const select = await screen.findByLabelText("Post CF session");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Not linked"]);
    expect(calls.some((call) => call.path.startsWith("/live-sessions"))).toBe(false);
  });
});

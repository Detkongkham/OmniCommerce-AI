import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { renderWithProviders } from "@/test/render";
import { SlipImage } from "./slip-image";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));

const create = vi.fn(() => "blob:mock-1");
const revoke = vi.fn();
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  create.mockClear();
  revoke.mockClear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
});
afterEach(() => vi.unstubAllGlobals());

describe("SlipImage", () => {
  it("ໂຫຼດ blob ດ້ວຍ auth ແລ້ວສະແດງຮູບ + ລິ້ງເປີດເຕັມ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    renderWithProviders(<SlipImage slipId="s1" />);
    const image = await screen.findByRole("img", { name: "Slip image" });
    expect(image).toHaveAttribute("src", "blob:mock-1");
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/image", { responseType: "blob" });
    const link = screen.getByRole("link", { name: "Open the full image in a new tab" });
    expect(link).toHaveAttribute("href", "blob:mock-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("ຄືນ object URL ຕອນ unmount (ບໍ່ຮົ່ວ memory)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Blob(["x"]));
    const { unmount } = renderWithProviders(<SlipImage slipId="s1" />);
    await screen.findByRole("img");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:mock-1");
  });

  it("blob ປ່ຽນ → ຄືນ URL ເກົ່າ ແລະ ສ້າງ URL ໃໝ່", async () => {
    create.mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");
    vi.mocked(apiFetch).mockResolvedValue(new Blob(["x"]));
    const { queryClient } = renderWithProviders(<SlipImage slipId="s1" />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:old"));
    act(() => queryClient.setQueryData([...queryKeys.slipImages, "s1"], new Blob(["y"])));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:new"));
    expect(revoke).toHaveBeenCalledWith("blob:old");
    expect(revoke).not.toHaveBeenCalledWith("blob:new");
  });

  it("ໂຫຼດບໍ່ໄດ້ → ຂໍ້ຄວາມ error + ປຸ່ມ Retry ທີ່ຍິງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(404, "nf", [], "SLIP_NOT_FOUND"));
    const { user } = renderWithProviders(<SlipImage slipId="s1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the image");
    vi.mocked(apiFetch).mockResolvedValueOnce(new Blob(["x"]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });

  it("ກຳລັງໂຫຼດ → skeleton ທີ່ບອກ busy", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SlipImage slipId="s1" />);
    expect(screen.getByRole("status", { name: "Loading..." })).toHaveAttribute("aria-busy", "true");
  });
});

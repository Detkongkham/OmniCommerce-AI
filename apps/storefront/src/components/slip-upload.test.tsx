import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientApiError, uploadSlip } from "@/lib/client-api";
import { SlipUpload } from "./slip-upload";

vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  uploadSlip: vi.fn(),
}));
const uploadSlipMock = vi.mocked(uploadSlip);

const png = (size = 10, name = "slip.png", type = "image/png") => new File([new Uint8Array(size)], name, { type });
const input = () => screen.getByLabelText("ເລືອກຮູບສະລິບ");

beforeEach(() => uploadSlipMock.mockReset());

describe("SlipUpload", () => {
  it("ເລືອກຮູບ → ອັບໂຫຼດ → ແຈ້ງສຳເລັດ ແລະ ເອີ້ນ onUploaded", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    uploadSlipMock.mockResolvedValue({ status: "REVIEWING" });
    render(<SlipUpload token="tok" onUploaded={onUploaded} />);
    const file = png();
    await user.upload(input(), file);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(uploadSlipMock).toHaveBeenCalledWith("tok", file);
    expect(screen.getByRole("status")).toHaveTextContent("ສົ່ງສະລິບແລ້ວ ຮ້ານຈະກວດສອບ ແລະ ຢືນຢັນໃຫ້");
  });

  it("ໄຟລ໌ໃຫຍ່ເກີນ 8 MB ຫຼື ບໍ່ແມ່ນຮູບ → ແຈ້ງທັນທີໂດຍບໍ່ສົ່ງ", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<SlipUpload token="tok" onUploaded={vi.fn()} />);
    await user.upload(input(), png(8 * 1024 * 1024 + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("ໄຟລ໌ຕ້ອງເປັນຮູບ JPEG, PNG ຫຼື WebP ແລະ ບໍ່ເກີນ 8 MB");
    await user.upload(input(), png(10, "doc.pdf", "application/pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent("ໄຟລ໌ຕ້ອງເປັນຮູບ JPEG, PNG ຫຼື WebP ແລະ ບໍ່ເກີນ 8 MB");
    expect(uploadSlipMock).not.toHaveBeenCalled();
  });

  it("server ປະຕິເສດ → ຂໍ້ຄວາມຕາມ code; ລອງໃໝ່ໄດ້", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    render(<SlipUpload token="tok" onUploaded={onUploaded} />);
    uploadSlipMock.mockRejectedValueOnce(new ClientApiError(409, "SLIP_LIMIT_REACHED"));
    await user.upload(input(), png());
    expect(await screen.findByRole("alert")).toHaveTextContent("ບິນນີ້ມີສະລິບຄົບຈຳນວນແລ້ວ");
    uploadSlipMock.mockRejectedValueOnce(new ClientApiError(500, undefined));
    await user.upload(input(), png());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ອັບໂຫຼດບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
    uploadSlipMock.mockResolvedValueOnce({ status: "REVIEWING" });
    await user.upload(input(), png());
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ລະຫວ່າງອັບໂຫຼດ ປຸ່ມຖືກປິດ ແລະ ບອກວ່າກຳລັງອັບໂຫຼດ", async () => {
    const user = userEvent.setup();
    let finish: (value: { status: "REVIEWING" }) => void = () => {};
    uploadSlipMock.mockReturnValueOnce(new Promise((done) => (finish = done)));
    render(<SlipUpload token="tok" onUploaded={vi.fn()} />);
    await user.upload(input(), png());
    expect(input()).toBeDisabled();
    expect(screen.getByText("ກຳລັງອັບໂຫຼດ…")).toBeInTheDocument();
    finish({ status: "REVIEWING" });
    await waitFor(() => expect(input()).toBeEnabled());
  });
});

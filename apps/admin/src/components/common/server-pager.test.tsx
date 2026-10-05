import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { MAX_SERVER_PAGE_SIZE, ServerPager } from "./server-pager";

describe("ServerPager", () => {
  it("ສະແດງສະຫຼຸບຈາກ total ຂອງ server ແລະ ປຸ່ມໜ້າຕໍ່ໄປເອີ້ນ onPageChange", async () => {
    const onPageChange = vi.fn();
    const { user } = renderWithProviders(
      <ServerPager page={2} pageSize={10} total={35} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 11-20 of 35 items")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("ບໍ່ມີຂໍ້ມູນ: 0-0 ຈາກ 0 ແລະ ປຸ່ມຖັດໄປປິດ", () => {
    renderWithProviders(
      <ServerPager page={1} pageSize={10} total={0} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 0-0 of 0 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("ເລືອກ 'ທັງໝົດ' ຖືກແປງເປັນ pageSize ສູງສຸດຂອງ API (100)", async () => {
    const onPageSizeChange = vi.fn();
    const { user } = renderWithProviders(
      <ServerPager page={1} pageSize={10} total={35} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "per page" }), "All");
    expect(onPageSizeChange).toHaveBeenCalledWith(MAX_SERVER_PAGE_SIZE);
  });

  it("page ເກີນຂອບເຂດ ຖືກຕັດເປັນໜ້າສຸດທ້າຍ", () => {
    renderWithProviders(
      <ServerPager page={5} pageSize={10} total={35} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 31-35 of 35 items")).toBeInTheDocument();
  });

  it("pageSize 0 ບໍ່ throw ແລະ ໃຊ້ 10", () => {
    renderWithProviders(
      <ServerPager page={1} pageSize={0} total={35} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 1-10 of 35 items")).toBeInTheDocument();
  });

  it("pageSize 100 ເລືອກ All (value 0)", () => {
    renderWithProviders(
      <ServerPager page={1} pageSize={100} total={35} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "per page" })).toHaveValue("0");
  });

  it("ປຸ່ມ Previous ປິດຢູ່ໜ້າ 1", () => {
    renderWithProviders(
      <ServerPager page={1} pageSize={10} total={35} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTableFooter } from "./data-table-footer";

const labels = { show: "Show", perPage: "per page", all: "All", previous: "Previous", next: "Next" };

function setup(page = 1) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <DataTableFooter
      page={page}
      totalPages={3}
      pageSize={10}
      summary="Showing 1-10 of 25 items"
      labels={labels}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

describe("DataTableFooter", () => {
  it("ສະແດງສະຫຼຸບ ແລະ ປຸ່ມກ່ອນໜ້າຖືກປິດທີ່ໜ້າທຳອິດ", () => {
    setup(1);
    expect(screen.getByText("Showing 1-10 of 25 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
  });

  it("ກົດເລກໜ້າ ແລະ ປຸ່ມຖັດໄປ", async () => {
    const { onPageChange } = setup(1);
    await userEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("ປ່ຽນຈຳນວນຕໍ່ໜ້າ", async () => {
    const { onPageSizeChange } = setup(1);
    await userEvent.selectOptions(screen.getByLabelText("per page"), "30");
    expect(onPageSizeChange).toHaveBeenCalledWith(30);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginationNav, productsHref } from "./pagination-nav";

describe("productsHref", () => {
  it("ໜ້າ 1 ບໍ່ມີ page; ຮັກສາ category ແລະ q", () => {
    expect(productsHref({})).toBe("/products");
    expect(productsHref({ page: 1, category: "shirts" })).toBe("/products?category=shirts");
    expect(productsHref({ page: 3, category: "shirts", q: "ດຳ" })).toBe(`/products?category=shirts&q=${encodeURIComponent("ດຳ")}&page=3`);
  });
});

describe("PaginationNav", () => {
  it("ໜ້າດຽວ → ບໍ່ສະແດງ", () => {
    const { container } = render(<PaginationNav page={1} pageSize={24} total={24} params={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ໜ້າກາງ: ມີລິ້ງກ່ອນ/ຖັດໄປ ທີ່ຮັກສາຕົວກັ່ນຕອງ ແລະ ບອກໜ້າປັດຈຸບັນ", () => {
    render(<PaginationNav page={2} pageSize={24} total={60} params={{ category: "shirts" }} />);
    expect(screen.getByRole("navigation", { name: "ໜ້າຂອງລາຍການສິນຄ້າ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ໜ້າກ່ອນ" })).toHaveAttribute("href", "/products?category=shirts");
    expect(screen.getByRole("link", { name: "ໜ້າຖັດໄປ" })).toHaveAttribute("href", "/products?category=shirts&page=3");
    expect(screen.getByText("ໜ້າ 2 / 3")).toHaveAttribute("aria-current", "page");
  });

  it("ໜ້າທຳອິດບໍ່ມີລິ້ງກ່ອນ; ໜ້າສຸດທ້າຍບໍ່ມີລິ້ງຖັດໄປ", () => {
    const { rerender } = render(<PaginationNav page={1} pageSize={24} total={60} params={{}} />);
    expect(screen.queryByRole("link", { name: "ໜ້າກ່ອນ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ໜ້າຖັດໄປ" })).toBeInTheDocument();
    rerender(<PaginationNav page={3} pageSize={24} total={60} params={{}} />);
    expect(screen.getByRole("link", { name: "ໜ້າກ່ອນ" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ໜ້າຖັດໄປ" })).not.toBeInTheDocument();
  });
});

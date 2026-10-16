import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("ມີລິ້ງ ບັນຊີ ໄປ /account ແລະ ລິ້ງກະຕ່າ", () => {
    render(<SiteHeader storeName="ຮ້ານ ກ" />);
    expect(screen.getByRole("link", { name: "ບັນຊີ" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "ກະຕ່າ" })).toHaveAttribute("href", "/cart");
  });
});

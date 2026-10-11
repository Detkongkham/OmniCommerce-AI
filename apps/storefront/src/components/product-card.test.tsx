import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoreProductListItem } from "@/lib/types";
import { ProductCard } from "./product-card";

const product = (patch: Partial<StoreProductListItem> = {}): StoreProductListItem => ({
  slug: "tee",
  name: "ເສື້ອຍືດ",
  imageUrl: "/media/files/tee.png",
  priceMin: "80000.00",
  priceMax: "80000.00",
  compareAtPrice: null,
  saleEndsAt: null,
  stock: "IN_STOCK",
  ...patch,
});

describe("ProductCard", () => {
  it("ຊື່ ແລະ ລາຄາ ຢູ່ໃນລິ້ງໄປໜ້າລາຍລະອຽດ; ຮູບມີ alt ເປັນຊື່ສິນຄ້າ", () => {
    render(<ProductCard product={product()} />);
    const link = screen.getByRole("link", { name: /ເສື້ອຍືດ/ });
    expect(link).toHaveAttribute("href", "/products/tee");
    expect(link).toHaveTextContent("80,000 ກີບ");
    expect(screen.getByRole("img", { name: "ເສື້ອຍືດ" })).toHaveAttribute("src", "/media/files/tee.png");
  });

  it("ຫຼາຍລາຄາສະແດງເປັນຊ່ວງ; ລາຄາກ່ອນຫຼຸດຖືກຂີດຂ້າ ພ້ອມຄຳອະທິບາຍສຳລັບ screen reader", () => {
    render(<ProductCard product={product({ priceMax: "120000.00", compareAtPrice: "100000.00" })} />);
    expect(screen.getByText("80,000 – 120,000 ກີບ")).toBeInTheDocument();
    const old = screen.getByText("100,000 ກີບ");
    expect(old.tagName).toBe("S");
    expect(screen.getByText("ລາຄາເດີມ")).toHaveClass("sr-only");
  });

  it("ໝົດ → ປ້າຍ 'ສິນຄ້າໝົດ'; ໃກ້ໝົດ → ປ້າຍ 'ໃກ້ໝົດ'; ມີຂອງບໍ່ມີປ້າຍ", () => {
    const { rerender } = render(<ProductCard product={product({ stock: "OUT" })} />);
    expect(screen.getByText("ສິນຄ້າໝົດ")).toBeInTheDocument();
    rerender(<ProductCard product={product({ stock: "LOW" })} />);
    expect(screen.getByText("ໃກ້ໝົດ")).toBeInTheDocument();
    rerender(<ProductCard product={product()} />);
    expect(screen.queryByText("ສິນຄ້າໝົດ")).not.toBeInTheDocument();
    expect(screen.queryByText("ໃກ້ໝົດ")).not.toBeInTheDocument();
  });

  it("ບໍ່ມີຮູບ → placeholder ທີ່ບໍ່ຖືກອ່ານ (ບໍ່ມີ img ເສຍ)", () => {
    render(<ProductCard product={product({ imageUrl: null })} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ເສື້ອຍືດ/ })).toBeInTheDocument();
  });

  it("Flash Sale badge: shown while a sale is running, hidden when sold out", () => {
    const { rerender } = render(<ProductCard product={product({ saleEndsAt: "2030-01-01T00:00:00.000Z", compareAtPrice: "100000.00" })} />);
    expect(screen.getByText("Flash Sale")).toBeInTheDocument();
    rerender(<ProductCard product={product({ saleEndsAt: "2030-01-01T00:00:00.000Z", stock: "OUT" })} />);
    expect(screen.queryByText("Flash Sale")).not.toBeInTheDocument();
  });
});

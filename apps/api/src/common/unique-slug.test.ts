import { describe, expect, it } from "vitest";
import { uniqueSlug } from "./unique-slug";

describe("uniqueSlug", () => {
  it("ໃຊ້ slug ຈາກຊື່ຖ້າຍັງບໍ່ມີ", async () => {
    expect(await uniqueSlug("Black Shirt", "product", async () => false)).toBe("black-shirt");
  });
  it("ຊື່ລາວລ້ວນໃຊ້ fallback", async () => {
    expect(await uniqueSlug("ເສື້ອຍືດ", "product", async () => false)).toBe("product");
  });
  it("ຊ້ຳແລ້ວຕໍ່ -2, -3 ...", async () => {
    const taken = new Set(["black-shirt", "black-shirt-2"]);
    expect(await uniqueSlug("Black Shirt", "product", async (slug) => taken.has(slug))).toBe("black-shirt-3");
  });
  it("ຊ້ຳຫຼາຍເກີນໄປໃຊ້ suffix ສຸ່ມ", async () => {
    const slug = await uniqueSlug("a", "product", async (candidate) => candidate === "a" || /-\d+$/.test(candidate));
    expect(slug).toMatch(/^a-[0-9a-f]{8}$/);
  });
});

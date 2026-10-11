import { afterEach, describe, expect, it, vi } from "vitest";
import { CART_STORAGE_KEY, addToCart, cartCount, clearCart, getCart, removeFromCart, replaceCart, resetCartForTests, setCartQuantity, subscribeCart } from "./cart";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetCartForTests();
});

describe("cart store", () => {
  it("ເລີ່ມຫວ່າງ; add ເພີ່ມລາຍການ ແລະ ລວມຈຳນວນຂອງ variant ເດີມ", () => {
    expect(getCart()).toEqual([]);
    expect(addToCart("v1", 2)).toBe(true);
    expect(addToCart("v2", 1)).toBe(true);
    expect(addToCart("v1", 3)).toBe(true);
    expect(getCart()).toEqual([
      { variantId: "v1", quantity: 5 },
      { variantId: "v2", quantity: 1 },
    ]);
    expect(cartCount(getCart())).toBe(6);
  });

  it("ຈຳນວນຕໍ່ລາຍການບໍ່ເກີນ 20: ເກີນ = ບໍ່ປ່ຽນ ແລະ ຄືນ false", () => {
    addToCart("v1", 19);
    expect(addToCart("v1", 2)).toBe(false);
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 19 }]);
    expect(addToCart("v1", 1)).toBe(true);
  });

  it("ບໍ່ເກີນ 20 ລາຍການ", () => {
    for (let index = 0; index < 20; index += 1) expect(addToCart(`v${index}`, 1)).toBe(true);
    expect(addToCart("v-extra", 1)).toBe(false);
    expect(getCart()).toHaveLength(20);
    // variant ທີ່ມີຢູ່ແລ້ວ ຍັງເພີ່ມຈຳນວນໄດ້
    expect(addToCart("v0", 1)).toBe(true);
  });

  it("setQuantity (ບີບໃຫ້ຢູ່ 1..20), remove ແລະ clear", () => {
    addToCart("v1", 2);
    addToCart("v2", 2);
    setCartQuantity("v1", 7);
    setCartQuantity("v2", 99);
    expect(getCart()).toEqual([
      { variantId: "v1", quantity: 7 },
      { variantId: "v2", quantity: 20 },
    ]);
    setCartQuantity("v1", 0);
    expect(getCart()[0]).toEqual({ variantId: "v1", quantity: 1 });
    removeFromCart("v1");
    expect(getCart()).toEqual([{ variantId: "v2", quantity: 20 }]);
    clearCart();
    expect(getCart()).toEqual([]);
  });

  it("replaceCart: ເຕີມກະຕ່າຈາກບິນເກົ່າ ໂດຍລວມ variant ຊ້ຳ ແລະ ຕັດຕາມເພດານ", () => {
    addToCart("old", 1);
    replaceCart([
      { variantId: "v1", quantity: 15 },
      { variantId: "v1", quantity: 15 },
      { variantId: "v2", quantity: 2 },
    ]);
    expect(getCart()).toEqual([
      { variantId: "v1", quantity: 20 },
      { variantId: "v2", quantity: 2 },
    ]);
  });

  it("ເກັບລົງ localStorage ແລະ ອ່ານຄືນຫຼັງໂຫຼດໃໝ່", () => {
    addToCart("v1", 2);
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null")).toEqual([{ variantId: "v1", quantity: 2 }]);
    resetCartForTests();
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 2 }]);
  });

  it("ຂໍ້ມູນໃນ localStorage ເສຍ ຫຼື ຜິດຮູບ → ເລີ່ມດ້ວຍກະຕ່າຫວ່າງ (ຖິ້ມລາຍການທີ່ຜິດ)", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "{not json");
    expect(getCart()).toEqual([]);
    resetCartForTests();
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([{ variantId: "ok", quantity: 2 }, { variantId: 5, quantity: 1 }, { variantId: "neg", quantity: -1 }, "x", { variantId: "big", quantity: 500 }]),
    );
    expect(getCart()).toEqual([
      { variantId: "ok", quantity: 2 },
      { variantId: "big", quantity: 20 },
    ]);
  });

  it("localStorage ໃຊ້ບໍ່ໄດ້ (throw) → ກະຕ່າຍັງໃຊ້ໄດ້ໃນ memory", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getCart()).toEqual([]);
    expect(addToCart("v1", 1)).toBe(true);
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 1 }]);
  });

  it("ແຈ້ງ subscriber ທຸກຄັ້ງທີ່ປ່ຽນ; snapshot ຄົງເດີມເມື່ອບໍ່ປ່ຽນ (ສຳລັບ useSyncExternalStore)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCart(listener);
    const before = getCart();
    expect(getCart()).toBe(before);
    addToCart("v1", 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCart()).not.toBe(before);
    unsubscribe();
    addToCart("v1", 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

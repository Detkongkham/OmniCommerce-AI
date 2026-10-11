import { STORE_MAX_LINES, STORE_MAX_QUANTITY } from "@oca/shared";
import { useSyncExternalStore } from "react";

/** ກະຕ່າເກັບສະເພາະ id + ຈຳນວນ: ຊື່/ລາຄາ/ສະຕ໋ອກມາຈາກ server ທຸກຄັ້ງ (POST /store/cart/check) */
export interface CartItem {
  variantId: string;
  quantity: number;
}

export const CART_STORAGE_KEY = "oca-cart-v1";

const EMPTY: readonly CartItem[] = Object.freeze([]);
const listeners = new Set<() => void>();
/** undefined = ຍັງບໍ່ໄດ້ອ່ານຈາກ localStorage */
let items: readonly CartItem[] | undefined;

const clampQuantity = (quantity: number): number => Math.min(Math.max(Math.trunc(quantity), 1), STORE_MAX_QUANTITY);

/** ຖິ້ມລາຍການທີ່ຜິດຮູບ, ລວມ variant ຊ້ຳ, ຕັດຕາມເພດານ */
function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, number>();
  for (const entry of raw as unknown[]) {
    if (entry === null || typeof entry !== "object") continue;
    const { variantId, quantity } = entry as { variantId?: unknown; quantity?: unknown };
    if (typeof variantId !== "string" || variantId === "" || variantId.length > 64) continue;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 1) continue;
    merged.set(variantId, clampQuantity((merged.get(variantId) ?? 0) + quantity));
  }
  return [...merged].slice(0, STORE_MAX_LINES).map(([variantId, quantity]) => ({ variantId, quantity }));
}

function load(): readonly CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : EMPTY;
  } catch {
    // private mode / storage ຖືກບລັອກ / JSON ເສຍ: ເລີ່ມຫວ່າງ ແລະ ໃຊ້ memory ຕໍ່
    return EMPTY;
  }
}

function commit(next: readonly CartItem[]): void {
  items = next;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ເກັບບໍ່ໄດ້: ກະຕ່າຢູ່ໃນ memory ຂອງ tab ນີ້ເທົ່ານັ້ນ
  }
  for (const listener of listeners) listener();
}

export function getCart(): readonly CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  items ??= load();
  return items;
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function cartCount(cart: readonly CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

/** ຄືນ false (ບໍ່ປ່ຽນຫຍັງ) ຖ້າຈະເກີນ 20 ອັນຕໍ່ລາຍການ ຫຼື 20 ລາຍການ */
export function addToCart(variantId: string, quantity: number): boolean {
  const cart = getCart();
  const existing = cart.find((item) => item.variantId === variantId);
  if (existing) {
    if (existing.quantity + quantity > STORE_MAX_QUANTITY) return false;
    commit(cart.map((item) => (item.variantId === variantId ? { variantId, quantity: item.quantity + quantity } : item)));
    return true;
  }
  if (cart.length >= STORE_MAX_LINES || quantity > STORE_MAX_QUANTITY) return false;
  commit([...cart, { variantId, quantity }]);
  return true;
}

export function setCartQuantity(variantId: string, quantity: number): void {
  commit(getCart().map((item) => (item.variantId === variantId ? { variantId, quantity: clampQuantity(quantity) } : item)));
}

export function removeFromCart(variantId: string): void {
  commit(getCart().filter((item) => item.variantId !== variantId));
}

export function clearCart(): void {
  commit(EMPTY);
}

/** ແທນທັງກະຕ່າ (ປຸ່ມ "ສັ່ງໃໝ່" ຂອງບິນທີ່ໝົດອາຍຸ) */
export function replaceCart(next: readonly CartItem[]): void {
  commit(sanitize(next));
}

/** ລືມສິ່ງທີ່ອ່ານໄວ້ ເພື່ອໃຫ້ອ່ານ localStorage ໃໝ່ (ໃຊ້ໃນ test ເທົ່ານັ້ນ) */
export function resetCartForTests(): void {
  items = undefined;
  listeners.clear();
}

const getServerSnapshot = (): readonly CartItem[] => EMPTY;

/** ກະຕ່າປັດຈຸບັນ. ຝັ່ງ server ແລະ ຕອນ hydrate ເປັນຫວ່າງສະເໝີ (ກັນ hydration mismatch) */
export function useCart(): readonly CartItem[] {
  return useSyncExternalStore(subscribeCart, getCart, getServerSnapshot);
}

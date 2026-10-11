"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useCart } from "./cart";
import { ClientApiError, checkCart } from "./client-api";
import type { StoreCart } from "./types";

export type CartCheckState =
  /** ຍັງບໍ່ຮູ້ວ່າກະຕ່າມີຫຍັງ (server render / ກ່ອນ hydrate) ຫຼື ກຳລັງຖາມ server ຄັ້ງທຳອິດ */
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; cart: StoreCart; refreshing: boolean }
  | { status: "error"; code: string | undefined };

const noopSubscribe = () => () => {};

/** false ຝັ່ງ server ແລະ ຕອນ hydrate; true ຫຼັງຈາກນັ້ນ (ກະຕ່າໃນ localStorage ອ່ານໄດ້ແລ້ວ) */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * ລາຄາ/ສະຕ໋ອກ/ຍອດປັດຈຸບັນຂອງກະຕ່າຈາກ server. ຖາມໃໝ່ທຸກຄັ້ງທີ່ກະຕ່າປ່ຽນ ຫຼື ເອີ້ນ `reload`;
  * ຄຳຕອບທີ່ມາຊ້າກວ່າຄຳຂໍໃໝ່ຖືກຖິ້ມ.
 */
export function useCartCheck(couponCode?: string): { state: CartCheckState; reload: () => void } {
  const hydrated = useHydrated();
  const items = useCart();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    | { for: unknown; coupon: string | undefined; attempt: number; cart: StoreCart }
    | { for: unknown; coupon: string | undefined; attempt: number; error: string | undefined; failed: true }
    | null
  >(null);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let cancelled = false;
    const key = items;
    checkCart(items, couponCode).then(
      (cart) => {
        if (!cancelled) setResult({ for: key, coupon: couponCode, attempt, cart });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ for: key, coupon: couponCode, attempt, failed: true, error: error instanceof ClientApiError ? error.code : undefined });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, items, couponCode, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  let state: CartCheckState;
  if (!hydrated) state = { status: "loading" };
  else if (items.length === 0) state = { status: "empty" };
  else if (!result) state = { status: "loading" };
  else {
    const current = result.for === items && result.coupon === couponCode && result.attempt === attempt;
    if ("failed" in result) state = current ? { status: "error", code: result.error } : { status: "loading" };
    // ຜົນກ່ອນໜ້າຍັງສະແດງຕໍ່ລະຫວ່າງຖາມໃໝ່ (ບໍ່ກະພິບ, ຟອມບໍ່ຫາຍ)
    else state = { status: "ready", cart: result.cart, refreshing: !current };
  }
  return { state, reload };
}

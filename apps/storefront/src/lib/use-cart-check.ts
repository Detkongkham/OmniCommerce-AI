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
export function useCartCheck(): { state: CartCheckState; reload: () => void } {
  const hydrated = useHydrated();
  const items = useCart();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    { for: unknown; cart: StoreCart } | { for: unknown; error: string | undefined; failed: true } | null
  >(null);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let cancelled = false;
    const key = items;
    checkCart(items).then(
      (cart) => {
        if (!cancelled) setResult({ for: key, cart });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ for: key, failed: true, error: error instanceof ClientApiError ? error.code : undefined });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, items, attempt]);

  const reload = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);

  let state: CartCheckState;
  if (!hydrated) state = { status: "loading" };
  else if (items.length === 0) state = { status: "empty" };
  else if (!result) state = { status: "loading" };
  else if ("failed" in result) state = result.for === items ? { status: "error", code: result.error } : { status: "loading" };
  // ຜົນຂອງກະຕ່າກ່ອນໜ້າ ຍັງສະແດງຕໍ່ລະຫວ່າງຖາມໃໝ່ (ບໍ່ກະພິບ)
  else state = { status: "ready", cart: result.cart, refreshing: result.for !== items };
  return { state, reload };
}

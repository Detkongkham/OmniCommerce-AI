"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCart } from "./cart";
import { ClientApiError, checkCart, isMemberRequired } from "./client-api";
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
 * ລາຄາ/ສະຕ໋ອກ/ຍອດປັດຈຸບັນຂອງກະຕ່າຈາກ server. ຖາມໃໝ່ທຸກຄັ້ງທີ່ກະຕ່າ/ໂຄດ/ແຕ້ມປ່ຽນ ຫຼື ເອີ້ນ `reload`;
 * ຄຳຕອບທີ່ມາຊ້າກວ່າຄຳຂໍໃໝ່ຖືກຖິ້ມ.
 *
 * `pointsToRedeem` > 0 ຕ້ອງມີ session ສະມາຊິກ: ຖ້າ server ຕອບ 401 MEMBER_REQUIRED (session ໝົດອາຍຸ)
 * ຈະບໍ່ສະແດງເປັນ error ແຕ່ເອີ້ນ `onMemberRequired` ໃຫ້ຜູ້ໃຊ້ hook ຖອດແຕ້ມອອກ (ແລ້ວຖາມໃໝ່ແບບບໍ່ມີແຕ້ມ).
 */
export function useCartCheck(
  couponCode?: string,
  pointsToRedeem?: number,
  onMemberRequired?: () => void,
): { state: CartCheckState; reload: () => void } {
  const hydrated = useHydrated();
  const items = useCart();
  const points = pointsToRedeem && pointsToRedeem > 0 ? pointsToRedeem : undefined;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    | { for: unknown; coupon: string | undefined; points: number | undefined; attempt: number; cart: StoreCart }
    | { for: unknown; coupon: string | undefined; points: number | undefined; attempt: number; error: string | undefined; failed: true }
    | null
  >(null);
  const memberRequired = useRef(onMemberRequired);
  useEffect(() => {
    memberRequired.current = onMemberRequired;
  }, [onMemberRequired]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let cancelled = false;
    const key = items;
    checkCart(items, couponCode, points).then(
      (cart) => {
        if (!cancelled) setResult({ for: key, coupon: couponCode, points, attempt, cart });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (points !== undefined && isMemberRequired(error) && memberRequired.current) {
          memberRequired.current();
          return;
        }
        setResult({ for: key, coupon: couponCode, points, attempt, failed: true, error: error instanceof ClientApiError ? error.code : undefined });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, items, couponCode, points, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  let state: CartCheckState;
  if (!hydrated) state = { status: "loading" };
  else if (items.length === 0) state = { status: "empty" };
  else if (!result) state = { status: "loading" };
  else {
    const current = result.for === items && result.coupon === couponCode && result.points === points && result.attempt === attempt;
    if ("failed" in result) state = current ? { status: "error", code: result.error } : { status: "loading" };
    // ຜົນກ່ອນໜ້າຍັງສະແດງຕໍ່ລະຫວ່າງຖາມໃໝ່ (ບໍ່ກະພິບ, ຟອມບໍ່ຫາຍ)
    else state = { status: "ready", cart: result.cart, refreshing: !current };
  }
  return { state, reload };
}

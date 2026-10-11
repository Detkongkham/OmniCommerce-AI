"use client";

import { useCan } from "@/components/auth/auth-provider";

/** ເປີດບິນຈາກເຄສ = POST /orders ຜູກເຄສ: ຕ້ອງ inbox:write + orders:write + inventory:read (ຄືຂອງໜ້າ /orders/new) */
export function useCanOpenOrder(): boolean {
  const canWriteInbox = useCan("inbox:write");
  const canWriteOrders = useCan("orders:write");
  const canReadInventory = useCan("inventory:read");
  return canWriteInbox && canWriteOrders && canReadInventory;
}

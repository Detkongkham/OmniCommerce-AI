import type { StoreCreateOrderInput, StoreSlipStatus } from "@oca/shared";
import type { CartItem } from "./cart";
import type { StoreCart, StoreOrder, StoreOrderCreated } from "./types";

/** ຄຳຂໍຈາກ browser ຜ່ານ rewrite ຂອງເວັບ (/api/* → API) */
const BASE = "/api/store";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    /** `code` ຈາກ API, "NETWORK" ເມື່ອສົ່ງບໍ່ຮອດ, undefined ເມື່ອ body ບໍ່ແມ່ນ JSON ຂອງ API */
    readonly code: string | undefined,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`Store request failed: ${status} ${code ?? ""}`.trim());
    this.name = "ClientApiError";
  }
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ClientApiError(0, "NETWORK");
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new ClientApiError(res.status, typeof body?.code === "string" ? body.code : undefined, body ?? {});
  return body as T;
}

const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/** `couponCode`: ໂຄດທີ່ລູກຄ້າໃສ່ (server ບອກວ່າໃຊ້ໄດ້ ຫຼື ບໍ່ ໃນ `coupon` / `couponError`) */
export function checkCart(items: readonly CartItem[], couponCode?: string): Promise<StoreCart> {
  return send<StoreCart>("/cart/check", postJson(couponCode ? { items, couponCode } : { items }));
}

/** `idempotencyKey` ຕ້ອງຄືເກົ່າເມື່ອລອງສົ່ງ body ເດີມຄືນ (ກັນໄດ້ສອງບິນ) */
export function createOrder(body: StoreCreateOrderInput, idempotencyKey: string): Promise<StoreOrderCreated> {
  return send<StoreOrderCreated>("/orders", postJson(body, { "Idempotency-Key": idempotencyKey }));
}

export function fetchOrder(token: string): Promise<StoreOrder> {
  return send<StoreOrder>(`/orders/${encodeURIComponent(token)}`, { cache: "no-store" });
}

export function uploadSlip(token: string, file: File): Promise<{ status: StoreSlipStatus }> {
  const form = new FormData();
  form.append("file", file);
  return send<{ status: StoreSlipStatus }>(`/orders/${encodeURIComponent(token)}/slips`, { method: "POST", body: form });
}

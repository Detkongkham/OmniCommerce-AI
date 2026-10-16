import type { StoreCreateOrderInput, StoreSlipStatus } from "@oca/shared";
import type { CartItem } from "./cart";
import type { Page, StoreCart, StoreMember, StoreMemberOrder, StoreMemberPoint, StoreOrder, StoreOrderCreated } from "./types";

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

/** 204 / body ວ່າງ */
async function sendEmpty(path: string, init: RequestInit): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ClientApiError(0, "NETWORK");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw new ClientApiError(res.status, typeof body?.code === "string" ? body.code : undefined, body ?? {});
  }
}

const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/**
 * `couponCode`: ໂຄດທີ່ລູກຄ້າໃສ່ (server ບອກວ່າໃຊ້ໄດ້ ຫຼື ບໍ່ ໃນ `coupon` / `couponError`).
 * `pointsToRedeem` (> 0) ຕ້ອງມີ session ສະມາຊິກ (cookie ທີ່ proxy ຖື) ບໍ່ດັ່ງນັ້ນ 401 MEMBER_REQUIRED
 */
export function checkCart(items: readonly CartItem[], couponCode?: string, pointsToRedeem?: number): Promise<StoreCart> {
  return send<StoreCart>(
    "/cart/check",
    postJson({ items, ...(couponCode ? { couponCode } : {}), ...(pointsToRedeem && pointsToRedeem > 0 ? { pointsToRedeem } : {}) }),
  );
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

// ---------------------------------------------------------------------------
// ສະມາຊິກເວັບ: token ຢູ່ໃນ cookie httpOnly ທີ່ proxy ຂອງເວັບຈັດການ; browser ເຫັນແຕ່ `member`
// ---------------------------------------------------------------------------

export function memberLogin(phone: string, pin: string): Promise<{ member: StoreMember }> {
  return send<{ member: StoreMember }>("/member/login", postJson({ phone, pin }));
}

export function memberLogout(): Promise<void> {
  return sendEmpty("/member/logout", { method: "POST" });
}

/** 401 MEMBER_REQUIRED = ຍັງບໍ່ໄດ້ເຂົ້າລະບົບ (ຫຼື session ໝົດອາຍຸ) */
export function fetchMember(): Promise<StoreMember> {
  return send<StoreMember>("/member/me", { cache: "no-store" });
}

export function fetchMemberOrders(page = 1): Promise<Page<StoreMemberOrder>> {
  return send<Page<StoreMemberOrder>>(`/member/orders?page=${page}`, { cache: "no-store" });
}

export function fetchMemberPoints(page = 1): Promise<Page<StoreMemberPoint>> {
  return send<Page<StoreMemberPoint>>(`/member/points?page=${page}`, { cache: "no-store" });
}

/** ຕັ້ງ PIN ຈາກໜ້າບິນ (ບິນເວັບທີ່ຊຳລະແລ້ວ) ແລະ ເຂົ້າລະບົບທັນທີ */
export function setOrderPin(token: string, pin: string): Promise<{ member: StoreMember }> {
  return send<{ member: StoreMember }>(`/orders/${encodeURIComponent(token)}/pin`, postJson({ pin }));
}

/** error ນີ້ໝາຍຄວາມວ່າບໍ່ມີ session ສະມາຊິກ (proxy ລຶບ cookie ແລ້ວ) */
export function isMemberRequired(error: unknown): boolean {
  return error instanceof ClientApiError && error.status === 401 && error.code === "MEMBER_REQUIRED";
}

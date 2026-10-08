import type { LoginInput, Permission } from "@oca/shared";

export const API_BASE = "/api";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
}

export interface Session {
  accessToken: string;
  user: SessionUser;
}

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
    /** ລະຫັດຄົງທີ່ຈາກ API (spec §6.2); undefined ຖ້າ response ບໍ່ມີ */
    readonly code?: string,
    /** body ທັງກ້ອນ ເພື່ອອ່ານ field ສະເພາະ ເຊັ່ນ `shortages` ຂອງ INSUFFICIENT_STOCK */
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** header ເພີ່ມເຕີມ (ເຊັ່ນ `Idempotency-Key`); Content-Type/Authorization ຂອງລະບົບຊະນະເມື່ອຊ້ຳ */
  headers?: Record<string, string>;
}

/** Endpoint ທີ່ບໍ່ຄວນ refresh ເມື່ອໄດ້ 401 (ຜິດ credentials ຫຼື refresh ເອງລົ້ມ). */
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

const SYSTEM_HEADERS = new Set(["content-type", "authorization"]);

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onSessionRefreshed: ((session: Session) => void) | null = null;
let refreshInFlight: Promise<Session | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** ຖືກເອີ້ນເມື່ອ session ໝົດແທ້ (refresh ລົ້ມ). AuthProvider ໃຊ້ເພື່ອສົ່ງໄປ /login. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** ຖືກເອີ້ນທຸກຄັ້ງທີ່ refresh ສຳເລັດ ເພື່ອໃຫ້ AuthProvider ອັບເດດ user/permissions. */
export function setSessionRefreshedHandler(handler: ((session: Session) => void) | null): void {
  onSessionRefreshed = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || `HTTP ${response.status}`;
  let issues: ApiIssue[] = [];
  let code: string | undefined;
  let parsed: Record<string, unknown> | undefined;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    parsed = body;
    if (typeof body.message === "string") message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join(", ");
    if (Array.isArray(body.issues)) issues = body.issues as ApiIssue[];
    if (typeof body.code === "string") code = body.code;
  } catch {
    // body ບໍ່ແມ່ນ JSON: ໃຊ້ statusText
  }
  return new ApiError(response.status, message, issues, code, parsed);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  // ຊື່ header ບໍ່ແຍກຕົວອັກສອນ: ຕັດ content-type/authorization ຂອງຜູ້ເອີ້ນອອກທຸກແບບຂຽນ ເພື່ອໃຫ້ຂອງລະບົບຊະນະສະເໝີ
  const headers: Record<string, string> = Object.fromEntries(
    Object.entries(options.headers ?? {}).filter(([name]) => !SYSTEM_HEADERS.has(name.toLowerCase())),
  );
  // FormData (ອັບໂຫຼດໄຟລ໌): ໃຫ້ browser ຕັ້ງ Content-Type + boundary ເອງ
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    credentials: "same-origin",
  });
}

async function requestRefresh(): Promise<Session | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" });
  if (!response.ok) return null;
  return (await response.json()) as Session;
}

/**
 * Refresh ຄັ້ງດຽວຕໍ່ເທື່ອ (single-flight ໃນ tab). API ຫມຸນ refresh token ແລະ revoke ທັງ family ເມື່ອໃຊ້ຊ້ຳ
 * ຈຶ່ງ serialise ຂ້າມ tab ດ້ວຍ Web Locks: tab ທີ່ສອງສົ່ງ cookie ທີ່ຖືກຫມຸນແລ້ວ (cookie jar ຮ່ວມກັນ).
 * network ລົ້ມ ຫຼື ບໍ່ ok = ບໍ່ມີ session.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const session =
        typeof navigator !== "undefined" && navigator.locks
          ? await navigator.locks.request("oca-refresh", requestRefresh)
          : await requestRefresh();
      if (!session) {
        setAccessToken(null);
        return null;
      }
      setAccessToken(session.accessToken);
      onSessionRefreshed?.(session);
      return session;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** ສົ່ງ request ພ້ອມ token; 401 → refresh (single-flight) ແລ້ວລອງໃໝ່ 1 ຄັ້ງ */
async function authorizedSend(path: string, options: RequestOptions): Promise<Response> {
  const usedToken = accessToken;
  const response = await send(path, options);
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) return response;

  // 401: ຖ້າ request ອື່ນ refresh ໄປແລ້ວ (token ປ່ຽນ) ລອງໃໝ່ເລີຍ; ບໍ່ດັ່ງນັ້ນ refresh (single-flight).
  const recovered = accessToken !== null && accessToken !== usedToken ? true : (await refreshSession()) !== null;
  if (!recovered) {
    onUnauthorized?.();
    return response;
  }
  const retry = await send(path, options);
  if (retry.status === 401) {
    setAccessToken(null);
    onUnauthorized?.();
  }
  return retry;
}

export async function apiFetch<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  return parse<T>(await authorizedSend(path, options));
}

/** ດາວໂຫຼດໄຟລ໌ (ເຊັ່ນ CSV) ດ້ວຍ token ຂອງ session; ຊື່ໄຟລ໌ຈາກ Content-Disposition (ບໍ່ມີ = fallback) */
export async function apiDownload(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const response = await authorizedSend(path, {});
  if (!response.ok) throw await toApiError(response);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  return { blob: await response.blob(), filename };
}

/** ໃຫ້ browser ບັນທຶກ blob ເປັນໄຟລ໌ */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function loginRequest(input: LoginInput): Promise<Session> {
  const session = await apiFetch<Session>("/auth/login", { method: "POST", body: input });
  setAccessToken(session.accessToken);
  return session;
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

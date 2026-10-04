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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
}

/** Endpoint ທີ່ບໍ່ຄວນ refresh ເມື່ອໄດ້ 401 (ຜິດ credentials ຫຼື refresh ເອງລົ້ມ). */
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
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

async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || `HTTP ${response.status}`;
  let issues: ApiIssue[] = [];
  try {
    const body = (await response.json()) as { message?: unknown; issues?: unknown };
    if (typeof body.message === "string") message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join(", ");
    if (Array.isArray(body.issues)) issues = body.issues as ApiIssue[];
  } catch {
    // body ບໍ່ແມ່ນ JSON: ໃຊ້ statusText
  }
  return new ApiError(response.status, message, issues);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });
}

/** Refresh ຄັ້ງດຽວຕໍ່ເທື່ອ (single-flight). network ລົ້ມ ຫຼື ບໍ່ ok = ບໍ່ມີ session. */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) {
        setAccessToken(null);
        return null;
      }
      const session = (await response.json()) as Session;
      setAccessToken(session.accessToken);
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

export async function apiFetch<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const usedToken = accessToken;
  const response = await send(path, options);
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) return parse<T>(response);

  // 401: ຖ້າ request ອື່ນ refresh ໄປແລ້ວ (token ປ່ຽນ) ລອງໃໝ່ເລີຍ; ບໍ່ດັ່ງນັ້ນ refresh (single-flight).
  const recovered = accessToken !== null && accessToken !== usedToken ? true : (await refreshSession()) !== null;
  if (!recovered) {
    onUnauthorized?.();
    return parse<T>(response);
  }
  const retry = await send(path, options);
  if (retry.status === 401) onUnauthorized?.();
  return parse<T>(retry);
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

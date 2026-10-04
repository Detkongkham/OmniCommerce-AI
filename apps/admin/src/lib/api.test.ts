import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  getAccessToken,
  loginRequest,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
} from "./api";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const session = (token: string) => ({
  accessToken: token,
  user: { id: "u1", email: "o@example.com", name: "Owner", roleId: "r1", roleName: "OWNER", permissions: ["staff:read"] },
});

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("ແນບ Bearer token ແລະ JSON body ໄປທີ່ /api", async () => {
    setAccessToken("tok");
    const fetchMock = mockFetch(() => json(200, { ok: true }));

    await expect(apiFetch("/staff", { method: "POST", body: { a: 1 } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/staff");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(headersOf(init).Authorization).toBe("Bearer tok");
    expect(headersOf(init)["Content-Type"]).toBe("application/json");
  });

  it("ໄດ້ 401 → refresh → ລອງໃໝ່ດ້ວຍ token ໃໝ່", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return json(200, session("new"));
      return headersOf(init).Authorization === "Bearer new" ? json(200, [{ id: "s1" }]) : json(401, { message: "Unauthorized" });
    });

    await expect(apiFetch("/staff")).resolves.toEqual([{ id: "s1" }]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/staff", "/api/auth/refresh", "/api/staff"]);
    expect(getAccessToken()).toBe("new");
  });

  it("refresh ລົ້ມ → ແຈ້ງ handler, ລ້າງ token ແລະ throw ApiError 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken("old");
    mockFetch((url) =>
      url === "/api/auth/refresh" ? json(401, { message: "Invalid refresh token" }) : json(401, { message: "Unauthorized" }),
    );

    await expect(apiFetch("/staff")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("ຫຼາຍ request ໄດ້ 401 ພ້ອມກັນ → refresh ພຽງຄັ້ງດຽວ", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch(async (url, init) => {
      if (url === "/api/auth/refresh") {
        await Promise.resolve();
        return json(200, session("new"));
      }
      return headersOf(init).Authorization === "Bearer new" ? json(200, { ok: true }) : json(401, {});
    });

    await Promise.all([apiFetch("/staff"), apiFetch("/roles")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("204 ໄດ້ undefined; error body ຖືກແປງເປັນ ApiError ພ້ອມ issues", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiFetch("/roles/x", { method: "DELETE" })).resolves.toBeUndefined();

    mockFetch(() => json(400, { message: "Validation failed", issues: [{ path: "name", message: "Required" }] }));
    await expect(apiFetch("/roles", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      message: "Validation failed",
      issues: [{ path: "name", message: "Required" }],
    });
  });
});

describe("auth requests", () => {
  it("login 401 ບໍ່ refresh ແລະ ບໍ່ແຈ້ງ handler", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetchMock = mockFetch(() => json(401, { message: "Invalid credentials" }));

    await expect(loginRequest({ email: "a@b.co", password: "password123" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("login ສຳເລັດເກັບ access token", async () => {
    mockFetch(() => json(200, session("tok")));
    const result = await loginRequest({ email: "a@b.co", password: "password123" });
    expect(result.user.email).toBe("o@example.com");
    expect(getAccessToken()).toBe("tok");
  });

  it("refreshSession: 401 ຫຼື network ລົ້ມ ໄດ້ null", async () => {
    mockFetch(() => json(401, {}));
    await expect(refreshSession()).resolves.toBeNull();

    mockFetch(() => {
      throw new Error("offline");
    });
    await expect(refreshSession()).resolves.toBeNull();
  });
});

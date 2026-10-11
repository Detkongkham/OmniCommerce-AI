import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  getAccessToken,
  loginRequest,
  refreshSession,
  setAccessToken,
  setSessionRefreshedHandler,
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
  setSessionRefreshedHandler(null);
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

  it("headers ເພີ່ມເຕີມ (ເຊັ່ນ Idempotency-Key) ຖືກສົ່ງພ້ອມ Authorization; ແລະ ຢູ່ຄົບຕອນ retry ຫຼັງ refresh", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return json(200, session("new"));
      return headersOf(init).Authorization === "Bearer new" ? json(201, { id: "o1" }) : json(401, {});
    });

    await apiFetch("/orders", { method: "POST", body: {}, headers: { "Idempotency-Key": "k-1" } });

    const orderCalls = fetchMock.mock.calls.filter((call) => call[0] === "/api/orders") as [string, RequestInit][];
    expect(orderCalls).toHaveLength(2);
    for (const [, init] of orderCalls) {
      expect(headersOf(init)["Idempotency-Key"]).toBe("k-1");
      expect(headersOf(init)["Content-Type"]).toBe("application/json");
    }
    expect(headersOf(orderCalls[1]![1]).Authorization).toBe("Bearer new");
  });

  it("header ຂອງຜູ້ເອີ້ນທີ່ຊື່ຕ່າງຂະໜາດຕົວອັກສອນ (content-type/authorization) ບໍ່ຢູ່ຄຽງ header ຂອງລະບົບ", async () => {
    setAccessToken("tok");
    const fetchMock = mockFetch(() => json(200, {}));
    await apiFetch("/orders", {
      method: "POST",
      body: {},
      headers: { "content-type": "text/plain", AUTHORIZATION: "Bearer evil", "Idempotency-Key": "k" },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const names = Object.keys(headersOf(init)).map((name) => name.toLowerCase());
    expect(names.filter((name) => name === "content-type")).toHaveLength(1);
    expect(names.filter((name) => name === "authorization")).toHaveLength(1);
    expect(headersOf(init)["Content-Type"]).toBe("application/json");
    expect(headersOf(init).Authorization).toBe("Bearer tok");
    expect(headersOf(init)["Idempotency-Key"]).toBe("k");
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

describe("apiFetch (token clearing & refreshed handler)", () => {
  it("refresh ສຳເລັດແຕ່ retry ຍັງ 401 → ລ້າງ token, ແຈ້ງ handler ຄັ້ງດຽວ, throw 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken("old");
    mockFetch((url) => (url === "/api/auth/refresh" ? json(200, session("new")) : json(401, { message: "Unauthorized" })));

    await expect(apiFetch("/staff")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("token ຖືກປ່ຽນໂດຍ request ອື່ນແລ້ວ → ລອງໃໝ່ດ້ວຍ token ໃໝ່ ໂດຍບໍ່ refresh", async () => {
    setAccessToken("old");
    const fetchMock = mockFetch((_url, init) => {
      if (headersOf(init).Authorization === "Bearer old") {
        setAccessToken("new");
        return json(401, {});
      }
      return json(200, { ok: true });
    });

    await expect(apiFetch("/staff")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/auth/refresh")).toBe(false);
    const last = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(headersOf(last[1]).Authorization).toBe("Bearer new");
  });

  it("/auth/logout ໄດ້ 401 ບໍ່ refresh ແລະ ບໍ່ແຈ້ງ handler", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken("old");
    const fetchMock = mockFetch(() => json(401, { message: "Unauthorized" }));

    await expect(apiFetch("/auth/logout", { method: "POST" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("401 → refresh → retry ແຈ້ງ sessionRefreshed handler ດ້ວຍ session ໃໝ່", async () => {
    const onRefreshed = vi.fn();
    setSessionRefreshedHandler(onRefreshed);
    setAccessToken("old");
    mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return json(200, session("new"));
      return headersOf(init).Authorization === "Bearer new" ? json(200, {}) : json(401, {});
    });

    await apiFetch("/staff");
    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(session("new"));
  });

  it("FormData: ສົ່ງຕົວມັນເອງ (ບໍ່ stringify) ແລະ ບໍ່ຕັ້ງ Content-Type ເພື່ອໃຫ້ browser ໃສ່ boundary", async () => {
    setAccessToken("tok");
    const fetchMock = mockFetch(() => json(201, { id: "s1" }));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    await apiFetch("/orders/o1/slips", { method: "POST", body: form });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(form);
    expect(headersOf(init)["Content-Type"]).toBeUndefined();
    expect(headersOf(init).Authorization).toBe("Bearer tok");
  });

  it("responseType blob: ຄືນ Blob; error ຍັງເປັນ ApiError", async () => {
    mockFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } }));
    const blob = await apiFetch<Blob>("/slips/s1/image", { responseType: "blob" });
    expect(blob.size).toBe(3);
    mockFetch(() => json(404, { code: "SLIP_NOT_FOUND", message: "Slip not found" }));
    await expect(apiFetch("/slips/s1/image", { responseType: "blob" })).rejects.toMatchObject({ status: 404, code: "SLIP_NOT_FOUND" });
  });
});

describe("refreshSession cross-tab lock", () => {
  it("ໃຊ້ navigator.locks.request('oca-refresh') ແລະ ຍັງໄດ້ session", async () => {
    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal("navigator", { locks: { request } });
    mockFetch(() => json(200, session("new")));

    await expect(refreshSession()).resolves.toEqual(session("new"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe("oca-refresh");
    expect(getAccessToken()).toBe("new");
  });
});

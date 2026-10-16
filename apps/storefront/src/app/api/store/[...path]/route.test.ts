// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const upstream = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "set-cookie": "x=1", "cache-control": "public" } });

describe("/api/store/* proxy", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("API_URL", "http://api.test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("POST: ສົ່ງຕໍ່ path, query, body ແລະ header ທີ່ອະນຸຍາດ; ແນບ X-Forwarded-For ຂອງລູກຄ້າ", async () => {
    fetchMock.mockResolvedValue(upstream({ orderNumber: "SO-1", token: "t" }, 201));
    const res = await POST(
      new Request("http://shop.test/api/store/orders?x=1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "k1",
          "x-forwarded-for": "203.0.113.9",
          cookie: "secret=1",
          authorization: "Bearer nope",
        },
        body: JSON.stringify({ a: 1 }),
      }),
      ctx("orders"),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ orderNumber: "SO-1", token: "t" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/store/orders?x=1");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("k1");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"a":1}');
  });

  it("X-Forwarded-For ຫຼາຍຄ່າ → ສົ່ງສະເພາະຄ່າສຸດທ້າຍ (ທີ່ proxy ໜ້າເວັບເພີ່ມ); ບໍ່ມີ → ບໍ່ສົ່ງ", async () => {
    fetchMock.mockImplementation(async () => upstream({}));
    await GET(new Request("http://shop.test/api/store/orders/tok", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } }), ctx("orders", "tok"));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-forwarded-for")).toBe("203.0.113.9");
    await GET(new Request("http://shop.test/api/store/orders/tok"), ctx("orders", "tok"));
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("x-forwarded-for")).toBeNull();
  });

  it("GET: ບໍ່ cache, ບໍ່ສົ່ງ body; response ບໍ່ມີ set-cookie ແລະ ເປັນ no-store", async () => {
    fetchMock.mockResolvedValue(upstream({ orderNumber: "SO-1" }));
    const res = await GET(new Request("http://shop.test/api/store/orders/a%2Fb"), ctx("orders", "a/b"));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/store/orders/a%2Fb");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("ສົ່ງຕໍ່ status ແລະ body ຂອງ error ຈາກ API", async () => {
    fetchMock.mockResolvedValue(upstream({ code: "PRICE_CHANGED", total: "240.00" }, 409));
    const res = await POST(new Request("http://shop.test/api/store/orders", { method: "POST", body: "{}" }), ctx("orders"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ code: "PRICE_CHANGED", total: "240.00" });
  });

  it("multipart: ສົ່ງ content-type (ມີ boundary) ແລະ bytes ຕາມເດີມ", async () => {
    fetchMock.mockResolvedValue(upstream({ status: "REVIEWING" }, 201));
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "slip.png", { type: "image/png" }));
    const request = new Request("http://shop.test/api/store/orders/tok/slips", { method: "POST", body: form });
    const res = await POST(request, ctx("orders", "tok", "slips"));
    expect(res.status).toBe(201);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    expect((init?.body as ArrayBuffer).byteLength).toBeGreaterThan(3);
  });

  it("body ໃຫຍ່ເກີນ (ຕາມ content-length) → 413 ໂດຍບໍ່ເອີ້ນ API", async () => {
    const res = await POST(
      new Request("http://shop.test/api/store/orders/tok/slips", { method: "POST", headers: { "content-length": String(20 * 1024 * 1024) }, body: "x" }),
      ctx("orders", "tok", "slips"),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("member session cookie (oca_member)", () => {
    const login = (path: string[], init: RequestInit = {}) =>
      POST(new Request(`http://shop.test/api/store/${path.join("/")}`, { method: "POST", body: "{}", ...init }), ctx(...path));
    const member = { id: "m1", phone: "2055551234", name: "Ana" };

    it("ມີ cookie → ສົ່ງ Authorization: Bearer ໄປ API", async () => {
      fetchMock.mockResolvedValue(upstream({ id: "m1" }));
      await GET(new Request("http://shop.test/api/store/member/me", { headers: { cookie: "a=1; oca_member=tok123" } }), ctx("member", "me"));
      const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(headers.get("authorization")).toBe("Bearer tok123");
      expect(headers.get("cookie")).toBeNull();
    });

    it("ບໍ່ສົ່ງ authorization ຈາກ browser; ໃຊ້ແຕ່ cookie", async () => {
      fetchMock.mockImplementation(async () => upstream({}));
      await GET(new Request("http://shop.test/api/store/member/me", { headers: { authorization: "Bearer evil" } }), ctx("member", "me"));
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBeNull();
      await GET(
        new Request("http://shop.test/api/store/member/me", { headers: { authorization: "Bearer evil", cookie: "oca_member=good" } }),
        ctx("member", "me"),
      );
      expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer good");
    });

    it("login ສຳເລັດ → ຕັ້ງ cookie (httpOnly, Lax, 30 ມື້, path /) ແລະ ຕັດ memberToken ອອກຈາກ body", async () => {
      fetchMock.mockResolvedValue(upstream({ memberToken: "tok-login", member }));
      const res = await login(["member", "login"]);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ member });
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^oca_member=tok-login;/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Max-Age=2592000/);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Secure/i);
      expect(cookie).not.toContain("x=1");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("ຕັ້ງ PIN ຫຼັງສັ່ງຊື້ (201) → ຕັ້ງ cookie ຄືກັນ", async () => {
      fetchMock.mockResolvedValue(upstream({ memberToken: "tok-pin", member }, 201));
      const res = await login(["orders", "ord-tok", "pin"]);
      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual({ member });
      expect(res.headers.get("set-cookie")).toMatch(/^oca_member=tok-pin;/);
    });

    it("production → cookie ມີ Secure", async () => {
      vi.stubEnv("NODE_ENV", "production");
      fetchMock.mockResolvedValue(upstream({ memberToken: "tok-login", member }));
      const res = await login(["member", "login"]);
      expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
    });

    it("path ອື່ນທີ່ body ມີ memberToken → ບໍ່ແຕະ", async () => {
      fetchMock.mockResolvedValue(upstream({ memberToken: "x", member }, 201));
      const res = await login(["orders"]);
      await expect(res.json()).resolves.toEqual({ memberToken: "x", member });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("login ລົ້ມເຫຼວ → ບໍ່ຕັ້ງ cookie, ສົ່ງ error ຕໍ່", async () => {
      fetchMock.mockResolvedValue(upstream({ statusCode: 401, code: "INVALID_PIN", message: "x" }, 401));
      const res = await login(["member", "login"]);
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ code: "INVALID_PIN" });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("POST member/logout → ລຶບ cookie, 204, ບໍ່ເອີ້ນ API", async () => {
      const res = await login(["member", "logout"], { headers: { cookie: "oca_member=tok" } });
      expect(res.status).toBe(204);
      expect(fetchMock).not.toHaveBeenCalled();
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^oca_member=;/);
      expect(cookie).toMatch(/Max-Age=0/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\//);
    });

    it("API ຕອບ 401 MEMBER_REQUIRED → ສົ່ງຕໍ່ ແລະ ລຶບ cookie", async () => {
      fetchMock.mockResolvedValue(upstream({ statusCode: 401, code: "MEMBER_REQUIRED", message: "x" }, 401));
      const res = await GET(new Request("http://shop.test/api/store/member/me", { headers: { cookie: "oca_member=old" } }), ctx("member", "me"));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ code: "MEMBER_REQUIRED" });
      expect(res.headers.get("set-cookie")).toMatch(/^oca_member=;.*Max-Age=0/);
    });

    it("path ຕົວພິມໃຫຍ່ (Member/Login, orders/t/PIN) → ຍັງຕັ້ງ cookie ແລະ ຕັດ token", async () => {
      fetchMock.mockImplementation(async () => upstream({ memberToken: "tok-case", member }));
      for (const path of [["Member", "Login"], ["orders", "t", "PIN"]]) {
        const res = await login(path);
        await expect(res.json()).resolves.toEqual({ member });
        expect(res.headers.get("set-cookie")).toMatch(/^oca_member=tok-case;/);
      }
    });

    it("path member/* ອື່ນທີ່ body ມີ memberToken → ຕັດ token ອອກ ແຕ່ບໍ່ຕັ້ງ cookie", async () => {
      fetchMock.mockResolvedValue(upstream({ memberToken: "leak", id: "m1" }));
      const res = await GET(new Request("http://shop.test/api/store/MEMBER/me"), ctx("MEMBER", "me"));
      await expect(res.json()).resolves.toEqual({ id: "m1" });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("login 2xx ທີ່ body ບໍ່ແມ່ນ JSON → ສົ່ງຕໍ່ຕາມເດີມ, ບໍ່ຕັ້ງ cookie", async () => {
      fetchMock.mockResolvedValue(new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
      const res = await login(["member", "login"]);
      expect(res.status).toBe(200);
      await expect(res.text()).resolves.toBe("not json");
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("login 2xx ທີ່ບໍ່ມີ memberToken → ສົ່ງ body ຕໍ່, ບໍ່ຕັ້ງ cookie", async () => {
      fetchMock.mockResolvedValue(upstream({ member }));
      const res = await login(["member", "login"]);
      await expect(res.json()).resolves.toEqual({ member });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("cookie ຮູບແບບຜິດ → ເປັນ guest (ບໍ່ສົ່ງ authorization), ບໍ່ 500, ລຶບ cookie", async () => {
      fetchMock.mockResolvedValue(upstream({ ok: true }));
      const res = await GET(new Request("http://shop.test/api/store/config", { headers: { cookie: "oca_member=a%0D%0Ab" } }), ctx("config"));
      expect(res.status).toBe(200);
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBeNull();
      expect(res.headers.get("set-cookie")).toMatch(/^oca_member=;.*Max-Age=0/);
    });

    it("logout ຈາກເວັບອື່ນ (Sec-Fetch-Site ຫຼື Origin ຕ່າງ) → 403, ບໍ່ລຶບ cookie", async () => {
      const crossSite: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "http://evil.test" }];
      for (const headers of crossSite) {
        const res = await login(["member", "logout"], { headers });
        expect(res.status).toBe(403);
        expect(res.headers.get("set-cookie")).toBeNull();
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logout ຈາກເວັບດຽວກັນ (same-origin / none / Origin ກົງ) → 204", async () => {
      const sameSite: Record<string, string>[] = [{ "sec-fetch-site": "same-origin", origin: "http://shop.test" }, { "sec-fetch-site": "none" }, { origin: "http://shop.test" }];
      for (const headers of sameSite) {
        const res = await login(["Member", "Logout"], { headers });
        expect(res.status).toBe(204);
        expect(res.headers.get("set-cookie")).toMatch(/^oca_member=;/);
      }
    });

    it("API ຕອບ 401 code ອື່ນ → ບໍ່ລຶບ cookie", async () => {
      fetchMock.mockResolvedValue(upstream({ statusCode: 401, code: "SOMETHING_ELSE", message: "x" }, 401));
      const res = await GET(new Request("http://shop.test/api/store/member/me", { headers: { cookie: "oca_member=old" } }), ctx("member", "me"));
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });

  it("API ຕິດຕໍ່ບໍ່ໄດ້ → 502 ພ້ອມ code ທີ່ເວັບເຂົ້າໃຈ", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET(new Request("http://shop.test/api/store/config"), ctx("config"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ code: "NETWORK" });
  });
});

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

  it("API ຕິດຕໍ່ບໍ່ໄດ້ → 502 ພ້ອມ code ທີ່ເວັບເຂົ້າໃຈ", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET(new Request("http://shop.test/api/store/config"), ctx("config"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ code: "NETWORK" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreApiError, getProduct, listProducts, storeFetch } from "./store-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("store-api", () => {
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

  it("ເອີ້ນ API_URL + path ແລະ ສົ່ງ revalidate 60 ວິ ເປັນຄ່າເລີ່ມຕົ້ນ", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await expect(storeFetch("/store/config")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/store/config", { next: { revalidate: 60 } });
  });

  it("ບໍ່ຕັ້ງ API_URL → http://localhost:3001; / ທ້າຍ API_URL ບໍ່ເຮັດໃຫ້ຊ້ຳ", async () => {
    vi.stubEnv("API_URL", "");
    fetchMock.mockImplementation(async () => json({}));
    await storeFetch("/store/config");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3001/store/config");
    vi.stubEnv("API_URL", "http://api.test/");
    await storeFetch("/store/config");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://api.test/store/config");
  });

  it("status ທີ່ບໍ່ສຳເລັດ → StoreApiError ພ້ອມ status ແລະ code", async () => {
    fetchMock.mockResolvedValue(json({ code: "TOO_MANY_ATTEMPTS" }, 429));
    const error = await storeFetch("/store/config").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StoreApiError);
    expect(error).toMatchObject({ status: 429, code: "TOO_MANY_ATTEMPTS" });
  });

  it("listProducts: ສົ່ງສະເພາະ query ທີ່ມີຄ່າ ແລະ encode ຂໍ້ຄວາມ", async () => {
    fetchMock.mockImplementation(async () => json({ items: [], total: 0, page: 1, pageSize: 24 }));
    await listProducts({ category: "shirts", q: "ເສື້ອ ດຳ", page: 2 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://api.test/store/products?category=shirts&q=${encodeURIComponent("ເສື້ອ ດຳ").replaceAll("%20", "+")}&page=2`,
    );
    await listProducts({});
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://api.test/store/products");
  });

  it("getProduct: 404 → null; slug ຖືກ encode; error ອື່ນ throw", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "PRODUCT_NOT_FOUND" }, 404));
    await expect(getProduct("a/b")).resolves.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/store/products/a%2Fb");
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(getProduct("x")).rejects.toBeInstanceOf(StoreApiError);
  });
});

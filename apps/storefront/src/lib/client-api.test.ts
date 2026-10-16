import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClientApiError,
  checkCart,
  createOrder,
  fetchMember,
  fetchMemberOrders,
  fetchMemberPoints,
  fetchOrder,
  isMemberRequired,
  memberLogin,
  memberLogout,
  setOrderPin,
  uploadSlip,
} from "./client-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("client-api", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("checkCart: POST /api/store/cart/check ດ້ວຍ JSON", async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: "0.00" }));
    await expect(checkCart([{ variantId: "v1", quantity: 2 }])).resolves.toMatchObject({ total: "0.00" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/store/cart/check");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ items: [{ variantId: "v1", quantity: 2 }] });
  });

  it("createOrder: ສົ່ງ Idempotency-Key", async () => {
    fetchMock.mockResolvedValue(json({ orderNumber: "SO-1", token: "t" }, 201));
    const body = { items: [], name: "ກ", phone: "020", address: "a", courierId: "c", branch: "b", expectedTotal: "1" };
    await expect(createOrder(body, "key-1")).resolves.toEqual({ orderNumber: "SO-1", token: "t" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/store/orders");
    expect(init?.headers).toMatchObject({ "Idempotency-Key": "key-1" });
  });

  it("fetchOrder: GET ບໍ່ cache, token ຖືກ encode", async () => {
    fetchMock.mockResolvedValue(json({ orderNumber: "SO-1" }));
    await fetchOrder("a/b");
    expect(fetchMock.mock.calls[0]).toEqual(["/api/store/orders/a%2Fb", { cache: "no-store" }]);
  });

  it("uploadSlip: multipart field ຊື່ file (ບໍ່ຕັ້ງ Content-Type ເອງ)", async () => {
    fetchMock.mockResolvedValue(json({ status: "REVIEWING" }, 201));
    const file = new File(["x"], "slip.png", { type: "image/png" });
    await expect(uploadSlip("tok", file)).resolves.toEqual({ status: "REVIEWING" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/store/orders/tok/slips");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init?.headers).toBeUndefined();
  });

  it("status ບໍ່ສຳເລັດ → ClientApiError ພ້ອມ status, code ແລະ body", async () => {
    fetchMock.mockResolvedValue(json({ code: "PRICE_CHANGED", total: "240.00" }, 409));
    const error = await checkCart([]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ClientApiError);
    expect(error).toMatchObject({ status: 409, code: "PRICE_CHANGED", body: { total: "240.00" } });
  });

  it("body ບໍ່ແມ່ນ JSON (ເຊັ່ນ 502 ຈາກ proxy) → code undefined; ເຄືອຂ່າຍລົ້ມ → code NETWORK", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(checkCart([])).rejects.toMatchObject({ status: 502, code: undefined });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(checkCart([])).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("checkCart: ສົ່ງ pointsToRedeem ສະເພາະເມື່ອ > 0", async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    await checkCart([{ variantId: "v1", quantity: 1 }], undefined, 0);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ items: [{ variantId: "v1", quantity: 1 }] });
    await checkCart([{ variantId: "v1", quantity: 1 }], "SAVE", 30);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ items: [{ variantId: "v1", quantity: 1 }], couponCode: "SAVE", pointsToRedeem: 30 });
  });

  it("ສະມາຊິກ: login, me, ປະຫວັດ, ຕັ້ງ PIN ແລະ logout ໄປທີ່ path ຂອງ proxy", async () => {
    fetchMock.mockImplementation(async () => json({ member: { name: "ກ" } }));
    await memberLogin("02055555555", "123456");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/store/member/login");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ phone: "02055555555", pin: "123456" });
    await fetchMember();
    expect(fetchMock.mock.calls[1]).toEqual(["/api/store/member/me", { cache: "no-store" }]);
    await fetchMemberOrders(2);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/store/member/orders?page=2");
    await fetchMemberPoints();
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/store/member/points?page=1");
    await setOrderPin("t/k", "654321");
    expect(fetchMock.mock.calls[4]?.[0]).toBe("/api/store/orders/t%2Fk/pin");
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toEqual({ pin: "654321" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(memberLogout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[5]).toEqual(["/api/store/member/logout", { method: "POST" }]);
  });

  it("isMemberRequired: ສະເພາະ 401 MEMBER_REQUIRED", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "MEMBER_REQUIRED" }, 401));
    expect(isMemberRequired(await fetchMember().catch((error: unknown) => error))).toBe(true);
    fetchMock.mockResolvedValueOnce(json({ code: "MEMBER_LOGIN_FAILED" }, 401));
    expect(isMemberRequired(await memberLogin("1", "2").catch((error: unknown) => error))).toBe(false);
  });
});

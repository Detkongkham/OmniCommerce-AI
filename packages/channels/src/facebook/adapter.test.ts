import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_BASE_URL, FacebookAdapter, type FacebookAdapterConfig } from "./adapter";
import { signBody } from "./signature";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function make(fetchImpl: typeof fetch, overrides: Partial<FacebookAdapterConfig> = {}) {
  return new FacebookAdapter({
    appSecret: "secret",
    verifyToken: "verify-me",
    pageAccessToken: "tok",
    graphBaseUrl: "http://graph.test/v1",
    fetch: fetchImpl,
    ...overrides,
  });
}

describe("FacebookAdapter.sendText", () => {
  it("POST /me/messages ດ້ວຍ Bearer token ແລະ body ຕາມ Send API; ຄືນ message_id", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { recipient_id: "U1", message_id: "m_1" }),
    );
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "ສະບາຍດີ");
    expect(result).toEqual({ ok: true, externalId: "m_1" });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://graph.test/v1/me/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init?.body))).toEqual({
      recipient: { id: "U1" },
      messaging_type: "RESPONSE",
      message: { text: "ສະບາຍດີ" },
    });
    expect(String(url)).not.toContain("tok");
  });

  it("ບໍ່ມີ page token → CHANNEL_NOT_CONFIGURED ໂດຍບໍ່ເອີ້ນເຄືອຂ່າຍ", async () => {
    const fetchImpl = vi.fn();
    const result = await make(fetchImpl as unknown as typeof fetch, { pageAccessToken: undefined }).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code: "CHANNEL_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [400, { error: { message: "(#10) This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } }, "OUTSIDE_WINDOW"],
    [400, { error: { message: "(#200) This message is sent outside of allowed window", code: 200 } }, "OUTSIDE_WINDOW"],
    [400, { error: { message: "Invalid OAuth access token.", code: 190 } }, "CHANNEL_AUTH"],
    [401, { error: { message: "nope" } }, "CHANNEL_AUTH"],
    [500, { error: { message: "boom", code: 1 } }, "CHANNEL_UNAVAILABLE"],
    [429, { error: { message: "slow down", code: 4 } }, "CHANNEL_UNAVAILABLE"],
    [400, { error: { message: "(#100) bad param", code: 100 } }, "SEND_REJECTED"],
    [400, "not json", "SEND_REJECTED"],
  ])("Graph %i → %s", async (status, body, code) => {
    const fetchImpl = vi.fn(async () => json(status, body));
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code });
  });

  it("200 ແຕ່ບໍ່ມີ message_id = SEND_REJECTED", async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    expect(await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x")).toMatchObject({ ok: false, code: "SEND_REJECTED" });
  });

  it("ເຄືອຂ່າຍລົ້ມ/timeout → CHANNEL_UNAVAILABLE ແລະ detail ບໍ່ມີ token", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const result = await make(fetchImpl as unknown as typeof fetch).sendText("U1", "x");
    expect(result).toMatchObject({ ok: false, code: "CHANNEL_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("tok");
  });
});

describe("FacebookAdapter.fetchProfile", () => {
  it("ຄືນຊື່ເຕັມຈາກ first_name + last_name", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { id: "U1", first_name: "Somchai", last_name: "Vong" }),
    );
    expect(await make(fetchImpl as unknown as typeof fetch).fetchProfile("U1")).toEqual({ name: "Somchai Vong" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://graph.test/v1/U1?fields=first_name%2Clast_name");
  });
  it("ລົ້ມ/ບໍ່ມີຊື່/ບໍ່ມີ token = null", async () => {
    expect(await make((async () => json(400, { error: {} })) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make((async () => json(200, { id: "U1" })) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make((async () => { throw new Error("x"); }) as unknown as typeof fetch).fetchProfile("U1")).toBeNull();
    expect(await make(vi.fn() as unknown as typeof fetch, { pageAccessToken: undefined }).fetchProfile("U1")).toBeNull();
  });
});

describe("FacebookAdapter webhook helpers", () => {
  const adapter = make(vi.fn() as unknown as typeof fetch);
  it("verifySignature ໃຊ້ app secret", () => {
    const body = Buffer.from("{}");
    expect(adapter.verifySignature(body, signBody("secret", body))).toBe(true);
    expect(adapter.verifySignature(body, signBody("other", body))).toBe(false);
  });
  it("verifyHandshake ຕ້ອງ mode=subscribe ແລະ token ຕົງ", () => {
    expect(adapter.verifyHandshake("subscribe", "verify-me")).toBe(true);
    expect(adapter.verifyHandshake("subscribe", "nope")).toBe(false);
    expect(adapter.verifyHandshake("unsubscribe", "verify-me")).toBe(false);
    expect(adapter.verifyHandshake(undefined, undefined)).toBe(false);
  });
  it("canReceive ຕ້ອງມີທັງ appSecret ແລະ verifyToken; default base URL", () => {
    expect(adapter.canReceive).toBe(true);
    expect(new FacebookAdapter({ appSecret: "s" }).canReceive).toBe(false);
    expect(new FacebookAdapter({}).canReceive).toBe(false);
    expect(DEFAULT_GRAPH_BASE_URL).toBe("https://graph.facebook.com/v21.0");
  });
});

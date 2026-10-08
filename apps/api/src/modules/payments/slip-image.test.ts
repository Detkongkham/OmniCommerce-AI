import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { SlipImageError, detectImageMime, fetchImageBytes, sha256Hex } from "./slip-image";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe("detectImageMime", () => {
  it("ຮູ້ຈັກ png/jpeg/webp ຈາກ magic bytes", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(WEBP)).toBe("image/webp");
  });
  it("ປະຕິເສດຢ່າງອື່ນ (gif, text, ວ່າງ, ສັ້ນເກີນ, RIFF ທີ່ບໍ່ແມ່ນ WEBP)", () => {
    expect(detectImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("ຄ່າຮູ້ຈັກ", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("fetchImageBytes", () => {
  const opts = { allowHttp: false, maxBytes: 100, timeoutMs: 1000 };
  const okResponse = (body: Uint8Array, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers });
  const fetchReturning = (response: Response) => (async () => response) as unknown as typeof fetch;

  it("ດາວໂຫຼດສຳເລັດ", async () => {
    const bytes = await fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: fetchReturning(okResponse(PNG)) });
    expect(Array.from(bytes)).toEqual(Array.from(PNG));
  });

  it("ໃຊ້ redirect: 'error' ແລະ ສົ່ງ signal ເພື່ອ timeout", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return okResponse(PNG);
    }) as unknown as typeof fetch;
    await fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl });
    expect(seen?.redirect).toBe("error");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("http ຖືກຫ້າມເມື່ອ allowHttp=false ແຕ່ໄດ້ເມື່ອ true; ໂປຣໂຕຄອນອື່ນຫ້າມສະເໝີ", async () => {
    const fetchImpl = fetchReturning(okResponse(PNG));
    await expect(fetchImageBytes("http://cdn.example/x.png", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    await expect(fetchImageBytes("http://localhost/x.png", { ...opts, allowHttp: true, fetchImpl })).resolves.toBeDefined();
    await expect(fetchImageBytes("file:///etc/passwd", { ...opts, allowHttp: true, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    await expect(fetchImageBytes("not a url", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
  });

  it("ສະຖານະບໍ່ແມ່ນ 2xx, content-length ເກີນ, ຫຼື body ເກີນຂະໜາດ → SlipImageError", async () => {
    const run = (response: Response) =>
      fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: fetchReturning(response) });
    await expect(run(new Response("no", { status: 403 }))).rejects.toBeInstanceOf(SlipImageError);
    await expect(run(okResponse(PNG, { "content-length": "101" }))).rejects.toBeInstanceOf(SlipImageError);
    await expect(run(okResponse(new Uint8Array(101)))).rejects.toBeInstanceOf(SlipImageError);
  });

  it("fetch throw (ເຄືອຂ່າຍ/timeout/redirect) → SlipImageError", async () => {
    const fetchImpl = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
  });
});

describe("fetchImageBytes: ຄວາມປອດໄພ (SSRF/redirect/credentials)", () => {
  const opts = { allowHttp: false, maxBytes: 100, timeoutMs: 1000 };
  const countingFetch = () => {
    const state = { calls: 0 };
    const fetchImpl = (async () => {
      state.calls += 1;
      return new Response(PNG, { status: 200 });
    }) as unknown as typeof fetch;
    return { state, fetchImpl };
  };

  it("ຕອບ 302 ຈາກ stub ບໍ່ຖືກຕາມ ແລະ ຖືກປະຕິເສດ", async () => {
    let calls = 0;
    const redirecting = (async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    }) as unknown as typeof fetch;
    await expect(fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: redirecting })).rejects.toBeInstanceOf(SlipImageError);
    expect(calls).toBe(1);
  });

  it("fetch ຈິງຂອງ node ບໍ່ຕາມ redirect (ເຊີບເວີ loopback ຊົ່ວຄາວ, allowHttp=true)", async () => {
    let hits = 0;
    const server = createServer((req, res) => {
      hits += 1;
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
      } else {
        res.writeHead(200);
        res.end(Buffer.from(PNG));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await expect(
        fetchImageBytes(`http://127.0.0.1:${port}/start`, { ...opts, allowHttp: true, fetchImpl: fetch }),
      ).rejects.toBeInstanceOf(SlipImageError);
      expect(hits).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("ປະຕິເສດ credentials ໃນ URL ສະເໝີ", async () => {
    const { state, fetchImpl } = countingFetch();
    for (const allowHttp of [false, true]) {
      await expect(fetchImageBytes("https://user:pass@cdn.example/x.png", { ...opts, allowHttp, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
      await expect(fetchImageBytes("https://user@cdn.example/x.png", { ...opts, allowHttp, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    }
    expect(state.calls).toBe(0);
  });

  it("ປະຕິເສດໂປຣໂຕຄອນອື່ນ (ftp, data, javascript, ws, gopher) ເຖິງ allowHttp=true", async () => {
    const { state, fetchImpl } = countingFetch();
    for (const url of ["ftp://cdn.example/x.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "wss://cdn.example/x", "gopher://cdn.example/"]) {
      await expect(fetchImageBytes(url, { ...opts, allowHttp: true, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    }
    expect(state.calls).toBe(0);
  });

  it("allowHttp=false: ປະຕິເສດ host ພາຍໃນ (localhost, loopback, private, link-local, metadata, IPv6, IPv4-mapped, ຮູບແບບເລກຖານອື່ນ)", async () => {
    const { state, fetchImpl } = countingFetch();
    const blocked = [
      "https://localhost/x.png",
      "https://LOCALHOST./x.png",
      "https://api.localhost/x.png",
      "https://printer.local/x.png",
      "https://db.internal/x.png",
      "https://127.0.0.1/x.png",
      "https://127.1/x.png",
      "https://2130706433/x.png",
      "https://0x7f000001/x.png",
      "https://0.0.0.0/x.png",
      "https://10.1.2.3/x.png",
      "https://172.16.0.1/x.png",
      "https://172.31.255.255/x.png",
      "https://192.168.1.1/x.png",
      "https://169.254.169.254/latest/meta-data",
      "https://100.64.0.1/x.png",
      "https://[::1]/x.png",
      "https://[::]/x.png",
      "https://[fe80::1]/x.png",
      "https://[fc00::1]/x.png",
      "https://[fd12:3456::1]/x.png",
      "https://[::ffff:127.0.0.1]/x.png",
      "https://[::ffff:10.0.0.1]/x.png",
    ];
    for (const url of blocked) {
      await expect(fetchImageBytes(url, { ...opts, fetchImpl }), url).rejects.toBeInstanceOf(SlipImageError);
    }
    expect(state.calls).toBe(0);
  });

  it("allowHttp=false: host ສາທາລະນະ (ລວມ 172.32.x, 8.8.8.8, IPv6 ສາທາລະນະ) ຜ່ານ guard", async () => {
    const { fetchImpl } = countingFetch();
    for (const url of ["https://cdn.example/x.png", "https://172.32.0.1/x.png", "https://8.8.8.8/x.png", "https://[2606:4700::1111]/x.png", "https://localhost.example.com/x.png"]) {
      await expect(fetchImageBytes(url, { ...opts, fetchImpl }), url).resolves.toBeDefined();
    }
  });

  it("allowHttp=true (dev/simulator): ຂ້າມ guard ຂອງ host ພາຍໃນ", async () => {
    const { fetchImpl } = countingFetch();
    for (const url of ["http://localhost:4010/x.png", "http://127.0.0.1:4010/x.png", "http://[::1]:4010/x.png", "https://10.0.0.5/x.png"]) {
      await expect(fetchImageBytes(url, { ...opts, allowHttp: true, fetchImpl }), url).resolves.toBeDefined();
    }
  });

  it("content-length ນ້ອຍກວ່າ body ຈິງ (ຕົວເລກຕົວະ) ຍັງຖືກຈຳກັດຕອນ stream", async () => {
    const lying = new Response(new Uint8Array(500), { status: 200, headers: { "content-length": "10" } });
    await expect(
      fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: (async () => lying) as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(SlipImageError);
  });

  it("ຍົກເລີກ stream ທີ່ເກີນຂະໜາດ (cancel) ແລະ abort signal ຖືກສົ່ງຕໍ່ເຖິງ body (ຄ້າງ → reject)", async () => {
    let cancelled = false;
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: (async () => new Response(big)) as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(SlipImageError);
    expect(cancelled).toBe(true);

    const hanging = (async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
        },
      });
      return new Response(body);
    }) as unknown as typeof fetch;
    await expect(fetchImageBytes("https://cdn.example/x.png", { ...opts, timeoutMs: 50, fetchImpl: hanging })).rejects.toBeInstanceOf(SlipImageError);
  });
});

describe("fetchImageBytes: ຍົກເລີກ body ທີ່ບໍ່ໄດ້ອ່ານ ແລະ header ບໍ່ຖືກຕ້ອງ", () => {
  const opts = { allowHttp: false, maxBytes: 100, timeoutMs: 1000 };
  const spiedBody = (rejectCancel = false) => {
    const state = { cancelled: 0 };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        state.cancelled += 1;
        if (rejectCancel) throw new Error("cancel failed");
      },
    });
    return { state, body };
  };
  const run = (response: Response) =>
    fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: (async () => response) as unknown as typeof fetch });

  it("status ບໍ່ແມ່ນ 2xx → cancel body", async () => {
    const { state, body } = spiedBody();
    await expect(run(new Response(body, { status: 403 }))).rejects.toBeInstanceOf(SlipImageError);
    expect(state.cancelled).toBe(1);
  });

  it("content-length ໃຫຍ່ເກີນ → cancel body", async () => {
    const { state, body } = spiedBody();
    await expect(run(new Response(body, { status: 200, headers: { "content-length": "101" } }))).rejects.toBeInstanceOf(SlipImageError);
    expect(state.cancelled).toBe(1);
  });

  it("cancel ທີ່ reject ບໍ່ປ່ຽນ error ຂອງ 'too large'", async () => {
    const { body } = spiedBody(true);
    await expect(run(new Response(body, { status: 200 }))).rejects.toThrow("Image is too large");
  });

  it("content-length: 'abc' ບໍ່ເຮັດໃຫ້ພັງ: ຖອຍໄປໃຊ້ cap ຕອນ stream", async () => {
    await expect(run(new Response(PNG, { status: 200, headers: { "content-length": "abc" } }))).resolves.toBeDefined();
    await expect(run(new Response(new Uint8Array(500), { status: 200, headers: { "content-length": "abc" } }))).rejects.toThrow("Image is too large");
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type StreamStatus, defaultSleep, runInboxStream } from "./inbox-stream";

const encoder = new TextEncoder();
const READY = "event: ready\ndata: {}\n\n";
const UPDATED = 'event: conversation.updated\ndata: {"type":"conversation.updated","conversationId":"c1"}\n\n';

function streamResponse(...chunks: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

/** fake clock: each call advances by dt (so ready -> end = a connection that lived dt) */
function clock(dt: number) {
  let t = 0;
  return () => (t += dt);
}

type Step = () => Response | Promise<Response>;

/** fetch ປອມທີ່ເດີນຕາມ steps; ໝົດ steps = abort ແລ້ວ throw (ຈົບ loop) */
function scripted(controller: AbortController, steps: Step[]) {
  const headers: (Record<string, string> | undefined)[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    headers.push(init?.headers as Record<string, string> | undefined);
    const step = steps.shift();
    if (!step) {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }
    return step();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, headers, calls: fetchImpl };
}

function setup(steps: Step[], overrides: Partial<Parameters<typeof runInboxStream>[0]> = {}) {
  const controller = new AbortController();
  const fetcher = scripted(controller, steps);
  const statuses: StreamStatus[] = [];
  const sleeps: number[] = [];
  const onChange = vi.fn();
  const options = {
    url: "/api/inbox/events",
    getToken: () => "tok",
    refresh: vi.fn(async () => "tok2"),
    onStatus: (status: StreamStatus) => statuses.push(status),
    onChange,
    signal: controller.signal,
    fetchImpl: fetcher.fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    baseMs: 1000,
    maxMs: 3000,
    ...overrides,
  };
  return { options, controller, fetcher, statuses, sleeps, onChange };
}

describe("runInboxStream", () => {
  it("ເຊື່ອມດ້ວຍ Bearer + Accept; ready → connected; conversation.updated → onChange; ປິດ → reconnecting; ເຊື່ອມໃໝ່ແລ້ວ ready → onChange (ອາດພາດ event)", async () => {
    const { options, fetcher, statuses, onChange } = setup([() => streamResponse(READY, UPDATED), () => streamResponse(READY)]);
    await runInboxStream(options);
    expect(fetcher.headers[0]).toEqual({ Accept: "text/event-stream", Authorization: "Bearer tok" });
    expect(statuses).toEqual(["connecting", "connected", "reconnecting", "connected", "reconnecting"]);
    // 1 ຄັ້ງຈາກ updated + 1 ຄັ້ງຈາກ ready ຫຼັງ reconnect; ready ຄັ້ງທຳອິດບໍ່ refetch
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ping ແລະ event ທີ່ບໍ່ຮູ້ຈັກຖືກຂ້າມ; ບໍ່ມີ token = ບໍ່ສົ່ງ Authorization", async () => {
    const { options, fetcher, onChange } = setup([() => streamResponse(READY, "event: ping\ndata: {}\n\n", "event: other\ndata: 1\n\n")], {
      getToken: () => null,
    });
    await runInboxStream(options);
    expect(onChange).not.toHaveBeenCalled();
    expect(fetcher.headers[0]).toEqual({ Accept: "text/event-stream" });
  });

  it("chunk ທີ່ຖືກຕັດກາງ frame ຍັງໄດ້ event", async () => {
    const { options, onChange } = setup([() => streamResponse("event: ready\nda", "ta: {}\n\nevent: conversation.upd", "ated\ndata: {}\n\n")]);
    await runInboxStream(options);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("401 → refresh ຄັ້ງດຽວ ແລ້ວລອງໃໝ່ດ້ວຍ token ໃໝ່", async () => {
    let token = "old";
    const { options, fetcher, statuses } = setup([() => new Response(null, { status: 401 }), () => streamResponse(READY)], {
      getToken: () => token,
      refresh: vi.fn(async () => {
        token = "new";
        return "new";
      }),
    });
    await runInboxStream(options);
    expect(options.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.headers[1]?.Authorization).toBe("Bearer new");
    expect(statuses).toContain("connected");
  });

  it("401 ສອງຄັ້ງຕິດ (ຫຼັງ refresh ແລ້ວ) = ເລີກ ບໍ່ວົນ; refresh ໄດ້ null = ເລີກທັນທີ", async () => {
    const twice = setup([() => new Response(null, { status: 401 }), () => new Response(null, { status: 401 }), () => streamResponse(READY)]);
    await runInboxStream(twice.options);
    expect(twice.fetcher.calls).toHaveBeenCalledTimes(2);
    expect(twice.options.refresh).toHaveBeenCalledTimes(1);
    expect(twice.statuses.at(-1)).toBe("disconnected");

    const none = setup([() => new Response(null, { status: 401 })], { refresh: vi.fn(async () => null) });
    await runInboxStream(none.options);
    expect(none.fetcher.calls).toHaveBeenCalledTimes(1);
    expect(none.statuses.at(-1)).toBe("disconnected");
  });

  it("401 separated by a 503 is not cumulative: refresh on each 401, then connects", async () => {
    const { options, statuses } = setup([
      () => new Response(null, { status: 401 }),
      () => new Response(null, { status: 503 }),
      () => new Response(null, { status: 401 }),
      () => streamResponse(READY),
    ]);
    await runInboxStream(options);
    expect(options.refresh).toHaveBeenCalledTimes(2);
    expect(statuses).toContain("connected");
    expect(statuses).not.toContain("disconnected");
  });

  it("503/ເຄືອຂ່າຍລົ້ມ → backoff ເພີ່ມເປັນສອງເທົ່າ ຕັນທີ່ maxMs; ເຊື່ອມສຳເລັດແລ້ວກັບໄປ baseMs", async () => {
    const { options, sleeps, statuses } = setup([
      () => new Response(null, { status: 503 }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response(null, { status: 500 }),
      () => streamResponse(READY),
    ], { now: clock(15_000) });
    await runInboxStream(options);
    expect(sleeps).toEqual([1000, 2000, 3000, 1000]);
    expect(statuses[0]).toBe("connecting");
    expect(statuses.filter((status) => status === "reconnecting").length).toBe(4);
  });

  it("abort ກ່ອນເລີ່ມ = ບໍ່ເຊື່ອມເລີຍ", async () => {
    const { options, controller, fetcher } = setup([() => streamResponse(READY)]);
    controller.abort();
    await runInboxStream(options);
    expect(fetcher.calls).not.toHaveBeenCalled();
  });

  it("ready then immediate drop (lived < 10s) does not reset backoff: 1000,2000,3000,3000; re-ready still fires onChange", async () => {
    const { options, sleeps, onChange } = setup(
      [() => streamResponse(READY), () => streamResponse(READY), () => streamResponse(READY), () => streamResponse(READY)],
      { now: clock(100) },
    );
    await runInboxStream(options);
    expect(sleeps).toEqual([1000, 2000, 3000, 3000]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("403 and a response without body = failed + backoff; body is cancelled", async () => {
    let cancelled = 0;
    const forbidden = () =>
      new Response(new ReadableStream<Uint8Array>({ cancel: () => void (cancelled += 1) }), { status: 403 });
    const { options, sleeps, fetcher } = setup([forbidden, () => new Response(null, { status: 200 })]);
    await runInboxStream(options);
    expect(sleeps).toEqual([1000, 2000]);
    expect(fetcher.calls).toHaveBeenCalledTimes(3);
    expect(cancelled).toBe(1);
  });

  it("401: body is cancelled", async () => {
    let cancelled = 0;
    const unauthorized = () =>
      new Response(new ReadableStream<Uint8Array>({ cancel: () => void (cancelled += 1) }), { status: 401 });
    const { options } = setup([unauthorized, () => streamResponse(READY)]);
    await runInboxStream(options);
    expect(cancelled).toBe(1);
  });

  it("abort while a read is pending: loop ends, reader cancelled, no further fetch", async () => {
    let cancelled = 0;
    const { options, controller, fetcher } = setup([
      () => {
        setTimeout(() => controller.abort(), 5);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(encoder.encode(READY));
            },
            cancel: () => void (cancelled += 1),
          }),
          { status: 200 },
        );
      },
    ]);
    await runInboxStream(options);
    expect(fetcher.calls).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(1);
  });
});

describe("defaultSleep", () => {
  it("abort during sleep resolves at once and clears timer and listener", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const done = defaultSleep(60_000, controller.signal);
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      await done;
      expect(vi.getTimerCount()).toBe(0);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves after the delay; an already-aborted signal resolves at once", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const done = defaultSleep(1000, controller.signal);
      await vi.advanceTimersByTimeAsync(1000);
      await done;
      controller.abort();
      await defaultSleep(1000, controller.signal);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

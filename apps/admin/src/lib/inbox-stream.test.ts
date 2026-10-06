// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type StreamStatus, runInboxStream } from "./inbox-stream";

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

    const none = setup([() => new Response(null, { status: 401 })], { refresh: vi.fn(async () => null) });
    await runInboxStream(none.options);
    expect(none.fetcher.calls).toHaveBeenCalledTimes(1);
  });

  it("503/ເຄືອຂ່າຍລົ້ມ → backoff ເພີ່ມເປັນສອງເທົ່າ ຕັນທີ່ maxMs; ເຊື່ອມສຳເລັດແລ້ວກັບໄປ baseMs", async () => {
    const { options, sleeps, statuses } = setup([
      () => new Response(null, { status: 503 }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response(null, { status: 500 }),
      () => streamResponse(READY),
    ]);
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
});

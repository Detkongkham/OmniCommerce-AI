// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runEventStream } from "./event-stream";

const encoder = new TextEncoder();

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

describe("runEventStream", () => {
  it("ເອີ້ນ onChange ສະເພາະ event ທີ່ຢູ່ໃນ events (live.updated), ຂ້າມ event ອື່ນ ແລະ ping", async () => {
    const controller = new AbortController();
    const urls: string[] = [];
    let served = false;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (served) {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }
      served = true;
      return streamResponse(
        "event: ready\ndata: {}\n\n",
        'event: conversation.updated\ndata: {"conversationId":"c1"}\n\n',
        "event: ping\ndata: {}\n\n",
        'event: live.updated\ndata: {"type":"live.updated","sessionId":"s1"}\n\n',
      );
    });
    const onChange = vi.fn();
    await runEventStream({
      url: "/api/live-sessions/s1/events",
      events: ["live.updated"],
      getToken: () => "tok",
      refresh: async () => "tok",
      onStatus: () => undefined,
      onChange,
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    expect(urls[0]).toBe("/api/live-sessions/s1/events");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

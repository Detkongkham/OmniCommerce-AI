import { createSseParser } from "./sse";

export type StreamStatus = "connecting" | "connected" | "reconnecting";

export interface InboxStreamOptions {
  url: string;
  getToken: () => string | null;
  /** ຂໍ token ໃໝ່ (refresh session); null = session ໃຊ້ບໍ່ໄດ້ */
  refresh: () => Promise<string | null>;
  onStatus: (status: StreamStatus) => void;
  /** ມີການປ່ຽນ (conversation.updated) ຫຼື ເຊື່ອມໃໝ່ສຳເລັດ (ອາດພາດ event ລະຫວ່າງຂາດ) → ຜູ້ເອີ້ນ refetch */
  onChange: () => void;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  baseMs?: number;
  maxMs?: number;
}

type Outcome = "unauthorized" | "failed" | "ended";

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const id = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

async function connectOnce(
  options: InboxStreamOptions,
  fetchImpl: typeof fetch,
  handlers: { onReady: () => void },
): Promise<Outcome> {
  let response: Response;
  try {
    const token = options.getToken();
    response = await fetchImpl(options.url, {
      headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    return "failed";
  }
  if (response.status === 401) return "unauthorized";
  if (!response.ok || !response.body) return "failed";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser((frame) => {
    if (frame.event === "ready") handlers.onReady();
    else if (frame.event === "conversation.updated") options.onChange();
  });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }));
    }
  } catch {
    // ເຄືອຂ່າຍຫຼຸດ ຫຼື abort: ຖືວ່າ stream ຈົບ
  }
  return "ended";
}

/**
 * ເຊື່ອມ SSE ຂອງ inbox ຕະຫຼອດ (ຈົນ signal abort):
 * - ເຊື່ອມໃໝ່ເອງເມື່ອ stream ຈົບ (server ຕັດຕາມອາຍຸ token ເປັນເລື່ອງປົກກະຕິ) ດ້ວຍ backoff ແບບສອງເທົ່າ (ຕັນທີ່ maxMs);
 *   ເຊື່ອມສຳເລັດ (ໄດ້ `ready`) ແລ້ວ backoff ກັບໄປ baseMs
 * - 401 → refresh token ຄັ້ງດຽວ ແລ້ວລອງໃໝ່; 401 ຊ້ຳຫຼັງ refresh ຫຼື refresh ບໍ່ໄດ້ = ເລີກ (session ໃຊ້ບໍ່ໄດ້)
 * - ເຊື່ອມໃໝ່ສຳເລັດຄັ້ງທີ 2 ເປັນຕົ້ນໄປເອີ້ນ onChange ເພື່ອ refetch ສິ່ງທີ່ອາດພາດ
 */
export async function runInboxStream(options: InboxStreamOptions): Promise<void> {
  const { signal } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 30_000;
  let failures = 0;
  let unauthorized = 0;
  let everConnected = false;

  options.onStatus("connecting");
  while (!signal.aborted) {
    let readyThisRound = false;
    const outcome = await connectOnce(options, fetchImpl, {
      onReady: () => {
        readyThisRound = true;
        unauthorized = 0;
        options.onStatus("connected");
        if (everConnected) options.onChange();
        everConnected = true;
      },
    });
    if (signal.aborted) return;

    if (outcome === "unauthorized") {
      unauthorized += 1;
      if (unauthorized > 1) return;
      const token = await options.refresh();
      if (!token || signal.aborted) return;
      continue;
    }

    failures = readyThisRound ? 0 : failures + 1;
    options.onStatus("reconnecting");
    await sleep(Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1)), signal);
  }
}

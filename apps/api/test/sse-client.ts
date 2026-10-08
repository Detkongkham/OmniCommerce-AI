/** ອ່ານ SSE stream ໃນ test ຈົນເຫັນຂໍ້ຄວາມທີ່ຕ້ອງການ (ມີ timeout ກັນ test ຄ້າງ) */
export function openSseStream(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const decoder = new TextDecoder();
  let buffer = "";
  let body: ReadableStreamDefaultReader<Uint8Array> | undefined;

  async function readChunk(remaining: number) {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        (body as ReadableStreamDefaultReader<Uint8Array>).read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timeout; got: ${buffer}`)), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get buffer() {
      return buffer;
    },
    async connect() {
      const res = await fetch(url, { headers, signal: controller.signal });
      body = res.body?.getReader();
      return res;
    },
    async readUntil(needle: string, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!buffer.includes(needle)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0 || !body) throw new Error(`timeout waiting for ${needle}; got: ${buffer}`);
        const chunk = await readChunk(remaining);
        if (chunk.done) throw new Error(`stream ended; got: ${buffer}`);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return buffer;
    },
    close() {
      controller.abort();
    },
  };
}

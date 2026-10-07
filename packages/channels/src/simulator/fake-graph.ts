import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface SentMessage {
  recipientId: string;
  text: string;
  authorization: string | undefined;
}

export interface FakeGraphFailure {
  status: number;
  code: number;
  subcode?: number;
  message: string;
}

export interface FakeGraphOptions {
  port?: number;
  /** ຖ້າຕັ້ງ ຕ້ອງສົ່ງ `Authorization: Bearer <token>` ຖືກ ບໍ່ດັ່ງນັ້ນຕອບ 401 (code 190) */
  token?: string;
  /** id ທີ່ບໍ່ຮູ້ຈັກ ຕອບຊື່ `Sim <id>` ແທນ error */
  autoProfiles?: boolean;
  onSend?: (message: SentMessage) => void;
}

export interface FakeGraph {
  readonly url: string;
  readonly sent: SentMessage[];
  readonly profiles: Map<string, string>;
  /** message_id ທີ່ຈະໄດ້ໃນການສົ່ງຄັ້ງຖັດໄປ */
  nextMessageId(): string;
  failNext(failure: FakeGraphFailure): void;
  reset(): void;
  close(): Promise<void>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Graph API ປອມ: POST .../me/messages ແລະ GET .../<psid>?fields=... (ສຳລັບ dev/test ເທົ່ານັ້ນ) */
export async function startFakeGraph(options: FakeGraphOptions = {}): Promise<FakeGraph> {
  const sent: SentMessage[] = [];
  const profiles = new Map<string, string>();
  const failures: FakeGraphFailure[] = [];
  let counter = 0;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const authorization = request.headers.authorization;
    if (options.token && authorization !== `Bearer ${options.token}`) {
      reply(401, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } });
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "POST" && url.pathname.endsWith("/me/messages")) {
      const failure = failures.shift();
      if (failure) {
        reply(failure.status, {
          error: { message: failure.message, type: "OAuthException", code: failure.code, error_subcode: failure.subcode },
        });
        return;
      }
      const body = await readJson(request);
      const recipient = body?.recipient as { id?: unknown } | undefined;
      const message = body?.message as { text?: unknown } | undefined;
      if (typeof recipient?.id !== "string" || typeof message?.text !== "string") {
        reply(400, { error: { message: "(#100) Invalid parameter", type: "OAuthException", code: 100 } });
        return;
      }
      counter += 1;
      const entry = { recipientId: recipient.id, text: message.text, authorization };
      sent.push(entry);
      options.onSend?.(entry);
      reply(200, { recipient_id: recipient.id, message_id: `m_sim_${counter}` });
      return;
    }

    if (request.method === "GET" && /^\/(?:v[\d.]+\/)?[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
      const name = profiles.get(id) ?? (options.autoProfiles ? `Sim ${id}` : undefined);
      if (!name) {
        reply(400, { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 } });
        return;
      }
      const [first = "", ...rest] = name.split(" ");
      reply(200, { id, first_name: first, last_name: rest.join(" ") });
      return;
    }

    reply(404, { error: { message: "Not found", code: 100 } });
  };

  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (response.destroyed || response.headersSent) return;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Internal error", code: 1 } }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;

  let closing: Promise<void> | undefined;

  return {
    url: `http://127.0.0.1:${port}`,
    sent,
    profiles,
    nextMessageId: () => `m_sim_${counter + 1}`,
    failNext: (failure) => {
      failures.push(failure);
    },
    reset: () => {
      sent.length = 0;
      failures.length = 0;
      profiles.clear();
      counter = 0;
    },
    close: () => {
      closing ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

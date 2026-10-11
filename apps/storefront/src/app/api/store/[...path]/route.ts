import { SLIP_MAX_BYTES } from "@oca/shared";

/**
 * ສົ່ງຕໍ່ຄຳຂໍຈາກ browser ໄປ API ສາທາລະນະ (`/api/store/*` → `${API_URL}/store/*`).
 * ໃຊ້ route ນີ້ແທນ rewrite ເພາະ rewrite ຂອງ Next ບໍ່ແນບ X-Forwarded-For: API ຈະເຫັນລູກຄ້າທຸກຄົນ
 * ເປັນ IP ຂອງເວັບ ແລະ ນັບ rate limit ລວມກັນ. ຢູ່ນີ້ Next ຕື່ມ x-forwarded-for ໃຫ້ຄຳຂໍທີ່ເຂົ້າມາ
 * (ທີ່ຢູ່ຂອງ socket ຖ້າບໍ່ມີ proxy ຢູ່ໜ້າ) ແລ້ວເຮົາສົ່ງຄ່າສຸດທ້າຍຕໍ່ໄປ. API ຕ້ອງຕັ້ງ TRUST_PROXY=1.
 */

/** ສະລິບ 8 MB + ສ່ວນຫົວຂອງ multipart */
const MAX_BODY_BYTES = SLIP_MAX_BYTES + 1024 * 1024;
const FORWARDED_REQUEST_HEADERS = ["content-type", "idempotency-key"];

type Context = { params: Promise<{ path: string[] }> };

function apiBase(): string {
  return (process.env.API_URL || "http://localhost:3001").replace(/\/+$/, "");
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function forward(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const target = `${apiBase()}/store/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // ຄ່າສຸດທ້າຍ = ທີ່ຢູ່ທີ່ hop ໃກ້ສຸດ (proxy ໜ້າເວັບ ຫຼື Next ເອງ) ເຫັນ; ຄ່າກ່ອນໜ້າລູກຄ້າປອມໄດ້
  const client = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (client) headers.set("x-forwarded-for", client);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return json(413, { statusCode: 413, code: "BAD_REQUEST", message: "Request body is too large" });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return json(413, { statusCode: 413, code: "BAD_REQUEST", message: "Request body is too large" });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
  } catch {
    return json(502, { statusCode: 502, code: "NETWORK", message: "Store API is unreachable" });
  }
  // ສົ່ງຄືນສະເພາະ status + body + content-type (ບໍ່ສົ່ງ set-cookie ຫຼື header ຄວາມປອດໄພຂອງ API ທີ່ບໍ່ກ່ຽວກັບເວັບ)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";

export function GET(request: Request, context: Context): Promise<Response> {
  return forward(request, context);
}

export function POST(request: Request, context: Context): Promise<Response> {
  return forward(request, context);
}

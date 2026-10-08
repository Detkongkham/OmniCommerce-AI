import { createHash } from "node:crypto";

export class SlipImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlipImageError";
  }
}

/** ກວດຊະນິດຮູບຈາກ magic bytes (ບໍ່ເຊື່ອ Content-Type/ນາມສະກຸນຈາກ client) */
export function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => at(index) === value)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    [0x52, 0x49, 0x46, 0x46].every((value, index) => at(index) === value) &&
    [0x57, 0x45, 0x42, 0x50].every((value, index) => at(8 + index) === value)
  ) {
    return "image/webp";
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** ແປງ IPv6 (ຮູບ normalized ຈາກ URL, ບໍ່ມີ []) ເປັນ 8 ກຸ່ມ; null ຖ້າອ່ານບໍ່ໄດ້ */
function parseIpv6(host: string): number[] | null {
  let text = host;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((part) => part > 255)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = parts;
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN,
  );
  return groups.length === 8 && groups.every((group) => !Number.isNaN(group)) ? groups : null;
}

function isInternalIpv4(a: number, b: number): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast + reserved + broadcast
  );
}

/**
 * Guard ແບບ literal-hostname ຕໍ່ SSRF (ໃຊ້ເມື່ອ allowHttp=false ຄື production):
 * ປະຕິເສດ localhost/*.localhost/*.local/*.internal ແລະ IP literal ທີ່ເປັນ loopback/private/link-local/metadata.
 * URL ຂອງ WHATWG ປ່ຽນເລກຖານ 10/16/8 ແລະ IPv4-mapped ເປັນຮູບມາດຕະຖານໃຫ້ແລ້ວ ຈຶ່ງກວດຮູບດຽວໄດ້.
 * ຂໍ້ຈຳກັດ: ບໍ່ກວດ DNS; hostname ທີ່ຊື່ສາທາລະນະແຕ່ resolve ເປັນ IP ພາຍໃນ (ແລະ DNS rebinding) ບໍ່ຖືກກັນ
 * ຕ້ອງກັນເພີ່ມໃນຊັ້ນເຄືອຂ່າຍ (egress firewall) ຖ້າຕ້ອງການ.
 */
export function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) return isInternalIpv4(Number(v4[1]), Number(v4[2]));
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    if (!groups) return true; // ອ່ານບໍ່ໄດ້ = ບໍ່ໄວ້ໃຈ
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
    if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80) return true; // fc00::/7, fe80::/10
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
      if (g5 === 0 && g6 === 0 && g7 <= 1) return true; // :: ແລະ ::1
      return isInternalIpv4(g6 >> 8, g6 & 0xff); // ::ffff:a.b.c.d ແລະ ::a.b.c.d
    }
  }
  return false;
}

export interface FetchImageOptions {
  fetchImpl: typeof fetch;
  /** dev/simulator ໃຊ້ http ໄດ້; production ຕ້ອງ https */
  allowHttp: boolean;
  maxBytes: number;
  timeoutMs: number;
}

/** ດາວໂຫຼດຮູບຈາກ URL ຂອງ attachment: ບໍ່ຕາມ redirect, ມີ timeout, ຈຳກັດຂະໜາດຕອນອ່ານ stream */
export async function fetchImageBytes(url: string, options: FetchImageOptions): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SlipImageError("Invalid image URL");
  }
  const protocolOk = parsed.protocol === "https:" || (options.allowHttp && parsed.protocol === "http:");
  if (!protocolOk) throw new SlipImageError("Image URL must use https");
  // ຫ້າມ credentials ໃນ URL (user:pass@host) ສະເໝີ
  if (parsed.username || parsed.password) throw new SlipImageError("Image URL must not contain credentials");
  // production (allowHttp=false): ຫ້າມ host ພາຍໃນ; dev/simulator ໃຊ້ localhost ໄດ້
  if (!options.allowHttp && isInternalHostname(parsed.hostname)) throw new SlipImageError("Image host is not allowed");

  let response: Response;
  try {
    response = await options.fetchImpl(parsed.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new SlipImageError(`Image download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new SlipImageError(`Image download failed with status ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) throw new SlipImageError("Image is too large");

  const reader = response.body?.getReader();
  if (!reader) throw new SlipImageError("Image response has no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel();
        throw new SlipImageError("Image is too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SlipImageError) throw error;
    throw new SlipImageError(`Image download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

import { createHash } from "node:crypto";
import { isInternalHostname } from "./ssrf-guard";

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
  // ຍົກເລີກ body ທີ່ບໍ່ໄດ້ອ່ານເມື່ອປະຕິເສດກ່ອນ ເພື່ອປ່ອຍ connection
  const discardBody = () => void response.body?.cancel().catch(() => {});
  if (!response.ok) {
    discardBody();
    throw new SlipImageError(`Image download failed with status ${response.status}`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    discardBody();
    throw new SlipImageError("Image is too large");
  }

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
        // cancel ທີ່ reject ຕ້ອງບໍ່ປ່ຽນ error ຫຼັກ
        await reader.cancel().catch(() => {});
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

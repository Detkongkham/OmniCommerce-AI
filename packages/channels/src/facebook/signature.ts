import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/** ລາຍເຊັນແບບທີ່ Meta ໃຊ້ໃນ header X-Hub-Signature-256: "sha256=" + HMAC-SHA256(appSecret, rawBody) */
export function signBody(appSecret: string, rawBody: Buffer | string): string {
  return PREFIX + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function isValidSignature(
  appSecret: string | undefined,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  if (!appSecret || typeof header !== "string" || !header.startsWith(PREFIX)) return false;
  const expected = Buffer.from(signBody(appSecret, rawBody));
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
